import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { CAREER_CATALOG } from "../convex/careerCatalog";
import { monthRepairPrompt, validatePlanMonths } from "../convex/planQuality";
import { priceCall } from "../convex/pricing";

const deployment = "doting-basilisk-558";
const cloudUrl = "https://doting-basilisk-558.convex.cloud";
const cli = resolve("node_modules/convex/bin/main.js");
const adminKey = process.env.PATHLIGHT_DEV_ADMIN_KEY;
const apiKey = process.env.OPENAI_API_KEY;
if (!adminKey || adminKey.length < 32 || !apiKey) throw new Error("DEV admin and OpenAI credentials must be present in this process.");
const dotenv = await readFile(".env.local", "utf8");
if (!/^CONVEX_DEPLOYMENT=dev:doting-basilisk-558(?:\s|$)/m.test(dotenv) || !/^VITE_CONVEX_URL=https:\/\/doting-basilisk-558\.convex\.cloud\s*$/m.test(dotenv)) throw new Error("Refusing to run unless .env.local selects doting-basilisk-558 DEV.");
if (process.env.CONVEX_DEPLOY_KEY) throw new Error("Refusing to run with a deployment-key override.");

const client = new ConvexHttpClient(cloudUrl);
const openai = new OpenAI({ apiKey, maxRetries: 0, timeout: 150_000 });
const monthResponseSchema = z.object({ projects: z.array(z.object({
  month: z.number().int().min(1).max(12), title: z.string(), projectDetails: z.string(),
  successCriteria: z.array(z.string()), timeNeeded: z.string(),
})).max(12) });
type Month = { month: number; title: string; projectDetails?: string; successCriteria?: string[]; timeNeeded?: string; thumbnailThemeId?: string; skillIndex: number; panelIndex: number; targetSkill?: string; build?: string; [key: string]: unknown };
type SavedPlanRow = { _id: string; _creationTime: number; title: string; status: string; token: string; lease: number; plan?: { subtitle: string; skills: string[]; coreSkills?: string[]; projects: Month[] }; error?: string | null };

function runConvex(functionName: string, args: Record<string, unknown>): string {
  return execFileSync(process.execPath, [cli, "run", functionName, JSON.stringify(args), "--deployment", deployment, "--typecheck", "disable", "--codegen", "disable"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, windowsHide: true }).trim();
}
function runInline<T>(source: string): T {
  const output = execFileSync(process.execPath, [cli, "run", "--inline-query", source, "--deployment", deployment, "--typecheck", "disable", "--codegen", "disable"], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, windowsHide: true });
  return JSON.parse(output) as T;
}

