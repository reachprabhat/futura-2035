import { chromium } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { readFile, writeFile } from "node:fs/promises";

const client = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const adminKey = (await readFile("artifacts/admin-costs-key.txt", "utf8")).trim();
const imagesRef = makeFunctionReference("planThumbnails:images");
const rowsRef = makeFunctionReference("costs:rows");
const storyRef = makeFunctionReference("data:stories");
const allLedger = async () => {
  const rows = [];
  let cursor = null;
  do {
    const page = await client.query(rowsRef, { adminKey, paginationOpts: { numItems: 100, cursor } });
    rows.push(...page.page);
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  return rows;
};
const start = JSON.parse(await readFile("design/thumbnail-library/aiCalls-start.json", "utf8"));
const before = new Set(start.ids);
const catalog = await client.query(imagesRef, {});
if (catalog.length !== 23 || catalog.some(theme => theme.status !== "ready" || !theme.imageUrl)) throw new Error("The complete 23-image thumbnail library is required.");
const localImages = await Promise.all(catalog.map(async theme => {
  const bytes = await readFile(`design/thumbnail-library/${theme.themeId}.webp`);
  return `<figure><img src="data:image/webp;base64,${bytes.toString("base64")}"><figcaption>${theme.title}</figcaption></figure>`;
}));
const browser = await chromium.launch({ headless: true });
try {
  const sheet = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await sheet.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;padding:26px;background:#f8f7fc;color:#423653;font-family:Arial,sans-serif}h1{font-size:25px;margin:0 0 6px}p{margin:0 0 20px;font-size:14px}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}figure{margin:0;padding:8px;background:white;border-radius:11px;box-shadow:0 2px 9px #42365317}img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:7px}figcaption{font-size:12px;line-height:1.25;padding:9px 1px 2px;min-height:39px}</style></head><body><h1>Futura · Plan thumbnails</h1><p>23 shared low quality photos · no identifiable faces</p><div class="grid">${localImages.join("")}</div></body></html>`);
  await sheet.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
  await sheet.screenshot({ path: "design/thumb-sheet.png", fullPage: true });
  await sheet.close();

  const flows = [
    { title: "Doctor", gender: "girl", interests: "biology, chemistry, debate", hopes: "high earning medical professional in usa", screenshot: "design/thumb-doctor.png" },
    { title: "Author", gender: "boy", interests: "literature, philosphy, watching movies", hopes: "good earning, overseas opportunity, stability", screenshot: "design/thumb-author.png" },
  ];
  const flowProof = [];
  for (const flow of flows) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:5173/");
    await page.getByRole("button", { name: "Explore their possibilities" }).click();
    await page.locator("#child-gender").selectOption(flow.gender);
    await page.locator("#interests").fill(flow.interests);
    await page.locator("#hopes").fill(flow.hopes);
    await page.locator("form").getByRole("button", { name: "Explore their possibilities" }).click();
    const card = page.locator(".m-career").filter({ has: page.getByRole("heading", { name: flow.title, exact: true }) });
    await card.getByRole("button", { name: "Explore this future" }).click({ timeout: 30000 });
    await page.getByRole("button", { name: "A day in the life" }).click();
    await page.getByRole("button", { name: "View full 12-month plan" }).waitFor({ timeout: 150000 });
    await page.getByRole("button", { name: "View full 12-month plan" }).click();
    await page.waitForFunction(() => document.querySelectorAll(".day-month").length === 12 && [...document.querySelectorAll(".day-month img[data-thumbnail-theme]")].length === 12, { timeout: 30000 });
    await page.waitForFunction(() => [...document.querySelectorAll(".day-month img")].every(image => image.complete && image.naturalWidth > 0), { timeout: 30000 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`${flow.title} overflows at 390px.`);
    const served = await client.query(storyRef, { searchKey: JSON.stringify(["careers-v4-catalog-80", flow.interests, flow.hopes]), gender: flow.gender });
    const themeIds = await page.locator(".day-month img[data-thumbnail-theme]").evaluateAll(images => images.map(image => image.getAttribute("data-thumbnail-theme")));
    if (themeIds.some(id => !catalog.some(theme => theme.themeId === id))) throw new Error(`${flow.title} contains a missing thumbnail theme.`);
    const images = await page.locator(".day-month img[data-thumbnail-theme]").evaluateAll(items => items.map(image => ({ src: image.src, themeId: image.getAttribute("data-thumbnail-theme") })));
    if (images.some(image => !catalog.some(theme => theme.themeId === image.themeId && image.src === theme.imageUrl))) throw new Error(`${flow.title} does not use the shared thumbnail library.`);
    if (!served[0] || errors.length) throw new Error(`${flow.title}: ${errors.join("; ") || "career result is missing"}`);
    await page.screenshot({ path: flow.screenshot, fullPage: true });
    flowProof.push({ title: flow.title, gender: flow.gender, width: 390, monthsOpen: 12, themes: themeIds, screenshot: flow.screenshot });
    await page.close();
    console.log(`${flow.title} (${flow.gender}): 12 tagged month cards use library thumbnails; screenshot saved.`);
  }
  const created = (await allLedger()).filter(row => !before.has(row._id)).sort((a, b) => a.timestamp - b.timestamp);
  const totalCostINR = created.reduce((sum, row) => sum + (row.costINR ?? 0), 0);
  await writeFile("design/thumbnail-library/aiCalls-final.json", JSON.stringify({ rows: created, totalCostINR, imageCount: created.filter(row => row.stage === "plan-thumbnail-image" && !row.cacheHit).length, flows: flowProof }, null, 2));
  await writeFile("design/thumbnail-library/browser-proof.json", JSON.stringify(flowProof, null, 2));
  console.log(JSON.stringify({ rows: created.map(row => ({ id: row._id, careerTitle: row.careerTitle, stage: row.stage, model: row.model, quality: row.imageQuality ?? null, cacheHit: row.cacheHit, costINR: row.costINR })), totalCostINR, imageCount: created.filter(row => row.stage === "plan-thumbnail-image" && !row.cacheHit).length }, null, 2));
} finally { await browser.close(); }
