import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
await mkdir("design/library-evidence", { recursive: true });
const evidence = [];
try {
  const inventory = JSON.parse(await readFile("design/library-evidence/inventory.json", "utf8"));
  if (inventory.scenes.length !== 32 || inventory.scenes.some(s => s.status !== "ready")) throw new Error("All 32 saved library images are required for the contact sheet.");
  const tiles = await Promise.all(inventory.scenes.map(async scene => {
    let bytes;
    try { bytes = await readFile(`design/library-evidence/${scene.sceneId}-${scene.gender}.webp`); }
    catch { const response = await fetch(scene.imageUrl); if (!response.ok) throw new Error("Saved scene download failed."); bytes = Buffer.from(await response.arrayBuffer()); await writeFile(`design/library-evidence/${scene.sceneId}-${scene.gender}.webp`, bytes); }
    return `<figure><img src="data:image/webp;base64,${bytes.toString("base64")}" /><figcaption>${scene.sceneId} · ${scene.gender === "boy" ? "Boy" : "Girl"}</figcaption></figure>`;
  }));
  const sheet = await browser.newPage({ viewport: { width: 1040, height: 900 }, deviceScaleFactor: 1 });
  await sheet.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f8f7fc;color:#423653;font-family:Arial,sans-serif}h1{font-size:24px;margin:0 0 6px}p{margin:0 0 20px;font-size:14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}figure{margin:0;background:white;padding:8px;border-radius:10px}img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px}figcaption{font-size:13px;padding:10px 0 3px;text-align:center}</style></head><body><h1>Shared scene library</h1><p>16 scenes · Girl and Boy · 32 medium-quality images</p><div class="grid">${tiles.join("")}</div></body></html>`);
  await sheet.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
  await sheet.screenshot({ path: "design/library-sheet.png", fullPage: true });
  await sheet.close();
  if (process.argv.includes("--sheet-only")) { console.log("Saved design/library-sheet.png from all 32 stored images."); await browser.close(); process.exit(0); }
  for (const [title, gender, filename] of [["Corporate Lawyer", "boy", "library-lawyer.png"], ["Doctor", "girl", "library-doctor.png"]]) {
    await page.goto(`http://127.0.0.1:5173/?career=${encodeURIComponent(title)}&gender=${gender}&library=1`);
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll(".day-moment-photo img").length === 4 && [...document.querySelectorAll(".career-day img")].every(img => img.complete && img.naturalWidth > 0));
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`${title} overflows at 390px.`);
    const workdayUrls = await page.locator(".day-moment-photo img").evaluateAll(images => images.map(i => i.src));
    const monthUrls = await page.locator(".day-project-image").evaluateAll(images => images.map(i => i.src));
    if (monthUrls.some(url => !workdayUrls.includes(url))) throw new Error("Month thumbnail does not reuse a workday scene.");
    await page.screenshot({ path: `design/${filename}`, fullPage: true });
    await page.getByRole("button", { name: "View full 12-month plan", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll(".day-project-image").length === 12);
    const allMonthUrls = await page.locator(".day-project-image").evaluateAll(images => images.map(i => i.src));
    if (allMonthUrls.some(url => !workdayUrls.includes(url))) throw new Error("A full-plan month thumbnail did not reuse the library.");
    evidence.push({ title, gender, width: 390, workdayUrls, monthUrls, allMonthUrls, screenshot: `design/${filename}` });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile("design/library-evidence/browser.json", JSON.stringify(evidence, null, 2));
  console.log("Both 390px shared-library pages passed; screenshots saved.");
} finally { await browser.close(); }
