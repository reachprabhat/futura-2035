import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { sceneKey, SCENE_CATALOG, eligibleScenes, mappingKey } from "./sceneCatalog";
import { THUMBNAIL_THEMES, thumbnailThemeKey } from "./thumbnailCatalog";
import { CAREER_TITLES } from "./careerCatalog";
import { storyKey } from "./storyKey";

const knownCloudUrls = ["https://nautical-chicken-192.convex.cloud", "https://doting-basilisk-558.convex.cloud"];
const gender = v.union(v.literal("girl"), v.literal("boy"));
const imageArgs = { kind: v.union(v.literal("scene"), v.literal("thumbnail")), itemId: v.string(), gender: v.optional(gender) };

function requireReleaseAdmin(adminKey: string) {
  if (!knownCloudUrls.includes(process.env.CONVEX_CLOUD_URL ?? ""))
    throw new ConvexError("Compressed image writes are restricted to the configured DEV and production deployments.");
  const expected = process.env.ADMIN_COSTS_KEY;
  if (!expected || adminKey.length < 32 || adminKey !== expected) throw new ConvexError("Admin access required.");
}

function requireProductionReleaseAdmin(adminKey: string) {
  if (process.env.CONVEX_CLOUD_URL !== "https://nautical-chicken-192.convex.cloud")
    throw new ConvexError("Career content imports are restricted to nautical-chicken-192 PROD.");
  const expected = process.env.ADMIN_COSTS_KEY;
  if (!expected || adminKey.length < 32 || adminKey !== expected) throw new ConvexError("Admin access required.");
}

const mappingPanel = v.object({ time: v.string(), caption: v.string(), sceneId: v.string() });

// Read-only data used by the release script and release check. The catalog bounds these lists.
export const contentSnapshot = query({
  args: {}, returns: v.any(),
  handler: async ctx => {
    const mappings = await ctx.db.query("sceneMappings").take(200);
    const plans = await ctx.db.query("careerPlans").take(200);
    return {
      mappings: mappings.map(row => ({ title: row.title, status: row.status, ...(row.status === "ready" ? { panels: row.panels ?? [] } : {}), ...(row.heroSceneId ? { heroSceneId: row.heroSceneId } : {}), ...(row.role2030s ? { role2030s: row.role2030s } : {}), ...(row.roleShort2030s ? { roleShort2030s: row.roleShort2030s } : {}), ...(row.dayMoments2030s ? { dayMoments2030s: row.dayMoments2030s } : {}), ...(row.salaryMinINR !== undefined ? { salaryMinINR: row.salaryMinINR } : {}), ...(row.salaryMaxINR !== undefined ? { salaryMaxINR: row.salaryMaxINR } : {}), ...(row.salaryBasis ? { salaryBasis: row.salaryBasis } : {}), ...(row.baselineSource ? { baselineSource: row.baselineSource } : {}), ...(row.earnings2030sLow !== undefined ? { earnings2030sLow: row.earnings2030sLow } : {}), ...(row.earnings2030sHigh !== undefined ? { earnings2030sHigh: row.earnings2030sHigh } : {}), ...(row.earnings2030sBasis ? { earnings2030sBasis: row.earnings2030sBasis } : {}) })),
      plans: plans.map(row => ({ title: row.title, status: row.status, hasPlan: !!row.plan, ...(row.status === "ready" && row.plan ? { plan: row.plan } : {}) })),
    };
  },
});

