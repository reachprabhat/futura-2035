import { internalMutation, internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { storyKey } from "./storyKey";
import { thumbnailTagsKey } from "./thumbnailCatalog";
import { isPlanReady, validatePlanMonths, withDefaultPlanImages } from "./planQuality";
async function getPlan(ctx: QueryCtx, title: string) {
  const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", storyKey(title))).unique();
  const plan = row?.plan;
  const projects = plan?.projects;
  if (!row || !plan || !projects?.length) return row;
  const tagRow = await ctx.db.query("planThumbnailTags").withIndex("by_key", q => q.eq("key", thumbnailTagsKey(title, projects))).unique();
  const tagByMonth = new Map((tagRow?.status === "ready" ? tagRow.tags ?? [] : []).map((tag: any) => [tag.month, tag.themeId]));
  return { ...row, plan: withDefaultPlanImages({ ...plan, projects: projects.map((project: any) => ({ ...project, thumbnailThemeId: tagByMonth.get(project.month) ?? project.thumbnailThemeId })) }) };
}
export const internalGet = internalQuery({ args: { title: v.string() }, returns: v.any(), handler: async (ctx, { title }) => {
  const row = await getPlan(ctx, title);
  return row?.safetyChecked === true ? row : null;
} });
export const get = query({ args: { title: v.string() }, returns: v.any(), handler: async (ctx, { title }) => {
  const row = await getPlan(ctx, title);
  if (row?.plan && row.safetyChecked !== true) return { ...row, status: "needs-review", needsReview: true, plan: null };
  if (row?.plan && isPlanReady(row.plan)) return { ...row, status: "ready", needsReview: false };
  if (!row?.plan || row.status === "unavailable" || row.status === "failed" || row.status === "generating") return row;
  if (row.status === "needs-review" || !isPlanReady(row.plan)) return { ...row, status: "needs-review", needsReview: true, plan: null };
  return { ...row, needsReview: false };
} });
export const claim = internalMutation({
  args: { title: v.string(), token: v.string() }, returns: v.any(),
  handler: async (ctx, { title, token }) => {
    const key = storyKey(title);
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", key)).unique();
    if ((row?.status === "ready" || row?.status === "needs-review") && isPlanReady(row.plan)) {
      if (row.status !== "ready") await ctx.db.patch(row._id, { status: "ready", lease: 0, error: null });
      return { state: "cached", row: { ...row, status: "ready" } };
    }
    if (row?.status === "ready" || row?.status === "needs-review") {
      if (row.status !== "needs-review") await ctx.db.patch(row._id, { status: "needs-review", lease: 0 });
      return { state: "needs-review", row: { ...row, status: "needs-review" } };
    }
    if (row?.status === "unavailable") return { state: "unavailable" };
    if (row?.status === "generating" && row.lease > Date.now()) return { state: "busy", row };
    const fields = { title, key, token, status: "generating", lease: Date.now() + 540000 };
    if (row) await ctx.db.patch(row._id, fields); else await ctx.db.insert("careerPlans", fields);
    return { state: "claimed" };
  },
});
export const finish = internalMutation({
  args: { title: v.string(), token: v.string(), plan: v.optional(v.any()), error: v.optional(v.string()), status: v.optional(v.union(v.literal("ready"), v.literal("needs-review"))) }, returns: v.null(),
  handler: async (ctx, { title, token, plan, error, status }) => {
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", storyKey(title))).unique();
    if (row?.token === token) await ctx.db.patch(row._id, { ...(plan ? { plan: withDefaultPlanImages(plan), safetyChecked: true } : {}), error: error ?? null, status: error ? "failed" : status ?? "ready", lease: 0 });
    return null;
  },
});
export const confirmSafety = internalMutation({
  args: { title: v.string() }, returns: v.null(),
  handler: async (ctx, { title }) => {
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", storyKey(title))).unique();
    if (row?.plan) await ctx.db.patch(row._id, { safetyChecked: true });
    return null;
  },
});
export const reclaimForSafetyRepair = internalMutation({
  args: { title: v.string(), token: v.string() }, returns: v.boolean(),
  handler: async (ctx, { title, token }) => {
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", storyKey(title))).unique();
    if (!row || row.status === "generating") return false;
    await ctx.db.patch(row._id, { status: "generating", token, lease: Date.now() + 540000, safetyChecked: false, error: null });
    return true;
  },
});
export const qualityReviewList = query({
  args: { adminKey: v.string() }, returns: v.array(v.object({ id: v.id("careerPlans"), title: v.string(), status: v.string(), createdAt: v.number(), issues: v.array(v.object({ month: v.number(), issues: v.array(v.string()) })), plan: v.any() })),
  handler: async (ctx, { adminKey }) => {
    const expected = process.env.ADMIN_COSTS_KEY;
    if (!expected || adminKey.length < 32 || adminKey !== expected) throw new Error("Admin access required.");
    const [reviewRows, readyRows] = await Promise.all([
      ctx.db.query("careerPlans").withIndex("by_status", q => q.eq("status", "needs-review")).take(500),
      ctx.db.query("careerPlans").withIndex("by_status", q => q.eq("status", "ready")).take(500),
    ]);
    const rows = new Map([...reviewRows.filter(row => row.safetyChecked === true && !isPlanReady(row.plan)), ...readyRows.filter(row => row.safetyChecked === true && !isPlanReady(row.plan))].map(row => [row._id, row]));
    return [...rows.values()].map(row => {
      const plan = row.plan ? withDefaultPlanImages(row.plan) : null;
      return { id: row._id, title: row.title, status: "needs-review", createdAt: row._creationTime, issues: validatePlanMonths(plan?.projects), plan };
    });
  },
});
export const claimQualityProofPlanDev = internalMutation({
  args: { title: v.union(v.literal("Economist"), v.literal("Performing Artist"), v.literal("Author"), v.literal("Food Critic"), v.literal("Sports Coach")), token: v.string() }, returns: v.null(),
  handler: async (ctx, { title, token }) => {
    if (process.env.CONVEX_CLOUD_URL !== "https://doting-basilisk-558.convex.cloud") throw new Error("Quality proof generation is restricted to doting-basilisk-558 DEV.");
    const key = storyKey(title);
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row?.status === "generating" && row.lease > Date.now()) throw new Error("A plan generation is already running for this career.");
    const fields = { title, key, token, status: "generating", lease: Date.now() + 540000 };
    if (row) await ctx.db.patch(row._id, fields); else await ctx.db.insert("careerPlans", fields);
    return null;
  },
});
export const reserveMissingDevPlanCall = internalMutation({
  args: {}, returns: v.number(),
  handler: async ctx => {
    if (process.env.CONVEX_CLOUD_URL !== "https://doting-basilisk-558.convex.cloud") throw new Error("Missing-plan generation is restricted to doting-basilisk-558 DEV.");
    const key = "missing-career-plans-v1";
    const row = await ctx.db.query("planGenerationBudgets").withIndex("by_key", q => q.eq("key", key)).unique();
    // Count real OpenAI requests. zodTextFormat can fail locally before an HTTP request;
    // those aiCalls rows have the specific schema-construction error and are excluded.
    const ledger = await ctx.db.query("aiCalls").withIndex("by_visitorId", q => q.eq("visitorId", "dev-missing-plans-batch")).collect();
    const actualCalls = ledger.filter(call => call.callType === "plan" && !call.cacheHit && !call.error?.includes("Schema field at `properties/" )).length;
    if (actualCalls >= 100) throw new Error("The 100-call DEV missing-plan generation cap has been reached.");
    const calls = actualCalls + 1;
    if (row) await ctx.db.patch(row._id, { calls }); else await ctx.db.insert("planGenerationBudgets", { key, calls });
    return calls;
  },
});
export const claimEconomistRegeneration = internalMutation({
  args: { token: v.string() }, returns: v.any(),
  handler: async (ctx, { token }) => {
    if (process.env.CONVEX_CLOUD_URL !== "https://doting-basilisk-558.convex.cloud") throw new Error("Economist plan refresh is restricted to doting-basilisk-558 DEV.");
    const title = "Economist", key = storyKey(title);
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", key)).unique();
    const isCurrent = row?.status === "ready" && Boolean(row.plan?.coreSkills && row.plan.coreSkills.length >= 4) && row.plan?.projects?.length === 12 && row.plan.projects.every((project: any) => project.projectDetails && project.targetSkill && project.successCriteria?.length && project.timeNeeded);
    if (isCurrent) return { state: "current", plan: row.plan };
    if (row?.status === "generating" && row.lease > Date.now()) return { state: "busy" };
    const fields = { title, key, token, status: "generating", lease: Date.now() + 540000 };
    if (row) await ctx.db.patch(row._id, fields); else await ctx.db.insert("careerPlans", fields);
    return { state: "claimed", daySkills: row?.plan?.skills ?? [] };
  },
});
export const failEconomistRegeneration = internalMutation({
  args: { token: v.string(), error: v.string() }, returns: v.null(),
  handler: async (ctx, { token, error }) => {
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", storyKey("Economist"))).unique();
    if (row?.token === token) await ctx.db.patch(row._id, { status: row.plan ? "ready" : "failed", error, lease: 0 });
    return null;
  },
});

