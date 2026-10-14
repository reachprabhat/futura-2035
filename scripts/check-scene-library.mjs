import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await mkdir("design/library-evidence", { recursive: true });
const evidence = [];
try {
  for (const [title, gender, filename] of [["Corporate Lawyer", "boy", "library-lawyer.png"], ["Doctor", "girl", "library-doctor.png"]]) {
    await page.goto(`http://127.0.0.1:5173/?career=${encodeURIComponent(title)}&gender=${gender}&library=1`);
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".day-moment-photo img").length === 4 && [...document.querySelectorAll(".career-day img")].every(img => img.complete && img.naturalWidth > 0));
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`${title} overflows at 390px.`);
    const workdayUrls = await page.locator(".day-moment-photo img").evaluateAll(images => images.map(i => i.src));
    const monthUrls = await page.locator(".day-project-image").evaluateAll(images => images.map(i => i.src));
    if (monthUrls.some(url => !workdayUrls.includes(url))) throw new Error("Month thumbnail does not reuse a workday scene.");
    await page.screenshot({ path: `design/${filename}`, fullPage: true });
    evidence.push({ title, gender, width: 390, workdayUrls, monthUrls, screenshot: `design/${filename}` });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile("design/library-evidence/browser.json", JSON.stringify(evidence, null, 2));
  console.log("Both 390px shared-library pages passed; screenshots saved.");
} finally { await browser.close(); }