const rawRows = runInline<SavedPlanRow[]>(`return await ctx.db.query("careerPlans").take(200)`);
const libraryImages = await client.query(api.planThumbnails.images, {});
const availableThemes = new Set<string>(libraryImages.filter(image => image.status === "ready" && image.imageUrl).map(image => image.themeId));
const fallbackAvailable = availableThemes.has("finished-project");
const failures = rawRows.filter(row => row.plan?.projects?.length).map(row => {
  for (const project of row.plan!.projects) {
    const imageAvailable = !!project.thumbnailThemeId && availableThemes.has(project.thumbnailThemeId);
    if (!imageAvailable && fallbackAvailable) project.thumbnailThemeId = "finished-project";
    else if (!imageAvailable) project.thumbnailThemeId = "";
  }
  return { row, months: validatePlanMonths(row.plan!.projects) };
}).filter(item => item.months.length).sort((a, b) => a.row.title.localeCompare(b.row.title));
const passedRows = rawRows.length - failures.length;
const reportPath = "design/polish/consistency-dev-inventory.json";
await writeFile(reportPath, JSON.stringify({ deployment: `dev:${deployment}`, checkedPlans: rawRows.length, passedPlans: passedRows, failedPlans: failures.length, failedMonths: failures.reduce((total, item) => total + item.months.length, 0), availableLibraryImages: availableThemes.size, fallbackImageAvailable: fallbackAvailable, failingPlans: failures.map(({ row, months }) => ({ career: row.title, planId: row._id, months })) }, null, 2));
console.log(JSON.stringify({ event: "inventory", checkedPlans: rawRows.length, passedPlans: passedRows, failedPlans: failures.length, failedMonths: failures.reduce((total, item) => total + item.months.length, 0), availableLibraryImages: availableThemes.size, fallbackImageAvailable: fallbackAvailable, reportPath }, null, 2));
const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : Number.POSITIVE_INFINITY;
type RepairResult = { career: string; planId: string; aiCalls: number; costUSD: number; state: "fixed" | "needs-review" | "error"; months: number[]; error?: string };
const resultsPath = "design/polish/consistency-dev-repair-results.json";
let results: RepairResult[] = [];
try {
  const previous = JSON.parse(await readFile(resultsPath, "utf8"));
  if (previous.deployment === `dev:${deployment}` && Array.isArray(previous.results)) results = previous.results;
} catch { /* Start a fresh repair batch when no prior receipt exists. */ }
const alreadyProcessed = new Set(results.map(item => item.planId));
const work = failures.filter(item => !alreadyProcessed.has(item.row._id)).slice(0, limit);
for (const { row, months: originalIssues } of work) {
  const plan = row.plan!;
  const career = CAREER_CATALOG.find(item => item.title === row.title);
  if (!career) { results.push({ career: row.title, planId: row._id, aiCalls: 0, costUSD: 0, state: "error", months: originalIssues.map(item => item.month), error: "Career not in catalog." }); continue; }
  let invalid = validatePlanMonths(plan.projects);
  const generationId = randomUUID();
  let aiCalls = 0, costUSD = 0, lastError: string | undefined;
  for (let attempt = 1; attempt <= 2 && invalid.length; attempt++) {
    const failing = new Set(invalid.map(issue => issue.month));
    const monthInput = plan.projects.filter(project => failing.has(project.month)).map(project => ({
      month: project.month, title: project.title, projectDetails: project.projectDetails ?? project.build ?? "",
      successCriteria: project.successCriteria ?? [], timeNeeded: project.timeNeeded ?? "",
      targetSkill: project.targetSkill, coreSkills: plan.coreSkills,
      failedFields: (invalid.find(issue => issue.month === project.month)?.issues ?? []).map(issue =>
        issue.startsWith("title") ? "title" : issue.startsWith("details") || issue.includes("instruction or validator") ? "projectDetails" :
        issue.startsWith("success criteria") ? "successCriteria" : issue.startsWith("time") ? "timeNeeded" : "thumbnailThemeId"),
    }));
    const callId = JSON.parse(runConvex("costs:begin", { careerTitle: row.title, callType: "plan", stage: `saved-plan-quality-repair-${attempt}`, model: "gpt-4.1-mini", generationId, visitorId: "dev-saved-plan-repair-batch", isTest: true }));
    try {
      const response = await openai.responses.parse({
        model: "gpt-4.1-mini", max_output_tokens: Math.min(6000, 1200 + monthInput.length * 700), temperature: 0.2,
        input: [{ role: "system", content: monthRepairPrompt }, { role: "user", content: JSON.stringify({ career: { title: row.title, description: career.description }, projects: monthInput }) }],
        text: { format: zodTextFormat(monthResponseSchema, "repaired_plan_months") },
      });
      const repaired = monthResponseSchema.parse(response.output_parsed).projects;
      const expected = [...failing].sort((a, b) => a - b);
      const actual = repaired.map(project => project.month).sort((a, b) => a - b);
      if (actual.length !== expected.length || actual.some((month, index) => month !== expected[index])) throw new Error("The model returned a different set of months than the failing set.");
      const repairByMonth = new Map(repaired.map(project => [project.month, project]));
      for (const project of plan.projects) {
        const repair = repairByMonth.get(project.month);
        if (!repair) continue;
        project.title = repair.title;
        project.projectDetails = repair.projectDetails;
        project.successCriteria = repair.successCriteria;
        project.timeNeeded = repair.timeNeeded;
      }
      runConvex("costs:finish", { id: callId, usage: response.usage ?? null, ...(response._request_id ? { requestId: response._request_id } : {}), webSearchCalls: 0 });
      aiCalls++;
      costUSD += priceCall("gpt-4.1-mini", response.usage ?? null, 0).costUSD ?? 0;
      invalid = validatePlanMonths(plan.projects);
      lastError = undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try { runConvex("costs:finish", { id: callId, usage: null, webSearchCalls: 0, error: message.slice(0, 500) }); } catch { /* Preserve the model error if cost logging also fails. */ }
      aiCalls++;
      lastError = message;
      break;
    }
  }
  const status = invalid.length ? "needs-review" : "ready";
  try {
    runConvex("plans:finish", { title: row.title, token: row.token, plan, status });
    results.push({ career: row.title, planId: row._id, aiCalls, costUSD, state: status === "ready" ? "fixed" : "needs-review", months: invalid.map(issue => issue.month), ...(lastError ? { error: lastError } : {}) });
    console.log(JSON.stringify({ event: "plan-repaired", career: row.title, planId: row._id, aiCalls, state: status, monthsStillFailing: invalid.map(issue => issue.month), lastError: lastError ?? null }));
  } catch (error) {
    results.push({ career: row.title, planId: row._id, aiCalls, costUSD, state: "error", months: invalid.map(issue => issue.month), error: error instanceof Error ? error.message : String(error) });
  }
}
await writeFile(resultsPath, JSON.stringify({ deployment: `dev:${deployment}`, processedPlans: results.length, repairedPlans: results.filter(item => item.state === "fixed").length, needsReviewPlans: results.filter(item => item.state === "needs-review").length, errors: results.filter(item => item.state === "error").length, aiCalls: results.reduce((sum, item) => sum + item.aiCalls, 0), results }, null, 2));
console.log(JSON.stringify({ event: "repair-complete", processedPlans: results.length, newlyProcessedPlans: work.length, fixedPlans: results.filter(item => item.state === "fixed").length, needsReviewPlans: results.filter(item => item.state === "needs-review").length, aiCalls: results.reduce((sum, item) => sum + item.aiCalls, 0), costUSD: results.reduce((sum, item) => sum + item.costUSD, 0), resultsPath }, null, 2));