export const copyCareerRole2030s = mutation({
  args: { adminKey: v.string(), title: v.string(), role2030s: v.optional(v.string()), roleShort2030s: v.optional(v.string()), dayMoments2030s: v.optional(v.array(v.object({ time: v.string(), skill: v.string(), why: v.string() }))), salaryMinINR: v.optional(v.number()), salaryMaxINR: v.optional(v.number()), salaryBasis: v.optional(v.string()), baselineSource: v.optional(v.union(v.literal("stored"), v.literal("ai-estimated"))), earnings2030sLow: v.optional(v.number()), earnings2030sHigh: v.optional(v.number()), earnings2030sBasis: v.optional(v.string()), overwrite: v.optional(v.boolean()) },
  returns: v.union(v.literal("created"), v.literal("replaced"), v.literal("skipped")),
  handler: async (ctx, { adminKey, title, role2030s, roleShort2030s, dayMoments2030s, salaryMinINR, salaryMaxINR, salaryBasis, baselineSource, earnings2030sLow, earnings2030sHigh, earnings2030sBasis, overwrite = false }) => {
    requireProductionReleaseAdmin(adminKey);
    if (!CAREER_TITLES.includes(title as typeof CAREER_TITLES[number])) throw new ConvexError("Unknown career title.");
    if (role2030s !== undefined && (role2030s.trim().split(/\s+/).length < 45 || role2030s.trim().split(/\s+/).length > 70 || dayMoments2030s?.length !== 4))
      throw new ConvexError("The source career role text is incomplete.");
    if (roleShort2030s !== undefined && (roleShort2030s.trim().split(/\s+/).filter(Boolean).length < 18 || roleShort2030s.trim().split(/\s+/).filter(Boolean).length > 28 || /\b(?:19|20)\d{2}\b/.test(roleShort2030s)))
      throw new ConvexError("The source short role text must contain 18-28 words and no single calendar year.");
    if ((earnings2030sLow !== undefined || earnings2030sHigh !== undefined || earnings2030sBasis !== undefined) && (earnings2030sLow === undefined || earnings2030sHigh === undefined || !earnings2030sBasis?.trim() || earnings2030sLow <= 0 || earnings2030sLow >= earnings2030sHigh || earnings2030sHigh > earnings2030sLow * 4 || earnings2030sLow % 50000 !== 0 || earnings2030sHigh % 50000 !== 0))
      throw new ConvexError("The source 2030s earnings values are incomplete or invalid.");
    if ((salaryMinINR !== undefined || salaryMaxINR !== undefined || salaryBasis !== undefined || baselineSource !== undefined) && (salaryMinINR === undefined || salaryMaxINR === undefined || !salaryBasis?.trim() || baselineSource === undefined || salaryMinINR <= 0 || salaryMinINR >= salaryMaxINR || (baselineSource === "ai-estimated" && (salaryMaxINR > salaryMinINR * 4 || salaryMinINR % 50000 !== 0 || salaryMaxINR % 50000 !== 0))))
      throw new ConvexError("The source 2026 baseline fields are incomplete or invalid.");
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
    if (!row || row.status !== "ready") throw new ConvexError("The PROD career scene mapping must be ready before role text can be copied.");
    if (!overwrite && (row.role2030s?.trim() || row.roleShort2030s?.trim() || row.dayMoments2030s?.length || row.salaryMinINR !== undefined || row.earnings2030sLow !== undefined)) return "skipped" as const;
    const wasFilled = !!row.role2030s?.trim() || !!row.roleShort2030s?.trim() || !!row.dayMoments2030s?.length || row.salaryMinINR !== undefined || row.earnings2030sLow !== undefined;
    await ctx.db.patch(row._id, { ...(role2030s !== undefined ? { role2030s } : {}), ...(dayMoments2030s !== undefined ? { dayMoments2030s } : {}), ...(roleShort2030s !== undefined ? { roleShort2030s } : {}), ...(salaryMinINR !== undefined ? { salaryMinINR, salaryMaxINR, salaryBasis, baselineSource } : {}), ...(earnings2030sLow !== undefined ? { earnings2030sLow, earnings2030sHigh, earnings2030sBasis } : {}) });
    return wasFilled ? "replaced" as const : "created" as const;
  },
});

