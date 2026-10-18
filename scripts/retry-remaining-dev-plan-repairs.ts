import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { CAREER_CATALOG } from "../convex/careerCatalog";
import { monthRepairPrompt, validatePlanMonths, type PlanMonth } from "../convex/planQuality";
import { priceCall } from "../convex/pricing";

const deployment = "doting-basilisk-558", url = "https://doting-basilisk-558.convex.cloud";
const cli = resolve("node_modules/convex/bin/main.js"), adminKey = process.env.PATHLIGHT_DEV_ADMIN_KEY, apiKey = process.env.OPENAI_API_KEY;
if (!adminKey || !apiKey || process.env.CONVEX_DEPLOY_KEY) throw new Error("DEV keys required; deployment key is forbidden.");
const env = await readFile(".env.local", "utf8");
if (!/^CONVEX_DEPLOYMENT=dev:doting-basilisk-558(?:\s|$)/m.test(env)) throw new Error("Wrong deployment in .env.local.");
function run(name: string, args: Record<string, unknown>) { return execFileSync(process.execPath, [cli, "run", name, JSON.stringify(args), "--deployment", deployment, "--typecheck", "disable", "--codegen", "disable"], { encoding: "utf8", maxBuffer: 20_000_000, windowsHide: true }).trim(); }
function inline<T>(source: string): T { return JSON.parse(execFileSync(process.execPath, [cli, "run", "--inline-query", source, "--deployment", deployment, "--typecheck", "disable", "--codegen", "disable"], { encoding: "utf8", maxBuffer: 20_000_000, windowsHide: true })); }
const schema = z.object({ projects: z.array(z.object({ month: z.number().int().min(1).max(12), title: z.string(), projectDetails: z.string(), successCriteria: z.array(z.string()), timeNeeded: z.string() })).max(12) });
type Row = { _id: string; title: string; token: string; plan: { projects: PlanMonth[]; [key: string]: unknown } };
const rows = inline<Row[]>(`return await ctx.db.query("careerPlans").take(200)`);
const report: any = JSON.parse(await readFile("design/polish/consistency-dev-repair-results.json", "utf8"));
const targetIds = new Set(report.results.filter((r: any) => r.aiCalls === 1 && r.state === "needs-review").map((r: any) => r.planId));
const client = new ConvexHttpClient(url), openai = new OpenAI({ apiKey, maxRetries: 0, timeout: 150_000 });
const done = [] as any[];
for (const row of rows.filter(x => targetIds.has(x._id))) {
  const career = CAREER_CATALOG.find(x => x.title === row.title);
  let invalid = validatePlanMonths(row.plan.projects), costUSD = 0, state = "needs-review", error: string | null = null;
  if (!career || !invalid.length) { done.push({ career: row.title, planId: row._id, skipped: true }); continue; }
  const failing = new Set(invalid.map(x => x.month));
  const projects = row.plan.projects.filter(x => failing.has(x.month)).map(x => ({ month: x.month, title: x.title, projectDetails: x.projectDetails ?? x.build ?? "", successCriteria: x.successCriteria ?? [], timeNeeded: x.timeNeeded ?? "", targetSkill: x.targetSkill, coreSkills: row.plan.coreSkills }));
  const callId = JSON.parse(run("costs:begin", { careerTitle: row.title, callType: "plan", stage: "saved-plan-quality-repair-2", model: "gpt-4.1-mini", visitorId: "dev-saved-plan-repair-batch", isTest: true }));
  let response: any = null;
  try {
    response = await openai.responses.parse({ model: "gpt-4.1-mini", max_output_tokens: Math.min(6000, 1200 + projects.length * 700), temperature: 0.2,
      input: [{ role: "system", content: monthRepairPrompt }, { role: "user", content: JSON.stringify({ career: { title: row.title, description: career.description }, expectedMonths: [...failing].sort((a,b)=>a-b), projects }) }],
      text: { format: zodTextFormat(schema, "repaired_plan_months") },
    });
    const repaired = schema.parse(response.output_parsed).projects, expected = [...failing].sort((a,b)=>a-b), actual = repaired.map(x=>x.month).sort((a,b)=>a-b);
    if (actual.length !== expected.length || actual.some((month,index)=>month !== expected[index])) throw new Error("The model returned a different set of months than the failing set.");
    const byMonth = new Map(repaired.map(x=>[x.month,x]));
    for (const p of row.plan.projects) { const fresh=byMonth.get(p.month); if(fresh) Object.assign(p,fresh); }
    invalid = validatePlanMonths(row.plan.projects); state = invalid.length ? "needs-review" : "ready";
    if (state === "ready") run("plans:finish", { title: row.title, token: row.token, plan: row.plan, status: "ready" });
    else run("plans:finish", { title: row.title, token: row.token, plan: row.plan, status: "needs-review" });
    costUSD = priceCall("gpt-4.1-mini", response.usage ?? null, 0).costUSD ?? 0;
    run("costs:finish", { id: callId, usage: response.usage ?? null, ...(response._request_id ? { requestId: response._request_id } : {}), webSearchCalls: 0 });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    if (response) { costUSD = priceCall("gpt-4.1-mini", response.usage ?? null, 0).costUSD ?? 0; run("costs:finish", { id: callId, usage: response.usage ?? null, ...(response._request_id ? { requestId: response._request_id } : {}), webSearchCalls: 0, error: error.slice(0, 500) }); }
    else run("costs:finish", { id: callId, usage: null, webSearchCalls: 0, error: error.slice(0, 500) });
  }
  done.push({ career: row.title, planId: row._id, aiCalls: 1, costUSD, state, months: invalid.map(x=>x.month), error });
  console.log(JSON.stringify(done.at(-1)));
}
const extraCalls = done.filter(x=>x.aiCalls).length, extraCost = done.reduce((s,x)=>s+(x.costUSD??0),0);
report.results = report.results.map((r: any) => { const retry=done.find(x=>x.planId===r.planId && x.aiCalls); return retry ? { ...r, aiCalls: 2, costUSD: (r.costUSD??0)+retry.costUSD, state: retry.state === "ready" ? "fixed" : "needs-review", months: retry.months, ...(retry.error ? { error: retry.error } : { error: undefined }) } : r; });
report.repairedPlans = report.results.filter((x:any)=>x.state==="fixed").length; report.needsReviewPlans=report.results.filter((x:any)=>x.state==="needs-review").length;
report.aiCalls=report.results.reduce((s:number,x:any)=>s+x.aiCalls,0); report.costUSD=report.results.reduce((s:number,x:any)=>s+(x.costUSD??0),0);
await writeFile("design/polish/consistency-dev-repair-results.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({event:"retry-complete",plansRetried:extraCalls,additionalCostUSD:extraCost,totalAiCalls:report.aiCalls,knownCostUSD:report.costUSD},null,2));
