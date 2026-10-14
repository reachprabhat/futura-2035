import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { findStoryboard, genderValidator } from "./gender";
import { v, ConvexError } from "convex/values";
import { istToday, callCap } from "./aiControls";
import { failureDetail, failureDetailValidator } from "./storyboardErrors";
import { libraryStory } from "./sceneLibrary";
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
  args: { key: v.string(), result: v.any(), gender: v.optional(genderValidator) },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("searches")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (row) { if (args.gender) await ctx.db.patch(row._id, { gender: args.gender }); return row.result; }
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
  args: { key: v.string(), title: v.string(), token: v.string(), gender: v.optional(genderValidator) },
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
    lastError: v.optional(v.string()),
    failureDetails: v.optional(v.array(failureDetailValidator)),
    lastFailureAt: v.optional(v.number()),
  },
  handler: async (ctx, { key, token, ...fields }) => {
    const row = await ctx.db
      .query("storyboards")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    // A late error or stale final result must never discard an already committed image.
    if (row?.token === token) {
      fields.panels = Array.from({ length: Math.max(fields.panels.length, row.panels.length) }, (_, index) =>
        row.panels[index]?.storageId ? row.panels[index] : fields.panels[index] ?? row.panels[index]);
    }
    if (fields.status === "failed" && !fields.lastError) {
      const details = fields.panels.flatMap((panel: any, index: number) => panel.imageErrorDetails ? [panel.imageErrorDetails] : panel.imageError ? [failureDetail(panel.imageError, "image", index + 1)] : []);
      fields.failureDetails = details.length ? details : row?.failureDetails ?? [failureDetail("Storyboard incomplete; previous error detail was not recorded.", "completion")];
      fields.lastError = details.length ? details.map((d: any) => d.message).join("\n") : row?.lastError ?? fields.failureDetails!.map(d => d.message).join("\n");
      fields.lastFailureAt = Date.now();
    }
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
// Read-only saved-career links never start a search, plan or image generation.
export const cachedCareer = query({
  args: { title: v.string(), gender: genderValidator }, returns: v.any(),
  handler: (ctx, { title, gender }) => libraryStory(ctx, title, gender),
});
export const stories = query({
  args: { searchKey: v.string(), gender: v.optional(genderValidator) }, returns: v.any(),
  handler: async (ctx, { searchKey, gender }) => {
    const search = await ctx.db.query("searches").withIndex("by_key", q => q.eq("key", searchKey)).unique();
    if (!search) return [];
    return Promise.all(search.result.careers.map((career: any) => libraryStory(ctx, career.title, gender)));
  },
});
// Compatibility endpoint for older clients. It only verifies shared scenes are available.
export const startStories = mutation({
  args: { searchKey: v.string(), careerIndex: v.number(), gender: v.optional(genderValidator), cachedOnly: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const search = await ctx.db.query("searches").withIndex("by_key", q => q.eq("key", args.searchKey)).unique();
    if (!search || (args.careerIndex !== undefined && (!Number.isInteger(args.careerIndex) || !search.result.careers[args.careerIndex])))
      throw new ConvexError("Choose a career from your results first.");
    const career = search.result.careers[args.careerIndex];
    if (!await libraryStory(ctx, career.title, args.gender))
      throw new ConvexError("This career's shared scenes are not ready yet.");
    return null;
  },
});

export const setSearchGender = internalMutation({
  args: { key: v.string(), gender: genderValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("searches").withIndex("by_key", q => q.eq("key", args.key)).unique();
    if (row) await ctx.db.patch(row._id, { gender: args.gender });
    return null;
  },
});
export const resolvedStory = internalQuery({
  args: { title: v.string(), gender: v.optional(genderValidator) }, returns: v.any(),
  handler: (ctx, args) => findStoryboard(ctx, args.title, args.gender),
});