export const copySceneMapping = mutation({
  args: { adminKey: v.string(), title: v.string(), panels: v.array(mappingPanel), heroSceneId: v.optional(v.string()), overwrite: v.optional(v.boolean()) },
  returns: v.union(v.literal("created"), v.literal("linked"), v.literal("replaced"), v.literal("skipped")),
  handler: async (ctx, { adminKey, title, panels, heroSceneId, overwrite = false }) => {
    requireProductionReleaseAdmin(adminKey);
    if (!CAREER_TITLES.includes(title as typeof CAREER_TITLES[number])) throw new ConvexError("Unknown career title.");
    if (panels.length !== 4 || panels.some(panel => !eligibleScenes(title).some(scene => scene.id === panel.sceneId)))
      throw new ConvexError("The source mapping does not contain four eligible scenes.");
    if (heroSceneId && !eligibleScenes(title).some(scene => scene.id === heroSceneId)) throw new ConvexError("The source hero scene is not eligible for this career.");

    // Mappings contain scene keys, never DEV storage IDs. Verify both PROD genders resolve locally.
    for (const panel of panels) for (const selectedGender of ["girl", "boy"] as const) {
      const image = await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(panel.sceneId, selectedGender))).unique();
      if (image?.status !== "ready" || (!image.storageId && !image.compressedStorageId))
        throw new ConvexError(`The PROD scene image is not ready for ${panel.sceneId} (${selectedGender}).`);
    }
    if (heroSceneId) for (const selectedGender of ["girl", "boy"] as const) {
      const image = await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(heroSceneId, selectedGender))).unique();
      if (image?.status !== "ready" || (!image.storageId && !image.compressedStorageId)) throw new ConvexError(`The PROD hero image is not ready for ${heroSceneId} (${selectedGender}).`);
    }

    const key = mappingKey(title);
    const row = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row?.status === "ready" && !overwrite) return "skipped" as const;
    const fields = { key, title, token: "release-copy", status: "ready", lease: 0, panels, ...(heroSceneId ? { heroSceneId } : {}), error: null };
    if (row?.status === "ready") { await ctx.db.patch(row._id, fields); return "replaced" as const; }
    if (row) {
      await ctx.db.patch(row._id, fields);
      return "linked" as const;
    }
    await ctx.db.insert("sceneMappings", fields);
    return "created" as const;
  },
});

export const copyCareerPlan = mutation({
  args: { adminKey: v.string(), title: v.string(), plan: v.any(), overwrite: v.optional(v.boolean()) },
  returns: v.union(v.literal("created"), v.literal("replaced"), v.literal("skipped")),
  handler: async (ctx, { adminKey, title, plan, overwrite = false }) => {
    requireProductionReleaseAdmin(adminKey);
    if (!CAREER_TITLES.includes(title as typeof CAREER_TITLES[number])) throw new ConvexError("Unknown career title.");
    if (!plan || !Array.isArray(plan.skills) || plan.skills.length !== 4 || !Array.isArray(plan.projects) || plan.projects.length !== 12)
      throw new ConvexError("The source career plan is incomplete.");
    const key = storyKey(title);
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", key)).unique();
    if (!overwrite && row?.status === "ready" && row.plan) return "skipped" as const;
    const fields = { title, key, token: "release-copy", status: "ready", lease: 0, plan, error: null };
    if (row) {
      await ctx.db.patch(row._id, fields);
      return "replaced" as const;
    }
    await ctx.db.insert("careerPlans", fields);
    return "created" as const;
  },
});

// A deleted failed row would be claimed as a fresh generation on the next page open.
// Keep a non-generating marker so a release cannot silently spend AI on PROD.
export const suppressFailedCareerPlan = mutation({
  args: { adminKey: v.string(), title: v.string() },
  returns: v.union(v.literal("suppressed"), v.literal("skipped")),
  handler: async (ctx, { adminKey, title }) => {
    requireProductionReleaseAdmin(adminKey);
    const mapping = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
    if (mapping?.status === "ready") return "skipped" as const;
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", storyKey(title))).unique();
    if (row?.status !== "failed") return "skipped" as const;
    await ctx.db.patch(row._id, { status: "unavailable", lease: 0, error: "No ready DEV plan was available to copy during release." });
    return "suppressed" as const;
  },
});

