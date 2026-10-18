/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { priceCall } from "./pricing";
import { istToday, costCap, callCap } from "./aiControls";
const modules = import.meta.glob("./**/*.ts");
const call = { careerTitle: "Food Scientist", callType: "panel image" as const, stage: "image", model: "gpt-image-1" };
afterEach(() => vi.unstubAllEnvs());
it("resets at midnight IST, uses 200/300 defaults and requires exact true", async () => {
  expect(istToday(Date.parse("2026-10-12T18:29:59Z")).day).toBe("2026-10-12");
  expect(istToday(Date.parse("2026-10-12T18:30:00Z")).day).toBe("2026-10-13");
  vi.stubEnv("DAILY_COST_CAP_INR", undefined); vi.stubEnv("AI_DAILY_CALL_CAP", undefined);
  expect(costCap()).toBe(200); expect(callCap()).toBe(300);
  const t = convexTest(schema, modules);
  for (const value of ["TRUE", " true", "true ", "false"]) {
    vi.stubEnv("AI_ENABLED", value);
    await expect(t.mutation(internal.costs.begin, call)).rejects.toThrow(/Pathlight is paused/);
  }
});
it("defaults AI off and spending to 200, without consuming blocked calls", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("AI_ENABLED", undefined);
  vi.stubEnv("DAILY_COST_CAP_INR", undefined);
  await expect(t.mutation(internal.costs.begin, call)).rejects.toThrow(/Pathlight is paused/);
  vi.stubEnv("AI_ENABLED", "true");
  vi.stubEnv("DAILY_COST_CAP_INR", "0");
  await expect(t.mutation(internal.costs.begin, call)).rejects.toThrow(/Pathlight is paused/);
  expect(await t.run(ctx => ctx.db.query("usage").collect())).toHaveLength(0);
});
it("reserves budget across parallel calls, settles actual costs, and holds unknown costs", async () => {
  vi.stubEnv("AI_ENABLED", "true"); vi.stubEnv("DAILY_COST_CAP_INR", "40");
  const t = convexTest(schema, modules);
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => t.mutation(internal.costs.begin, call)));
  const accepted = results.filter(r => r.status === "fulfilled");
  expect(accepted).toHaveLength(2);
  expect((await t.run(ctx => ctx.db.query("usage").collect()))[0].calls).toBe(2);
  const id = (accepted[0] as PromiseFulfilledResult<any>).value;
  await t.mutation(internal.costs.finish, { id, usage: { input_tokens: 320, input_tokens_details: { text_tokens: 320, image_tokens: 0 }, output_tokens: 4160 }, webSearchCalls: 0 });
  await expect(t.mutation(internal.costs.begin, call)).rejects.toThrow(/Pathlight is paused/);
  vi.stubEnv("DAILY_COST_CAP_INR", "56");
  await expect(t.mutation(internal.costs.begin, call)).resolves.toBeDefined();
});
it("allows cached results while AI is off and ignores previous IST days", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("AI_ENABLED", "false");
  await expect(t.mutation(internal.costs.cache, call)).resolves.toBeNull();
  vi.stubEnv("AI_ENABLED", "true"); vi.stubEnv("DAILY_COST_CAP_INR", "100");
  await t.run(ctx => ctx.db.insert("aiCalls", { ...call, usage: null, cacheHit: false, timestamp: 0, status: "failed", costUSD: null, costINR: null, pricingDate: "2026-10-12", usdToInr: 90 }));
  await expect(t.mutation(internal.costs.begin, call)).resolves.toBeDefined();
  vi.stubEnv("AI_ENABLED", "false");
  await expect(t.mutation(internal.costs.begin, call)).rejects.toThrow(/Pathlight is paused/);
});
it("prices actual token modalities, cached tokens and returned search calls", () => {
  expect(priceCall("gpt-4.1", { input_tokens: 2000, input_tokens_details: { cached_tokens: 1000 }, output_tokens: 100 }, 2).costUSD).toBeCloseTo(0.0233);
  expect(priceCall("gpt-image-1", { input_tokens: 320, input_tokens_details: { text_tokens: 320, image_tokens: 0 }, output_tokens: 4160 }).costUSD).toBeCloseTo(0.168);
  expect(priceCall("gpt-image-1", null).costUSD).toBeNull();
  expect(priceCall("gpt-image-1", { input_tokens: 320, output_tokens: 4160 }).costUSD).toBeNull();
});
it("refuses non-admin reads and records cache hits as zero calls and zero cost", async () => {
  const key = "a".repeat(48); vi.stubEnv("ADMIN_COSTS_KEY", key);
  const t = convexTest(schema, modules);
  await t.mutation(internal.costs.cache, { careerTitle: "Test Career", callType: "panel image", stage: "storyboard-cache", model: "gpt-image-1" });
  await expect(t.query(api.costs.rows, { adminKey: "wrong", paginationOpts: { cursor: null, numItems: 100 } })).rejects.toThrow("Admin access required");
  const hiddenTests = await t.query(api.costs.rows, { adminKey: key, paginationOpts: { cursor: null, numItems: 100 } });
  expect(hiddenTests.page).toHaveLength(0);
  const result = await t.query(api.costs.rows, { adminKey: key, includeTest: true, paginationOpts: { cursor: null, numItems: 100 } });
  expect(result.page).toHaveLength(1);
  expect(result.page[0]).toMatchObject({ cacheHit: true, usage: null, costUSD: 0, costINR: 0 });
  expect(await t.run(ctx => ctx.db.query("usage").collect())).toHaveLength(0);
});
it("records detailed plan failure reasons for admins without exposing them to unauthorised readers", async () => {
  const key = "b".repeat(48); vi.stubEnv("ADMIN_COSTS_KEY", key);
  const t = convexTest(schema, modules);
  await t.mutation(internal.costs.planGenerationFailure, { generationId: "plan-1", careerTitle: "Economist", stage: "12-month-plan", error: "{\"message\":\"network timeout\"}", tracking: { isTest: false } });
  await expect(t.query(api.costs.planFailures, { adminKey: "wrong" })).rejects.toThrow("Admin access required");
  await expect(t.query(api.costs.planFailures, { adminKey: key })).resolves.toMatchObject([{ careerTitle: "Economist", stage: "12-month-plan", error: "{\"message\":\"network timeout\"}" }]);
});
