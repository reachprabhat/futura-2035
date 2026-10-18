import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { validatePlanMonths, type PlanMonth } from "../convex/planQuality";

const deployment = "doting-basilisk-558", url = "https://doting-basilisk-558.convex.cloud", key = process.env.PATHLIGHT_DEV_ADMIN_KEY;
if (!key || process.env.CONVEX_DEPLOY_KEY) throw new Error("DEV admin key required; deployment key is forbidden.");
const dotenv = await (await import("node:fs/promises")).readFile(".env.local", "utf8");
if (!/^CONVEX_DEPLOYMENT=dev:doting-basilisk-558(?:\s|$)/m.test(dotenv)) throw new Error("Wrong deployment in .env.local.");
const cli = resolve("node_modules/convex/bin/main.js");
type Row = { _id: string; title: string; plan?: { projects?: PlanMonth[] } };
const raw = execFileSync(process.execPath, [cli, "run", "--inline-query", `return await ctx.db.query("careerPlans").take(200)`, "--deployment", deployment, "--typecheck", "disable", "--codegen", "disable"], { encoding: "utf8", maxBuffer: 20_000_000, windowsHide: true });
const rows = JSON.parse(raw) as Row[], client = new ConvexHttpClient(url);
const images = await client.query(api.planThumbnails.images, {}), themes = new Set<string>(images.filter(x => x.status === "ready" && x.imageUrl).map(x => x.themeId));
const failures = rows.filter(row => row.plan?.projects).map(row => {
  const projects = row.plan!.projects!.map(project => ({ ...project, thumbnailThemeId: typeof project.thumbnailThemeId === "string" && themes.has(project.thumbnailThemeId) ? project.thumbnailThemeId : themes.has("finished-project") ? "finished-project" : "" }));
  return { row, months: validatePlanMonths(projects) };
}).filter(x => x.months.length).sort((a,b)=>a.row.title.localeCompare(b.row.title));
const report = { deployment: `dev:${deployment}`, checkedPlans: rows.length, passedPlans: rows.length-failures.length, failedPlans: failures.length, failedMonths: failures.reduce((n,x)=>n+x.months.length,0), availableLibraryImages: themes.size, fallbackImageAvailable: themes.has("finished-project"), failingPlans: failures.map(x=>({career:x.row.title,planId:x.row._id,months:x.months})) };
await writeFile("design/polish/consistency-dev-inventory.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