// A ready scene mapping makes this career eligible for normal plan generation.
// Remove a failed plan row so the first parent can claim and share one generation.
export const resetFailedCareerPlan = mutation({
  args: { adminKey: v.string(), title: v.string() },
  returns: v.union(v.literal("reset"), v.literal("skipped")),
  handler: async (ctx, { adminKey, title }) => {
    requireProductionReleaseAdmin(adminKey);
    const mapping = await ctx.db.query("sceneMappings").withIndex("by_key", q => q.eq("key", mappingKey(title))).unique();
    if (mapping?.status !== "ready") return "skipped" as const;
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", storyKey(title))).unique();
    if (row?.status !== "failed") return "skipped" as const;
    await ctx.db.delete(row._id);
    return "reset" as const;
  },
});

export const getTarget = internalQuery({
  args: imageArgs, returns: v.any(),
  handler: async (ctx, args) => {
    if (args.kind === "scene") {
      if (!args.gender || !SCENE_CATALOG.some(scene => scene.id === args.itemId)) throw new ConvexError("Unknown scene image id.");
      return ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(args.itemId, args.gender!))).unique();
    }
    if (args.gender || !THUMBNAIL_THEMES.some(theme => theme.id === args.itemId)) throw new ConvexError("Unknown thumbnail image id.");
    return ctx.db.query("planThumbnailImages").withIndex("by_key", q => q.eq("key", thumbnailThemeKey(args.itemId))).unique();
  },
});

// Release tooling reads the original file directly so a fresh deployment can
// receive the source image before its compressed version is linked.
export const inspectLibraryImage = query({
  args: imageArgs, returns: v.any(),
  handler: async (ctx, args) => {
    const row = args.kind === "scene"
      ? args.gender && SCENE_CATALOG.some(scene => scene.id === args.itemId)
        ? await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(args.itemId, args.gender!))).unique()
        : null
      : !args.gender && THUMBNAIL_THEMES.some(theme => theme.id === args.itemId)
        ? await ctx.db.query("planThumbnailImages").withIndex("by_key", q => q.eq("key", thumbnailThemeKey(args.itemId))).unique()
        : null;
    return {
      exists: !!row,
      hasOriginal: !!row?.storageId && row.status === "ready",
      hasCompressed: !!row?.compressedStorageId,
      compressedDigest: row?.compressedDigest ?? null,
      originalUrl: row?.storageId ? await ctx.storage.getUrl(row.storageId) : null,
    };
  },
});

export const ensureLibraryOriginal = mutation({
  args: { adminKey: v.string(), ...imageArgs, storageId: v.id("_storage") }, returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    requireReleaseAdmin(args.adminKey);
    if (args.kind === "scene" && (!args.gender || !SCENE_CATALOG.some(scene => scene.id === args.itemId))) throw new ConvexError("Unknown scene image id.");
    if (args.kind === "thumbnail" && (args.gender || !THUMBNAIL_THEMES.some(theme => theme.id === args.itemId))) throw new ConvexError("Unknown thumbnail image id.");
    const table = args.kind === "scene" ? "sceneImages" : "planThumbnailImages";
    const key = args.kind === "scene" ? sceneKey(args.itemId, args.gender!) : thumbnailThemeKey(args.itemId);
    const row = args.kind === "scene"
      ? await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", key)).unique()
      : await ctx.db.query("planThumbnailImages").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row?.storageId && row.status === "ready") return { created: false };
    if (row) {
      await ctx.db.patch(row._id, { storageId: args.storageId, status: "ready", error: null });
    } else if (table === "sceneImages") {
      await ctx.db.insert("sceneImages", { key, sceneId: args.itemId, gender: args.gender!, token: "release-copy", status: "ready", storageId: args.storageId, error: null });
    } else {
      await ctx.db.insert("planThumbnailImages", { key, themeId: args.itemId, token: "release-copy", status: "ready", storageId: args.storageId, error: null });
    }
    return { created: !row };
  },
});

