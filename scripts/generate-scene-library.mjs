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
  } catch (error) {
    // Never print child-process command arguments: they contain the admin key.
    let detail = String(error.stderr ?? "").trim();
    try { if (adminKey) detail = detail.replaceAll(adminKey, "<redacted>"); } catch {}
    detail = detail.replace(/sk-[^\s"']+/g, "<redacted>");
    throw new Error(`DEV command failed. No automatic retry was made.${detail ? ` ${detail}` : ""}`);
  }
}
const adminKey = (await cli(["env", "get", "ADMIN_COSTS_KEY"])).replace(/^"|"$/g, "");
if (adminKey.length < 32) throw new Error("Missing DEV admin credential.");
const run = async (fn, args) => {
  const output = await cli(["run", fn, JSON.stringify(args)]);
  return output ? JSON.parse(output) : null;
};
if (process.argv.includes("--preflight")) {
  const controls = await run("costs:controls", { adminKey });
  const inventory = await run("sceneLibrary:inventory", {});
  console.log(JSON.stringify({ controls, readyImages: inventory.scenes.filter(s => s.status === "ready").length, otherImageStates: inventory.scenes.filter(s => s.status !== "ready" && s.status !== "missing"), readyMappings: inventory.mappings.filter(s => s.status === "ready").length }, null, 2));
  process.exit(0);
}
if (process.argv.includes("--proof-plans")) {
  const { CAREER_CATALOG } = await import("../convex/careerCatalog.ts");
  const titles = ["Corporate Lawyer", "Doctor"], key = "shared-library-proof-v1", started = Date.now();
  const reportPath = path.join(root, "design/library-evidence/aiCalls.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  report.startedAt = Math.min(report.startedAt, ...report.rows.map(r => r.timestamp));
  const checkBudget = async () => {
    const totals = await run("sceneLibrary:totals", { adminKey });
    if (totals.costINR + (report.proofPlanCostINR ?? 0) > 250) throw new Error("STOP: total passed ₹250; no more AI calls.");
  };
  await run("data:saveSearch", { key, result: { careers: titles.map(title => CAREER_CATALOG.find(c => c.title === title)) } });
  for (let careerIndex = 0; careerIndex < titles.length; careerIndex++) {
    const saved = await run("plans:get", { title: titles[careerIndex] });
    if (saved?.status === "ready") { console.log(`reused saved plan: ${titles[careerIndex]}`); continue; }
    await checkBudget();
    const plan = await run("ai:careerPlan", { searchKey: key, careerIndex });
    if (plan?.projects?.length !== 12) throw new Error(`Proof plan is not ready: ${titles[careerIndex]}`);
    const page = await run("costs:rows", { adminKey, paginationOpts: { numItems: 100, cursor: null } });
    const added = page.page.filter(r => r.timestamp >= started && r.stage === "12-month-plan" && titles.includes(r.careerTitle) && !report.rows.some(old => old._id === r._id));
    report.rows.push(...added);
    report.proofPlanCostINR = (report.proofPlanCostINR ?? 0) + added.reduce((sum, r) => sum + (r.costINR ?? 0), 0);
    report.totalCostUSD = report.rows.reduce((sum, r) => sum + (r.costUSD ?? 0), 0);
    report.totalCostINR = report.rows.reduce((sum, r) => sum + (r.costINR ?? 0), 0);
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    await checkBudget();
    console.log(`prepared plan: ${titles[careerIndex]}; total ₹${report.totalCostINR.toFixed(2)}`);
  }
  report.endedAt = Date.now();
  report.unknownCosts = report.rows.filter(r => !r.cacheHit && r.costUSD === null).length;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  process.exit(0);
}
// Explicit one-image comparison. It exits before any shared-library work can run.
if (process.argv.includes("--boy-v2-test") || process.argv.includes("--boy-v2-proof")) {
  const generationId = "boy-v2-test";
  const promptPath = path.join(root, "design/boy-v2-test-prompt.txt");
  const outputPath = path.join(root, "design/boy-v2-test.png");
  const evidencePath = path.join(root, "design/boy-v2-test-aiCall.json");
  const findRows = async () => {
    let cursor = null;
    for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
      const page = await run("costs:rows", { adminKey, paginationOpts: { numItems: 100, cursor } });
      const found = page.page.filter(row => row.generationId === generationId);
      if (found.length || page.isDone) return found;
      cursor = page.continueCursor;
    }
    throw new Error("Ledger scan exceeded its safety limit.");
  };
  const existingRows = await findRows();
  if (process.argv.includes("--boy-v2-proof")) {
    await writeFile(evidencePath, JSON.stringify(existingRows, null, 2));
    console.log(`EXACT PROMPT\n${await readFile(promptPath, "utf8")}\nAI CALL\n${JSON.stringify(existingRows, null, 2)}`);
    if (existingRows.length !== 1 || existingRows[0].status !== "succeeded") throw new Error("Expected exactly one successful Boy v2 image call.");
    process.exit(0);
  }
  if (existingRows.length) throw new Error("Boy v2 already has a recorded attempt. No new image was requested.");
  const { photoCharacter, photoPrompt } = await import("../convex/photoPrompt.ts");
  const prompt = `${photoPrompt(photoCharacter("boy", "Corporate Lawyer"), "Corporate Lawyer, 9:00: reviewing case files at a wooden desk in a private modern office. Seated, examining an open case folder and blank pages with a pen; a closed laptop nearby.")}\nReference image role: appearance, natural skin tone, lighting and mood only. Match the swept-back voluminous dark hair, thin dark metal rectangular glasses, neat light stubble, calm confident half-smile, navy blazer and open-collar white shirt. Match the look and mood of the reference, not the exact face; create an original fictional Indian man. Replace the reference composition with the requested desk activity. Soft warm indoor window light, shallow depth of field, realistic skin texture. Square eye-level medium shot with face and working hands visible. No readable writing, logos or watermarks.`;
  await writeFile(promptPath, prompt);
  const apiKey = (await cli(["env", "get", "OPENAI_API_KEY"])).replace(/^"|"$/g, "");
  if (!apiKey) throw new Error("DEV image API credential is unavailable.");
  const { default: OpenAI, toFile } = await import("openai");
  const ai = new OpenAI({ apiKey, maxRetries: 0, timeout: 150000 });
  const reference = await toFile(await readFile(path.join(root, "design/person-reference-boy-v2.png")), "person-reference-boy-v2.png", { type: "image/png" });
  const id = await run("costs:begin", { careerTitle: "Corporate Lawyer", callType: "panel image", stage: "admin-boy-v2-test", model: "gpt-image-1", imageSize: "1024x1024", imageQuality: "medium", generationId, panel: 1 });
  let response;
  try {
    // Exactly one API invocation, one image, and zero SDK retries.
    response = await ai.images.edit({ model: "gpt-image-1", image: reference, prompt, n: 1, quality: "medium", size: "1024x1024", output_format: "png" });
  } catch (error) {
    await run("costs:finish", { id, usage: null, webSearchCalls: 0, error: error instanceof Error ? error.message : String(error) });
    await writeFile(evidencePath, JSON.stringify(await findRows(), null, 2));
    throw new Error("The one Boy v2 image request failed. It was recorded; no retry or other generation was made.");
  }
  await writeFile(path.join(root, "design/boy-v2-test-response.json"), JSON.stringify({ created: response.created, requestId: response._request_id ?? null, usage: response.usage ?? null }, null, 2));
  const image = response.data?.[0]?.b64_json;
  if (image) await writeFile(outputPath, Buffer.from(image, "base64"));
  await run("costs:finish", { id, usage: response.usage ?? null, ...(response._request_id ? { requestId: response._request_id } : {}), webSearchCalls: 0, ...(!image ? { error: "No image returned." } : {}) });
  const rows = await findRows();
  await writeFile(evidencePath, JSON.stringify(rows, null, 2));
  if (!image || rows.length !== 1 || rows[0].status !== "succeeded") throw new Error("Boy v2 evidence is incomplete. Do not generate again.");
  console.log(`EXACT PROMPT\n${prompt}\nAI CALL\n${JSON.stringify(rows[0], null, 2)}`);
  process.exit(0);
}
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
const budget = async () => {
  const total = await run("sceneLibrary:totals", { adminKey });
  await writeFile(path.join(out, "running-total.json"), JSON.stringify(total, null, 2));
  if (total.overBudget) { console.log(`STOP: library total ₹${total.costINR.toFixed(2)} passed ₹250.`); throw new Error("Library budget passed ₹250; no more AI calls allowed."); }
  return total;
};
await budget();
const boyBytes = await readFile(path.join(root, "design/boy-locked.png"));
const boyDigest = createHash("sha256").update(boyBytes).digest("hex");
const lockedBoy = await run("sceneLibrary:reference", { gender: "boy" });
if (lockedBoy && lockedBoy.digest !== boyDigest) throw new Error("The stored Boy reference differs from design/boy-locked.png.");
if (!lockedBoy) {
  const uploadUrl = await run("sceneLibrary:referenceUpload", { adminKey });
  const uploaded = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "image/png" }, body: boyBytes });
  if (!uploaded.ok) throw new Error("Boy reference upload failed.");
  const { storageId } = await uploaded.json();
  await run("sceneLibrary:saveBoyReference", { adminKey, storageId, digest: boyDigest });
}
let done = initial.scenes.filter(s => s.status === "ready").length;
console.log("target: DEV doting-basilisk-558; generating shared scenes sequentially; no deployment");
try {
  // No Promise.all: await each completed storage commit before starting the next image.
  for (const scene of initial.scenes) {
    if (scene.status === "ready") continue;
    if (scene.status !== "missing") throw new Error(`Inspect prior attempt: ${scene.sceneId}/${scene.gender} (${scene.status}).`);
    await budget();
    const result = await run("libraryActions:generateScene", { adminKey, sceneId: scene.sceneId, gender: scene.gender });
    if (result.status !== "ready") throw new Error("Scene was not saved.");
    const total = await budget();
    const image = await fetch(result.imageUrl);
    if (!image.ok) throw new Error("Could not download saved shared scene.");
    await writeFile(path.join(out, `${scene.sceneId}-${scene.gender}.webp`), Buffer.from(await image.arrayBuffer()));
    done++;
    console.log(`saved ${done}/32 ${scene.sceneId}/${scene.gender}; running cost ₹${total.costINR.toFixed(2)}`);
    if (done % 8 === 0) console.log(`PROGRESS: ${done}/32 images done; running cost ₹${total.costINR.toFixed(2)}`);
  }
  const completeImages = await run("sceneLibrary:inventory", {});
  await writeFile(path.join(out, "inventory.json"), JSON.stringify(completeImages, null, 2));
  if (completeImages.scenes.some(s => s.status !== "ready")) throw new Error("Not all 32 images are ready.");
  for (const career of initial.mappings) {
    if (career.status === "ready") continue;
    await budget();
    const result = await run("libraryActions:prepareCareer", { adminKey, title: career.title });
    if (result.status !== "ready") throw new Error(`Career mapping incomplete: ${career.title}`);
    const total = await budget();
    console.log(`mapped ${career.title}; library total ₹${total.costINR.toFixed(2)}`);
  }
} finally {
  const rows = []; let cursor = null;
  do {
    const page = await run("costs:rows", { adminKey, paginationOpts: { numItems: 100, cursor } });
    rows.push(...page.page.filter(row => row.cacheKey?.startsWith("shared-scenes-v1:")));
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  rows.sort((a, b) => a.timestamp - b.timestamp);
  const after = await archive();
  const report = { target: "dev:doting-basilisk-558", startedAt, endedAt: Date.now(), archivedStoryboardsUnchanged: hash(before) === hash(after), totalCostUSD: rows.reduce((sum, r) => sum + (r.costUSD ?? 0), 0), totalCostINR: rows.reduce((sum, r) => sum + (r.costINR ?? 0), 0), unknownCosts: rows.filter(r => !r.cacheHit && r.costUSD === null).length, rows };
  await writeFile(path.join(out, "aiCalls.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, rows: `${rows.length} rows saved to design/library-evidence/aiCalls.json` }));
  if (!report.archivedStoryboardsUnchanged) throw new Error("Archived storyboard comparison failed.");
}
await writeFile(path.join(out, "inventory.json"), JSON.stringify(await run("sceneLibrary:inventory", {}), null, 2));
