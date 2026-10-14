import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { SCENE_CATALOG, LIBRARY_VERSION, mappingKey, sceneKey, eligibleScenes } from "./sceneCatalog";
import { genderValidator } from "./gender";
import { CAREER_TITLES } from "./careerCatalog";

const binaryGender = v.union(v.literal("girl"), v.literal("boy"));
export function requireLibraryDev() {
  if (process.env.CONVEX_CLOUD_URL !== "https://doting-basilisk-558.convex.cloud") throw new ConvexError("Shared library changes are restricted to doting-basilisk-558 DEV.");
}
function requireAdmin(adminKey: string) {
  requireLibraryDev();
  if (!process.env.ADMIN_COSTS_KEY || adminKey.length < 32 || adminKey !== process.env.ADMIN_COSTS_KEY) throw new ConvexError("Admin access required.");
}
const referenceKey = (gender: "girl" | "boy") => `${LIBRARY_VERSION}:${gender}`;
export const reference = internalQuery({ args: { gender: binaryGender }, returns: v.any(), handler: (ctx, { gender }) => ctx.db.query("sceneReferences").withIndex("by_key", q => q.eq("key", referenceKey(gender))).unique() });
export const referenceUpload = mutation({ args: { adminKey: v.string() }, returns: v.string(), handler: async (ctx, { adminKey }) => { requireAdmin(adminKey); return ctx.storage.generateUploadUrl(); } });
export const saveBoyReference = mutation({
  args: { adminKey: v.string(), storageId: v.id("_storage"), digest: v.string() }, returns: v.null(),
  handler: async (ctx, { adminKey, storageId, digest }) => {
    requireAdmin(adminKey);
    const key = referenceKey("boy");
    const row = await ctx.db.query("sceneReferences").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row) { if (row.digest !== digest) throw new ConvexError("Boy reference is already locked to a different image."); return null; }
    if (!await ctx.db.system.get(storageId)) throw new ConvexError("Reference upload is missing.");
    await ctx.db.insert("sceneReferences", { key, storageId, digest });
    return null;
  },
});
export async function libraryTotals(ctx: Pick<QueryCtx, "db">) {
  let costUSD = 0, costINR = 0, calls = 0, unknownCosts = 0;
  for await (const row of ctx.db.query("aiCalls").withIndex("by_cacheKey", q => q.gte("cacheKey", `${LIBRARY_VERSION}:`).lt("cacheKey", `${LIBRARY_VERSION};`))) {
    if (row.cacheHit) continue;
    calls++; costUSD += row.costUSD ?? 0; costINR += row.costINR ?? 0;
    if (row.costUSD === null) unknownCosts++;
  }
  return { costUSD, costINR, calls, unknownCosts, limitINR: 250, overBudget: costINR > 250 };
}
export const totals = query({ args: { adminKey: v.string() }, returns: v.any(), handler: async (ctx, { adminKey }) => { requireAdmin(adminKey); return libraryTotals(ctx); } });
export const getMapping = internalQuery({
  args: { title: v.string() }, returns: v.any(),
  handler: (ctx, { title }) => ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique(),
});
export const claimMapping = internalMutation({
  args: { title: v.string(), token: v.string() }, returns: v.any(),
  handler: async (ctx, { title, token }) => {
    requireLibraryDev();
    const key = mappingKey(title);
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row?.status === "ready") return { state: "cached", row };
    if (row?.status === "generating" && row.lease > Date.now()) return { state: "busy" };
    const fields = { key, title, token, status: "generating", lease: Date.now() + 540000 };
    if (row) await ctx.db.patch(row._id, fields); else await ctx.db.insert("sceneMappings", fields);
    return { state: "claimed" };
  },
});
export const finishMapping = internalMutation({
  args: { title: v.string(), token: v.string(), panels: v.optional(v.array(v.object({ time: v.string(), caption: v.string(), sceneId: v.string() }))), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, { title, token, panels, error }) => {
    requireLibraryDev();
    if (panels && (panels.length !== 4 || panels.some(p => !eligibleScenes(title).some(s => s.id === p.sceneId)))) throw new Error("Four scenes with the correct outfit are required.");
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
    if (row?.token === token) await ctx.db.patch(row._id, { ...(panels ? { panels } : {}), error: error ?? null, status: error ? "failed" : "ready", lease: 0 });
    return null;
  },
});
// One global lock serialises every image request, including concurrent admin invocations.
// A failed/expired request is never automatically regenerated: its billing outcome may be unknown.
export const claimImage = internalMutation({
  args: { sceneId: v.string(), gender: binaryGender, token: v.string() }, returns: v.any(),
  handler: async (ctx, { sceneId, gender, token }) => {
    requireLibraryDev();
    if (!SCENE_CATALOG.some(s => s.id === sceneId)) throw new Error("Unknown scene.");
    const key = sceneKey(sceneId, gender);
    const row = await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row?.status === "ready") return { state: "cached", row };
    if (row) throw new ConvexError("This scene already has a generation attempt. Inspect its saved status before retrying.");
    const lock = await ctx.db.query("sceneLibraryLocks").withIndex("by_key", q => q.eq("key", LIBRARY_VERSION)).unique();
    if (lock?.token) throw new ConvexError("Another shared scene is being generated. Finish it before starting the next.");
    if (lock) await ctx.db.patch(lock._id, { token }); else await ctx.db.insert("sceneLibraryLocks", { key: LIBRARY_VERSION, token });
    await ctx.db.insert("sceneImages", { key, sceneId, gender, token, status: "generating" });
    return { state: "claimed" };
  },
});
export const finishImage = internalMutation({
  args: { sceneId: v.string(), gender: binaryGender, token: v.string(), storageId: v.optional(v.id("_storage")), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, { sceneId, gender, token, storageId, error }) => {
    requireLibraryDev();
    const row = await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(sceneId, gender))).unique();
    if (row?.token !== token) throw new Error("Scene generation token mismatch.");
    await ctx.db.patch(row._id, { ...(storageId ? { storageId } : {}), error: error ?? null, status: storageId ? "ready" : "failed" });
    if (gender === "girl" && storageId) {
      const key = referenceKey("girl");
      const reference = await ctx.db.query("sceneReferences").withIndex("by_key", q => q.eq("key", key)).unique();
      if (!reference) await ctx.db.insert("sceneReferences", { key, storageId });
    }
    const lock = await ctx.db.query("sceneLibraryLocks").withIndex("by_key", q => q.eq("key", LIBRARY_VERSION)).unique();
    if (lock?.token === token) await ctx.db.patch(lock._id, { token: null });
    return null;
  },
});
export async function libraryStory(ctx: Pick<QueryCtx, "db" | "storage">, title: string, gender?: "girl" | "boy" | "unspecified") {
  const mapping = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
  if (mapping?.status !== "ready") return null;
  const selectedGender = gender === "boy" ? "boy" : "girl";
  const panels = await Promise.all((mapping.panels ?? []).map(async p => {
    const image = await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(p.sceneId, selectedGender))).unique();
    return { ...p, illustration: SCENE_CATALOG.find(s => s.id === p.sceneId)?.activity ?? "", ...(image?.storageId ? { storageId: image.storageId } : {}), imageUrl: image?.storageId ? await ctx.storage.getUrl(image.storageId) : null };
  }));
  return { title, gender: selectedGender, status: panels.length === 4 && panels.every(p => p.imageUrl) ? "ready" : "prepared", panels, path: "shared-scene-library", raw: JSON.stringify({ libraryVersion: LIBRARY_VERSION }) };
}
// Explicit library preview; ordinary cached links continue to prefer archived storyboards.
export const career = query({ args: { title: v.string(), gender: genderValidator }, returns: v.any(), handler: (ctx, args) => libraryStory(ctx, args.title, args.gender) });
export const resolved = internalQuery({ args: { title: v.string(), gender: v.optional(genderValidator) }, returns: v.any(), handler: (ctx, args) => libraryStory(ctx, args.title, args.gender) });
export const inventory = query({
  args: {}, returns: v.any(),
  handler: async ctx => ({ version: LIBRARY_VERSION, scenes: await Promise.all(SCENE_CATALOG.flatMap(s => (["girl", "boy"] as const).map(async gender => {
    const row = await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(s.id, gender))).unique();
    return { sceneId: s.id, gender, status: row?.status ?? "missing", imageUrl: row?.storageId ? await ctx.storage.getUrl(row.storageId) : null };
  }))), mappings: await Promise.all(CAREER_TITLES.map(async title => {
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
    return { title, status: row?.status ?? "missing" };
  })) }),
});