export const prepareLibraryOriginalUpload = mutation({
  args: { adminKey: v.string() }, returns: v.string(),
  handler: async (ctx, { adminKey }) => {
    requireReleaseAdmin(adminKey);
    return await ctx.storage.generateUploadUrl();
  },
});

export const linkCompressedImage = internalMutation({
  args: { ...imageArgs, storageId: v.id("_storage"), sha256: v.string() }, returns: v.union(v.id("_storage"), v.null()),
  handler: async (ctx, args) => {
    const row = args.kind === "scene"
      ? await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(args.itemId, args.gender!))).unique()
      : await ctx.db.query("planThumbnailImages").withIndex("by_key", q => q.eq("key", thumbnailThemeKey(args.itemId))).unique();
    if (!row || row.status !== "ready" || !row.storageId) throw new ConvexError("The matching original image is missing.");
    if (row.compressedDigest === args.sha256 && row.compressedStorageId) {
      if (row.compressedStorageId !== args.storageId) await ctx.storage.delete(args.storageId);
      return null;
    }
    const previous = row.compressedStorageId ?? null;
    await ctx.db.patch(row._id, { compressedStorageId: args.storageId, compressedDigest: args.sha256 });
    return previous;
  },
});

export const prepareCompressedLibraryImage = mutation({
  args: { adminKey: v.string(), ...imageArgs, sha256: v.string() },
  returns: v.object({ alreadyCurrent: v.boolean(), uploadUrl: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    requireReleaseAdmin(args.adminKey);
    if (!/^[a-f0-9]{64}$/i.test(args.sha256)) throw new ConvexError("Invalid image digest.");
    const target = args.kind === "scene"
      ? await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(args.itemId, args.gender!))).unique()
      : await ctx.db.query("planThumbnailImages").withIndex("by_key", q => q.eq("key", thumbnailThemeKey(args.itemId))).unique();
    if (!target || target.status !== "ready" || !target.storageId) throw new ConvexError("The matching original image is missing.");
    if (target.compressedDigest === args.sha256 && target.compressedStorageId)
      return { alreadyCurrent: true, uploadUrl: null };
    return { alreadyCurrent: false, uploadUrl: await ctx.storage.generateUploadUrl() };
  },
});

export const saveCompressedLibraryImage = mutation({
  args: { adminKey: v.string(), ...imageArgs, storageId: v.id("_storage"), sha256: v.string() },
  returns: v.object({ itemId: v.string(), gender: v.optional(gender), alreadyCurrent: v.boolean() }),
  handler: async (ctx, args) => {
    requireReleaseAdmin(args.adminKey);
    if (!/^[a-f0-9]{64}$/i.test(args.sha256)) throw new ConvexError("Invalid image digest.");
    const target = args.kind === "scene"
      ? await ctx.db.query("sceneImages").withIndex("by_key", q => q.eq("key", sceneKey(args.itemId, args.gender!))).unique()
      : await ctx.db.query("planThumbnailImages").withIndex("by_key", q => q.eq("key", thumbnailThemeKey(args.itemId))).unique();
    if (!target || target.status !== "ready" || !target.storageId) throw new ConvexError("The matching original image is missing.");
    const alreadyCurrent = target.compressedDigest === args.sha256 && !!target.compressedStorageId;
    if (alreadyCurrent) {
      if (target.compressedStorageId !== args.storageId) await ctx.storage.delete(args.storageId);
    } else {
      const previous = target.compressedStorageId ?? null;
      await ctx.db.patch(target._id, { compressedStorageId: args.storageId, compressedDigest: args.sha256 });
      if (previous && previous !== args.storageId) await ctx.storage.delete(previous);
    }
    return { itemId: args.itemId, ...(args.gender ? { gender: args.gender } : {}), alreadyCurrent };
  },
});
