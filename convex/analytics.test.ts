/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { lockedMessageForCareer } from "../src/visitorTracking";

const modules = import.meta.glob("./**/*.ts");
const adminKey = "a".repeat(48);
afterEach(() => vi.unstubAllEnvs());

function backend() {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://doting-basilisk-558.convex.cloud");
  vi.stubEnv("ADMIN_COSTS_KEY", adminKey);
  return convexTest(schema, modules);
}

it("saves the locked-card text in one protected setting and allows it to be empty", async () => {
  const t = backend();
  const defaultMessage = "For less than a McD meal, your child starts to take concrete steps towards becoming a {career}.";
  expect(await t.query(api.planUnlocks.lockedMessage, {})).toBe("");
  expect(await t.query(api.planUnlocks.price, {})).toBe(199);
  await expect(t.mutation(api.planUnlocks.saveLockedMessage, { adminKey: "wrong", value: "Changed" })).rejects.toThrow("Admin access required");
  await t.mutation(api.planUnlocks.saveLockedMessage, { adminKey, value: "  " });
  expect(await t.query(api.planUnlocks.lockedMessage, {})).toBe("");
  await t.mutation(api.planUnlocks.savePrice, { adminKey, value: 249 });
  await t.mutation(api.planUnlocks.saveLockedMessage, { adminKey, value: "Explore {career} for {price}." });
  expect(await t.query(api.planUnlocks.adminData, { adminKey })).toMatchObject({ price: 249, lockedMessage: "Explore {career} for {price}." });
  await t.mutation(api.planUnlocks.savePrice, { adminKey, value: 199 });
  await t.mutation(api.planUnlocks.saveLockedMessage, { adminKey, value: defaultMessage });
  expect(await t.query(api.planUnlocks.price, {})).toBe(199);
  expect(await t.query(api.planUnlocks.lockedMessage, {})).toBe(defaultMessage);
});

it("fills career articles, bracketed words, and the live price in locked-card text", () => {
  expect(lockedMessageForCareer("Becoming a {career}.", "Doctor (MD)", 249)).toBe("Becoming a Doctor.");
  expect(lockedMessageForCareer("Becoming a {career}.", "Author [fiction]", 249)).toBe("Becoming an Author.");
  expect(lockedMessageForCareer("Follow {career} for {price}.", "Author", 249)).toBe("Follow an Author for ₹249.");
});

it("filters test visitors by default and keeps payment amounts linked to their visitor", async () => {
  const t = backend();
  const first = { visitorId: "visitor-parent", isTest: false };
  const test = { visitorId: "visitor-test", isTest: true };
  for (const event of ["landing-view", "gender-picked", "career-search", "career-opened"] as const) {
    await t.mutation(api.planUnlocks.logAnalytics, { event, tracking: first, career: event === "career-opened" ? "Doctor" : undefined, gender: "girl" });
  }
  await t.mutation(api.planUnlocks.logAnalytics, { event: "landing-view", tracking: test });
  await t.run(ctx => ctx.db.insert("planUnlockEvents", { event: "locked-card-view", career: "Old result", gender: "girl", createdAt: 1 }));
  await t.run(ctx => ctx.db.insert("aiCalls", { careerTitle: "Old result", callType: "careers", stage: "legacy", model: "gpt-4.1", usage: null, cacheHit: false, timestamp: 2, status: "succeeded", costUSD: 1, costINR: 90, pricingDate: "2026-10-14", usdToInr: 90 }));
  const quote = await t.mutation(api.planUnlocks.beginCheckout, { career: "Doctor", gender: "girl", tracking: first });
  expect(quote.amount).toBe(199);
  const request = await t.mutation(api.planUnlocks.createRequest, { quoteToken: quote.token, parentName: "Test Parent", mobile: "+91 99999 12345", tracking: first });
  const stored = await t.run(ctx => ctx.db.query("planUnlockRequests").collect());
  expect(stored[0]).toMatchObject({ parentName: "Test Parent", mobile: "+91 99999 12345", visitorId: "visitor-parent", isTest: false, amount: 199 });
  const range = { adminKey, start: 0, end: Date.now() + 1000, includeTest: false };
  const data = await t.query(api.planUnlocks.analytics, range);
  expect(data.visitors).toHaveLength(1);
  expect(data.visitors[0]).toMatchObject({ visitorId: "visitor-parent", careersOpened: ["Doctor"], paid: true, furthestStep: "Career opened", entryPath: "Search" });
  expect(data.funnel.find((row: { event: string }) => row.event === "landing-view")?.visitors).toBe(1);
  expect(data.funnel.some((row: { event: string }) => ["gender-picked", "payment-submitted", "approved"].includes(row.event))).toBe(false);
  expect(data.visitors[0].timeline.some((row: { event: string }) => row.event === "payment-submitted")).toBe(true);
  const allVisitors = (await t.query(api.planUnlocks.analytics, { ...range, includeTest: true })).visitors;
  expect(allVisitors).toHaveLength(3);
  expect(allVisitors.find((row: { visitorId: string }) => row.visitorId === "unknown")).toMatchObject({ aiCalls: 1, aiCost: 90 });
  expect(await t.query(api.planUnlocks.requestStatus, { token: request.token })).toMatchObject({ amount: 199, status: "pending" });
});

