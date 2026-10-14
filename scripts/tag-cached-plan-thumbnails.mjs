import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { readFile, writeFile } from "node:fs/promises";

const root = process.cwd();
if (root.toLowerCase() !== "c:\\users\\reach\\skill-sprint") throw new Error("Run only in C:\\Users\\reach\\skill-sprint.");
const env = await readFile(".env.local", "utf8");
if (!/^CONVEX_DEPLOYMENT=dev:doting-basilisk-558(?:\s|$)/m.test(env)) throw new Error("Expected doting-basilisk-558 DEV.");
if (process.env.CONVEX_DEPLOY_KEY) throw new Error("Remove any deployment-key override before proceeding.");
const adminKey = (await readFile("artifacts/admin-costs-key.txt", "utf8")).trim();
const exec = promisify(execFile);
const output = await exec(process.execPath, ["node_modules/convex/bin/main.js", "data", "careerPlans", "--limit", "1000", "--format", "json", "--deployment", "doting-basilisk-558"], { cwd: root, maxBuffer: 20000000 });
const plans = JSON.parse(output.stdout).filter(row => row.status === "ready" && row.plan?.projects?.length === 12);
const client = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const tagRef = makeFunctionReference("planThumbnailActions:tagSavedPlan");
const getPlanRef = makeFunctionReference("plans:get");
const rowsRef = makeFunctionReference("costs:rows");
const getRows = async () => {
  const rows = [];
  let cursor = null;
  do {
    const page = await client.query(rowsRef, { adminKey, paginationOpts: { numItems: 100, cursor } });
    rows.push(...page.page);
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  return rows;
};
const before = new Set((await getRows()).map(row => row._id));
let done = 0;
for (const row of plans) {
  const stored = await client.query(getPlanRef, { title: row.title });
  if (stored?.status === "ready" && stored.plan.projects.every(project => project.thumbnailThemeId)) { done++; continue; }
  await client.action(tagRef, { adminKey, title: row.title });
  const updated = await client.query(getPlanRef, { title: row.title });
  if (!updated?.plan?.projects?.every(project => project.thumbnailThemeId)) throw new Error(`${row.title} did not receive twelve cached theme tags.`);
  done++;
  console.log(`Tagged ${done}/${plans.length}: ${row.title} (12 month projects).`);
}
const created = (await getRows()).filter(row => !before.has(row._id)).sort((a, b) => a.timestamp - b.timestamp);
const report = { cachedPlans: plans.length, taggedPlans: done, rows: created, totalCostINR: created.reduce((sum, row) => sum + (row.costINR ?? 0), 0) };
await writeFile("design/thumbnail-library/aiCalls-tags.json", JSON.stringify(report, null, 2));
console.log(`Tagged all ${done} cached plans. New tag call cost: ₹${report.totalCostINR.toFixed(4)}.`);
