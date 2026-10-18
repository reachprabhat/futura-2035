import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const usage = "Usage: npm run generate:roles-2030s -- --careers \"A,B\" [--overwrite] | --remaining [--overwrite]";
const args = process.argv.slice(2);
let careerNames = null, remaining = false, overwrite = false;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--overwrite") overwrite = true;
  else if (arg === "--remaining") remaining = true;
  else if (arg === "--careers") {
    const value = args[++index];
    if (!value || value.startsWith("--")) throw new Error(`--careers needs a comma-separated list. ${usage}`);
    careerNames = value.split(",").map(title => title.trim()).filter(Boolean);
    if (!careerNames.length || new Set(careerNames).size !== careerNames.length) throw new Error(`--careers needs unique, non-empty names. ${usage}`);
  } else throw new Error(`Unknown option: ${arg}. ${usage}`);
}
if (remaining === !!careerNames) throw new Error(usage);
const client = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const catalog = await client.query(api.sceneLibrary.roleCatalog, {});
const first = new Set(["Economist", "Author", "Food Critic"]);
const titles = remaining ? catalog.map(row => row.title).filter(title => !first.has(title)) : careerNames;
for (const title of titles) {
  const result = await client.action(api.ai.generateRole2030sDev, { title, overwrite });
  console.log(JSON.stringify(remaining ? { title: result.title, state: result.state } : result));
}
console.log(`BATCH ${JSON.stringify(await client.query(api.sceneLibrary.role2030sCallReport, {}))}`);
