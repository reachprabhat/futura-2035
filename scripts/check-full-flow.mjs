import { chromium } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { readFile, writeFile } from "node:fs/promises";

const rootUrl = "http://127.0.0.1:5173/";
const client = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const adminKey = (await readFile("artifacts/admin-costs-key.txt", "utf8")).trim();
const rows = makeFunctionReference("costs:rows");
const career = makeFunctionReference("sceneLibrary:career");
const ledger = async () => {
  const all = [];
  let cursor = null;
  do {
    const page = await client.query(rows, { adminKey, paginationOpts: { numItems: 100, cursor } });
    all.push(...page.page);
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  return all;
};
const before = new Set((await ledger()).map(row => row._id));
const flows = [
  { title: "Doctor", gender: "girl", interests: "biology, chemistry, debate", hopes: "high earning medical professional in usa", screenshot: "design/full-1.png" },
  { title: "Financial Analyst", gender: "boy", interests: "accountancy, cooking, drawing", hopes: "good income, mba", screenshot: "design/full-2.png" },
  { title: "Author", gender: "boy", interests: "literature, philosphy, watching movies", hopes: "good earning, overseas opportunity, stability", screenshot: "design/full-3.png" },
];
const browser = await chromium.launch({ headless: true });
const evidence = [];
try {
  for (const flow of flows) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(rootUrl);
    await page.getByRole("button", { name: "Explore their possibilities" }).click();
    await page.locator("#child-gender").selectOption(flow.gender);
    await page.locator("#interests").fill(flow.interests);
    await page.locator("#hopes").fill(flow.hopes);
    await page.locator("form").getByRole("button", { name: "Explore their possibilities" }).click();
    const card = page.locator(".m-career").filter({ has: page.getByRole("heading", { name: flow.title, exact: true }) });
    await card.getByRole("button", { name: "Explore this future" }).click({ timeout: 30000 });
    await page.getByRole("button", { name: "A day in the life" }).click();
    await page.locator(".day-month").first().waitFor({ timeout: 150000 });
    await page.waitForFunction(() => document.querySelectorAll(".day-moment-photo img").length === 4 && [...document.querySelectorAll(".career-day img")].every(img => img.complete && img.naturalWidth > 0), { timeout: 30000 });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`${flow.title} overflows 390px.`);
    const shared = await client.query(career, { title: flow.title, gender: flow.gender });
    if (!shared || shared.status !== "ready" || shared.gender !== flow.gender) throw new Error(`Shared ${flow.gender} scenes are unavailable for ${flow.title}.`);
    const expected = shared.panels.map(p => p.imageUrl);
    const used = await page.locator(".day-moment-photo img").evaluateAll(images => images.map(i => i.src));
    if (JSON.stringify(used) !== JSON.stringify(expected)) throw new Error(`${flow.title} shows an image outside the chosen gender's library mapping.`);
    if (await page.locator(".day-month").count() !== 3) throw new Error("Preview does not contain exactly three months.");
    const pin = await page.locator(".day-sticky").evaluate(el => getComputedStyle(el).position);
    if (pin !== "fixed") throw new Error("Full-plan button is not pinned.");
    await page.getByRole("button", { name: "View full 12-month plan", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll(".day-month").length === 12);
    const months = await page.locator(".day-project-image").evaluateAll(images => images.map(i => i.src));
    if (months.some(url => !expected.includes(url))) throw new Error(`${flow.title} has a month image outside the shared workday scenes.`);
    if (await page.locator(".day-skill").count() !== 4 || errors.length) throw new Error(`${flow.title}: ${errors.join("; ") || "four skills are missing"}`);
    await page.screenshot({ path: flow.screenshot, fullPage: true });
    evidence.push({ ...flow, mappedScenes: shared.panels.map(p => p.sceneId), previewMonths: 3, fullMonths: months.length, skillChips: 4, width: 390 });
    await page.close();
    console.log(`${flow.title} (${flow.gender}): 4 scenes, 4 skills, 3 preview months, 12 full months, 390px screenshot saved.`);
  }
  const created = (await ledger()).filter(row => !before.has(row._id)).sort((a, b) => a.timestamp - b.timestamp);
  const imageCalls = created.filter(row => row.callType === "panel image" || row.model.startsWith("gpt-image"));
  await writeFile("design/full-flow-aiCalls.json", JSON.stringify({ rows: created, totalCostINR: created.reduce((sum, row) => sum + (row.costINR ?? 0), 0), imageCalls: imageCalls.length, flows: evidence }, null, 2));
  console.log(JSON.stringify({ aiCalls: created.map(row => ({ id: row._id, careerTitle: row.careerTitle, callType: row.callType, stage: row.stage, model: row.model, cacheHit: row.cacheHit, status: row.status, costINR: row.costINR })), totalCostINR: created.reduce((sum, row) => sum + (row.costINR ?? 0), 0), imageCalls: imageCalls.length }, null, 2));
  if (imageCalls.length) throw new Error("An image call was created during the parent flow.");
} finally {
  await browser.close();
}
