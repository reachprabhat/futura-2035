import { chromium } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

if (process.argv.slice(2).some(arg => arg === "--help" || arg === "-h")) {
  console.log("Usage: npm run release:check -- --help");
  console.log("       Checks the PROD scene images, career mappings, plans and thumbnails (read-only).");
  process.exit(0);
}

const client = new ConvexHttpClient("https://nautical-chicken-192.convex.cloud");
const [sceneData, thumbnails, content] = await Promise.all([
  client.query(api.sceneLibrary.inventory, {}),
  client.query(api.planThumbnails.images, {}),
  client.query(api.releaseAssets.contentSnapshot, {}),
]);
const scenes = sceneData.scenes.filter(row => row.status === "ready" && row.imageUrl);
const readyThumbnails = thumbnails.filter(row => row.status === "ready" && row.imageUrl);
console.log(`Production scenes: ${scenes.length}/32 ready (${scenes.filter(row => row.compressed).length} compressed)`);
console.log(`Production thumbnails: ${readyThumbnails.length}/23 ready (${readyThumbnails.filter(row => row.compressed).length} compressed)`);
const readyMappings = sceneData.mappings.filter(row => row.status === "ready");
const readyPlans = content.plans.filter(row => row.status === "ready");
console.log(`Careers with a ready mapping: ${readyMappings.length}/${sceneData.mappings.length}`);
console.log(`Ready plans: ${readyPlans.length}`);
if (scenes.length !== 32 || readyThumbnails.length !== 23) process.exitCode = 1;
if (readyMappings.length !== sceneData.mappings.length) process.exitCode = 1;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("https://nautical-chicken-192.convex.site/", { waitUntil: "networkidle" });
  const header = page.locator('img[alt="Pathlight. Real paths. Brighter future."]');
  const visible = await header.isVisible().catch(() => false);
  console.log(`Pathlight header: ${visible ? "visible" : "missing"}`);
  if (!visible) process.exitCode = 1;
} finally {
  await browser.close();
}
