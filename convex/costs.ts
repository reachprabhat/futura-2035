import { internalMutation, internalQuery, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { priceCall, USD_TO_INR, PRICING_DATE, PRICING_URL } from "./pricing";
import { internal } from "./_generated/api";
import { todayControls, estimateINR, PAUSED_MESSAGE } from "./aiControls";
import { libraryTotals } from "./sceneLibrary";
import { readTracking, trackingString, trackingBoolean } from "./tracking";

const metadata = {
  careerTitle: v.string(), callType: v.union(v.literal("careers"), v.literal("captions"), v.literal("panel image"), v.literal("plan")),
  stage: v.string(), model: v.string(), imageSize: v.optional(v.string()), imageQuality: v.optional(v.string()),
  tracking: v.optional(v.any()),
  cacheKey: v.optional(v.string()),
  generationId: v.optional(v.string()), panel: v.optional(v.number()),
};
export const begin = internalMutation({
  args: metadata, returns: v.id("aiCalls"),
  handler: async (ctx, args) => {
    const tracking = readTracking(args.tracking);
    const { tracking: _tracking, ...fields } = args;
    const visitorId = trackingString(tracking.visitorId), isTest = trackingBoolean(tracking.isTest);
    if (args.cacheKey?.startsWith("shared-scenes-v1:") && (await libraryTotals(ctx)).overBudget) throw new ConvexError("Shared scene library passed the ₹250 limit. Generation stopped.");
    if (process.env.AI_ENABLED !== "true") throw new ConvexError(PAUSED_MESSAGE);
    const today = await todayControls(ctx);
    if (today.estimatedSpendINR + estimateINR(args.model, args.imageQuality) > today.dailyCostCapINR)
      throw new ConvexError(PAUSED_MESSAGE);
    // Both reservations and the pending ledger entry commit together, including under concurrency.
    await ctx.runMutation(internal.data.reserve, {});
    return await ctx.db.insert("aiCalls", { ...fields, visitorId: visitorId ?? "unknown", isTest: isTest ?? true, usage: null, cacheHit: false,
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
    const tracking = readTracking(args.tracking);
    const { tracking: _tracking, ...fields } = args;
    const visitorId = trackingString(tracking.visitorId), isTest = trackingBoolean(tracking.isTest);
    await ctx.db.insert("aiCalls", { ...fields, visitorId: visitorId ?? "unknown", isTest: isTest ?? true, usage: null, cacheHit: true, timestamp: Date.now(), status: "cached",
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
export const planGenerationFailure = internalMutation({
  args: { generationId: v.string(), careerTitle: v.string(), stage: v.string(), error: v.string(), tracking: v.optional(v.any()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tracking = readTracking(args.tracking);
    const { tracking: _tracking, ...baseFields } = args;
    const previous = await ctx.db.query("planGenerationErrors").withIndex("by_generationId", q => q.eq("generationId", args.generationId)).unique();
    const fields = { ...baseFields, ...(trackingString(tracking.visitorId) ? { visitorId: trackingString(tracking.visitorId) } : {}), timestamp: Date.now(), isTest: trackingBoolean(tracking.isTest) ?? false };
    if (previous) await ctx.db.patch(previous._id, fields);
    else await ctx.db.insert("planGenerationErrors", fields);
    return null;
  },
});
export const markPlanCallFailed = internalMutation({
  args: { generationId: v.string(), error: v.string() }, returns: v.null(),
  handler: async (ctx, { generationId, error }) => {
    const row = await ctx.db.query("aiCalls").withIndex("by_generationId", q => q.eq("generationId", generationId)).order("desc").first();
    if (row) await ctx.db.patch(row._id, { status: "failed", error });
    return null;
  },
});
export const byGeneration = internalQuery({
  args: { generationId: v.string() }, returns: v.any(),
  handler: async (ctx, { generationId }) => {
    const row = await ctx.db.query("aiCalls").withIndex("by_generationId", q => q.eq("generationId", generationId)).order("desc").first();
    return row ? { careerTitle: row.careerTitle, callType: row.callType, stage: row.stage, model: row.model, status: row.status, cacheHit: row.cacheHit, usage: row.usage, costUSD: row.costUSD, costINR: row.costINR, error: row.error ?? null, timestamp: row.timestamp } : null;
  },
});
export const rows = query({
  args: { adminKey: v.string(), paginationOpts: paginationOptsValidator, includeTest: v.optional(v.boolean()) }, returns: v.any(),
  handler: async (ctx, { adminKey, paginationOpts, includeTest = false }) => {
    const expected = process.env.ADMIN_COSTS_KEY;
    if (!expected || adminKey.length < 32 || adminKey !== expected) throw new ConvexError("Admin access required.");
    const query = ctx.db.query("aiCalls").withIndex("by_timestamp").order("desc");
    const result = await (includeTest ? query : query.filter(q => q.eq(q.field("isTest"), false))).paginate(paginationOpts);
    return { ...result, pricingDate: PRICING_DATE, pricingUrl: PRICING_URL, usdToInr: USD_TO_INR };
  },
});
export const planFailures = query({
  args: { adminKey: v.string(), includeTest: v.optional(v.boolean()) },
  returns: v.array(v.object({ generationId: v.string(), careerTitle: v.string(), stage: v.string(), error: v.string(), timestamp: v.number(), isTest: v.boolean() })),
  handler: async (ctx, { adminKey, includeTest = false }) => {
    const expected = process.env.ADMIN_COSTS_KEY;
    if (!expected || adminKey.length < 32 || adminKey !== expected) throw new ConvexError("Admin access required.");
    const rows = await ctx.db.query("planGenerationErrors").withIndex("by_timestamp").order("desc").take(100);
    return rows.filter(row => includeTest || !row.isTest).map(({ generationId, careerTitle, stage, error, timestamp, isTest }) => ({ generationId, careerTitle, stage, error, timestamp, isTest }));
  },
});
