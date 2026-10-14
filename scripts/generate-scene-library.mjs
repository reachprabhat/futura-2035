// Deliberately contains no backend-sync, deploy, hosting, production, or env-write command.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (root.toLowerCase() !== "c:\\users\\reach\\skill-sprint") throw new Error("Run only inside C:\\Users\\reach\\skill-sprint.");
const env = await readFile(path.join(root, ".env.local"), "utf8");
if (!/^CONVEX_DEPLOYMENT=dev:doting-basilisk-558(?:\s|$)/m.test(env) || !/^VITE_CONVEX_URL=https:\/\/doting-basilisk-558\.convex\.cloud\s*$/m.test(env)) throw new Error("Expected DEV configuration.");
if (process.env.CONVEX_DEPLOY_KEY) throw new Error("Remove the deployment-key override before running this DEV-only script.");
const exec = promisify(execFile);
async function cli(args) {
  try {
    const { stdout } = await exec(process.execPath, [path.join(root, "node_modules/convex/bin/main.js"), ...args, "--deployment", "doting-basilisk-558"], { cwd: root, maxBuffer: 16 * 1024 * 1024, timeout: 240000 });
    return stdout.trim();
  } catch {
    // Never print child-process command arguments: they contain the admin key.
    throw new Error("DEV command failed; inspect the DEV dashboard. No automatic retry was made.");
  }
}
const adminKey = (await cli(["env", "get", "ADMIN_COSTS_KEY"])).replace(/^"|"$/g, "");
if (adminKey.length < 32) throw new Error("Missing DEV admin credential.");
const run = async (fn, args) => JSON.parse(await cli(["run", fn, JSON.stringify(args)]));
const out = path.join(root, "design/library-evidence");
await mkdir(out, { recursive: true });
const startedAt = Date.now();
const archive = () => cli(["data", "storyboards", "--limit", "1000", "--format", "json"]);
const hash = text => createHash("sha256").update(text).digest("hex");
const before = await archive();
if (JSON.parse(before).length >= 1000) throw new Error("Archive verification needs pagination before generation can proceed.");
const initial = await run("sceneLibrary:inventory", {});
const controls = await run("costs:controls", { adminKey });
if (!controls.aiEnabled) throw new Error("DEV AI is disabled; no settings were changed.");
console.log("target: DEV doting-basilisk-558; generating shared scenes sequentially; no deployment");
try {
  // No Promise.all: await each completed storage commit before starting the next image.
  for (const scene of initial.scenes) {
    if (scene.status === "ready") continue;
    if (scene.status !== "missing") throw new Error(`Inspect prior attempt: ${scene.sceneId}/${scene.gender} (${scene.status}).`);
    const result = await run("libraryActions:generateScene", { adminKey, sceneId: scene.sceneId, gender: scene.gender });
    if (result.status !== "ready") throw new Error("Scene was not saved.");
    const image = await fetch(result.imageUrl);
    if (!image.ok) throw new Error("Could not download saved shared scene.");
    await writeFile(path.join(out, `${scene.sceneId}-${scene.gender}.webp`), Buffer.from(await image.arrayBuffer()));
    console.log(`saved ${scene.sceneId}/${scene.gender}`);
  }
  for (const career of initial.mappings) {
    if (career.status === "ready") continue;
    const result = await run("libraryActions:prepareCareer", { adminKey, title: career.title });
    if (result.status !== "ready") throw new Error(`Career mapping incomplete: ${career.title}`);
    console.log(`mapped ${career.title}`);
  }
} finally {
  const rows = []; let cursor = null;
  do {
    const page = await run("costs:rows", { adminKey, paginationOpts: { numItems: 100, cursor } });
    rows.push(...page.page.filter(row => row.timestamp >= startedAt && row.cacheKey?.startsWith("shared-scenes-v1:")));
    cursor = page.isDone || page.page.at(-1)?.timestamp < startedAt ? null : page.continueCursor;
  } while (cursor);
  rows.sort((a, b) => a.timestamp - b.timestamp);
  const after = await archive();
  const report = { target: "dev:doting-basilisk-558", startedAt, endedAt: Date.now(), archivedStoryboardsUnchanged: hash(before) === hash(after), totalCostUSD: rows.reduce((sum, r) => sum + (r.costUSD ?? 0), 0), totalCostINR: rows.reduce((sum, r) => sum + (r.costINR ?? 0), 0), unknownCosts: rows.filter(r => !r.cacheHit && r.costUSD === null).length, rows };
  await writeFile(path.join(out, "aiCalls.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, rows: `${rows.length} rows saved to design/library-evidence/aiCalls.json` }));
  if (!report.archivedStoryboardsUnchanged) throw new Error("Archived storyboard comparison failed.");
}
await writeFile(path.join(out, "inventory.json"), JSON.stringify(await run("sceneLibrary:inventory", {}), null, 2));
