/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const adminKey = "k".repeat(48);
afterEach(() => vi.unstubAllEnvs());

function backend() {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://doting-basilisk-558.convex.cloud");
  vi.stubEnv("ADMIN_COSTS_KEY", adminKey);
  return convexTest(schema, modules);
}

it("uses the ₹199 default, protects settings, and accepts only whole rupees in range", async () => {
  const t = backend();
  expect(await t.query(api.planUnlocks.price, {})).toBe(199);
  await expect(t.mutation(api.planUnlocks.savePrice, { adminKey: "wrong", value: 250 })).rejects.toThrow("Admin access required");
  for (const value of [0, 10000, 1.5]) await expect(t.mutation(api.planUnlocks.savePrice, { adminKey, value })).rejects.toThrow("whole-rupee");
  await t.mutation(api.planUnlocks.savePrice, { adminKey, value: 349 });
  expect(await t.query(api.planUnlocks.price, {})).toBe(349);
  await expect(t.query(api.planUnlocks.adminData, { adminKey: "wrong" })).rejects.toThrow("Admin access required");
});

it("freezes the checkout amount, makes a pending request, and unlocks only its career and gender", async () => {
  const t = backend();
  const quote = await t.mutation(api.planUnlocks.beginCheckout, { career: "Doctor", gender: "girl" });
  expect(quote.amount).toBe(199);
  expect(await t.query(api.planUnlocks.quote, { token: quote.token })).toMatchObject({ career: "Doctor", gender: "girl", amount: 199 });
  await t.mutation(api.planUnlocks.savePrice, { adminKey, value: 499 });
  expect(await t.query(api.planUnlocks.price, {})).toBe(499);

  const created = await t.mutation(api.planUnlocks.createRequest, { quoteToken: quote.token, parentName: "  Test Parent  ", mobile: "+91 99999 12345" });
  expect(created.status).toBe("pending");
  expect(await t.query(api.planUnlocks.requestStatus, { token: created.token })).toMatchObject({ career: "Doctor", gender: "girl", amount: 199, status: "pending" });
  const again = await t.mutation(api.planUnlocks.createRequest, { quoteToken: quote.token, parentName: "Test Parent", mobile: "+91 99999 12345" });
  expect(again.token).toBe(created.token);
  expect(await t.run(ctx => ctx.db.query("planUnlockRequests").collect())).toHaveLength(1);
  await t.mutation(api.planUnlocks.logEvent, { event: "locked-card-view", career: "Doctor", gender: "girl", requestToken: created.token });
  expect((await t.query(api.planUnlocks.adminData, { adminKey, includeTest: true })).pending[0]).toMatchObject({ parentName: "Test Parent", mobile: "+91 99999 12345", amount: 199, status: "pending" });

  await expect(t.mutation(api.planUnlocks.logEvent, { event: "download", career: "Author", gender: "boy", requestToken: created.token })).rejects.toThrow("not unlocked");
  await t.mutation(api.planUnlocks.reviewRequest, { adminKey, requestId: (await t.query(api.planUnlocks.adminData, { adminKey, includeTest: true })).pending[0]._id, decision: "approved" });
  expect(await t.query(api.planUnlocks.requestStatus, { token: created.token })).toMatchObject({ career: "Doctor", gender: "girl", amount: 199, status: "approved" });
  await t.mutation(api.planUnlocks.logEvent, { event: "download", career: "Doctor", gender: "girl", requestToken: created.token });
  await expect(t.mutation(api.planUnlocks.logEvent, { event: "download", career: "Author", gender: "boy", requestToken: created.token })).rejects.toThrow("not unlocked");
  const events = await t.run(ctx => ctx.db.query("planUnlockEvents").collect());
  expect(events.map(event => event.event).sort()).toEqual(["approved", "download", "locked-card-view", "pay-tap", "payment-submitted"].sort());
  await expect(t.mutation(api.planUnlocks.reviewRequest, { adminKey, requestId: events.find(event => event.event === "approved")!.requestId!, decision: "rejected" })).rejects.toThrow("already been reviewed");

  const secondQuote = await t.mutation(api.planUnlocks.beginCheckout, { career: "Author", gender: "boy" });
  const secondRequest = await t.mutation(api.planUnlocks.createRequest, { quoteToken: secondQuote.token, parentName: "Another Parent", mobile: "9999912346" });
  const secondPending = (await t.query(api.planUnlocks.adminData, { adminKey, includeTest: true })).pending.find((row: { token: string; _id: Id<"planUnlockRequests"> }) => row.token === secondRequest.token)!;
  await t.mutation(api.planUnlocks.reviewRequest, { adminKey, requestId: secondPending._id, decision: "rejected" });
  expect(await t.query(api.planUnlocks.requestStatus, { token: secondRequest.token })).toMatchObject({ career: "Author", gender: "boy", status: "rejected" });
  await expect(t.mutation(api.planUnlocks.logEvent, { event: "download", career: "Author", gender: "boy", requestToken: secondRequest.token })).rejects.toThrow("not unlocked");
  expect((await t.run(ctx => ctx.db.query("planUnlockEvents").collect())).some(event => event.event === "rejected")).toBe(true);
});

