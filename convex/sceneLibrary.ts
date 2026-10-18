import { internalMutation, internalQuery, query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { SCENE_CATALOG, LIBRARY_VERSION, mappingKey, sceneKey, eligibleScenes, CREATIVE_CAREERS, isCreativeCareer } from "./sceneCatalog";
import { genderValidator } from "./gender";
import { CAREER_CATALOG, CAREER_TITLES } from "./careerCatalog";

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
const dayMoment2030s = v.object({ time: v.string(), skill: v.string(), why: v.string() });
export const roleCatalog = query({
  args: {}, returns: v.array(v.object({ title: v.string(), description: v.string() })),
  handler: () => CAREER_CATALOG.map(({ title, description }) => ({ title, description })),
});
// The old salary ranges live in saved search results. Return only salary fields, never
// interests, hopes, or the rest of a family's saved search result.
export const careerEarningsInputs = query({
  args: {}, returns: v.array(v.object({ title: v.string(), low: v.number(), high: v.number(), basis: v.string(), snapshots: v.number(), baselineSource: v.union(v.literal("stored"), v.literal("ai-estimated")) })),
  handler: async ctx => {
    if (process.env.CONVEX_CLOUD_URL !== "https://doting-basilisk-558.convex.cloud") throw new ConvexError("Salary inputs are restricted to doting-basilisk-558 DEV.");
    const rows = await ctx.db.query("searches").take(8192);
    const byTitle = new Map<string, { low: number; high: number; basis: string; createdAt: number; snapshots: number }>();
    for (const row of rows) {
      const careers = (row.result as { careers?: unknown[] } | null)?.careers;
      if (!Array.isArray(careers)) continue;
      for (const item of careers) {
        if (!item || typeof item !== "object") continue;
        const career = item as Record<string, unknown>;
        if (typeof career.title !== "string" || !CAREER_TITLES.includes(career.title as typeof CAREER_TITLES[number])) continue;
        if (typeof career.salaryMinINR !== "number" || typeof career.salaryMaxINR !== "number" || career.salaryMinINR <= 0 || career.salaryMaxINR <= career.salaryMinINR || typeof career.salaryBasis !== "string") continue;
        const existing = byTitle.get(career.title);
        byTitle.set(career.title, { low: career.salaryMinINR, high: career.salaryMaxINR, basis: career.salaryBasis, createdAt: row._creationTime, snapshots: (existing?.snapshots ?? 0) + 1 });
        // The table is in creation order; retain the newest stored value per career.
        if (existing && existing.createdAt > row._creationTime) byTitle.set(career.title, { ...existing, snapshots: (existing.snapshots ?? 0) + 1 });
      }
    }
    const mappings = await ctx.db.query("sceneMappings").take(200);
    const mappingByTitle = new Map(mappings.map(row => [row.title, row]));
    return CAREER_TITLES.flatMap(title => {
      const mapping = mappingByTitle.get(title);
      if (typeof mapping?.salaryMinINR === "number" && typeof mapping.salaryMaxINR === "number" && mapping.salaryBasis && mapping.baselineSource) return [{ title, low: mapping.salaryMinINR, high: mapping.salaryMaxINR, basis: mapping.salaryBasis, snapshots: 0, baselineSource: mapping.baselineSource }];
      const row = byTitle.get(title);
      return row ? [{ title, low: row.low, high: row.high, basis: row.basis, snapshots: row.snapshots, baselineSource: "stored" as const }] : [];
    });
  },
});
export const role2030s = query({
  args: { title: v.string() }, returns: v.union(v.null(), v.object({ role2030s: v.optional(v.string()), roleShort2030s: v.optional(v.string()), dayMoments2030s: v.optional(v.array(dayMoment2030s)), salaryMinINR: v.optional(v.number()), salaryMaxINR: v.optional(v.number()), salaryBasis: v.optional(v.string()), baselineSource: v.optional(v.union(v.literal("stored"), v.literal("ai-estimated"))), earnings2030sLow: v.optional(v.number()), earnings2030sHigh: v.optional(v.number()), earnings2030sBasis: v.optional(v.string()) })),
  handler: async (ctx, { title }) => {
    if (!CAREER_TITLES.includes(title as typeof CAREER_TITLES[number])) return null;
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
    return row ? { ...(row.roleSafetyChecked && row.role2030s ? { role2030s: row.role2030s } : {}), ...(row.roleSafetyChecked && row.roleShort2030s ? { roleShort2030s: row.roleShort2030s } : {}), ...(row.roleSafetyChecked && row.dayMoments2030s ? { dayMoments2030s: row.dayMoments2030s } : {}), ...(row.salaryMinINR !== undefined ? { salaryMinINR: row.salaryMinINR } : {}), ...(row.salaryMaxINR !== undefined ? { salaryMaxINR: row.salaryMaxINR } : {}), ...(row.salaryBasis ? { salaryBasis: row.salaryBasis } : {}), ...(row.baselineSource ? { baselineSource: row.baselineSource } : {}), ...(row.earnings2030sLow !== undefined ? { earnings2030sLow: row.earnings2030sLow } : {}), ...(row.earnings2030sHigh !== undefined ? { earnings2030sHigh: row.earnings2030sHigh } : {}), ...(row.earnings2030sBasis ? { earnings2030sBasis: row.earnings2030sBasis } : {}) } : null;
  },
});
const roleShortRow = v.object({ title: v.string(), role2030s: v.optional(v.string()), roleShort2030s: v.optional(v.string()) });
export const roleShortCatalog = query({
  args: {}, returns: v.array(roleShortRow),
  handler: async ctx => Promise.all(CAREER_TITLES.map(async title => {
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
    return { title, ...(row?.roleSafetyChecked && row.role2030s ? { role2030s: row.role2030s } : {}), ...(row?.roleSafetyChecked && row.roleShort2030s ? { roleShort2030s: row.roleShort2030s } : {}) };
  })),
});
export const shortRoles = query({
  args: { titles: v.array(v.string()) }, returns: v.array(v.object({ title: v.string(), roleShort2030s: v.optional(v.string()) })),
  handler: async (ctx, { titles }) => {
    if (titles.length > 3 || titles.some(title => !CAREER_TITLES.includes(title as typeof CAREER_TITLES[number]))) throw new ConvexError("Choose up to three careers from the career catalog.");
    return Promise.all(titles.map(async title => {
      const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
      return { title, ...(row?.roleSafetyChecked && row.roleShort2030s ? { roleShort2030s: row.roleShort2030s } : {}) };
    }));
  },
});
export const saveRole2030s = internalMutation({
  args: { title: v.string(), role2030s: v.string(), dayMoments2030s: v.array(dayMoment2030s), overwrite: v.boolean() }, returns: v.union(v.literal("saved"), v.literal("skipped")),
  handler: async (ctx, { title, role2030s, dayMoments2030s, overwrite }) => {
    requireLibraryDev();
    if (!CAREER_TITLES.includes(title as typeof CAREER_TITLES[number])) throw new ConvexError("Unknown career title.");
    const key = mappingKey(title);
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", key)).unique();
    if (!row || row.status !== "ready") throw new ConvexError("A ready scene mapping is required before saving career text.");
    if (!overwrite && row.roleSafetyChecked && (row.role2030s?.trim() || row.dayMoments2030s?.length)) return "skipped" as const;
    await ctx.db.patch(row._id, { role2030s, roleShort2030s: undefined, dayMoments2030s, roleSafetyChecked: true });
    return "saved" as const;
  },
});
export const saveRoleShort2030s = internalMutation({
  args: { title: v.string(), roleShort2030s: v.string(), overwrite: v.boolean() }, returns: v.union(v.literal("saved"), v.literal("skipped")),
  handler: async (ctx, { title, roleShort2030s, overwrite }) => {
    requireLibraryDev();
    if (!CAREER_TITLES.includes(title as typeof CAREER_TITLES[number])) throw new ConvexError("Unknown career title.");
    const words = roleShort2030s.trim().split(/\s+/).filter(Boolean).length;
    if (words < 18 || words > 28 || /\b(?:19|20)\d{2}\b/.test(roleShort2030s)) throw new ConvexError("The short role description must contain 18-28 words and no single calendar year.");
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
    if (!row || row.status !== "ready" || !row.role2030s?.trim() || !row.roleSafetyChecked) throw new ConvexError("A ready career with its screened full 2030s role text is required.");
    if (!overwrite && row.roleSafetyChecked && row.roleShort2030s?.trim()) return "skipped" as const;
    await ctx.db.patch(row._id, { roleShort2030s, roleSafetyChecked: true });
    return "saved" as const;
  },
});
export const reserveRole2030sCall = internalMutation({
  args: { key: v.string() }, returns: v.number(),
  handler: async (ctx, { key }) => {
    requireLibraryDev();
    if (key !== "career-role-2030s-v1" && key !== "career-role-short-2030s-v1" && key !== "career-earnings-2030s-v1") throw new ConvexError("Unknown role generation batch.");
    const row = await ctx.db.query("role2030sGenerationBudget").withIndex("by_key", q => q.eq("key", key)).unique();
    if ((row?.calls ?? 0) >= 100) throw new ConvexError("The 100-call DEV role generation limit has been reached.");
    const calls = (row?.calls ?? 0) + 1;
    if (row) await ctx.db.patch(row._id, { calls }); else await ctx.db.insert("role2030sGenerationBudget", { key, calls });
    return calls;
  },
});
export const role2030sCallReport = query({
  args: {}, returns: v.object({ calls: v.number(), costINR: v.number(), failed: v.number() }),
  handler: async ctx => {
    requireLibraryDev();
    const rows = await ctx.db.query("aiCalls").withIndex("by_cacheKey", q => q.eq("cacheKey", "career-role-2030s-v1")).take(200);
    return { calls: rows.filter(row => !row.cacheHit).length, costINR: rows.reduce((total, row) => total + (row.costINR ?? 0), 0), failed: rows.filter(row => row.status === "failed").length };
  },
});
export const roleShort2030sCallReport = query({
  args: {}, returns: v.object({ calls: v.number(), costINR: v.number(), failed: v.number() }),
  handler: async ctx => {
    requireLibraryDev();
    const rows = await ctx.db.query("aiCalls").withIndex("by_cacheKey", q => q.eq("cacheKey", "career-role-short-2030s-v1")).take(200);
    return { calls: rows.filter(row => !row.cacheHit).length, costINR: rows.reduce((total, row) => total + (row.costINR ?? 0), 0), failed: rows.filter(row => row.status === "failed").length };
  },
});
export const careerEarnings2030sCallReport = query({
  args: {}, returns: v.object({ calls: v.number(), costINR: v.number(), failed: v.number() }),
  handler: async ctx => {
    requireLibraryDev();
    const rows = await ctx.db.query("aiCalls").withIndex("by_cacheKey", q => q.eq("cacheKey", "career-earnings-2030s-v1")).take(200);
    return { calls: rows.filter(row => !row.cacheHit).length, costINR: rows.reduce((total, row) => total + (row.costINR ?? 0), 0), failed: rows.filter(row => row.status === "failed").length };
  },
});
export const careerEarnings2030sProgress = query({
  args: {}, returns: v.array(v.object({ title: v.string(), state: v.string(), low: v.optional(v.number()), high: v.optional(v.number()), basis: v.optional(v.string()), reason: v.optional(v.string()) })),
  handler: async ctx => {
    requireLibraryDev();
    const [mappings, errors, searches] = await Promise.all([
      ctx.db.query("sceneMappings").take(200),
      ctx.db.query("careerEarningsErrors").withIndex("by_timestamp").order("desc").take(200),
      ctx.db.query("searches").take(8192),
    ]);
    const mappingByTitle = new Map(mappings.map(row => [row.title, row]));
    const errorByTitle = new Map<string, string>();
    for (const row of errors) if (!errorByTitle.has(row.title)) errorByTitle.set(row.title, row.error);
    const hasBase = new Set<string>();
    for (const row of searches) {
      const careers = (row.result as { careers?: unknown[] } | null)?.careers;
      if (!Array.isArray(careers)) continue;
      for (const item of careers) {
        if (!item || typeof item !== "object") continue;
        const career = item as Record<string, unknown>;
        if (typeof career.title === "string" && typeof career.salaryMinINR === "number" && typeof career.salaryMaxINR === "number" && typeof career.salaryBasis === "string" && career.salaryMinINR > 0 && career.salaryMaxINR > career.salaryMinINR && /india/i.test(career.salaryBasis)) hasBase.add(career.title);
      }
    }
    return CAREER_TITLES.map(title => {
      const row = mappingByTitle.get(title), reason = errorByTitle.get(title);
      if (row?.earnings2030sLow !== undefined && row.earnings2030sHigh !== undefined && row.earnings2030sBasis) return { title, state: "updated", low: row.earnings2030sLow, high: row.earnings2030sHigh, basis: row.earnings2030sBasis };
      if (reason) return { title, state: "skipped-validation", reason };
      if (row?.salaryMinINR !== undefined && row.salaryMaxINR !== undefined && row.salaryBasis) return { title, state: "baseline-ready", low: row.salaryMinINR, high: row.salaryMaxINR, basis: row.salaryBasis };
      if (!hasBase.has(title)) return { title, state: "skipped-no-stored-2026-range" };
      if (!row) return { title, state: "skipped-no-career-record" };
      return { title, state: "skipped-not-generated" };
    });
  },
});
export const saveCareerEarnings2030s = internalMutation({
  args: { title: v.string(), low: v.number(), high: v.number(), basis: v.string() }, returns: v.null(),
  handler: async (ctx, { title, low, high, basis }) => {
    requireLibraryDev();
    if (!CAREER_TITLES.includes(title as typeof CAREER_TITLES[number]) || low <= 0 || low >= high || low % 50_000 !== 0 || high % 50_000 !== 0) throw new ConvexError("Invalid 2030s earnings values.");
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
    if (!row) throw new ConvexError("No shared career record exists for this title.");
    if (row.salaryMinINR === undefined || row.salaryMinINR <= 0 || row.salaryMaxINR === undefined || row.salaryMaxINR <= row.salaryMinINR) throw new ConvexError("A valid 2026 baseline is required for a 2030s range.");
    const allowedRangeRatio = Math.min(row.salaryMaxINR / row.salaryMinINR, 8);
      if (high > low * 8) throw new ConvexError("The 2030s range must not exceed the 8× cap.");
    const finalBasis = row.baselineSource === "ai-estimated" ? basis.replace(/^2026 stored India range/u, "AI-estimated 2026 Indian metro range") : basis;
    await ctx.db.patch(row._id, { earnings2030sLow: low, earnings2030sHigh: high, earnings2030sBasis: finalBasis });
    return null;
  },
});
export const normalizeCareerEarnings2030sBases = mutation({
  args: {}, returns: v.number(),
  handler: async ctx => {
    requireLibraryDev();
    const rows = await ctx.db.query("sceneMappings").take(200);
    let updated = 0;
    for (const row of rows) if (row.baselineSource === "ai-estimated" && row.earnings2030sBasis?.startsWith("2026 stored India range")) {
      await ctx.db.patch(row._id, { earnings2030sBasis: row.earnings2030sBasis.replace(/^2026 stored India range/u, "AI-estimated 2026 Indian metro range") });
      updated++;
    }
    return updated;
  },
});
export const saveCareerEarningsBaseline = internalMutation({
  args: { title: v.string(), low: v.number(), high: v.number(), basis: v.string(), source: v.union(v.literal("stored"), v.literal("ai-estimated")) }, returns: v.union(v.literal("saved"), v.literal("skipped")),
  handler: async (ctx, { title, low, high, basis, source }) => {
    requireLibraryDev();
    if (!CAREER_TITLES.includes(title as typeof CAREER_TITLES[number]) || low <= 0 || low >= high || !basis.trim()) throw new ConvexError("Invalid 2026 salary baseline.");
    if (source === "ai-estimated" && (high > low * 4 || low % 50000 !== 0 || high % 50000 !== 0)) throw new ConvexError("An AI-estimated 2026 baseline must be rounded to ₹50,000 and have a maximum 4× range.");
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
    if (!row) throw new ConvexError("No shared career record exists for this title.");
    if (row.baselineSource === "ai-estimated" && source === "stored") return "skipped" as const;
    await ctx.db.patch(row._id, { salaryMinINR: low, salaryMaxINR: high, salaryBasis: basis, baselineSource: source });
    return "saved" as const;
  },
});
export const saveStoredCareerBaseline = mutation({
  args: { title: v.string(), low: v.number(), high: v.number(), basis: v.string() }, returns: v.union(v.literal("saved"), v.literal("skipped")),
  handler: async (ctx, args) => {
    requireLibraryDev();
    if (!CAREER_TITLES.includes(args.title as typeof CAREER_TITLES[number]) || args.low <= 0 || args.low >= args.high || !args.basis.trim()) throw new ConvexError("Invalid stored salary baseline.");
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(args.title))).unique();
    if (!row) throw new ConvexError("No shared career record exists for this title.");
    if (row.salaryMinINR !== undefined && row.baselineSource) return "skipped" as const;
    await ctx.db.patch(row._id, { salaryMinINR: args.low, salaryMaxINR: args.high, salaryBasis: args.basis, baselineSource: "stored" });
    return "saved" as const;
  },
});
export const reserveCareerEarningsCompletionCall = internalMutation({
  args: {}, returns: v.number(),
  handler: async ctx => {
    requireLibraryDev();
    const key = "career-earnings-completion-v2";
    const row = await ctx.db.query("role2030sGenerationBudget").withIndex("by_key", q => q.eq("key", key)).unique();
    if ((row?.calls ?? 0) >= 125) throw new ConvexError("The 125-call DEV earnings completion limit has been reached.");
    const calls = (row?.calls ?? 0) + 1;
    if (row) await ctx.db.patch(row._id, { calls }); else await ctx.db.insert("role2030sGenerationBudget", { key, calls });
    return calls;
  },
});
export const careerEarningsCompletionCallReport = query({
  args: {}, returns: v.object({ calls: v.number(), costINR: v.number(), failed: v.number() }),
  handler: async ctx => {
    requireLibraryDev();
    const rows = await ctx.db.query("aiCalls").withIndex("by_cacheKey", q => q.eq("cacheKey", "career-earnings-completion-v2")).take(200);
    return { calls: rows.filter(row => !row.cacheHit).length, costINR: rows.reduce((total, row) => total + (row.costINR ?? 0), 0), failed: rows.filter(row => row.status === "failed").length };
  },
});
export const logCareerEarningsError = internalMutation({
  args: { title: v.string(), error: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    requireLibraryDev();
    if (!CAREER_TITLES.includes(args.title as typeof CAREER_TITLES[number])) throw new ConvexError("Unknown career title.");
    await ctx.db.insert("careerEarningsErrors", { ...args, timestamp: Date.now() });
    return null;
  },
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
const creativePanelSceneIds = ["creative-brief", "creative-making", "creative-feedback", "creative-share"] as const;
export const applyCreativeMappings = mutation({
  args: { adminKey: v.string() }, returns: v.object({ updated: v.number(), skipped: v.array(v.string()) }),
  handler: async (ctx, { adminKey }) => {
    requireAdmin(adminKey);
    let updated = 0;
    const skipped: string[] = [];
    for (const title of CREATIVE_CAREERS) {
      const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
      if (!row || row.status !== "ready" || !row.panels || row.panels.length !== 4 || !isCreativeCareer(title)) { skipped.push(title); continue; }
      const scenes = ["creative-hero", ...creativePanelSceneIds];
      let imagesReady = true;
      for (const sceneId of scenes) for (const gender of ["girl", "boy"] as const) {
        const image = await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(sceneId, gender))).unique();
        if (image?.status !== "ready" || (!image.storageId && !image.compressedStorageId)) imagesReady = false;
      }
      if (!imagesReady) { skipped.push(title); continue; }
      await ctx.db.patch(row._id, { heroSceneId: "creative-hero", panels: row.panels.map((panel, index) => ({ ...panel, sceneId: creativePanelSceneIds[index] })) });
      updated++;
    }
    return { updated, skipped };
  },
});
// One global lock serialises every image request, including concurrent admin invocations.
// A failed/expired request is never automatically regenerated: its billing outcome may be unknown.
export const claimImage = internalMutation({
  args: { sceneId: v.string(), gender: binaryGender, token: v.string(), retry: v.optional(v.boolean()) }, returns: v.any(),
  handler: async (ctx, { sceneId, gender, token, retry = false }) => {
    requireLibraryDev();
    if (!SCENE_CATALOG.some(s => s.id === sceneId)) throw new Error("Unknown scene.");
    const key = sceneKey(sceneId, gender);
    const row = await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row?.status === "ready") return { state: "cached", row };
    if (row && !(retry && row.status === "failed")) throw new ConvexError("This scene already has a generation attempt. Inspect its saved status before retrying.");
    const lock = await ctx.db.query("sceneLibraryLocks").withIndex("by_key", q => q.eq("key", LIBRARY_VERSION)).unique();
    if (lock?.token) throw new ConvexError("Another shared scene is being generated. Finish it before starting the next.");
    if (lock) await ctx.db.patch(lock._id, { token }); else await ctx.db.insert("sceneLibraryLocks", { key: LIBRARY_VERSION, token });
    const selectedScene = SCENE_CATALOG.find(scene => scene.id === sceneId);
    if (selectedScene && "creative" in selectedScene && selectedScene.creative) {
      const budgetKey = "creative-scene-pack-v1";
      const budget = await ctx.db.query("creativeSceneGenerationBudgets").withIndex("by_key", q => q.eq("key", budgetKey)).unique();
      if ((budget?.calls ?? 0) >= 12) throw new ConvexError("The 12-image DEV creative-scene limit, including two retries, has been reached.");
      const calls = (budget?.calls ?? 0) + 1;
      if (budget) await ctx.db.patch(budget._id, { calls }); else await ctx.db.insert("creativeSceneGenerationBudgets", { key: budgetKey, calls });
    }
    if (row) await ctx.db.patch(row._id, { token, status: "generating", error: null });
    else await ctx.db.insert("sceneImages", { key, sceneId, gender, token, status: "generating" });
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
  const heroImage = mapping.heroSceneId ? await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(mapping.heroSceneId!, selectedGender))).unique() : null;
  const heroStorageId = heroImage?.compressedStorageId ?? heroImage?.storageId;
  const panels = await Promise.all((mapping.panels ?? []).map(async p => {
    const image = await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(p.sceneId, selectedGender))).unique();
    const imageStorageId = image?.compressedStorageId ?? image?.storageId;
    return { ...p, illustration: SCENE_CATALOG.find(s => s.id === p.sceneId)?.activity ?? "", ...(image?.storageId ? { storageId: image.storageId } : {}), imageUrl: imageStorageId ? await ctx.storage.getUrl(imageStorageId) : null };
  }));
  return { title, gender: selectedGender, status: panels.length === 4 && panels.every(p => p.imageUrl) ? "ready" : "prepared", panels, ...(mapping.heroSceneId ? { heroSceneId: mapping.heroSceneId } : {}), ...(heroStorageId ? { heroImageUrl: await ctx.storage.getUrl(heroStorageId) } : {}), ...(mapping.roleSafetyChecked && mapping.role2030s ? { role2030s: mapping.role2030s } : {}), ...(mapping.roleSafetyChecked && mapping.roleShort2030s ? { roleShort2030s: mapping.roleShort2030s } : {}), ...(mapping.roleSafetyChecked && mapping.dayMoments2030s ? { dayMoments2030s: mapping.dayMoments2030s } : {}), ...(mapping.salaryMinINR !== undefined ? { salaryMinINR: mapping.salaryMinINR } : {}), ...(mapping.salaryMaxINR !== undefined ? { salaryMaxINR: mapping.salaryMaxINR } : {}), ...(mapping.salaryBasis ? { salaryBasis: mapping.salaryBasis } : {}), ...(mapping.baselineSource ? { baselineSource: mapping.baselineSource } : {}), ...(mapping.earnings2030sLow !== undefined ? { earnings2030sLow: mapping.earnings2030sLow } : {}), ...(mapping.earnings2030sHigh !== undefined ? { earnings2030sHigh: mapping.earnings2030sHigh } : {}), ...(mapping.earnings2030sBasis ? { earnings2030sBasis: mapping.earnings2030sBasis } : {}), path: "shared-scene-library", raw: JSON.stringify({ libraryVersion: LIBRARY_VERSION }) };
}
// Shared scenes power both ordinary career pages and saved career links.
export const career = query({ args: { title: v.string(), gender: genderValidator }, returns: v.any(), handler: (ctx, args) => libraryStory(ctx, args.title, args.gender) });
export const resolved = internalQuery({ args: { title: v.string(), gender: v.optional(genderValidator) }, returns: v.any(), handler: (ctx, args) => libraryStory(ctx, args.title, args.gender) });
export const inventory = query({
  args: {}, returns: v.any(),
  handler: async ctx => ({ version: LIBRARY_VERSION, scenes: await Promise.all(SCENE_CATALOG.flatMap(s => (["girl", "boy"] as const).map(async gender => {
    const row = await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(s.id, gender))).unique();
    const imageStorageId = row?.compressedStorageId ?? row?.storageId;
    return { sceneId: s.id, gender, status: row?.status ?? "missing", compressed: !!row?.compressedStorageId, imageUrl: imageStorageId ? await ctx.storage.getUrl(imageStorageId) : null };
  }))), mappings: await Promise.all(CAREER_TITLES.map(async title => {
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
    return { title, status: row?.status ?? "missing" };
  })) }),
});
