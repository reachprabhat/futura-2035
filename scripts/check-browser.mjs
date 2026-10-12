import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "chromium", headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
const failures = [],
  calls = [];
page.on("pageerror", (e) => failures.push(e.message));
page.on("websocket", (ws) =>
  ws.on("framereceived", async ({ payload }) => {
    try {
      const frame = JSON.parse(String(payload));
      if (frame.type === "ActionResponse") {
        calls.push(frame);
        await writeFile(
          "artifacts/raw-dev-output.json",
          JSON.stringify(calls, null, 2),
        );
      }
    } catch {}
  }),
);
page.on("response", async (response) => {
  if (response.url().includes("/api/action")) {
    try {
      const body = await response.json();
      calls.push({
        request: JSON.parse(response.request().postData()),
        response: body,
      });
      await writeFile(
        "artifacts/raw-dev-output.json",
        JSON.stringify(calls, null, 2),
      );
    } catch {}
  }
});
try {
  await page.goto("http://127.0.0.1:5173/");
  await page
    .getByLabel("What does your child enjoy?")
    .fill("Economics, book writing, food critique");
  await page
    .getByLabel("What matters to you as a parent?")
    .fill("good earning, stability, overseas");
  await page.screenshot({ path: "artifacts/input-phone.png", fullPage: true });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Input overflows phone width");
  await page
    .getByRole("button", { name: "Explore possible futures ↗" })
    .click();
  await Promise.race([
    page.locator(".career").first().waitFor({ timeout: 180000 }),
    page.getByRole("alert").waitFor({ timeout: 180000 }),
  ]);
  if (await page.locator(".career").count()) {
    await page.screenshot({
      path: "artifacts/pathways-phone.png",
      fullPage: true,
    });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error("Pathways overflow phone width");
    await page
      .getByRole("button", { name: "Picture a day in this life ↗" })
      .first()
      .click();
    await page
      .locator(".loading")
      .waitFor({ state: "hidden", timeout: 540000 });
    await page
      .locator("#storyboard img")
      .evaluateAll(
        async (images) =>
          await Promise.all(images.map((img) => img.decode().catch(() => {}))),
      );
    await page
      .locator("#storyboard")
      .screenshot({ path: "artifacts/storyboard-phone.png" });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw new Error("Storyboard overflows phone width");
    const imageCount = await page.locator("#storyboard img").count();
    console.log("Illustrated panels:", imageCount);
    if (imageCount === 4) {
      await page.getByRole("button", { name: "View this day again ↗" }).click();
      await page
        .getByText("Path ran: storyboard-cache", { exact: true })
        .waitFor({ timeout: 15000 });
      console.log("Verified storyboard-cache");
    }
  } else {
    await page.screenshot({
      path: "artifacts/storyboard-phone.png",
      fullPage: true,
    });
    process.exitCode = 1;
  }
  await writeFile(
    "artifacts/browser-check.json",
    JSON.stringify(
      {
        failures,
        phoneWidth: 390,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        text: await page.locator("main").innerText(),
      },
      null,
      2,
    ),
  );
  console.log("Browser errors:", JSON.stringify(failures));
  console.log("Full output: artifacts/raw-dev-output.json");
  console.log((await page.locator("main").innerText()).slice(0, 6000));
  if (failures.length || (await page.getByRole("alert").count()))
    process.exitCode = 1;
} finally {
  await browser.close();
}
