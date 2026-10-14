import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
const quality = v.union(v.literal("high"), v.literal("medium"));
export const claim = internalMutation({
  args: { quality, revision: v.optional(v.union(v.literal("fresh-v2"), v.literal("reference-v3"), v.literal("student-v5"), v.literal("boy-v1"), v.literal("outfit-boy-v1"), v.literal("outfit-girl-v1"))) }, returns: v.any(),
  handler: async (ctx, args) => {
    const key = args.revision === "outfit-boy-v1" || args.revision === "outfit-girl-v1" ? args.revision : args.revision === "boy-v1" ? "author-boy-panel1-photo-boy-v1-medium" : args.revision ? `author-girl-panel1-photo-${args.revision}-medium` : `author-girl-panel1-photo-v2-${args.quality}`;
    const row = await ctx.db.query("photoTests").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row) return row;
    const id = await ctx.db.insert("photoTests", { key, status: "pending" });
    return { _id: id, key, status: "claimed" };
  },
});
export const finish = internalMutation({
  args: { id: v.id("photoTests"), storageId: v.optional(v.id("_storage")), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, { id, ...args }) => {
    await ctx.db.patch(id, { ...args, status: args.error ? "failed" : "ready" });
    return null;
  },
});

