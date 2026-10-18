import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const preferred = ["Economist", "Author", "Food Critic"];
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log('Usage: npm run generate:earnings-2030s -- --careers "Economist,Author,Food Critic" | --remaining | --all');
  process.exit(0);
}
let titles;
if (args[0] === "--careers" && args[1]) titles = args[1].split(",").map(value => value.trim()).filter(Boolean);
else if (args.length === 1 && args[0] === "--remaining") titles = (await client.query(api.sceneLibrary.roleCatalog, {})).map(row => row.title).filter(title => !preferred.includes(title));
else if (args.length === 1 && args[0] === "--all") titles = (await client.query(api.sceneLibrary.roleCatalog, {})).map(row => row.title);
else throw new Error("Choose --careers with names, --remaining, or --all. No credentials are read by this script.");
if (new Set(titles).size !== titles.length) throw new Error("Career names must be unique.");
const catalog = new Set((await client.query(api.sceneLibrary.roleCatalog, {})).map(row => row.title));
if (titles.some(title => !catalog.has(title))) throw new Error("A requested title is not in the career catalog.");
const outputs = [];
for (const title of titles) {
  const result = await client.action(api.ai.generateCareerEarnings2030sDev, { title });
  outputs.push(result);
  console.log(JSON.stringify(result));
}
console.log(`REPORT ${JSON.stringify(await client.query(api.sceneLibrary.careerEarnings2030sCallReport, {}))}`);
