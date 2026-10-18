import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const usage = [
  "Usage: npm run release:copy-content -- [--careers \"<comma-separated career names>\"] [--overwrite] [--missing] [--overwrite-mappings] [--dry-run]",
  "       --careers with --overwrite replaces only the named careers' existing PROD plans using ready DEV plans.",
  "       --missing copies ready DEV plans only where PROD has no ready plan; it never replaces a ready PROD plan.",
  "       --careers with --overwrite-mappings replaces only the named PROD scene mappings with ready DEV mappings.",
  "       --dry-run lists plan and mapping changes; it performs no writes.",
].join("\n");
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage);
  process.exit(0);
}

let careerNames = null;
let dryRun = false;
let overwrite = false, missing = false, overwriteMappings = false;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--dry-run") dryRun = true;
  else if (arg === "--overwrite") overwrite = true;
  else if (arg === "--missing") missing = true;
  else if (arg === "--overwrite-mappings") overwriteMappings = true;
  else if (arg === "--careers") {
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`--careers needs a comma-separated list.\n${usage}`);
    careerNames = value.split(",").map(title => title.trim()).filter(Boolean);
    if (!careerNames.length || new Set(careerNames).size !== careerNames.length) throw new Error(`--careers needs unique, non-empty names.\n${usage}`);
  } else throw new Error(`Unknown option: ${arg}\n${usage}`);
}
if (overwrite && !careerNames) throw new Error(`--overwrite requires --careers so its scope is explicit.\n${usage}`);
if (overwriteMappings && !careerNames) throw new Error(`--overwrite-mappings requires --careers so its scope is explicit.\n${usage}`);
if (overwrite && missing) throw new Error(`--overwrite and --missing cannot be combined: choose replacement or missing plans.\n${usage}`);

const selectedCareers = careerNames ? new Set(careerNames) : null;
const dev = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const target = new ConvexHttpClient("https://nautical-chicken-192.convex.cloud");
const adminKey = process.env.PROD_ADMIN_COSTS_KEY;
if (!dryRun && (!adminKey || adminKey.length < 32)) throw new Error("Set PROD_ADMIN_COSTS_KEY in this PowerShell session before copying career content.");

const isSelected = title => !selectedCareers || selectedCareers.has(title);
const [source, production] = await Promise.all([
  dev.query(api.releaseAssets.contentSnapshot, {}),
  target.query(api.releaseAssets.contentSnapshot, {}),
]);
if (source.plans.some(row => row.status === "ready" && !row.hasPlan))
  throw new Error("A ready DEV career plan has no plan content.");
if (overwrite && !missing && !overwriteMappings) {
  const sourcePlans = new Map(source.plans.filter(row => row.status === "ready" && row.plan && isSelected(row.title)).map(row => [row.title, row]));
  const prodPlans = new Map(production.plans.map(row => [row.title, row]));
  for (const title of careerNames) {
    const sourcePlan = sourcePlans.get(title);
    const existing = prodPlans.has(title);
    if (sourcePlan) console.log(`${title}: plan — ${existing ? "replace with ready DEV plan" : "create from ready DEV plan"}`);
    else console.log(`${title}: plan — skip (no ready DEV plan)`);
  }
  const replacements = careerNames.filter(title => sourcePlans.has(title) && prodPlans.has(title));
  console.log(`PROD plans to replace: ${replacements.length ? replacements.join(", ") : "none"}`);
  if (dryRun) {
    console.log(`Dry run complete: ${replacements.length} PROD plans would be replaced; no production writes.`);
  } else {
    let created = 0, replaced = 0, skipped = 0;
    for (const title of careerNames) {
      const row = sourcePlans.get(title);
      if (!row) { skipped++; continue; }
      const result = await target.mutation(api.releaseAssets.copyCareerPlan, { adminKey, title, plan: row.plan, overwrite: true });
      if (result === "created") created++;
      else if (result === "replaced") replaced++;
      else skipped++;
    }
    console.log(`Selected plan copy complete: created ${created}, replaced ${replaced}, skipped ${skipped}.`);
  }
  process.exit(0);
}

const sourceMappings = new Map(source.mappings.filter(row => row.status === "ready" && isSelected(row.title)).map(row => [row.title, row]));
const sourcePlans = new Map(source.plans.filter(row => row.status === "ready" && row.plan && isSelected(row.title)).map(row => [row.title, row]));
const prodMappings = new Map(production.mappings.map(row => [row.title, row]));
const prodPlans = new Map(production.plans.map(row => [row.title, row]));
const productionScenes = await target.query(api.sceneLibrary.inventory, {});
const prodSceneKeys = new Set(productionScenes.scenes.filter(row => row.status === "ready" && row.imageUrl).map(row => `${row.sceneId}:${row.gender}`));

if (!sourceMappings.size) throw new Error("DEV has no ready career scene mappings to copy.");
if (source.mappings.some(row => row.status === "ready" && isSelected(row.title) && (!Array.isArray(row.panels) || row.panels.length !== 4)))
  throw new Error("A ready DEV scene mapping is incomplete.");
