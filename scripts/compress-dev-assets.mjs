import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const devUrl = "https://doting-basilisk-558.convex.cloud";
const outputRoot = join(process.cwd(), "src", "assets", "optimized");
const client = new ConvexHttpClient(devUrl);
const inventory = await client.query(api.sceneLibrary.inventory, {});
const thumbnails = await client.query(api.planThumbnails.images, {});
if (inventory.scenes.length !== 32 || inventory.scenes.some(item => item.status !== "ready" || !item.imageUrl))
  throw new Error("DEV must provide all 32 ready scene images before compression.");
if (thumbnails.length !== 23 || thumbnails.some(item => item.status !== "ready" || !item.imageUrl))
  throw new Error("DEV must provide all 23 ready thumbnail images before compression.");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("about:blank");

async function encodeWebp(input, contentType) {
  const inputBase64 = Buffer.from(input).toString("base64");
  const result = await page.evaluate(async ({ inputBase64, contentType }) => {
    const image = new Image();
    image.src = `data:${contentType};base64,${inputBase64}`;
    await image.decode();
    const width = Math.min(900, image.naturalWidth);
    const height = Math.max(1, Math.round(image.naturalHeight * width / image.naturalWidth));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d", { alpha: true }).drawImage(image, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.75));
    if (!blob) throw new Error("This browser could not encode WebP.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return { base64: btoa(binary), width, height };
  }, { inputBase64, contentType });
  return { bytes: Buffer.from(result.base64, "base64"), width: result.width, height: result.height };
}

const report = [];
async function saveAsset({ id, kind, input, contentType, relativePath }) {
  const encoded = await encodeWebp(input, contentType);
  const outputPath = join(outputRoot, relativePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, encoded.bytes);
  report.push({
    id, kind, relativePath: relativePath.replaceAll("\\", "/"),
    sourceBytes: input.byteLength, compressedBytes: encoded.bytes.byteLength,
    width: encoded.width, height: encoded.height,
    sha256: createHash("sha256").update(encoded.bytes).digest("hex"),
  });
}

try {
  for (const item of inventory.scenes) {
    const response = await fetch(item.imageUrl);
    if (!response.ok) throw new Error(`DEV scene image download failed (${response.status}).`);
    await saveAsset({ id: `${item.sceneId}:${item.gender}`, kind: "scene", input: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type")?.split(";")[0] || "image/png", relativePath: join("scenes", `${item.sceneId}-${item.gender}.webp`) });
  }
  for (const item of thumbnails) {
    const response = await fetch(item.imageUrl);
    if (!response.ok) throw new Error(`DEV thumbnail download failed (${response.status}).`);
    await saveAsset({ id: item.themeId, kind: "thumbnail", input: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type")?.split(";")[0] || "image/png", relativePath: join("thumbnails", `${item.themeId}.webp`) });
  }
  const logo = await readFile("public/pathlight-logo.svg");
  await saveAsset({ id: "pathlight-logo", kind: "brand", input: logo, contentType: "image/svg+xml", relativePath: join("brand", "pathlight-logo.webp") });
  const qr = await readFile("public/assets/upi-qr.png");
  await saveAsset({ id: "upi-qr", kind: "payment", input: qr, contentType: "image/png", relativePath: join("brand", "upi-qr.webp") });
} finally {
  await browser.close();
}

const sum = rows => rows.reduce((total, row) => total + row.sourceBytes, 0);
const compressed = rows => rows.reduce((total, row) => total + row.compressedBytes, 0);
const byKind = kind => report.filter(row => row.kind === kind);
const sceneAverage = compressed(byKind("scene")) / 32;
const thumbnailAverage = compressed(byKind("thumbnail")) / 23;
const pageBytes = sceneAverage * 4 + thumbnailAverage * 3 + byKind("brand")[0].compressedBytes;
const summary = {
  source: "DEV doting-basilisk-558",
  quality: 75,
  maxWidth: 900,
  images: report.length,
  averageSourceBytes: sum(report) / report.length,
  averageCompressedBytes: compressed(report) / report.length,
  estimatedCareerPageImageBytes: Math.round(pageBytes),
  estimateIncludes: "Pathlight logo, four scene images, and the three visible project thumbnails; excludes the payment screen QR.",
  outputRoot: "src/assets/optimized",
  assets: report,
};
await writeFile("design/compressed-assets-report.json", `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  source: summary.source,
  counts: { scenes: 32, thumbnails: 23, logo: 1, qr: 1, total: report.length },
  averageBeforeBytes: Math.round(summary.averageSourceBytes),
  averageAfterBytes: Math.round(summary.averageCompressedBytes),
  estimatedCareerPageMB: (summary.estimatedCareerPageImageBytes / 1048576).toFixed(3),
  report: "design/compressed-assets-report.json",
}, null, 2));