const refreshableDevPlanTitles = ["Author", "Food Critic"] as const;
export const claimSelectedDevPlanRegeneration = internalMutation({
  args: { title: v.union(v.literal("Author"), v.literal("Food Critic")), token: v.string() }, returns: v.any(),
  handler: async (ctx, { title, token }) => {
    if (process.env.CONVEX_CLOUD_URL !== "https://doting-basilisk-558.convex.cloud") throw new Error("Selected plan refresh is restricted to doting-basilisk-558 DEV.");
    if (!refreshableDevPlanTitles.includes(title)) throw new Error("Only the explicitly selected DEV career plans can be refreshed.");
    const key = storyKey(title);
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", key)).unique();
    if (row?.status === "generating" && row.lease > Date.now()) return { state: "busy" };
    const fields = { title, key, token, status: "generating", lease: Date.now() + 540000 };
    if (row) await ctx.db.patch(row._id, fields); else await ctx.db.insert("careerPlans", fields);
    return { state: "claimed", daySkills: row?.plan?.skills ?? [] };
  },
});
export const failSelectedDevPlanRegeneration = internalMutation({
  args: { title: v.union(v.literal("Author"), v.literal("Food Critic")), token: v.string(), error: v.string() }, returns: v.null(),
  handler: async (ctx, { title, token, error }) => {
    if (process.env.CONVEX_CLOUD_URL !== "https://doting-basilisk-558.convex.cloud") throw new Error("Selected plan refresh is restricted to doting-basilisk-558 DEV.");
    const row = await ctx.db.query("careerPlans").withIndex("by_key", q => q.eq("key", storyKey(title))).unique();
    if (row?.token === token) await ctx.db.patch(row._id, { status: row.plan ? "ready" : "failed", error, lease: 0 });
    return null;
  },
});
