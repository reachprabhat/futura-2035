import { internalMutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { priceCall, USD_TO_INR, PRICING_DATE, PRICING_URL } from "./pricing";
import { internal } from "./_generated/api";
import { todayControls, estimateINR, PAUSED_MESSAGE } from "./aiControls";

const metadata = {
  careerTitle: v.string(), callType: v.union(v.literal("careers"), v.literal("captions"), v.literal("panel image"), v.literal("plan")),
  stage: v.string(), model: v.string(), imageSize: v.optional(v.string()), imageQuality: v.optional(v.string()),
  cacheKey: v.optional(v.string()),
  generationId: v.optional(v.string()), panel: v.optional(v.number()),
};
export const begin = internalMutation({
  args: metadata, returns: v.id("aiCalls"),
  handler: async (ctx, args) => {
    if (process.env.AI_ENABLED !== "true") throw new ConvexError(PAUSED_MESSAGE);
    const today = await todayControls(ctx);
    if (today.estimatedSpendINR + estimateINR(args.model) > today.dailyCostCapINR)
      throw new ConvexError(PAUSED_MESSAGE);
    // Both reservations and the pending ledger entry commit together, including under concurrency.
    await ctx.runMutation(internal.data.reserve, {});
    return await ctx.db.insert("aiCalls", { ...args, usage: null, cacheHit: false,
      timestamp: Date.now(), status: "pending", costUSD: null, costINR: null, pricingDate: PRICING_DATE, usdToInr: USD_TO_INR });
  },
});
export const controls = query({
  args: { adminKey: v.string() }, returns: v.any(),
  handler: async (ctx, { adminKey }) => {
    const expected = process.env.ADMIN_COSTS_KEY;
    if (!expected || adminKey.length < 32 || adminKey !== expected) throw new ConvexError("Admin access required.");
    return await todayControls(ctx);
  },
});
export const finish = internalMutation({
  args: { id: v.id("aiCalls"), usage: v.any(), requestId: v.optional(v.string()), webSearchCalls: v.number(), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, { id, ...result }) => {
    const row = await ctx.db.get(id);
    if (!row) throw new Error("Missing AI call");
    await ctx.db.patch(id, { ...result, status: result.error ? "failed" : "succeeded", ...priceCall(row.model, result.usage, result.webSearchCalls) });
    return null;
  },
});
export const cache = internalMutation({
  args: metadata, returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("aiCalls", { ...args, usage: null, cacheHit: true, timestamp: Date.now(), status: "cached",
      costUSD: 0, costINR: 0, pricingDate: PRICING_DATE, usdToInr: USD_TO_INR });
    return null;
  },
});
export const completed = internalMutation({
  args: { generationId: v.string() }, returns: v.null(),
  handler: async (ctx, { generationId }) => {
    const row = await ctx.db.query("aiCalls").withIndex("by_generationId", q => q.eq("generationId", generationId)).order("desc").first();
    if (row) await ctx.db.patch(row._id, { fullStoryboardCompleted: true });
    return null;
  },
});
export const rows = query({
  args: { adminKey: v.string(), paginationOpts: paginationOptsValidator }, returns: v.any(),
  handler: async (ctx, { adminKey, paginationOpts }) => {
    const expected = process.env.ADMIN_COSTS_KEY;
    if (!expected || adminKey.length < 32 || adminKey !== expected) throw new ConvexError("Admin access required.");
    const result = await ctx.db.query("aiCalls").withIndex("by_timestamp").order("desc").paginate(paginationOpts);
    return { ...result, pricingDate: PRICING_DATE, pricingUrl: PRICING_URL, usdToInr: USD_TO_INR };
  },
});
