import { internalMutation, internalQuery, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { THUMBNAIL_LIBRARY_VERSION, THUMBNAIL_THEMES, thumbnailTagsKey, thumbnailThemeKey } from "./thumbnailCatalog";

const themesById = new Set<string>(THUMBNAIL_THEMES.map(theme => theme.id));
export const getImage = internalQuery({
  args: { themeId: v.string() }, returns: v.any(),
  handler: (ctx, { themeId }) => ctx.db.query("planThumbnailImages").withIndex("by_key", q => q.eq("key", thumbnailThemeKey(themeId))).unique(),
});
export const claimImage = internalMutation({
  args: { themeId: v.string(), token: v.string() }, returns: v.any(),
  handler: async (ctx, { themeId, token }) => {
    if (!themesById.has(themeId)) throw new ConvexError("Choose a theme from the thumbnail catalog.");
    const key = thumbnailThemeKey(themeId);
    const row = await ctx.db.query("planThumbnailImages").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row?.status === "ready") return { state: "cached", row };
    if (row) throw new ConvexError("This thumbnail already has an image attempt. Inspect its saved status before retrying.");
    const lock = await ctx.db.query("planThumbnailLocks").withIndex("by_key", q => q.eq("key", THUMBNAIL_LIBRARY_VERSION)).unique();
    if (lock?.token) throw new ConvexError("Another plan thumbnail is being generated. Finish it before starting the next.");
    if (lock) await ctx.db.patch(lock._id, { token }); else await ctx.db.insert("planThumbnailLocks", { key: THUMBNAIL_LIBRARY_VERSION, token });
    await ctx.db.insert("planThumbnailImages", { key, themeId, token, status: "generating" });
    return { state: "claimed" };
  },
});
export const finishImage = internalMutation({
  args: { themeId: v.string(), token: v.string(), storageId: v.optional(v.id("_storage")), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, { themeId, token, storageId, error }) => {
    const row = await ctx.db.query("planThumbnailImages").withIndex("by_key", q => q.eq("key", thumbnailThemeKey(themeId))).unique();
    if (row?.token !== token) throw new Error("Thumbnail generation token mismatch.");
    await ctx.db.patch(row._id, { ...(storageId ? { storageId } : {}), error: error ?? null, status: storageId ? "ready" : "failed" });
    const lock = await ctx.db.query("planThumbnailLocks").withIndex("by_key", q => q.eq("key", THUMBNAIL_LIBRARY_VERSION)).unique();
    if (lock?.token === token) await ctx.db.patch(lock._id, { token: null });
    return null;
  },
});
export const images = query({
  args: {}, returns: v.any(),
  handler: async ctx => Promise.all(THUMBNAIL_THEMES.map(async theme => {
    const row = await ctx.db.query("planThumbnailImages").withIndex("by_key", q => q.eq("key", thumbnailThemeKey(theme.id))).unique();
    return { themeId: theme.id, title: theme.title, status: row?.status ?? "missing", imageUrl: row?.storageId ? await ctx.storage.getUrl(row.storageId) : null };
  })),
});
export const getTags = internalQuery({
  args: { title: v.string() }, returns: v.any(),
  handler: (ctx, { title }) => ctx.db.query("planThumbnailTags").withIndex("by_key", q => q.eq("key", thumbnailTagsKey(title))).unique(),
});
export const claimTags = internalMutation({
  args: { title: v.string(), token: v.string() }, returns: v.any(),
  handler: async (ctx, { title, token }) => {
    const key = thumbnailTagsKey(title);
    const row = await ctx.db.query("planThumbnailTags").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row?.status === "ready") return { state: "cached", row };
    if (row?.status === "generating" && row.lease > Date.now()) return { state: "busy" };
    const fields = { key, title, token, status: "generating", lease: Date.now() + 540000 };
    if (row) await ctx.db.patch(row._id, fields); else await ctx.db.insert("planThumbnailTags", fields);
    return { state: "claimed" };
  },
});
export const finishTags = internalMutation({
  args: { title: v.string(), token: v.string(), tags: v.optional(v.array(v.object({ month: v.number(), themeId: v.string() }))), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, { title, token, tags, error }) => {
    if (tags && (tags.length !== 12 || tags.some((tag, index) => tag.month !== index + 1 || !themesById.has(tag.themeId)))) throw new Error("Twelve valid month-to-theme tags are required.");
    const row = await ctx.db.query("planThumbnailTags").withIndex("by_key", q => q.eq("key", thumbnailTagsKey(title))).unique();
    if (row?.token === token) await ctx.db.patch(row._id, { ...(tags ? { tags } : {}), error: error ?? null, status: error ? "failed" : "ready", lease: 0 });
    return null;
  },
});
