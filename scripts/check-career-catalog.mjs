import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const dir = "artifacts/career-catalog";
await mkdir(dir, { recursive: true });
const env = await readFile(".env.local", "utf8");
const url = env.match(/^VITE_CONVEX_URL=(.+)$/m)?.[1].trim();
if (url !== "https://doting-basilisk-558.convex.cloud") throw Error("Futura dev only");
const client = new ConvexHttpClient(url);
const ref = name => makeFunctionReference(name);
const adminKey = (await readFile("artifacts/admin-costs-key.txt", "utf8")).trim();
async function rows() {
  const all = []; let cursor = null;
  do {
    const p = await client.query(ref("costs:rows"), { adminKey, paginationOpts: { numItems: 100, cursor } });
    all.push(...p.page); cursor = p.isDone ? null : p.continueCursor;
  } while (cursor);
  return all;
}
const inputs = [
  { interests: "Economics, book writing, food critique", hopes: "good earning, stability, overseas" },
  { interests: "Cricket, maths, video games", hopes: "stability, stay in India" },
  { interests: "Drawing, biology, helping people", hopes: "good earning, overseas" },
];
const baseline = await rows();
await writeFile(`${dir}/aiCalls-before.json`, JSON.stringify(baseline, null, 2));
const responses = [];
// Reserve the remaining daily allowance for all three requested career results
// before opening cards, which triggers the app's unchanged image prefetch.
for (const [i, input] of inputs.entries()) {
  const result = await client.action(ref("ai:recommend"), input);
  responses.push({ input, result });
  await writeFile(`${dir}/input-${i + 1}-full-raw.json`, JSON.stringify({ input, result }, null, 2));
  await writeFile(`${dir}/input-${i + 1}-ai-text.json`, JSON.parse(result.raw).output_text);
  console.log(JSON.stringify({ input: i + 1, titles: result.careers.map(c => c.title), initialStoryboardPaths: result.stories.map(s => ({ title: s.title, path: s.path })) }));
}
// Generate one real storyboard and request it again to prove exact-title reuse.
const first = responses[0].result;
const generated = await client.action(ref("ai:storyboard"), { searchKey: first.searchKey, careerIndex: 0 });
const reused = await client.action(ref("ai:storyboard"), { searchKey: first.searchKey, careerIndex: 0 });
await writeFile(`${dir}/cache-proof.json`, JSON.stringify({ generated, reused }, null, 2));
if (reused.path !== "storyboard-cache" || JSON.stringify(generated.panels.map(p => p.storageId)) !== JSON.stringify(reused.panels.map(p => p.storageId))) throw Error("Storyboard cache was not reused");
console.log(JSON.stringify({ cacheProof: reused.title, path: reused.path }));
const browser = await chromium.launch({ channel: "chromium", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(180000);
const browserErrors = [];
page.on("pageerror", e => browserErrors.push(e.message));
const browserRuns = [];
try {
  for (const [i, input] of inputs.entries()) {
    await page.goto("http://127.0.0.1:5173/");
    await page.getByLabel("What does your child enjoy?").fill(input.interests);
    await page.getByLabel("What matters to you as a parent?").fill(input.hopes);
    await page.locator("form button.primary").click();
    await page.locator(".career").first().waitFor();
    const titles = await page.locator(".career h3").allTextContents();
    if (JSON.stringify(titles) !== JSON.stringify(responses[i].result.careers.map(c => c.title))) throw Error("Browser titles differed from saved discovery output");
    await page.locator(".career button").first().click();
    await page.locator("#storyboard figcaption").nth(3).waitFor();
    if (i === 0) {
      await page.waitForFunction(() => document.querySelectorAll("#storyboard img.image-visible").length === 4);
      await page.locator("#storyboard img").evaluateAll(async imgs => Promise.all(imgs.map(img => img.decode())));
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    browserRuns.push({ input, titles, overflow, storyboardText: await page.locator("#storyboard").innerText() });
    await page.screenshot({ path: `${dir}/input-${i + 1}-phone.png`, fullPage: true });
  }
  // Wait for every requested storyboard to settle, including daily-cap failures.
  for (let attempt = 0; attempt < 180; attempt++) {
    const stories = await Promise.all(responses.map(({ result }) => client.query(ref("data:stories"), { searchKey: result.searchKey })));
    if (stories.flat().every(s => s && s.status !== "generating")) {
      await writeFile(`${dir}/final-storyboards.json`, JSON.stringify(stories, null, 2));
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await admin.goto("http://127.0.0.1:5173/admin/costs");
  await admin.getByLabel("Admin key").fill(adminKey);
  await admin.getByRole("button", { name: "View costs" }).click();
  await admin.locator("tbody tr").first().waitFor();
  await admin.getByRole("status").waitFor({ state: "hidden" });
  await admin.screenshot({ path: `${dir}/admin-costs.png`, fullPage: true });
  const totalText = await admin.locator("h2").innerText();
  const all = await rows(), beforeIds = new Set(baseline.map(r => r._id));
  const added = all.filter(r => !beforeIds.has(r._id));
  await writeFile(`${dir}/aiCalls-all.json`, JSON.stringify(all, null, 2));
  await writeFile(`${dir}/aiCalls-new.json`, JSON.stringify(added, null, 2));
  await writeFile(`${dir}/aiCalls-new.jsonl`, added.map(r => JSON.stringify(r)).join("\n"));
  const report = { responses: responses.map(({input,result}) => ({ input, titles: result.careers.map(c => c.title), initialStoryboardPaths: result.stories.map(s => ({ title: s.title, path: s.path })) })),
    cacheProof: { title: reused.title, path: reused.path }, browserRuns, browserErrors, newRows: added.length,
    totalText, totalUSD: all.reduce((s,r) => s + (r.costUSD ?? 0), 0), totalINR: all.reduce((s,r) => s + (r.costINR ?? 0), 0) };
  await writeFile(`${dir}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (browserErrors.length || browserRuns.some(r => r.overflow)) throw Error("Browser check failed");
} finally { await browser.close(); }
