import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { storyKey } from "./storyKey";
export const get = query({
  args: { title: v.string() }, returns: v.any(),
  handler: (ctx, { title }) => ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", storyKey(title))).unique(),
});
export const claim = internalMutation({
  args: { title: v.string(), token: v.string() }, returns: v.any(),
  handler: async (ctx, { title, token }) => {
    const key = storyKey(title);
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row?.status === "ready") return { state: "cached", row };
    if (row?.status === "generating" && row.lease > Date.now()) return { state: "busy", row };
    const fields = { title, key, token, status: "generating", lease: Date.now() + 540000 };
    if (row) await ctx.db.patch(row._id, fields); else await ctx.db.insert("careerPlans", fields);
    return { state: "claimed" };
  },
});
export const finish = internalMutation({
  args: { title: v.string(), token: v.string(), plan: v.optional(v.any()), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, { title, token, plan, error }) => {
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", storyKey(title))).unique();
    if (row?.token === token) await ctx.db.patch(row._id, { ...(plan ? { plan } : {}), error: error ?? null, status: error ? "failed" : "ready", lease: 0 });
    return null;
  },
});
