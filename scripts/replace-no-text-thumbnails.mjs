import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = process.cwd().toLowerCase();
if (root !== "c:\\users\\reach\\skill-sprint") throw new Error("Run only in C:\\Users\\reach\\skill-sprint.");
const env = await readFile(".env.local", "utf8");
if (!/^CONVEX_DEPLOYMENT=dev:doting-basilisk-558(?:\s|$)/m.test(env) || !/^VITE_CONVEX_URL=https:\/\/doting-basilisk-558\.convex\.cloud\s*$/m.test(env)) throw new Error("Expected only the doting-basilisk-558 DEV target.");
if (/^CONVEX_DEPLOY_KEY=/m.test(env) || process.env.CONVEX_DEPLOY_KEY) throw new Error("Deployment key override detected; stopping.");

const adminKey = (await readFile("artifacts/admin-costs-key.txt", "utf8")).trim();
if (adminKey.length < 32) throw new Error("DEV admin credential is missing.");
const client = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const imagesRef = makeFunctionReference("planThumbnails:images");
const rowsRef = makeFunctionReference("costs:rows");
const controlsRef = makeFunctionReference("costs:controls");
const replaceRef = makeFunctionReference("planThumbnailActions:regenerateNoTextThumbnail");
const targets = ["presentation-slides", "field-visit", "law-contract"];
const evidenceDir = "design/thumbnail-library/replacements";
await mkdir(evidenceDir, { recursive: true });

async function allLedger() {
  const result = [];
  let cursor = null;
  do {
    const page = await client.query(rowsRef, { adminKey, paginationOpts: { numItems: 100, cursor } });
    result.push(...page.page);
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  return result;
}
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const controls = await client.query(controlsRef, { adminKey });
if (!controls.aiEnabled || controls.callCount + 3 > controls.dailyCallCap || controls.estimatedSpendINR + 6 > controls.dailyCostCapINR) {
  throw new Error(`DEV budget does not allow all three calls: ${JSON.stringify({ aiEnabled: controls.aiEnabled, callCount: controls.callCount, dailyCallCap: controls.dailyCallCap, estimatedSpendINR: controls.estimatedSpendINR, dailyCostCapINR: controls.dailyCostCapINR })}`);
}
const initialImages = await client.query(imagesRef, {});
if (initialImages.length !== 23 || initialImages.some(image => image.status !== "ready" || !image.imageUrl)) throw new Error("Expected all 23 existing library images to be ready.");
const beforeById = new Map(initialImages.map(image => [image.themeId, image]));
const beforeHashes = new Map();
for (const image of initialImages) beforeHashes.set(image.themeId, sha(await readFile(`design/thumbnail-library/${image.themeId}.webp`)));
const beforeLedger = await allLedger();
const intendedGenerationIds = targets.map(id => `thumbnail-no-text-v1:${id}`);
if (beforeLedger.some(row => intendedGenerationIds.includes(row.generationId))) throw new Error("A replacement call already exists in the ledger; refusing to duplicate it.");
await writeFile(`${evidenceDir}/no-text-before.json`, JSON.stringify({ capturedAt: new Date().toISOString(), imageUrls: Object.fromEntries(initialImages.map(({ themeId, imageUrl }) => [themeId, imageUrl])), fileSha256: Object.fromEntries(beforeHashes) }, null, 2));

const prompts = [];
for (let index = 0; index < targets.length; index++) {
  const themeId = targets[index];
  console.log(`Starting one low-quality replacement call (${index + 1}/3): ${themeId}`);
  const result = await client.action(replaceRef, { adminKey, themeId });
  if (result.themeId !== themeId || result.status !== "ready" || result.generationId !== intendedGenerationIds[index] || !result.prompt?.endsWith("no text, no letters, no words, no logos anywhere in the image")) throw new Error(`Unexpected response for ${themeId}.`);
  prompts.push({ themeId, generationId: result.generationId, prompt: result.prompt });
  const current = await client.query(imagesRef, {});
  const saved = current.find(image => image.themeId === themeId);
  if (saved?.status !== "ready" || saved.imageUrl === beforeById.get(themeId).imageUrl) throw new Error(`${themeId} was not replaced in DEV.`);
  const response = await fetch(saved.imageUrl);
  if (!response.ok) throw new Error(`Could not fetch the saved ${themeId} thumbnail.`);
  await writeFile(`design/thumbnail-library/${themeId}.webp`, Buffer.from(await response.arrayBuffer()));
  const ledger = await allLedger();
  const row = ledger.find(item => item.generationId === result.generationId);
  if (!row || row.status !== "succeeded" || row.cacheHit || row.imageQuality !== "low") throw new Error(`The completed low-quality call is missing from aiCalls for ${themeId}.`);
  console.log(`Saved ${themeId}; recorded cost ₹${(row.costINR ?? 0).toFixed(6)}.`);
}

const finalImages = await client.query(imagesRef, {});
for (const image of finalImages) {
  if (!targets.includes(image.themeId) && image.imageUrl !== beforeById.get(image.themeId).imageUrl) throw new Error(`Untargeted DEV image changed: ${image.themeId}`);
}
const changedLocalFiles = [];
for (const themeId of targets) {
  const afterHash = sha(await readFile(`design/thumbnail-library/${themeId}.webp`));
  if (afterHash === beforeHashes.get(themeId)) throw new Error(`Local replacement did not update: ${themeId}`);
  changedLocalFiles.push(themeId);
}
for (const image of finalImages) if (!targets.includes(image.themeId) && sha(await readFile(`design/thumbnail-library/${image.themeId}.webp`)) !== beforeHashes.get(image.themeId)) throw new Error(`Untargeted local image changed: ${image.themeId}`);

const finalLedger = await allLedger();
const rows = intendedGenerationIds.map(generationId => {
  const row = finalLedger.find(item => item.generationId === generationId);
  if (!row) throw new Error(`Missing requested aiCalls row ${generationId}.`);
  return row;
});
const totalCostINR = rows.reduce((sum, row) => sum + (row.costINR ?? 0), 0);
await writeFile(`${evidenceDir}/no-text-prompts.json`, JSON.stringify(prompts, null, 2));
await writeFile(`${evidenceDir}/no-text-aiCalls.json`, JSON.stringify({ rows, totalCostINR }, null, 2));

const catalog = await client.query(imagesRef, {});
const figures = await Promise.all(catalog.map(async theme => {
  const bytes = await readFile(`design/thumbnail-library/${theme.themeId}.webp`);
  return `<figure><img src="data:image/webp;base64,${bytes.toString("base64")}"><figcaption>${theme.title}</figcaption></figure>`;
}));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;padding:26px;background:#f8f7fc;color:#423653;font-family:Arial,sans-serif}h1{font-size:25px;margin:0 0 6px}p{margin:0 0 20px;font-size:14px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}figure{margin:0;padding:8px;background:white;border-radius:11px;box-shadow:0 2px 9px #42365317}img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:7px}figcaption{font-size:12px;line-height:1.25;padding:9px 1px 2px;min-height:39px}</style></head><body><h1>Futura · Plan thumbnails</h1><p>23 shared low quality photos · no identifiable faces</p><div class="grid">${figures.join("")}</div></body></html>`);
  await page.waitForFunction(() => [...document.images].length === 23 && [...document.images].every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: "design/thumb-sheet.png", fullPage: true });
} finally { await browser.close(); }

console.log(JSON.stringify({ regenerated: targets, changedLocalFiles, unchangedImages: 20, totalCostINR, rows }, null, 2));
