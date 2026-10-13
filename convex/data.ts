import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { storyKey } from "./storyKey";
import { v, ConvexError } from "convex/values";
import { istToday, callCap } from "./aiControls";
import { PAUSED_MESSAGE } from "./aiControls";
import { CAREER_CATALOG_VERSION } from "./careerCatalog";

// The example only reads an existing result. It never schedules generation or calls AI.
export const example = mutation({
  args: {}, returns: v.any(),
  handler: async (ctx) => {
    const interests = "Economics, book writing, food critique";
    const hopes = "good earning, stability, overseas";
    const key = JSON.stringify([CAREER_CATALOG_VERSION, "book writing, economics, food critique", "good earning, overseas, stability"]);
    const saved = await ctx.db.query("searches").withIndex("by_key", q => q.eq("key", key)).unique();
    if (!saved) throw new ConvexError("The saved example is unavailable for a moment. Please try again later.");
    await ctx.runMutation(internal.costs.cache, { careerTitle: "Career discovery (shared)", callType: "careers",
      stage: "career-cache", model: "gpt-4.1", cacheKey: key });
    return { ...saved.result, interests, hopes, searchKey: key, path: "career-cache", stories: [] };
  },
});
export const reserve = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { day } = istToday();
    const limit = callCap();
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
// Preserve an existing AI result when its recorded original input supplies the exact new key.
export const aliasSearch = internalMutation({
  args: { sourceKey: v.string(), key: v.string() }, returns: v.null(),
  handler: async (ctx, { sourceKey, key }) => {
    const existing = await ctx.db.query("searches").withIndex("by_key", q => q.eq("key", key)).unique();
    if (!existing) {
      const source = await ctx.db.query("searches").withIndex("by_key", q => q.eq("key", sourceKey)).unique();
      if (!source) throw new ConvexError("Saved career result is missing.");
      await ctx.db.insert("searches", { key, result: source.result });
    }
    return null;
  },
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

// Each completed image is committed on its own; simultaneous panels cannot overwrite one another.
export const savePanel = internalMutation({
  args: { key: v.string(), token: v.string(), index: v.number(), panel: v.any() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("storyboards").withIndex("by_key", q => q.eq("key", args.key)).unique();
    if (row?.token === args.token) {
      const panels = [...row.panels];
      panels[args.index] = args.panel;
      await ctx.db.patch(row._id, { panels, lease: Date.now() + 540000 });
    }
    return null;
  },
});
export const stories = query({
  args: { searchKey: v.string() }, returns: v.any(),
  handler: async (ctx, { searchKey }) => {
    const search = await ctx.db.query("searches").withIndex("by_key", q => q.eq("key", searchKey)).unique();
    if (!search) return [];
    return Promise.all(search.result.careers.map(async (career: any) => {
      const row = await ctx.db.query("storyboards").withIndex("by_key", q => q.eq("key", storyKey(career.title))).unique();
      if (!row) return null;
      return { title: row.title, status: row.status, raw: row.raw ?? null,
        path: row.status === "ready" ? "storyboard-cache" : row.status === "generating" ? "openai-background-images" : "storyboard-captions-ready",
        error: row.status === "failed" ? "Some illustrations could not finish. Please try again." : null,
        panels: await Promise.all(row.panels.map(async (p: any) => ({ ...p, imageUrl: p.storageId ? await ctx.storage.getUrl(p.storageId) : null }))),
      };
    }));
  },
});
// Scheduling returns immediately. The existing atomic claim prevents duplicate paid calls.
export const startStories = mutation({
  args: { searchKey: v.string(), careerIndex: v.number(), cachedOnly: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const search = await ctx.db.query("searches").withIndex("by_key", q => q.eq("key", args.searchKey)).unique();
    if (!search || (args.careerIndex !== undefined && (!Number.isInteger(args.careerIndex) || !search.result.careers[args.careerIndex])))
      throw new ConvexError("Choose a career from your results first.");
    const indexes = [args.careerIndex];
    for (const careerIndex of indexes) {
      const career = search.result.careers[careerIndex];
      const row = await ctx.db.query("storyboards").withIndex("by_key", q => q.eq("key", storyKey(career.title))).unique();
      if (row && (row.status === "ready" || args.cachedOnly || process.env.AI_ENABLED !== "true")) {
        if (args.careerIndex !== undefined) await ctx.runMutation(internal.costs.cache, {
          careerTitle: career.title, callType: "panel image", stage: "storyboard-cache", model: "gpt-image-1", imageSize: "1024x1024", imageQuality: "high",
        });
      } else if (args.cachedOnly || process.env.AI_ENABLED !== "true") {
        if (args.careerIndex !== undefined) throw new ConvexError(PAUSED_MESSAGE);
      } else if (row?.status !== "generating" || row.lease <= Date.now()) {
        await ctx.scheduler.runAfter(0, internal.ai.generate, { searchKey: args.searchKey, careerIndex });
      }
    }
    return null;
  },
});
