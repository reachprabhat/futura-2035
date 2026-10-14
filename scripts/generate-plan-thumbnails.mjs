import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = process.cwd();
if (root.toLowerCase() !== "c:\\users\\reach\\skill-sprint") throw new Error("Run only in C:\\Users\\reach\\skill-sprint.");
const env = await readFile(".env.local", "utf8");
if (!/^CONVEX_DEPLOYMENT=dev:doting-basilisk-558(?:\s|$)/m.test(env) || !/^VITE_CONVEX_URL=https:\/\/doting-basilisk-558\.convex\.cloud\s*$/m.test(env)) throw new Error("Expected the doting-basilisk-558 DEV configuration.");
if (process.env.CONVEX_DEPLOY_KEY) throw new Error("Remove any deployment-key override before proceeding.");
const adminKey = (await readFile("artifacts/admin-costs-key.txt", "utf8")).trim();
if (adminKey.length < 32) throw new Error("DEV admin credential is missing.");
const client = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const imagesRef = makeFunctionReference("planThumbnails:images");
const generateRef = makeFunctionReference("planThumbnailActions:generate");
const costsRef = makeFunctionReference("costs:rows");
const evidenceDir = "design/thumbnail-library";
await mkdir(evidenceDir, { recursive: true });
const allLedger = async () => {
  const rows = [];
  let cursor = null;
  do {
    const page = await client.query(costsRef, { adminKey, paginationOpts: { numItems: 100, cursor } });
    rows.push(...page.page);
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  return rows;
};
const before = await allLedger();
await writeFile(`${evidenceDir}/aiCalls-start.json`, JSON.stringify({ capturedAt: new Date().toISOString(), ids: before.map(row => row._id) }, null, 2));
const themes = await client.query(imagesRef, {});
if (themes.length !== 23) throw new Error(`Expected 23 themes, found ${themes.length}.`);
let done = themes.filter(theme => theme.status === "ready").length;
if (themes.some(theme => theme.status !== "ready" && theme.status !== "missing")) throw new Error("A theme has a previous failed or active attempt; inspect it before generating.");
for (const theme of themes) {
  if (theme.status === "ready") continue;
  console.log(`Generating ${done + 1}/23: ${theme.title}`);
  await client.action(generateRef, { adminKey, themeId: theme.themeId });
  const refreshed = await client.query(imagesRef, {});
  const saved = refreshed.find(item => item.themeId === theme.themeId);
  if (saved?.status !== "ready" || !saved.imageUrl) throw new Error(`${theme.themeId} did not save successfully.`);
  const response = await fetch(saved.imageUrl);
  if (!response.ok) throw new Error(`Could not download saved thumbnail ${theme.themeId}.`);
  await writeFile(`${evidenceDir}/${theme.themeId}.webp`, Buffer.from(await response.arrayBuffer()));
  done++;
  const rows = (await allLedger()).filter(row => row._creationTime >= (before[0]?._creationTime ?? 0) && row.stage === "plan-thumbnail-image" && row.cacheKey?.startsWith("plan-thumbnails-v1:"));
  const costINR = rows.reduce((sum, row) => sum + (row.costINR ?? 0), 0);
  await writeFile(`${evidenceDir}/aiCalls-progress.json`, JSON.stringify({ done, total: themes.length, costINR, rows }, null, 2));
  console.log(`Done ${done}/23; thumbnail image cost ₹${costINR.toFixed(4)}.`);
}
const finalImages = await client.query(imagesRef, {});
if (finalImages.some(theme => theme.status !== "ready" || !theme.imageUrl)) throw new Error("The thumbnail set is incomplete.");
const ledger = await allLedger();
const previous = new Set(before.map(row => row._id));
const newRows = ledger.filter(row => !previous.has(row._id)).sort((a, b) => a.timestamp - b.timestamp);
await writeFile(`${evidenceDir}/aiCalls-images.json`, JSON.stringify({ rows: newRows, totalCostINR: newRows.reduce((sum, row) => sum + (row.costINR ?? 0), 0), imageCalls: newRows.filter(row => row.stage === "plan-thumbnail-image").length }, null, 2));
console.log(`All ${done}/23 thumbnails are ready in DEV. New image call rows: ${newRows.filter(row => row.stage === "plan-thumbnail-image").length}; total ledger cost: ₹${newRows.reduce((sum, row) => sum + (row.costINR ?? 0), 0).toFixed(4)}.`);
