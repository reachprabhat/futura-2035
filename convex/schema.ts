import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
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
