import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    localStorage.setItem("pathlight-visitor-id", "compressed-image-proof");
    localStorage.setItem("pathlight-this-browser-is-me", "true");
  });
  await page.goto("http://127.0.0.1:5173/?career=Doctor&gender=girl&library=1", { waitUntil: "networkidle" });
  await page.locator(".day-locked-plan").waitFor({ timeout: 30000 });
  await page.locator("img.day-hero-image").waitFor({ state: "visible" });
  const sourceInfo = await page.locator("img").evaluateAll(images => images.map(image => ({
    alt: image.alt, src: image.currentSrc, width: image.naturalWidth,
  })));
  const logo = sourceInfo.find(image => image.alt.startsWith("Pathlight."));
  const hero = sourceInfo.find(image => image.alt.includes("working day"));
  if (!logo?.src.endsWith(".webp") || !hero?.src.endsWith(".webp")) throw new Error("The Pathlight logo or career hero did not use a compressed WebP asset.");
  await mkdir("design", { recursive: true });
  await page.screenshot({ path: "design/compressed-career-page.png", fullPage: true });
  console.log(JSON.stringify({ width: 390, screenshot: "design/compressed-career-page.png", logoWebp: logo.src.endsWith(".webp"), heroWebp: hero.src.endsWith(".webp"), images: sourceInfo.length }, null, 2));
} finally {
  await browser.close();
}
