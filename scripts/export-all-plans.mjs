import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomInt } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { chromium } from "playwright";
import { createServer } from "vite";
import { api } from "../convex/_generated/api.js";

const root = path.resolve(".");
if (root.toLowerCase() !== "c:\\users\\reach\\skill-sprint") {
  throw new Error(`Run this script from C:\\Users\\reach\\skill-sprint (current folder: ${root}).`);
}

const devUrl = "https://doting-basilisk-558.convex.cloud";
const outputDir = path.join(root, "exports", "plans");
const client = new ConvexHttpClient(devUrl);
const safeName = value => value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "") || "Career";

async function withConcurrency(values, limit, task) {
  const results = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await task(values[index]);
    }
  }));
  return results;
}

const careers = await client.query(api.sceneLibrary.roleShortCatalog, {});
const imageRows = await client.query(api.planThumbnails.images, {});
const imageByTheme = new Map(imageRows.filter(row => row.status === "ready" && row.imageUrl).map(row => [row.themeId, row.imageUrl]));
const records = await withConcurrency(careers, 8, async career => ({
  career,
  row: await client.query(api.plans.get, { title: career.title }),
}));
const ready = records.filter(({ row }) => row?.status === "ready" && row.plan);
const skipped = records.filter(({ row }) => row?.status !== "ready" || !row.plan);

await mkdir(outputDir, { recursive: true });
const port = randomInt(5200, 6200);
const vite = await createServer({
  configFile: false,
  root,
  logLevel: "error",
  server: { host: "127.0.0.1", port, strictPort: true },
});
let browser;
const failures = [];
const saved = [];
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });

  for (const { career, row } of ready) {
    const plan = row.plan;
    if (!Array.isArray(plan.projects) || plan.projects.length !== 12) {
      failures.push(`${career.title} (READY plan has ${plan.projects?.length ?? 0} months)`);
      continue;
    }
    try {
      const base64 = await page.evaluate(async ({ careerTitle, planData, imageEntries }) => {
        const { makePlanPdf } = await import("/src/planPdf.ts");
        const pdf = await makePlanPdf({
          career: careerTitle,
          gender: "Girl",
          panels: [],
          projects: planData.projects,
          skills: planData.coreSkills ?? planData.skills ?? [],
          imageByTheme: new Map(imageEntries),
        });
        const bytes = new Uint8Array(await pdf.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return btoa(binary);
      }, { careerTitle: career.title, planData: plan, imageEntries: [...imageByTheme] });
      const fileName = `${safeName(career.title)} - 12 Month plan.pdf`;
      await writeFile(path.join(outputDir, fileName), Buffer.from(base64, "base64"));
      saved.push(fileName);
    } catch (error) {
      failures.push(`${career.title} (export error: ${error instanceof Error ? error.message : String(error)})`);
    }
  }
} finally {
  await browser?.close();
  await vite.close();
}

const listing = (await readdir(outputDir)).filter(name => name.toLowerCase().endsWith(".pdf")).sort((a, b) => a.localeCompare(b));
const randomSamples = listing.length <= 3 ? listing : Array.from(new Set(Array.from({ length: 3 }, () => listing[randomInt(listing.length)])));
console.log(`DEV_URL ${devUrl}`);
console.log(`CAREERS_IN_CATALOG ${careers.length}`);
console.log(`READY_PLANS_FOUND ${ready.length}`);
console.log(`SAVED_COUNT ${saved.length}`);
console.log(`SKIPPED_COUNT ${skipped.length}`);
console.log(`SKIPPED_NAMES ${skipped.map(({ career, row }) => `${career.title} [${row?.status ?? "no plan"}]`).join("; ") || "none"}`);
console.log(`EXPORT_FAILURE_COUNT ${failures.length}`);
console.log(`EXPORT_FAILURES ${failures.join("; ") || "none"}`);
console.log("GENDER_VARIANTS 0 (the current PDF generator uses the same saved neutral month images for both genders)");
console.log("FOLDER_LISTING_BEGIN");
for (const file of listing) console.log(file);
console.log("FOLDER_LISTING_END");
console.log(`RANDOM_PDF_SAMPLES ${randomSamples.join("; ") || "none"}`);

if (saved.length + failures.length !== ready.length) throw new Error("Not every READY plan was either exported or reported as a failure.");
