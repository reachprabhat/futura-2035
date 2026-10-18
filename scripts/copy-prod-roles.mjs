import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const usage = [
  "Usage: npm run release:copy-roles -- [--careers \"A,B\"] [--overwrite] [--dry-run]",
  "       Copies role text, the 2026 baseline and 2030s earnings fields from ready DEV scene mappings to PROD.",
  "       --overwrite replaces saved role text only for the named careers; --dry-run writes nothing.",
].join("\n");
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) { console.log(usage); process.exit(0); }
let careerNames = null, overwrite = false, dryRun = false;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--overwrite") overwrite = true;
  else if (arg === "--dry-run") dryRun = true;
  else if (arg === "--careers") {
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`--careers needs a comma-separated list.\n${usage}`);
    careerNames = value.split(",").map(title => title.trim()).filter(Boolean);
    if (!careerNames.length || new Set(careerNames).size !== careerNames.length) throw new Error(`--careers needs unique, non-empty names.\n${usage}`);
  } else throw new Error(`Unknown option: ${arg}\n${usage}`);
}
if (overwrite && !careerNames) throw new Error(`--overwrite requires --careers so its scope is explicit.\n${usage}`);

const dev = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const target = new ConvexHttpClient("https://nautical-chicken-192.convex.cloud");
const adminKey = process.env.PROD_ADMIN_COSTS_KEY;
if (!dryRun && (!adminKey || adminKey.length < 32)) throw new Error("Set PROD_ADMIN_COSTS_KEY in this PowerShell session before copying career role text.");
const [source, production] = await Promise.all([
  dev.query(api.releaseAssets.contentSnapshot, {}),
  target.query(api.releaseAssets.contentSnapshot, {}),
]);
const selected = careerNames ? new Set(careerNames) : null;
const eligible = source.mappings.filter(row => row.status === "ready" && ((row.role2030s && Array.isArray(row.dayMoments2030s) && row.dayMoments2030s.length === 4) || (typeof row.salaryMinINR === "number" && typeof row.salaryMaxINR === "number" && row.salaryBasis && row.baselineSource) || (typeof row.earnings2030sLow === "number" && typeof row.earnings2030sHigh === "number" && row.earnings2030sBasis)) && (!selected || selected.has(row.title)));
const sourceByTitle = new Map(eligible.map(row => [row.title, row]));
const prodByTitle = new Map(production.mappings.map(row => [row.title, row]));
const titles = careerNames ?? [...sourceByTitle.keys()].sort((a, b) => a.localeCompare(b));
for (const title of titles) {
  const row = sourceByTitle.get(title), current = prodByTitle.get(title);
  const hasProdRole = Boolean(current?.role2030s?.trim() || current?.roleShort2030s?.trim() || current?.dayMoments2030s?.length || current?.salaryMinINR !== undefined || current?.earnings2030sLow !== undefined);
  const status = !row ? "skip (no ready DEV role text, baseline or 2030s earnings)" : !current || current.status !== "ready" ? "skip (no ready PROD scene mapping)" : hasProdRole && !overwrite ? "skip (already has role text, baseline or earnings)" : hasProdRole ? "replace saved role text, baseline and earnings" : "copy role text, baseline and earnings to PROD";
  console.log(`${title}: ${status}`);
}
if (dryRun) {
  console.log(`Dry run complete: ${eligible.length} ready DEV career role records checked; no writes.`);
} else {
  let created = 0, replaced = 0, skipped = 0;
  for (const title of titles) {
    const row = sourceByTitle.get(title);
    if (!row) { skipped++; continue; }
    const result = await target.mutation(api.releaseAssets.copyCareerRole2030s, { adminKey, title, role2030s: row.role2030s, roleShort2030s: row.roleShort2030s, dayMoments2030s: row.dayMoments2030s, salaryMinINR: row.salaryMinINR, salaryMaxINR: row.salaryMaxINR, salaryBasis: row.salaryBasis, baselineSource: row.baselineSource, earnings2030sLow: row.earnings2030sLow, earnings2030sHigh: row.earnings2030sHigh, earnings2030sBasis: row.earnings2030sBasis, overwrite });
    if (result === "created") created++;
    else if (result === "replaced") replaced++;
    else skipped++;
  }
  console.log(`Career role copy complete: created ${created}, replaced ${replaced}, skipped ${skipped}.`);
}
