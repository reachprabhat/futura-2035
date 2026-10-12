/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { priceCall } from "./pricing";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());
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
  const result = await t.query(api.costs.rows, { adminKey: key, paginationOpts: { cursor: null, numItems: 100 } });
  expect(result.page).toHaveLength(1);
  expect(result.page[0]).toMatchObject({ cacheHit: true, usage: null, costUSD: 0, costINR: 0 });
  expect(await t.run(ctx => ctx.db.query("usage").collect())).toHaveLength(0);
});