it("rejects malformed parent details and refuses calls outside the DEV deployment", async () => {
  const t = backend();
  const quote = await t.mutation(api.planUnlocks.beginCheckout, { career: "Author", gender: "boy" });
  await expect(t.mutation(api.planUnlocks.createRequest, { quoteToken: quote.token, parentName: "A", mobile: "12345" })).rejects.toThrow("parent name");
  await expect(t.mutation(api.planUnlocks.createRequest, { quoteToken: quote.token, parentName: "Test Parent", mobile: "12345" })).rejects.toThrow("mobile number");
  vi.stubEnv("CONVEX_CLOUD_URL", "https://production.example.convex.cloud");
  await expect(t.mutation(api.planUnlocks.beginCheckout, { career: "Author", gender: "boy" })).rejects.toThrow("restricted to doting-basilisk-558 DEV");
});

it("defaults to free preview, records each tap by career, and gates mode changes to admins", async () => {
  const t = backend();
  expect(await t.query(api.planUnlocks.paymentMode, {})).toBe("free_preview");
  expect((await t.query(api.planUnlocks.adminData, { adminKey, includeTest: true })).paymentMode).toBe("free_preview");
  await expect(t.mutation(api.planUnlocks.savePaymentMode, { adminKey: "wrong", value: "paid" })).rejects.toThrow("Admin access required");

  await t.mutation(api.planUnlocks.recordFreePreviewTap, { career: "Economist", gender: "girl", tracking: { visitorId: "visitor-a", isTest: false } });
  await t.mutation(api.planUnlocks.recordFreePreviewTap, { career: "Economist", gender: "girl", tracking: { visitorId: "visitor-a", isTest: false } });
  await t.mutation(api.planUnlocks.recordFreePreviewTap, { career: "Author", gender: "boy", tracking: { visitorId: "visitor-b", isTest: false } });
  await t.mutation(api.planUnlocks.logEvent, { event: "download", career: "Economist", gender: "girl", tracking: { visitorId: "visitor-a", isTest: false } });
  await t.mutation(api.planUnlocks.logEvent, { event: "share", career: "Economist", gender: "girl", tracking: { visitorId: "visitor-a", isTest: false } });

  const now = Date.now();
  expect((await t.query(api.planUnlocks.analytics, { adminKey, start: 0, end: now + 1, includeTest: true })).paymentTapsByCareer)
    .toEqual([{ career: "Economist", taps: 2 }, { career: "Author", taps: 1 }]);

  await t.mutation(api.planUnlocks.savePaymentMode, { adminKey, value: "paid" });
  expect(await t.query(api.planUnlocks.paymentMode, {})).toBe("paid");
  await expect(t.mutation(api.planUnlocks.recordFreePreviewTap, { career: "Economist", gender: "girl" })).rejects.toThrow("Free preview is not enabled");
  await expect(t.mutation(api.planUnlocks.logEvent, { event: "download", career: "Economist", gender: "girl" })).rejects.toThrow("not unlocked");
});
