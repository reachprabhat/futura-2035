import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

function localEnv(name: string) {
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find(value => value.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim();
}

const deployment = process.env.VITE_CONVEX_URL ?? localEnv("VITE_CONVEX_URL");
if (deployment !== "https://doting-basilisk-558.convex.cloud") {
  throw new Error(`Refusing to run outside DEV: ${deployment ?? "no Convex URL configured"}`);
}

const client = new ConvexHttpClient(deployment);
const savedSearch = JSON.stringify([
  "careers-v4-catalog-80",
  "book writing, economics, food critique",
  "good earning, overseas, stability",
]);
const careers = [
  { title: "Economist", searchKey: savedSearch, careerIndex: 0 },
  { title: "Performing Artist", searchKey: "tracking-validation-no-saved-search", careerIndex: 0 },
  { title: "Learning Designer", searchKey: JSON.stringify(["careers-v4-catalog-80", "classical dance, classical singing, creative art", "global career &recognition, performing artist"]), careerIndex: 2 },
];
const cases = [
  { name: "no tracking", tracking: undefined },
  {
    name: "full tracking",
    tracking: {
      visitorId: "tracking-validation-test",
      isTest: true,
      age: 14,
      device: "mobile",
      referrerDomain: "www.google.com",
      ref: "wa-test",
      utm_source: "whatsapp",
      utm_medium: "share",
      utm_campaign: "tracking-validation",
    },
  },
  {
    name: "unknown tracking key",
    tracking: {
      visitorId: "tracking-validation-test",
      isTest: true,
      age: 14,
      device: "mobile",
      referrerDomain: "www.google.com",
      ref: "wa-test",
      utm_source: "whatsapp",
      utm_medium: "share",
      utm_campaign: "tracking-validation",
      foo: "future-field",
    },
  },
];

for (const career of careers) {
  const saved = await client.query(api.plans.get, { title: career.title });
  if (!saved?.plan || !["ready", "needs-review"].includes(saved.status)) {
    throw new Error(`No saved plan for ${career.title}; stopping before any generation.`);
  }
}

for (const career of careers) {
  for (const testCase of cases) {
    const args = {
      searchKey: career.searchKey,
      careerIndex: career.careerIndex,
      ...(testCase.tracking === undefined ? {} : { tracking: testCase.tracking }),
    };
    try {
      const result = await client.action(api.ai.careerPlan, args as any);
      if (career.title === "Performing Artist") {
        throw new Error("Performing Artist unexpectedly resolved without a saved career search.");
      }
      const state = result?.state ?? "saved plan";
      console.log(`PASS ${career.title} | ${testCase.name} | ${state} | no generation`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (career.title === "Performing Artist" && message.includes("Choose a career from your saved results first")) {
        console.log(`PASS ${career.title} | ${testCase.name} | server validator accepted; saved search unavailable | no generation`);
      } else if (/argument validation|ArgumentValidationError|extra field/i.test(message)) {
        throw new Error(`FAIL ${career.title} | ${testCase.name} | ${message}`);
      } else {
        throw error;
      }
    }
  }
}

console.log("Fresh AI generations: 0");

