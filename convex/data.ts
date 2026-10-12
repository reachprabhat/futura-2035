import { internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
export const reserve = internalMutation({
  args: {},
  handler: async (ctx) => {
    const day = new Date().toISOString().slice(0, 10);
    const limit = Math.min(
      100,
      Math.max(1, Number(process.env.AI_DAILY_CALL_CAP) || 100),
    );
    const row = await ctx.db
      .query("usage")
      .withIndex("by_day", (q) => q.eq("day", day))
      .unique();
    if ((row?.calls ?? 0) >= limit)
      throw new ConvexError(
        "Today’s AI limit has been reached. Please try again tomorrow.",
      );
    if (row) await ctx.db.patch(row._id, { calls: row.calls + 1 });
    else await ctx.db.insert("usage", { day, calls: 1 });
  },
});
export const search = internalQuery({
  args: { key: v.string() },
  handler: (ctx, { key }) =>
    ctx.db
      .query("searches")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique(),
});
export const saveSearch = internalMutation({
  args: { key: v.string(), result: v.any() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("searches")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (row) return row.result;
    await ctx.db.insert("searches", args);
    return args.result;
  },
});
export const getStory = internalQuery({
  args: { key: v.string() },
  handler: (ctx, { key }) =>
    ctx.db
      .query("storyboards")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique(),
});
export const claim = internalMutation({
  args: { key: v.string(), title: v.string(), token: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("storyboards")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (row?.status === "ready") return { state: "cached", row };
    if (row?.status === "generating" && row.lease > Date.now())
      return { state: "busy", row };
    const fields = {
      ...args,
      status: "generating",
      lease: Date.now() + 540000,
    };
    if (row) {
      await ctx.db.patch(row._id, fields);
      return { state: "claimed", row: { ...row, ...fields } };
    }
    const id = await ctx.db.insert("storyboards", { ...fields, panels: [] });
    return {
      state: "claimed",
      row: { _id: id, ...fields, panels: [], raw: undefined },
    };
  },
});
export const saveStory = internalMutation({
  args: {
    key: v.string(),
    token: v.string(),
    panels: v.any(),
    status: v.string(),
    raw: v.optional(v.string()),
  },
  handler: async (ctx, { key, token, ...fields }) => {
    const row = await ctx.db
      .query("storyboards")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row?.token === token)
      await ctx.db.patch(row._id, {
        ...fields,
        lease: fields.status === "generating" ? Date.now() + 540000 : 0,
      });
  },
});
