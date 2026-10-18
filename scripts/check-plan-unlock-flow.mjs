import { chromium } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";

if (process.cwd().toLowerCase() !== "c:\\users\\reach\\skill-sprint") throw new Error("Run only in C:\\Users\\reach\\skill-sprint.");
const env = await readFile(".env.local", "utf8");
if (!/^CONVEX_DEPLOYMENT=dev:doting-basilisk-558(?:\s|$)/m.test(env) || !/^VITE_CONVEX_URL=https:\/\/doting-basilisk-558\.convex\.cloud\s*$/m.test(env)) throw new Error("Expected only the doting-basilisk-558 DEV environment.");
if (/^CONVEX_DEPLOY_KEY=/m.test(env) || process.env.CONVEX_DEPLOY_KEY) throw new Error("Deployment-key override detected.");
const adminKey = (await readFile("artifacts/admin-costs-key.txt", "utf8")).trim();
const client = new ConvexHttpClient("https://doting-basilisk-558.convex.cloud");
const reference = name => makeFunctionReference(name);
const ledger = async () => {
  const rows = []; let cursor = null;
  do { const page = await client.query(reference("costs:rows"), { adminKey, paginationOpts: { numItems: 100, cursor } }); rows.push(...page.page); cursor = page.isDone ? null : page.continueCursor; } while (cursor);
  return rows;
};
const savedRows = await ledger();
const savedRowIds = new Set(savedRows.map(row => row._id));
const startAt = Date.now();
const priceBefore = await client.query(reference("planUnlocks:price"), {});
if (priceBefore !== 199) throw new Error(`Expected the DEV price to start at ₹199, got ₹${priceBefore}.`);
for (const item of [{ title: "Doctor", gender: "girl" }, { title: "Author", gender: "boy" }]) {
  const [plan, story] = await Promise.all([
    client.query(reference("plans:get"), { title: item.title }),
    client.query(reference("data:cachedCareer"), item),
  ]);
  if (plan?.status !== "ready" || plan.plan.projects.length !== 12 || plan.plan.projects.some(project => !project.thumbnailThemeId) || story?.panels?.length !== 4 || story.panels.some(panel => !panel.imageUrl)) throw new Error(`${item.title} is not fully cached; refusing to trigger generation.`);
}

