import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const samples = ["Data Analyst", "Nutritionist", "Agricultural Scientist"];
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log('Usage: npm run generate:earnings-completion -- --careers "Data Scientist,Teacher,Performing Artist" | --remaining | --all');
  process.exit(0);
}
const catalog = (await client.query(api.sceneLibrary.roleCatalog, {})).map(row => row.title);
const savedInputs = await client.query(api.sceneLibrary.careerEarningsInputs, {});
// Mark all pre-existing saved search ranges as stored baselines once; no source result is edited.
for (const base of savedInputs.filter(row => row.baselineSource === "stored")) {
  await client.mutation(api.sceneLibrary.saveStoredCareerBaseline, { title: base.title, low: base.low, high: base.high, basis: base.basis });
}
let titles;
if (args[0] === "--careers" && args[1]) titles = args[1].split(",").map(value => value.trim()).filter(Boolean);
else if (args.length === 1 && args[0] === "--remaining") {
  const hasBaseline = new Set(savedInputs.map(row => row.title));
  const progress = await client.query(api.sceneLibrary.careerEarnings2030sProgress, {});
  const exhaustedBaselineRetries = new Set(progress.filter(row => row.state === "skipped-validation" && row.reason?.includes("baseline attempt")).map(row => row.title));
  titles = catalog.filter(title => !hasBaseline.has(title) && !samples.includes(title) && !exhaustedBaselineRetries.has(title));
} else if (args.length === 1 && args[0] === "--all") titles = catalog;
else throw new Error("Choose --careers with names, --remaining, or --all. This script reads no credentials.");
if (new Set(titles).size !== titles.length || titles.some(title => !catalog.includes(title))) throw new Error("Career names must be unique titles from the career catalog.");
for (const title of titles) {
  let baseline = await client.action(api.ai.generateCareerEarningsBaselineDev, { title });
  console.log(`BASELINE ${JSON.stringify(baseline)}`);
  if (baseline.state === "invalid-baseline" || baseline.state === "skipped-no-career-record") continue;
  const estimate = await client.action(api.ai.generateCareerEarnings2030sDev, { title });
  console.log(`2030S ${JSON.stringify(estimate)}`);
}
console.log(`REPORT ${JSON.stringify(await client.query(api.sceneLibrary.careerEarningsCompletionCallReport, {}))}`);
