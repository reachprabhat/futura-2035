import { internalMutation, internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { storyKey } from "./storyKey";
import { thumbnailTagsKey } from "./thumbnailCatalog";
async function getPlan(ctx: QueryCtx, title: string) {
  const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", storyKey(title))).unique();
  if (!row?.plan?.projects?.length) return row;
  const tagRow = await ctx.db.query("planThumbnailTags").withIndex("by_key", q => q.eq("key", thumbnailTagsKey(title))).unique();
  const tagByMonth = new Map((tagRow?.status === "ready" ? tagRow.tags ?? [] : []).map((tag: any) => [tag.month, tag.themeId]));
  return { ...row, plan: { ...row.plan, projects: row.plan.projects.map((project: any) => ({ ...project, thumbnailThemeId: project.thumbnailThemeId ?? tagByMonth.get(project.month) })) } };
}
export const internalGet = internalQuery({ args: { title: v.string() }, returns: v.any(), handler: (ctx, { title }) => getPlan(ctx, title) });
export const get = query({ args: { title: v.string() }, returns: v.any(), handler: (ctx, { title }) => getPlan(ctx, title) });
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
