import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const client = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const exec = promisify(execFile);
const { stdout } = await exec(process.execPath, ["node_modules/convex/bin/main.js", "env", "get", "ADMIN_COSTS_KEY", "--deployment", "doting-basilisk-558"], { cwd: process.cwd(), timeout: 30000 });
const adminKey = stdout.trim().replace(/^"|"$/g, "");
const creativeTitles = ["Digital Accessibility Specialist", "User Experience Designer", "Game Designer", "Simulation Designer", "Digital Artist", "Animator", "Illustrator", "Author", "Content Strategist", "Editor", "Documentary Filmmaker", "Learning Designer", "Industrial Designer", "Performing Artist", "Assistive Technology Designer"];
const sceneIds = ["creative-hero", "creative-brief", "creative-making", "creative-feedback", "creative-share"];
const retryLimit = 2;
let retriesUsed = 0;
const inventory = await client.query(api.sceneLibrary.inventory, {});
const states = new Map(inventory.scenes.filter(row => sceneIds.includes(row.sceneId)).map(row => [`${row.sceneId}:${row.gender}`, row]));
let ledger = [], cursor = null;
for (let index = 0; index < 50; index++) {
  const page = await client.query(api.costs.rows, { adminKey, includeTest: true, paginationOpts: { numItems: 100, cursor } });
  ledger.push(...page.page.filter(row => row.callType === "panel image" && row.careerTitle.startsWith("Shared scene: creative-")));
  if (page.isDone) break;
  cursor = page.continueCursor;
}
let attempts = ledger.filter(row => !row.cacheHit).length;
for (const sceneId of sceneIds) for (const gender of ["girl", "boy"]) {
  const key = `${sceneId}:${gender}`;
  if (states.get(key)?.status === "ready") continue;
  let isRetry = states.get(key)?.status === "failed";
  while (attempts < 12) {
    try {
      const result = await client.action(api.libraryActions.generateScene, { adminKey, sceneId, gender, ...(isRetry ? { retry: true } : {}) });
      attempts++;
      states.set(key, { sceneId, gender, status: result.status, imageUrl: result.imageUrl });
      console.log(JSON.stringify({ sceneId, gender, status: result.status, attempt: attempts }));
      break;
    } catch (error) {
      attempts++;
      const reason = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ sceneId, gender, status: "failed", attempt: attempts, reason }));
      const current = (await client.query(api.sceneLibrary.inventory, {})).scenes.find(row => row.sceneId === sceneId && row.gender === gender);
      states.set(key, current);
      if (attempts >= 12 || retriesUsed >= retryLimit) break;
      retriesUsed++;
      isRetry = true;
    }
  }
  if (attempts >= 12 && states.get(key)?.status !== "ready") break;
}
const missing = sceneIds.flatMap(sceneId => ["girl", "boy"].filter(gender => states.get(`${sceneId}:${gender}`)?.status !== "ready").map(gender => `${sceneId}/${gender}`));
if (missing.length) {
  console.log(JSON.stringify({ state: "incomplete", missing, attempts, retriesUsed }));
  process.exitCode = 1;
} else {
  const mappingResult = await client.mutation(api.sceneLibrary.applyCreativeMappings, { adminKey });
  const mappings = await Promise.all(creativeTitles.map(async title => {
    const story = await client.query(api.sceneLibrary.career, { title, gender: "girl" });
    return { title, hero: story?.heroSceneId, scenes: story?.panels?.map(panel => panel.sceneId) };
  }));
  console.log(JSON.stringify({ state: "ready", attempts, retriesUsed, mappingResult, mappings }, null, 2));
}