it("reports three test journeys through the funnel, including a stop, a payment, and a share", async () => {
  const t = backend();
  const visitors = ["test-stops-at-lock", "test-submits-payment", "test-shares-plan"];
  const range = { adminKey, start: 0, end: Date.now() + 1000, includeTest: true };
  for (const visitorId of visitors) {
    const tracking = { visitorId, isTest: true };
    await t.mutation(api.planUnlocks.logAnalytics, { event: "landing-view", tracking });
    await t.mutation(api.planUnlocks.logAnalytics, { event: "gender-picked", tracking, gender: "girl" });
    await t.mutation(api.planUnlocks.logAnalytics, { event: "career-search", tracking, gender: "girl" });
    await t.mutation(api.planUnlocks.logAnalytics, { event: "career-opened", tracking, gender: "girl", career: "Doctor" });
    await t.mutation(api.planUnlocks.logEvent, { event: "locked-card-view", career: "Doctor", gender: "girl", tracking });
  }
  for (const visitorId of visitors.slice(1)) {
    const tracking = { visitorId, isTest: true };
    const quote = await t.mutation(api.planUnlocks.beginCheckout, { career: "Doctor", gender: "girl", tracking });
    const request = await t.mutation(api.planUnlocks.createRequest, { quoteToken: quote.token, parentName: "Test Parent", mobile: "9999912345", tracking });
    if (visitorId === "test-shares-plan") {
      const pending = (await t.query(api.planUnlocks.adminData, { adminKey, includeTest: true })).pending.find((row: { token: string; _id: Id<"planUnlockRequests"> }) => row.token === request.token)!;
      await t.mutation(api.planUnlocks.reviewRequest, { adminKey, requestId: pending._id, decision: "approved" });
      await t.mutation(api.planUnlocks.logEvent, { event: "share", career: "Doctor", gender: "girl", requestToken: request.token, tracking });
    }
  }
  const result = await t.query(api.planUnlocks.analytics, range);
  expect(result.visitors).toHaveLength(3);
  expect(result.funnel.map((row: { event: string; visitors: number }) => [row.event, row.visitors])).toEqual([
    ["landing-view", 3], ["branch", 3], ["career-opened", 3], ["day-viewed", 0],
    ["plan-preview-viewed", 0], ["locked-card-view", 0], ["pay-tap", 0], ["full-plan-shown", 0],
    ["pdf-download", 0], ["whatsapp-share", 0],
  ]);
  expect(result.funnel.every((row: { dropPercent: number }) => row.dropPercent >= 0)).toBe(true);
  expect(result.stopped).toEqual([{ entryPath: "Search", step: "Career opened", visitors: 3 }]);
  expect(result.visitors[0].timeline.some((row: { event: string }) => row.event === "approved")).toBe(true);
  expect(result.topCareers).toEqual([{ career: "Doctor", opens: 3 }]);
});