for (const mapping of sourceMappings.values()) {
  if (mapping.heroSceneId) for (const gender of ["girl", "boy"]) {
    if (!prodSceneKeys.has(`${mapping.heroSceneId}:${gender}`)) {
      if (dryRun) console.log(`${mapping.title}: ${mapping.heroSceneId} (${gender}) is not in PROD yet; run release:copy-images before applying this mapping.`);
      else throw new Error(`PROD has no ready hero image for ${mapping.title}: ${mapping.heroSceneId} (${gender}).`);
    }
  }
  for (const panel of mapping.panels) for (const gender of ["girl", "boy"]) {
    if (!prodSceneKeys.has(`${panel.sceneId}:${gender}`)) {
      if (dryRun) console.log(`${mapping.title}: ${panel.sceneId} (${gender}) is not in PROD yet; run release:copy-images before applying this mapping.`);
      else throw new Error(`PROD has no ready image for ${mapping.title}: ${panel.sceneId} (${gender}).`);
    }
  }
}

const titles = [...new Set([
  ...sourceMappings.keys(),
  ...sourcePlans.keys(),
  ...production.plans.filter(row => row.status === "failed" && isSelected(row.title)).map(row => row.title),
])].sort((a, b) => a.localeCompare(b));

function actionsFor(title) {
  const sourceMapping = sourceMappings.get(title), prodMapping = prodMappings.get(title);
  const sourcePlan = sourcePlans.get(title), prodPlan = prodPlans.get(title);
  const mappingReadyAfterRun = prodMapping?.status === "ready" || !!sourceMapping;
  return {
    mapping: sourceMapping
      ? prodMapping?.status === "ready" ? overwriteMappings ? "replace with ready DEV mapping" : "skip (already ready)" : prodMapping ? "link from PROD scene keys" : "create and link from PROD scene keys"
      : "skip (no ready DEV mapping)",
    plan: sourcePlan
      ? prodPlan?.status === "ready" && prodPlan.plan ? missing ? "skip (already ready; --missing never replaces)" : overwrite ? "replace with DEV plan" : "skip (already ready)" : prodPlan ? "copy ready DEV plan over missing/non-ready row" : "create from DEV plan"
      : prodPlan?.status === "failed" && mappingReadyAfterRun ? "reset to not generated yet (mapping ready)"
        : prodPlan?.status === "failed" ? "reset to unavailable (no ready mapping)" : "skip (no ready DEV plan)",
  };
}

for (const title of titles) {
  const actions = actionsFor(title);
  console.log(`${title}: mapping — ${actions.mapping}; plan — ${actions.plan}`);
}

if (dryRun) {
  console.log(`Dry run complete: ${sourceMappings.size} ready mappings and ${sourcePlans.size} ready plans checked; no production writes.`);
} else {
  let mappingsCreated = 0, mappingsLinked = 0, mappingsSkipped = 0;
  for (const [title, mapping] of sourceMappings) {
    const result = await target.mutation(api.releaseAssets.copySceneMapping, { adminKey, title, panels: mapping.panels, ...(mapping.heroSceneId ? { heroSceneId: mapping.heroSceneId } : {}), overwrite: overwriteMappings });
    if (result === "created") mappingsCreated++;
    else if (result === "linked") mappingsLinked++;
    else if (result === "replaced") mappingsLinked++;
    else mappingsSkipped++;
  }

  let plansCreated = 0, plansReplaced = 0, plansSkipped = 0;
  for (const [title, row] of sourcePlans) {
    const existing = prodPlans.get(title);
    if (missing && existing?.status === "ready" && existing.plan) { plansSkipped++; continue; }
    const result = await target.mutation(api.releaseAssets.copyCareerPlan, { adminKey, title, plan: row.plan, ...(overwrite ? { overwrite: true } : {}) });
    if (result === "created") plansCreated++;
    else if (result === "replaced") plansReplaced++;
    else plansSkipped++;
  }

  let failedPlansReset = 0, failedPlansSuppressed = 0, failedPlansSkipped = 0;
  for (const row of production.plans.filter(item => item.status === "failed" && !sourcePlans.has(item.title) && isSelected(item.title))) {
    const mappingWillBeReady = prodMappings.get(row.title)?.status === "ready" || sourceMappings.has(row.title);
    if (mappingWillBeReady) {
      const result = await target.mutation(api.releaseAssets.resetFailedCareerPlan, { adminKey, title: row.title });
      if (result === "reset") failedPlansReset++;
      else failedPlansSkipped++;
    } else {
      const result = await target.mutation(api.releaseAssets.suppressFailedCareerPlan, { adminKey, title: row.title });
      if (result === "suppressed") failedPlansSuppressed++;
      else failedPlansSkipped++;
    }
  }
  console.log(`Production content copy complete: mappings created ${mappingsCreated}, linked ${mappingsLinked}, skipped ${mappingsSkipped}; plans created ${plansCreated}, replaced ${plansReplaced}, skipped ${plansSkipped}; failed plans reset to not generated yet ${failedPlansReset}, marked unavailable ${failedPlansSuppressed}, skipped ${failedPlansSkipped}.`);
}
