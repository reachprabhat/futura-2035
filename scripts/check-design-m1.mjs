import { chromium } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const dir = "artifacts/design-m1";
await mkdir(dir, { recursive: true });
const env = await readFile(".env.local", "utf8");
const url = env.match(/^VITE_CONVEX_URL=(.+)$/m)?.[1].trim();
if (url !== "https://doting-basilisk-558.convex.cloud") throw Error("Futura dev only");
const client = new ConvexHttpClient(url);
const adminKey = (await readFile("artifacts/admin-costs-key.txt", "utf8")).trim();
async function rows() {
  const all = []; let cursor = null;
  do {
    const result = await client.query(makeFunctionReference("costs:rows"), { adminKey, paginationOpts: { numItems: 100, cursor } });
    all.push(...result.page); cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  return all;
}
const baseline = await rows(), ids = new Set(baseline.map(r => r._id));
const browser = await chromium.launch({ channel: "chromium", headless: true });
const errors = [], shots = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(30000);
  page.on("pageerror", error => errors.push(error.message));
  async function capture(screen) {
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.evaluate(() => document.fonts.ready);
      const imageElements = await page.locator(".m1 img").all();
      for (const image of imageElements) { await image.scrollIntoViewIfNeeded(); await image.evaluate(img => img.decode()); }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, columnWidth: document.querySelector(".m-main").getBoundingClientRect().width }));
      if (dimensions.scrollWidth > width || dimensions.columnWidth > 720) throw Error(`${screen} overflows at ${width}`);
      const path = `${dir}/${screen}-${width}.png`;
      await page.screenshot({ path, fullPage: true }); shots.push(path); checks.push({ screen, ...dimensions });
    }
  }
  await page.goto("http://127.0.0.1:5173/");
  await capture("landing");
  await page.getByRole("button", { name: "Explore their possibilities", exact: true }).click();
  await page.getByLabel("What does your child enjoy?").fill("Economics, book writing, food critique");
  await page.getByLabel("What matters to you as a parent?").fill("good earning, stability, overseas");
  await capture("input");
  await page.getByRole("button", { name: "Futura 2035 home" }).click();
  // Open the example exactly once. Its endpoint is cache-only, even if AI is enabled.
  await page.getByRole("button", { name: "Take a look at an example" }).click();
  await page.locator(".m-career").nth(2).waitFor();
  await capture("results");
  await page.getByRole("button", { name: "Explore this future" }).first().click();
  await page.locator(".m-connection").waitFor();
  await capture("career-detail");
  await page.getByRole("button", { name: "A day in the life", exact: true }).click();
  await page.locator("#storyboard figure").nth(3).waitFor();
  await capture("storyboard");
  let added = [];
  for (let i = 0; i < 30; i++) { added = (await rows()).filter(r => !ids.has(r._id)); if (added.length >= 2) break; await page.waitForTimeout(100); }
  const report = { exampleRuns: 1, titles: await page.locator(".m-storyboard>.m-lede").allTextContents(), screenshots: shots, checks, browserErrors: errors, newOpenAICalls: added.filter(r => !r.cacheHit).length, aiCalls: added };
  await writeFile(`${dir}/proof.json`, JSON.stringify(report, null, 2));
  await writeFile(`${dir}/aiCalls.json`, JSON.stringify(added, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.newOpenAICalls || errors.length || added.length !== 2) throw Error("Unexpected calls or browser errors");
} finally { await browser.close(); }
