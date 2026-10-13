import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  aiCalls: defineTable({
    careerTitle: v.string(),
    callType: v.union(v.literal("careers"), v.literal("captions"), v.literal("panel image")),
    stage: v.string(), model: v.string(),
    cacheKey: v.optional(v.string()),
    imageSize: v.optional(v.string()), imageQuality: v.optional(v.string()),
    usage: v.any(), cacheHit: v.boolean(), timestamp: v.number(),
    status: v.string(), costUSD: v.union(v.number(), v.null()), costINR: v.union(v.number(), v.null()),
    generationId: v.optional(v.string()), panel: v.optional(v.number()),
    requestId: v.optional(v.string()), webSearchCalls: v.optional(v.number()),
    fullStoryboardCompleted: v.optional(v.boolean()), error: v.optional(v.string()),
    pricingDate: v.string(), usdToInr: v.number(),
  }).index("by_timestamp", ["timestamp"]).index("by_generationId", ["generationId"]).index("by_cache_timestamp", ["cacheHit", "timestamp"]),
  usage: defineTable({ day: v.string(), calls: v.number() }).index("by_day", [
    "day",
  ]),
  searches: defineTable({ key: v.string(), result: v.any() }).index("by_key", [
    "key",
  ]),
  storyboards: defineTable({
    title: v.string(),
    key: v.string(),
    panels: v.any(),
    status: v.string(),
    lease: v.number(),
    token: v.string(),
    raw: v.optional(v.string()),
  }).index("by_key", ["key"]),
});