await mkdir("design", { recursive: true });
const browser = await chromium.launch({ headless: true });
let pdfPath = "", waUrl = "";
const pageErrors = [];
try {
  const doctor = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, acceptDownloads: true });
  doctor.on("pageerror", error => pageErrors.push(error.message));
  await doctor.goto("http://127.0.0.1:5173/?career=Doctor&gender=girl");
  await doctor.getByRole("button", { name: "Pay to unlock", exact: true }).waitFor();
  await doctor.waitForFunction(() => { const images = [...document.querySelectorAll(".day-moment-photo img")]; return images.length === 4 && images.every(image => image.complete && image.naturalWidth > 0); });
  await doctor.waitForFunction(() => { const images = [...document.querySelectorAll(".day-month img[data-thumbnail-theme]")]; return images.length === 3 && images.every(image => image.complete && image.naturalWidth > 0); });
  if (await doctor.locator(".day-month").count() !== 3 || await doctor.locator(".day-locked-month").count() !== 9) throw new Error("Doctor free and locked month counts are incorrect.");
  const doctorPitch = await doctor.locator(".day-plan-pitch").innerText();
  if (!doctorPitch.includes("becoming a Doctor") || await doctor.locator(".day-plan-pitch").evaluate(node => getComputedStyle(node).webkitLineClamp) !== "2") throw new Error("Doctor pitch or two-line limit is incorrect.");
  await doctor.screenshot({ path: "design/pay-1-locked-doctor.png", fullPage: true });

  const author = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  author.on("pageerror", error => pageErrors.push(error.message));
  await author.goto("http://127.0.0.1:5173/?career=Author&gender=boy");
  await author.getByRole("button", { name: "Pay to unlock", exact: true }).waitFor();
  await author.waitForFunction(() => { const images = [...document.querySelectorAll(".day-moment-photo img")]; return images.length === 4 && images.every(image => image.complete && image.naturalWidth > 0); });
  if (await author.locator(".day-month").count() !== 3 || await author.locator(".day-locked-month").count() !== 9 || !(await author.locator(".day-plan-pitch").innerText()).includes("becoming an Author")) throw new Error("Author lock screen is incorrect.");
  await author.screenshot({ path: "design/pay-1-locked-author.png", fullPage: true });

  await doctor.getByRole("button", { name: "Pay to unlock", exact: true }).click();
  await doctor.getByRole("img", { name: "UPI payment QR code" }).waitFor();
  await doctor.waitForFunction(() => document.querySelector(".day-pay-qr")?.complete && document.querySelector(".day-pay-qr")?.naturalWidth > 100);
  await doctor.getByText("₹199", { exact: true }).waitFor();
  await doctor.screenshot({ path: "design/pay-2-qr.png", fullPage: true });
  await doctor.getByLabel("Parent name").fill("Automated Test Parent");
  await doctor.getByLabel("Mobile number").fill("9999912345");
  await doctor.getByRole("button", { name: "I have paid", exact: true }).click();
  await doctor.getByRole("status").filter({ hasText: "Payment received for review. Your full plan unlocks once it is confirmed." }).waitFor();
  const requestToken = new URL(doctor.url()).searchParams.get("request");
  if (!requestToken) throw new Error("The same-link request token was not placed in the page address.");
  await doctor.screenshot({ path: "design/pay-3-pending.png", fullPage: true });
  const pendingReturn = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await pendingReturn.goto(doctor.url());
  await pendingReturn.getByRole("status").filter({ hasText: "Payment received for review. Your full plan unlocks once it is confirmed." }).waitFor();
  await pendingReturn.close();

  const admin = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  admin.on("pageerror", error => pageErrors.push(error.message));
  await admin.goto("http://127.0.0.1:5173/admin");
  await admin.getByLabel("Admin key").fill(adminKey);
  await admin.getByRole("button", { name: "Open plan payments" }).click();
  const requestRow = admin.getByRole("article").filter({ hasText: "Automated Test Parent" });
  await requestRow.waitFor();
  if (!(await requestRow.innerText()).includes("₹199")) throw new Error("The admin request did not retain its checkout amount.");
  await admin.screenshot({ path: "design/pay-5-admin-price.png", fullPage: true });

  await admin.getByLabel("Plan price (₹)").fill("249");
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await admin.getByRole("status").filter({ hasText: "Price saved." }).waitFor();
  await doctor.getByText("₹249", { exact: true }).waitFor();
  if (!(await requestRow.innerText()).includes("₹199")) throw new Error("Changing price altered an existing request amount.");
  await admin.getByLabel("Plan price (₹)").fill("199");
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await admin.getByRole("status").filter({ hasText: "Price saved." }).waitFor();
  await doctor.getByText("₹199", { exact: true }).waitFor();

  await requestRow.getByRole("button", { name: "Approve", exact: true }).click();
  const approvedLink = doctor.url();
  await doctor.reload();
  if (doctor.url() !== approvedLink) throw new Error("The approved status link changed when reopened.");
  await doctor.getByRole("button", { name: "Download plan", exact: true }).waitFor();
  if (await doctor.locator(".day-month").count() !== 12) throw new Error("Approval did not unlock exactly 12 plan months.");
  await doctor.waitForFunction(() => { const images = [...document.querySelectorAll(".day-month img[data-thumbnail-theme]")]; return images.length === 12 && images.every(image => image.complete && image.naturalWidth > 0); });
  await doctor.screenshot({ path: "design/pay-4-unlocked.png", fullPage: true });

  const [download] = await Promise.all([
    doctor.waitForEvent("download"),
    doctor.getByRole("button", { name: "Download plan", exact: true }).click(),
  ]);
  pdfPath = "design/share-plan.pdf";
  await download.saveAs(pdfPath);
  const pdf = await readFile(pdfPath);
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) || pdf.length < 5000) throw new Error("Downloaded plan is not a complete PDF.");

  await doctor.route("https://wa.me/**", async route => {
    waUrl = route.request().url();
    await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>WhatsApp fallback captured</title><p>Share fallback captured by proof run.</p>" });
  });
  await doctor.getByRole("button", { name: "Share on WhatsApp", exact: true }).click();
  await doctor.waitForURL("https://wa.me/**");
  const waText = new URL(waUrl).searchParams.get("text") ?? "";
  if (!waText.includes("Doctor — 12-month plan") || !waText.includes("Month 12:") || /https?:\/\//.test(waText)) throw new Error("WhatsApp fallback text is incomplete or contains an app link.");

  const adminData = await client.query(reference("planUnlocks:adminData"), { adminKey });
  const request = await client.query(reference("planUnlocks:requestStatus"), { token: requestToken });
  if (request?.status !== "approved" || request.amount !== 199 || request.career !== "Doctor" || request.gender !== "girl") throw new Error("Approved request is missing or out of scope.");
  const testEvents = adminData.events.filter(event => event.createdAt >= startAt && ((event.career === "Doctor" && event.gender === "girl") || (event.career === "Author" && event.gender === "boy")));
  const doctorEvents = testEvents.filter(event => event.career === "Doctor").map(event => event.event);
  for (const event of ["locked-card-view", "pay-tap", "payment-submitted", "approved", "download", "share"]) if (!doctorEvents.includes(event)) throw new Error(`Missing Doctor funnel event: ${event}`);
  if (!testEvents.some(event => event.career === "Author" && event.event === "locked-card-view")) throw new Error("Missing Author locked-card view event.");
  const afterRows = await ledger();
  if (afterRows.some(row => !savedRowIds.has(row._id))) throw new Error("The payment flow created an AI call; no AI calls are allowed.");
  if (pageErrors.length) throw new Error(`Browser errors: ${pageErrors.join(" | ")}`);
  const proof = { startedAt: startAt, requestToken, request: { career: request.career, gender: request.gender, amount: request.amount, status: request.status }, funnelRows: testEvents, aiCallRowsAdded: afterRows.filter(row => !savedRowIds.has(row._id)).length, pdfBytes: (await stat(pdfPath)).size, shareFallback: { url: waUrl, text: waText }, screenshots: ["design/pay-1-locked-doctor.png", "design/pay-1-locked-author.png", "design/pay-2-qr.png", "design/pay-3-pending.png", "design/pay-4-unlocked.png", "design/pay-5-admin-price.png"], pdf: pdfPath };
  await writeFile("design/plan-unlock-proof.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
  await author.close(); await admin.close(); await doctor.close();
} finally { await browser.close(); }
