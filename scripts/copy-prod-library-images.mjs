import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { SCENE_CATALOG } from "../convex/sceneCatalog.ts";

const devUrl = "https://doting-basilisk-558.convex.cloud";
const prodUrl = "https://nautical-chicken-192.convex.cloud";
if (process.argv.slice(2).some(arg => arg === "--help" || arg === "-h")) {
  console.log("Usage: npm run release:copy-images -- [--dry-run]");
  console.log("       Copies ready DEV scene and thumbnail images to PROD; --dry-run writes nothing.");
  process.exit(0);
}
const dryRun = process.argv.includes("--dry-run");
if (process.argv.slice(2).some(arg => arg !== "--dry-run")) throw new Error("Only the optional --dry-run flag is supported.");
const adminKey = process.env.PROD_ADMIN_COSTS_KEY;
if (!adminKey || adminKey.length < 32) throw new Error("Set PROD_ADMIN_COSTS_KEY in this PowerShell session before copying images.");
const dev = new ConvexHttpClient(devUrl);
const target = new ConvexHttpClient(prodUrl);
const [sceneData, thumbnailData] = await Promise.all([
  dev.query(api.sceneLibrary.inventory, {}),
  dev.query(api.planThumbnails.images, {}),
]);
const scenes = sceneData.scenes.filter(row => row.status === "ready" && row.imageUrl);
const thumbnails = thumbnailData.filter(row => row.status === "ready" && row.imageUrl);
const expectedScenes = SCENE_CATALOG.length * 2;
if (scenes.length !== expectedScenes || thumbnails.length !== 23) throw new Error(`DEV library count check failed: ${scenes.length} scenes (expected ${expectedScenes}), ${thumbnails.length} thumbnails.`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("about:blank");
async function encodeWebp(input, contentType) {
  const inputBase64 = Buffer.from(input).toString("base64");
  const result = await page.evaluate(async ({ inputBase64, contentType }) => {
    const image = new Image(); image.src = `data:${contentType};base64,${inputBase64}`; await image.decode();
    const width = Math.min(900, image.naturalWidth), height = Math.max(1, Math.round(image.naturalHeight * width / image.naturalWidth));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    canvas.getContext("2d", { alpha: true }).drawImage(image, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.75));
    if (!blob) throw new Error("WebP encoding failed.");
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, { inputBase64, contentType });
  return Buffer.from(result);
}
async function uploadToProd(bytes, contentType) {
  const uploadUrl = await target.mutation(api.releaseAssets.prepareLibraryOriginalUpload, { adminKey });
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": contentType }, body: bytes });
  if (!response.ok) throw new Error(`Convex image upload failed (${response.status}).`);
  return (await response.json()).storageId;
}
async function copy({ kind, id, gender, fallbackUrl }) {
  const args = { kind, itemId: id, ...(gender ? { gender } : {}) };
  let prodState;
  try {
    prodState = await target.query(api.releaseAssets.inspectLibraryImage, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!(dryRun && kind === "scene" && /unknown scene image id/i.test(message))) throw error;
    // The older PROD catalog does not know the new scene IDs until its matching backend release.
    // During dry-run, show the expected creation/upload steps without writing anything.
    prodState = { exists: false, hasOriginal: false, hasCompressed: false, compressedDigest: null, originalUrl: null };
  }
  const sourceState = await dev.query(api.releaseAssets.inspectLibraryImage, args);
  if (!sourceState.originalUrl) throw new Error(`DEV original image is missing for ${id}${gender ? ` (${gender})` : ""}.`);
  const label = `${kind} ${id}${gender ? ` (${gender})` : ""}`;
  if (prodState.hasOriginal && prodState.hasCompressed) {
    console.log(`${label}: skip (original and compressed image already exist on prod)`);
    return "skipped";
  }

  let originalBytes, originalContentType;
  if (!prodState.hasOriginal) {
    const originalResponse = await fetch(sourceState.originalUrl);
    if (!originalResponse.ok) throw new Error(`DEV original image fetch failed for ${label}.`);
    originalContentType = originalResponse.headers.get("content-type")?.split(";")[0] || "image/png";
    originalBytes = Buffer.from(await originalResponse.arrayBuffer());
  }
  if (!originalBytes) {
    const originalResponse = await fetch(sourceState.originalUrl);
    if (!originalResponse.ok) throw new Error(`DEV original image fetch failed for ${label}.`);
    originalContentType = originalResponse.headers.get("content-type")?.split(";")[0] || "image/png";
    originalBytes = Buffer.from(await originalResponse.arrayBuffer());
  }
  const bytes = await encodeWebp(originalBytes, originalContentType);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const compressedCurrent = prodState.hasCompressed && prodState.compressedDigest === sha256;
  const steps = [];
  if (!prodState.exists) steps.push("create prod row");
  if (!prodState.hasOriginal) steps.push(`upload original (${originalContentType})`);
  if (compressedCurrent) steps.push("skip compressed WebP (already current)");
  else steps.push("upload and link compressed WebP");
  if (dryRun) {
    console.log(`${label}: ${steps.join("; ")}`);
    return "skipped";
  }
  if (originalBytes) {
    const originalStorageId = await uploadToProd(originalBytes, originalContentType);
    await target.mutation(api.releaseAssets.ensureLibraryOriginal, { adminKey, ...args, storageId: originalStorageId });
  }
  if (!compressedCurrent) {
    const prepared = await target.mutation(api.releaseAssets.prepareCompressedLibraryImage, { adminKey, ...args, sha256 });
    if (!prepared.alreadyCurrent) {
      const upload = await fetch(prepared.uploadUrl, { method: "POST", headers: { "Content-Type": "image/webp" }, body: bytes });
      if (!upload.ok) throw new Error(`Convex compressed image upload failed for ${label} (${upload.status}).`);
      const { storageId } = await upload.json();
      await target.mutation(api.releaseAssets.saveCompressedLibraryImage, { adminKey, ...args, storageId, sha256 });
    }
  }
  console.log(`${label}: ${steps.join("; ")}`);
  return "copied";
}
let copied = 0, skipped = 0;
try {
  for (const scene of scenes) { if (await copy({ kind: "scene", id: scene.sceneId, gender: scene.gender, fallbackUrl: scene.imageUrl }) === "copied") copied++; else skipped++; }
  for (const thumbnail of thumbnails) { if (await copy({ kind: "thumbnail", id: thumbnail.themeId, fallbackUrl: thumbnail.imageUrl }) === "copied") copied++; else skipped++; }
} finally {
  await browser.close();
}
console.log(dryRun
  ? `Dry run complete: ${scenes.length + thumbnails.length} images checked; no production writes.`
  : `Completed production image copy from DEV: ${copied} copied, ${skipped} skipped (${scenes.length} scenes, ${thumbnails.length} thumbnails checked). Originals remain stored.`);
