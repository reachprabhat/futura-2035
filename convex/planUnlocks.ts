import { action, internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { buildFunnelMath } from "./funnelMath";
import { CAREER_TITLES } from "./careerCatalog";
import { readTracking, trackingString, trackingBoolean } from "./tracking";

const priceKey = "full-plan-price-inr";
const DEFAULT_PLAN_PRICE = 199;
const messageKey = "locked-card-message";
const paymentModeKey = "paymentMode";
const DEFAULT_PAYMENT_MODE = "free_preview" as const;
const gender = v.union(v.literal("girl"), v.literal("boy"));
function requireAdmin(adminKey: string) {
  assertSupportedDeployment();
  const expected = process.env.ADMIN_COSTS_KEY;
  if (!expected || adminKey.length < 32 || adminKey !== expected) throw new ConvexError("Admin access required.");
}
function assertDev() {
  if (process.env.CONVEX_CLOUD_URL !== "https://doting-basilisk-558.convex.cloud") throw new ConvexError("Plan payments are restricted to doting-basilisk-558 DEV.");
}
function assertSupportedDeployment() {
  const url = process.env.CONVEX_CLOUD_URL;
  if (url !== "https://doting-basilisk-558.convex.cloud" && url !== "https://nautical-chicken-192.convex.cloud")
    throw new ConvexError("Plan payments are enabled only on the named DEV and production deployments; other targets are restricted to doting-basilisk-558 DEV.");
}
async function readPrice(ctx: Pick<QueryCtx, "db">) {
  assertSupportedDeployment();
  const setting = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", priceKey)).unique();
  return typeof setting?.value === "number" ? setting.value : DEFAULT_PLAN_PRICE;
}
async function readLockedMessage(ctx: Pick<QueryCtx, "db">) {
  assertSupportedDeployment();
  const setting = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", messageKey)).unique();
  return typeof setting?.value === "string" ? setting.value : "";
}
async function readPaymentMode(ctx: Pick<QueryCtx, "db">): Promise<"free_preview" | "paid"> {
  assertSupportedDeployment();
  const setting = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", paymentModeKey)).unique();
  return setting?.value === "paid" ? "paid" : DEFAULT_PAYMENT_MODE;
}
type AnalyticsEvent = "landing-view" | "example-viewed" | "gender-picked" | "career-search" | "career-opened" | "day-viewed" | "plan-preview-viewed" | "locked-card-view" | "pay-tap" | "full-plan-shown" | "payment-submitted" | "approved" | "rejected" | "pdf-download" | "whatsapp-share";
type AnalyticsDimensions = { visitorId?: string; ref?: string; referrerDomain?: string; isTest?: boolean; career?: string; gender?: "girl" | "boy" | "unspecified"; age?: 13 | 14 | 15 | 16; amount?: number; device?: "mobile" | "desktop"; entryPath?: "Example" | "Search" | "Unknown"; paymentMode?: "free_preview" | "paid"; seedBatch?: string };
async function writeAnalytics(ctx: MutationCtx, event: AnalyticsEvent, values: AnalyticsDimensions, createdAt = Date.now()) {
  assertSupportedDeployment();
  const visitorId = values.visitorId ?? "unknown";
  const entryPath = values.entryPath ?? "Unknown";
  const previous = await ctx.db.query("analyticsEvents").withIndex("by_visitorId", q => q.eq("visitorId", visitorId)).take(250);
  if (event === "landing-view" && entryPath !== "Unknown") {
    const landing = previous.find(row => row.event === "landing-view" && (row.entryPath ?? "Unknown") === "Unknown");
    if (landing) { await ctx.db.patch(landing._id, { entryPath, ...(!landing.ref && values.ref ? { ref: values.ref } : {}), ...(!landing.referrerDomain && values.referrerDomain ? { referrerDomain: values.referrerDomain } : {}), ...(!landing.device && values.device ? { device: values.device } : {}), ...(values.age ? { age: values.age } : {}), ...(values.paymentMode ? { paymentMode: values.paymentMode } : {}) }); return; }
  }
  const duplicate = previous.find(row => row.event === event && (event !== "landing-view" || (row.entryPath ?? "Unknown") === entryPath));
  if (duplicate && !values.seedBatch) {
    const patch = { ...(!duplicate.ref && values.ref ? { ref: values.ref } : {}), ...(!duplicate.referrerDomain && values.referrerDomain ? { referrerDomain: values.referrerDomain } : {}), ...(!duplicate.device && values.device ? { device: values.device } : {}), ...(values.age ? { age: values.age } : {}) };
    if (Object.keys(patch).length) await ctx.db.patch(duplicate._id, patch);
    return;
  }
  const paymentMode = values.paymentMode ?? await readPaymentMode(ctx);
  await ctx.db.insert("analyticsEvents", { event, visitorId, isTest: values.isTest ?? true, createdAt, paymentMode, entryPath, ...(values.ref ? { ref: values.ref } : {}), ...(values.referrerDomain ? { referrerDomain: values.referrerDomain } : {}), ...(values.device ? { device: values.device } : {}), ...(values.career ? { career: values.career } : {}), ...(values.gender ? { gender: values.gender } : {}), ...(values.age ? { age: values.age } : {}), ...(values.amount !== undefined ? { amount: values.amount } : {}), ...(values.seedBatch ? { seedBatch: values.seedBatch } : {}) });
}

const migrationPage = v.object({ done: v.boolean(), cursor: v.union(v.string(), v.null()), updated: v.number() });
export const migrateAiTestFlagsBatch = internalMutation({
  args: { paginationOpts: paginationOptsValidator }, returns: migrationPage,
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db.query("aiCalls").withIndex("by_timestamp").paginate(paginationOpts);
    let updated = 0;
    for (const row of page.page) {
      if (row.isTest === undefined || row.visitorId === undefined) {
        await ctx.db.patch(row._id, { ...(row.isTest === undefined ? { isTest: true } : {}), ...(row.visitorId === undefined ? { visitorId: "unknown" } : {}) });
        updated++;
      }
    }
    return { done: page.isDone, cursor: page.continueCursor, updated };
  },
});
export const migrateFunnelTestFlagsBatch = internalMutation({
  args: { paginationOpts: paginationOptsValidator }, returns: migrationPage,
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db.query("planUnlockEvents").withIndex("by_createdAt").paginate(paginationOpts);
    let updated = 0;
    for (const row of page.page) {
      if (row.isTest === undefined || row.visitorId === undefined) {
        await ctx.db.patch(row._id, { ...(row.isTest === undefined ? { isTest: true } : {}), ...(row.visitorId === undefined ? { visitorId: "unknown" } : {}) });
        updated++;
      }
    }
    return { done: page.isDone, cursor: page.continueCursor, updated };
  },
});
export const migrateExistingRowsToTest = action({
  args: { adminKey: v.string() }, returns: v.object({ aiCallsUpdated: v.number(), funnelEventsUpdated: v.number() }),
  handler: async (ctx, { adminKey }) => {
    assertDev();
    requireAdmin(adminKey);
    const aiBatch = makeFunctionReference<"mutation">("planUnlocks:migrateAiTestFlagsBatch");
    const funnelBatch = makeFunctionReference<"mutation">("planUnlocks:migrateFunnelTestFlagsBatch");
    async function runBatches(ref: typeof aiBatch) {
      let cursor: string | null = null;
      let updated = 0;
      let done = false;
      while (!done) {
        const result: { done: boolean; cursor: string | null; updated: number } = await ctx.runMutation(ref, { paginationOpts: { numItems: 100, cursor } });
        updated += result.updated;
        cursor = result.cursor;
        done = result.done;
      }
      return updated;
    }
    const [aiCallsUpdated, funnelEventsUpdated] = await Promise.all([runBatches(aiBatch), runBatches(funnelBatch)]);
    return { aiCallsUpdated, funnelEventsUpdated };
  },
});

export const price = query({
  args: {}, returns: v.number(),
  handler: ctx => readPrice(ctx),
});
export const lockedMessage = query({ args: {}, returns: v.string(), handler: ctx => readLockedMessage(ctx) });
export const paymentMode = query({ args: {}, returns: v.union(v.literal("free_preview"), v.literal("paid")), handler: ctx => readPaymentMode(ctx) });

export const savePaymentMode = mutation({
  args: { adminKey: v.string(), value: v.union(v.literal("free_preview"), v.literal("paid")) }, returns: v.null(),
  handler: async (ctx, { adminKey, value }) => {
    requireAdmin(adminKey);
    const row = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", paymentModeKey)).unique();
    if (row) await ctx.db.patch(row._id, { value, updatedAt: Date.now() });
    else await ctx.db.insert("appSettings", { key: paymentModeKey, value, updatedAt: Date.now() });
    return null;
  },
});

export const savePrice = mutation({
  args: { adminKey: v.string(), value: v.number() }, returns: v.null(),
  handler: async (ctx, { adminKey, value }) => {
    requireAdmin(adminKey);
    if (!Number.isInteger(value) || value < 1 || value > 9999) throw new ConvexError("Enter a whole-rupee price from \u20B91 to \u20B99,999.");
    const row = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", priceKey)).unique();
    if (row) await ctx.db.patch(row._id, { value, updatedAt: Date.now() });
    else await ctx.db.insert("appSettings", { key: priceKey, value, updatedAt: Date.now() });
    return null;
  },
});

export const saveLockedMessage = mutation({
  args: { adminKey: v.string(), value: v.string() }, returns: v.null(),
  handler: async (ctx, { adminKey, value }) => {
    requireAdmin(adminKey);
    const message = value.trim();
    if (message.length > 500) throw new ConvexError("Keep the locked card message under 500 characters.");
    const row = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", messageKey)).unique();
    if (row) await ctx.db.patch(row._id, { value: message, updatedAt: Date.now() });
    else await ctx.db.insert("appSettings", { key: messageKey, value: message, updatedAt: Date.now() });
    return null;
  },
});

export const initializeProductionDefaults = mutation({
  args: { adminKey: v.string() }, returns: v.null(),
  handler: async (ctx, { adminKey }) => {
    if (process.env.CONVEX_CLOUD_URL !== "https://nautical-chicken-192.convex.cloud")
      throw new ConvexError("Default production settings can only be initialized on nautical-chicken-192.");
    const expected = process.env.ADMIN_COSTS_KEY;
    if (!expected || adminKey.length < 32 || adminKey !== expected) throw new ConvexError("Admin access required.");
    for (const [key, value] of [[priceKey, DEFAULT_PLAN_PRICE], [paymentModeKey, DEFAULT_PAYMENT_MODE]] as const) {
      const row = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", key)).unique();
      if (row) await ctx.db.patch(row._id, { value, updatedAt: Date.now() });
      else await ctx.db.insert("appSettings", { key, value, updatedAt: Date.now() });
    }
    return null;
  },
});

export const logAnalytics = mutation({
  args: { event: v.union(v.literal("landing-view"), v.literal("example-viewed"), v.literal("gender-picked"), v.literal("career-search"), v.literal("career-opened"), v.literal("day-viewed"), v.literal("plan-preview-viewed"), v.literal("full-plan-shown")), tracking: v.optional(v.any()), career: v.optional(v.string()), gender: v.optional(v.union(gender, v.literal("unspecified"))), entryPath: v.optional(v.union(v.literal("Example"), v.literal("Search"), v.literal("Unknown"))) },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSupportedDeployment();
    const tracking = readTracking(args.tracking);
    const visitorId = trackingString(tracking.visitorId);
    const isTest = trackingBoolean(tracking.isTest);
    if (!visitorId || visitorId.length > 100) throw new ConvexError("Visitor id is invalid.");
    if (args.career && (args.career.trim().length === 0 || args.career.length > 120)) throw new ConvexError("Career name is invalid.");
    await writeAnalytics(ctx, args.event, { visitorId, isTest, ref: trackingString(tracking.ref), referrerDomain: trackingString(tracking.referrerDomain), age: [13, 14, 15, 16].includes(tracking.age as number) ? tracking.age as 13 | 14 | 15 | 16 : undefined, career: args.career?.trim(), gender: args.gender, entryPath: args.entryPath, device: tracking.device === "mobile" || tracking.device === "desktop" ? tracking.device : undefined });
    return null;
  },
});

export const beginCheckout = mutation({
  args: { career: v.string(), gender, tracking: v.optional(v.any()), entryPath: v.optional(v.union(v.literal("Example"), v.literal("Search"), v.literal("Unknown"))) }, returns: v.object({ token: v.string(), amount: v.number() }),
  handler: async (ctx, { career, gender: childGender, tracking: rawTracking, entryPath }) => {
    const tracking = readTracking(rawTracking);
    const visitorId = trackingString(tracking.visitorId), isTest = trackingBoolean(tracking.isTest), ref = trackingString(tracking.ref), referrerDomain = trackingString(tracking.referrerDomain);
    const device = tracking.device === "mobile" || tracking.device === "desktop" ? tracking.device : undefined;
    assertSupportedDeployment();
    const title = career.trim();
    if (!title || title.length > 120) throw new ConvexError("Career name is invalid.");
    const amount = await readPrice(ctx);
    const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
    const createdAt = Date.now();
    await ctx.db.insert("planUnlockQuotes", { token, title, gender: childGender, amount, createdAt, ...(visitorId ? { visitorId } : {}), ...(ref ? { ref } : {}), ...(referrerDomain ? { referrerDomain } : {}), ...(device ? { device } : {}), isTest: isTest ?? true });
    await ctx.db.insert("planUnlockEvents", { event: "pay-tap", career: title, gender: childGender, amount, createdAt, ...(visitorId ? { visitorId } : {}), isTest: isTest ?? true });
    await writeAnalytics(ctx, "pay-tap", { visitorId, isTest, ref, referrerDomain, career: title, gender: childGender, amount, entryPath, device }, createdAt);
    return { token, amount };
  },
});

export const recordFreePreviewTap = mutation({
  args: { career: v.string(), gender, tracking: v.optional(v.any()), entryPath: v.optional(v.union(v.literal("Example"), v.literal("Search"), v.literal("Unknown"))) }, returns: v.null(),
  handler: async (ctx, { career, gender: childGender, tracking: rawTracking, entryPath }) => {
    const tracking = readTracking(rawTracking);
    const visitorId = trackingString(tracking.visitorId), isTest = trackingBoolean(tracking.isTest), ref = trackingString(tracking.ref), referrerDomain = trackingString(tracking.referrerDomain);
    const device = tracking.device === "mobile" || tracking.device === "desktop" ? tracking.device : undefined;
    if (await readPaymentMode(ctx) !== "free_preview") throw new ConvexError("Free preview is not enabled.");
    const title = career.trim();
    if (!title || title.length > 120) throw new ConvexError("Career name is invalid.");
    const createdAt = Date.now();
    const testVisitor = isTest ?? true;
    await ctx.db.insert("planUnlockEvents", { event: "pay-tap", career: title, gender: childGender, createdAt, ...(visitorId ? { visitorId } : {}), isTest: testVisitor });
    await writeAnalytics(ctx, "pay-tap", { visitorId, isTest: testVisitor, ref, referrerDomain, career: title, gender: childGender, entryPath, device }, createdAt);
    return null;
  },
});

export const quote = query({
  args: { token: v.string() }, returns: v.union(v.null(), v.object({ career: v.string(), gender, amount: v.number(), createdAt: v.number() })),
  handler: async (ctx, { token }) => {
    assertSupportedDeployment();
    const row = await ctx.db.query("planUnlockQuotes").withIndex("by_token", q => q.eq("token", token)).unique();
    return row ? { career: row.title, gender: row.gender, amount: row.amount, createdAt: row.createdAt } : null;
  },
});

export const createRequest = mutation({
  args: { quoteToken: v.string(), parentName: v.string(), mobile: v.string(), tracking: v.optional(v.any()) },
  returns: v.object({ token: v.string(), status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")), createdAt: v.number() }),
  handler: async (ctx, { quoteToken, parentName, mobile, tracking: rawTracking }) => {
    const tracking = readTracking(rawTracking);
    const visitorId = trackingString(tracking.visitorId), isTest = trackingBoolean(tracking.isTest);
    assertSupportedDeployment();
    const quoteRow = await ctx.db.query("planUnlockQuotes").withIndex("by_token", q => q.eq("token", quoteToken)).unique();
    if (!quoteRow) throw new ConvexError("This payment screen has expired. Open Pay to unlock again.");
    if (quoteRow.visitorId && visitorId && quoteRow.visitorId !== visitorId) throw new ConvexError("This payment belongs to a different visitor.");
    if (quoteRow.usedRequestId) {
      const existing = await ctx.db.get(quoteRow.usedRequestId);
      if (existing) return { token: existing.token, status: existing.status, createdAt: existing.createdAt };
    }
    const name = parentName.trim().replace(/\s+/g, " ");
    const phone = mobile.trim();
    if (name.length < 2 || name.length > 80) throw new ConvexError("Enter a parent name between 2 and 80 characters.");
    if (phone.replace(/\D/g, "").length < 10 || phone.replace(/\D/g, "").length > 15 || !/^[\d+ ()-]+$/.test(phone)) throw new ConvexError("Enter a valid mobile number.");
    const createdAt = Date.now();
    const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
    const linkedVisitor = quoteRow.visitorId ?? visitorId ?? "unknown";
    const testVisitor = quoteRow.isTest ?? isTest ?? true;
    const requestId = await ctx.db.insert("planUnlockRequests", { token, quoteToken, parentName: name, mobile: phone, gender: quoteRow.gender, career: quoteRow.title, amount: quoteRow.amount, visitorId: linkedVisitor, ...(quoteRow.ref ? { ref: quoteRow.ref } : {}), ...(quoteRow.referrerDomain ? { referrerDomain: quoteRow.referrerDomain } : {}), ...(quoteRow.device ? { device: quoteRow.device } : {}), isTest: testVisitor, createdAt, status: "pending" });
    await ctx.db.patch(quoteRow._id, { usedRequestId: requestId });
    await ctx.db.insert("planUnlockEvents", { event: "payment-submitted", career: quoteRow.title, gender: quoteRow.gender, amount: quoteRow.amount, visitorId: linkedVisitor, isTest: testVisitor, requestId, createdAt });
    await writeAnalytics(ctx, "payment-submitted", { visitorId: linkedVisitor, isTest: testVisitor, ref: quoteRow.ref, referrerDomain: quoteRow.referrerDomain, device: quoteRow.device, career: quoteRow.title, gender: quoteRow.gender, amount: quoteRow.amount }, createdAt);
    return { token, status: "pending" as const, createdAt };
  },
});

export const requestStatus = query({
  args: { token: v.string() }, returns: v.union(v.null(), v.object({ career: v.string(), gender, amount: v.number(), createdAt: v.number(), status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")) })),
  handler: async (ctx, { token }) => {
    assertSupportedDeployment();
    const row = await ctx.db.query("planUnlockRequests").withIndex("by_token", q => q.eq("token", token)).unique();
    return row ? { career: row.career, gender: row.gender, amount: row.amount, createdAt: row.createdAt, status: row.status } : null;
  },
});

export const logEvent = mutation({
  args: { event: v.union(v.literal("locked-card-view"), v.literal("download"), v.literal("share")), career: v.string(), gender, requestToken: v.optional(v.string()), tracking: v.optional(v.any()), entryPath: v.optional(v.union(v.literal("Example"), v.literal("Search"), v.literal("Unknown"))) },
  returns: v.null(),
  handler: async (ctx, { event, career, gender: childGender, requestToken, tracking: rawTracking, entryPath }) => {
    const tracking = readTracking(rawTracking);
    const visitorId = trackingString(tracking.visitorId), isTest = trackingBoolean(tracking.isTest), ref = trackingString(tracking.ref), referrerDomain = trackingString(tracking.referrerDomain);
    const device = tracking.device === "mobile" || tracking.device === "desktop" ? tracking.device : undefined;
    assertSupportedDeployment();
    const title = career.trim();
    if (!title || title.length > 120) throw new ConvexError("Career name is invalid.");
    let requestId;
    if (requestToken) {
      const request = await ctx.db.query("planUnlockRequests").withIndex("by_token", q => q.eq("token", requestToken)).unique();
      if (!request || request.career !== title || request.gender !== childGender || (event !== "locked-card-view" && request.status !== "approved")) throw new ConvexError("This plan is not unlocked for this link.");
      requestId = request._id;
    } else if (event !== "locked-card-view" && await readPaymentMode(ctx) !== "free_preview") {
      throw new ConvexError("This plan is not unlocked for this link.");
    }
    const createdAt = Date.now();
    const testVisitor = isTest ?? true;
    await ctx.db.insert("planUnlockEvents", { event, career: title, gender: childGender, ...(visitorId ? { visitorId } : {}), isTest: testVisitor, ...(requestId ? { requestId } : {}), createdAt });
    await writeAnalytics(ctx, event === "locked-card-view" ? event : event === "download" ? "pdf-download" : "whatsapp-share", { visitorId, isTest: testVisitor, ref, referrerDomain, career: title, gender: childGender, entryPath, device }, createdAt);
    return null;
  },
});

export const adminData = query({
  args: { adminKey: v.string(), includeTest: v.optional(v.boolean()) }, returns: v.any(),
  handler: async (ctx, { adminKey, includeTest = false }) => {
    requireAdmin(adminKey);
    const setting = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", priceKey)).unique();
    const message = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", messageKey)).unique();
    const pending = (await ctx.db.query("planUnlockRequests").withIndex("by_status", q => q.eq("status", "pending")).order("desc").take(200)).filter(row => includeTest || row.isTest === false);
    const events = (await ctx.db.query("planUnlockEvents").withIndex("by_createdAt").order("desc").take(500)).filter(row => includeTest || row.isTest === false);
    const modeSetting = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", paymentModeKey)).unique();
    const safetyCount = await ctx.db.query("appSettings").withIndex("by_key", q => q.eq("key", "ai-safety-block-count")).unique();
    const [mappings, earningsErrors] = await Promise.all([ctx.db.query("sceneMappings").take(200), ctx.db.query("careerEarningsErrors").withIndex("by_timestamp").order("desc").take(500)]);
    const mappingByTitle = new Map(mappings.map(row => [row.title, row]));
    const errorByTitle = new Map<string, string>();
    for (const row of earningsErrors) if (!errorByTitle.has(row.title)) errorByTitle.set(row.title, row.error);
    const missing2030sEarnings = CAREER_TITLES.flatMap(title => {
      const row = mappingByTitle.get(title);
      if (typeof row?.earnings2030sLow === "number" && typeof row.earnings2030sHigh === "number" && row.earnings2030sBasis) return [];
      return [{ title, reason: errorByTitle.get(title) ?? "No 2030s earnings range has been saved yet." }];
    });
    return { price: typeof setting?.value === "number" ? setting.value : DEFAULT_PLAN_PRICE, lockedMessage: typeof message?.value === "string" ? message.value : "", paymentMode: modeSetting?.value === "paid" ? "paid" : DEFAULT_PAYMENT_MODE, pending, events, missing2030sEarnings, aiSafetyBlockCount: typeof safetyCount?.value === "number" ? safetyCount.value : 0 };
  },
});

export const aiSafetyEventRows = query({
  args: { adminKey: v.string(), start: v.number() }, returns: v.any(),
  handler: async (ctx, { adminKey, start }) => {
    requireAdmin(adminKey);
    return await ctx.db.query("aiSafetyEvents").withIndex("by_timestamp", q => q.gte("timestamp", start)).order("asc").take(200);
  },
});

export const reviewRequest = mutation({
  args: { adminKey: v.string(), requestId: v.id("planUnlockRequests"), decision: v.union(v.literal("approved"), v.literal("rejected")) }, returns: v.null(),
  handler: async (ctx, { adminKey, requestId, decision }) => {
    requireAdmin(adminKey);
    const row = await ctx.db.get(requestId);
    if (!row) throw new ConvexError("Payment request not found.");
    if (row.status !== "pending") throw new ConvexError("This payment request has already been reviewed.");
    const createdAt = Date.now();
    await ctx.db.patch(requestId, { status: decision, statusAt: createdAt });
    await ctx.db.insert("planUnlockEvents", { event: decision, career: row.career, gender: row.gender, amount: row.amount, ...(row.visitorId ? { visitorId: row.visitorId } : {}), isTest: row.isTest ?? true, requestId, createdAt });
    await writeAnalytics(ctx, decision, { visitorId: row.visitorId, isTest: row.isTest ?? true, ref: row.ref, referrerDomain: row.referrerDomain, device: row.device, career: row.career, gender: row.gender, amount: row.amount }, createdAt);
    return null;
  },
});

type FunnelEventRow = { event: AnalyticsEvent; visitorId: string; isTest: boolean; createdAt: number; career?: string; gender?: "girl" | "boy" | "unspecified"; amount?: number; paymentMode?: "free_preview" | "paid"; device?: "mobile" | "desktop"; entryPath?: "Example" | "Search" | "Unknown"; ref?: string; referrerDomain?: string };
const legacyEventName = (event: string): AnalyticsEvent => event === "download" ? "pdf-download" : event === "share" ? "whatsapp-share" : event as AnalyticsEvent;
export const analytics = query({
  args: { adminKey: v.string(), start: v.number(), end: v.number(), includeTest: v.boolean() }, returns: v.any(),
  handler: async (ctx, { adminKey, start, end, includeTest }) => {
    requireAdmin(adminKey);
    const [storedEvents, legacyEvents, aiRows] = await Promise.all([
      ctx.db.query("analyticsEvents").withIndex("by_createdAt", q => q.gte("createdAt", start).lte("createdAt", end)).take(5000),
      ctx.db.query("planUnlockEvents").withIndex("by_createdAt", q => q.gte("createdAt", start).lte("createdAt", end)).take(5000),
      ctx.db.query("aiCalls").withIndex("by_timestamp", q => q.gte("timestamp", start).lte("timestamp", end)).take(5000),
    ]);
    const events: FunnelEventRow[] = storedEvents.map(row => ({ event: row.event, visitorId: row.visitorId, isTest: row.isTest ?? true, createdAt: row.createdAt, career: row.career, gender: row.gender, amount: row.amount }));
    const known = new Set(events.map(row => `${row.event}|${row.visitorId}|${row.createdAt}|${row.career ?? ""}`));
    for (const row of legacyEvents) {
      const event = legacyEventName(row.event), visitorId = row.visitorId ?? "unknown";
      const key = `${event}|${visitorId}|${row.createdAt}|${row.career}`;
      if (!known.has(key)) events.push({ event, visitorId, isTest: row.isTest ?? true, createdAt: row.createdAt, career: row.career, gender: row.gender, amount: row.amount });
    }
    const filteredEvents = events.filter(row => includeTest || !row.isTest);
    const filteredAi = aiRows.filter(row => includeTest || row.isTest === false);
    const byVisitor = new Map<string, { visitorId: string; firstSeen: number; careers: Set<string>; events: typeof filteredEvents; aiCalls: number; aiCost: number }>();
    const visitor = (id: string, at: number) => {
      let value = byVisitor.get(id);
      if (!value) { value = { visitorId: id, firstSeen: at, careers: new Set(), events: [], aiCalls: 0, aiCost: 0 }; byVisitor.set(id, value); }
      value.firstSeen = Math.min(value.firstSeen, at); return value;
    };
    for (const row of filteredEvents) { const value = visitor(row.visitorId, row.createdAt); value.events.push(row); if (row.event === "career-opened" && row.career) value.careers.add(row.career); }
    for (const row of filteredAi) { const value = visitor(row.visitorId ?? "unknown", row.timestamp); value.aiCalls++; value.aiCost += row.costINR ?? 0; }
    const entryByVisitor = new Map<string, "Example" | "Search" | "Unknown">();
    for (const row of filteredEvents) if (row.event === "example-viewed") entryByVisitor.set(row.visitorId, "Example"); else if (row.event === "career-search" && !entryByVisitor.has(row.visitorId)) entryByVisitor.set(row.visitorId, "Search");
    const math = buildFunnelMath(filteredEvents.map(row => ({ event: row.event, visitorId: row.visitorId, createdAt: row.createdAt, career: row.career, device: row.device, paymentMode: row.paymentMode, entryPath: row.entryPath && row.entryPath !== "Unknown" ? row.entryPath : entryByVisitor.get(row.visitorId) ?? "Unknown" })));
    const mathVisitors = new Map(math.visitors.map(row => [row.visitorId, row]));
    const visitors = [...byVisitor.values()].map(value => {
      const funnelVisitor = mathVisitors.get(value.visitorId);
      return { visitorId: value.visitorId, firstSeen: value.firstSeen, careersOpened: [...value.careers], furthestStep: funnelVisitor?.furthestStep ?? "No funnel step", entryPath: funnelVisitor?.entryPath ?? "Unknown", device: funnelVisitor?.device ?? "Unknown", paid: value.events.some(row => row.event === "payment-submitted" || row.event === "approved"), aiCalls: value.aiCalls, aiCost: value.aiCost, timeline: [...value.events].sort((a, b) => a.createdAt - b.createdAt) };
    }).sort((a, b) => b.firstSeen - a.firstSeen);
    const funnel = math.funnels.combined;
    const careers = new Map<string, number>();
    for (const row of filteredEvents) if (row.event === "career-opened" && row.career) careers.set(row.career, (careers.get(row.career) ?? 0) + 1);
    const topCareers = [...careers].map(([career, opens]) => ({ career, opens })).sort((a, b) => b.opens - a.opens).slice(0, 50);
    const paymentTaps = new Map<string, number>();
    for (const row of filteredEvents) if (row.event === "pay-tap" && row.career) paymentTaps.set(row.career, (paymentTaps.get(row.career) ?? 0) + 1);
    const paymentTapsByCareer = [...paymentTaps].map(([career, taps]) => ({ career, taps })).sort((a, b) => b.taps - a.taps);
    const aiCost = filteredAi.reduce((sum, row) => sum + (row.costINR ?? 0), 0);
    const payers = new Set(filteredEvents.filter(row => row.event === "payment-submitted" || row.event === "approved").map(row => row.visitorId));
    const revenue = filteredEvents.filter(row => row.event === "approved").reduce((sum, row) => sum + (row.amount ?? 0), 0);
    return { funnel, funnels: math.funnels, stopped: math.stopped, visitors, topCareers, paymentTapsByCareer, totals: { visitors: visitors.length, aiCalls: filteredAi.length, aiCost, averagePerVisitor: visitors.length ? aiCost / visitors.length : 0, averagePerPayingParent: payers.size ? aiCost / payers.size : 0, payingParents: payers.size, revenue }, truncated: storedEvents.length === 5000 || legacyEvents.length === 5000 || aiRows.length === 5000 };
  },
});

export const analyticsFunnel = query({
  args: { adminKey: v.string(), start: v.number(), end: v.number(), includeTest: v.boolean(), career: v.optional(v.string()), device: v.optional(v.union(v.literal("mobile"), v.literal("desktop"))), ref: v.optional(v.string()) }, returns: v.any(),
  handler: async (ctx, { adminKey, start, end, includeTest, career, device, ref }) => {
    requireAdmin(adminKey);
    const [stored, oldRows, aiRows] = await Promise.all([
      ctx.db.query("analyticsEvents").withIndex("by_createdAt", q => q.gte("createdAt", start).lte("createdAt", end)).take(5000),
      ctx.db.query("planUnlockEvents").withIndex("by_createdAt", q => q.gte("createdAt", start).lte("createdAt", end)).take(5000),
      ctx.db.query("aiCalls").withIndex("by_timestamp", q => q.gte("timestamp", start).lte("timestamp", end)).take(5000),
    ]);
    const rows: FunnelEventRow[] = stored.filter(row => includeTest || !row.isTest).map(row => ({ event: row.event, visitorId: row.visitorId, isTest: row.isTest ?? true, createdAt: row.createdAt, career: row.career, gender: row.gender, amount: row.amount, paymentMode: row.paymentMode, device: row.device, entryPath: row.entryPath, ref: row.ref, referrerDomain: row.referrerDomain }));
    const canonicalKeys = new Set(rows.map(row => row.visitorId + "|" + row.event + "|" + (row.career ?? "")));
    for (const row of oldRows) {
      const event = row.event === "download" ? "pdf-download" : row.event === "share" ? "whatsapp-share" : row.event;
      const visitorId = row.visitorId ?? "unknown", key = visitorId + "|" + event + "|" + row.career;
      if ((includeTest || row.isTest === false) && !canonicalKeys.has(key)) rows.push({ event, visitorId, createdAt: row.createdAt, career: row.career, gender: row.gender, amount: row.amount, isTest: row.isTest ?? true });
    }
    const untaggedCount = rows.filter(row => row.visitorId === "unknown").length;
    const entryByVisitor = new Map<string, "Example" | "Search" | "Unknown">();
    for (const row of rows) if (row.event === "example-viewed") entryByVisitor.set(row.visitorId, "Example"); else if (row.event === "career-search" && !entryByVisitor.has(row.visitorId)) entryByVisitor.set(row.visitorId, "Search");
    const eligibleVisitors = new Set(rows.filter(row => row.visitorId !== "unknown" && (!career || row.career === career) && (!device || row.device === device) && (!ref || row.ref === ref)).map(row => row.visitorId));
    const filtered = rows.filter(row => eligibleVisitors.has(row.visitorId));
    const mathEvents = filtered.map(row => ({ event: row.event, visitorId: row.visitorId, createdAt: row.createdAt, career: row.career, device: row.device, paymentMode: row.paymentMode, entryPath: row.entryPath && row.entryPath !== "Unknown" ? row.entryPath : entryByVisitor.get(row.visitorId) ?? "Unknown" }));
    const math = buildFunnelMath(mathEvents);
    const summaryMath = buildFunnelMath(filtered.filter(row => row.visitorId !== "unknown").map(row => ({ event: row.event, visitorId: row.visitorId, createdAt: row.createdAt, career: row.career, device: row.device, paymentMode: row.paymentMode, entryPath: row.entryPath && row.entryPath !== "Unknown" ? row.entryPath : entryByVisitor.get(row.visitorId) ?? "Unknown" })));
    const visitorSummaries = summaryMath.visitors.map(person => {
      const history = filtered.filter(row => row.visitorId === person.visitorId).sort((a, b) => a.createdAt - b.createdAt);
      const last = history[history.length - 1];
      return { visitorId: person.visitorId, ref: history.find(row => row.ref)?.ref ?? "—", firstSeen: history[0]?.createdAt ?? 0, lastSeen: last?.createdAt ?? 0, device: [...history].reverse().find(row => row.device)?.device ?? "Unknown", furthestStep: person.furthestStep, paid: history.some(row => row.event === "payment-submitted" || row.event === "approved") };
    }).sort((a, b) => b.lastSeen - a.lastSeen);
    const ids = new Set(math.visitors.map(row => row.visitorId));
    const visitorRows = math.visitors.map(person => {
      const history = filtered.filter(row => row.visitorId === person.visitorId).sort((a, b) => a.createdAt - b.createdAt);
      const opens = [...new Set(history.filter(row => row.event === "career-opened" && row.career).map(row => row.career!))];
      return { ...person, firstSeen: history.length ? Math.min(...history.map(row => row.createdAt)) : 0, careersOpened: opens, paid: history.some(row => row.event === "payment-submitted" || row.event === "approved"), aiCalls: 0, aiCost: 0, timeline: history };
    });
    const aiFiltered = aiRows.filter(row => (includeTest || row.isTest === false) && (!career || row.careerTitle === career) && eligibleVisitors.has(row.visitorId ?? "unknown"));
    for (const visitor of visitorRows) { const matches = aiFiltered.filter(row => row.visitorId === visitor.visitorId); visitor.aiCalls = matches.length; visitor.aiCost = matches.reduce((sum, row) => sum + (row.costINR ?? 0), 0); }
    const distinct = (event: string) => new Set(filtered.filter(row => row.event === event && row.visitorId !== "unknown").map(row => row.visitorId));
    const careerMap = new Map<string, Set<string>>(), tapsMap = new Map<string, Set<string>>();
    for (const row of filtered) {
      if (row.event === "career-opened" && row.career) { const set = careerMap.get(row.career) ?? new Set<string>(); set.add(row.visitorId); careerMap.set(row.career, set); }
      if (row.event === "pay-tap" && row.career) { const set = tapsMap.get(row.career) ?? new Set<string>(); set.add(row.visitorId); tapsMap.set(row.career, set); }
    }
    const careers = [...new Set(filtered.map(row => row.career).filter((value): value is string => Boolean(value)))].sort();
    const aiCost = aiFiltered.reduce((sum, row) => sum + (row.costINR ?? 0), 0), payers = new Set(filtered.filter(row => row.event === "payment-submitted" || row.event === "approved").map(row => row.visitorId));
    const revenue = filtered.filter(row => row.event === "approved").reduce((sum, row) => sum + (row.amount ?? 0), 0);
    return { ...math, funnel: math.funnels.combined, visitors: visitorRows.sort((a, b) => b.firstSeen - a.firstSeen), visitorSummaries, untaggedCount, topCareers: [...careerMap].map(([careerName, set]) => ({ career: careerName, opens: set.size })).sort((a, b) => b.opens - a.opens), paymentTapsByCareer: [...tapsMap].map(([careerName, set]) => ({ career: careerName, taps: set.size })).sort((a, b) => b.taps - a.taps), careers, refs: [...new Set(rows.map(row => row.ref).filter((value): value is string => Boolean(value)))].sort(), totals: { visitors: summaryMath.visitors.length, aiCalls: aiFiltered.length, aiCost, averagePerVisitor: summaryMath.visitors.length ? aiCost / summaryMath.visitors.length : 0, averagePerPayingParent: payers.size ? aiCost / payers.size : 0, payingParents: payers.size, revenue }, truncated: stored.length === 5000 || oldRows.length === 5000 || aiRows.length === 5000 };
  },
});

const analyticsFixtureBatch = "analytics-funnel-demo-v1";
export const seedAnalyticsFixtures = mutation({
  args: {}, returns: v.object({ visitors: v.number(), events: v.number(), seedBatch: v.string() }),
  handler: async ctx => {
    assertDev();
    const existing = await ctx.db.query("analyticsEvents").withIndex("by_seedBatch", q => q.eq("seedBatch", analyticsFixtureBatch)).take(1000);
    if (existing.length) return { visitors: new Set(existing.map(row => row.visitorId)).size, events: existing.length, seedBatch: analyticsFixtureBatch };
    const now = Date.now(), mode = await readPaymentMode(ctx);
    const paths: { id: string; path: "Example" | "Search"; device: "mobile" | "desktop"; career: string; sequence: string[]; age: number }[] = [
      { id: "example-complete", path: "Example", device: "mobile", career: "Economist", sequence: ["landing-view", "example-viewed", "career-opened", "day-viewed", "plan-preview-viewed", "locked-card-view", "pay-tap", "full-plan-shown", "pdf-download", "whatsapp-share"], age: 1 },
      { id: "example-lock", path: "Example", device: "desktop", career: "Author", sequence: ["landing-view", "example-viewed", "career-opened", "day-viewed", "plan-preview-viewed", "locked-card-view"], age: 2 },
      { id: "example-day", path: "Example", device: "mobile", career: "Food Critic", sequence: ["landing-view", "example-viewed", "career-opened", "day-viewed"], age: 3 },
      { id: "search-start", path: "Search", device: "mobile", career: "Economist", sequence: ["landing-view", "career-search"], age: 4 },
      { id: "search-career", path: "Search", device: "desktop", career: "Author", sequence: ["landing-view", "career-search", "career-opened"], age: 5 },
      { id: "search-plan", path: "Search", device: "desktop", career: "Food Critic", sequence: ["landing-view", "career-search", "career-opened", "day-viewed", "plan-preview-viewed", "locked-card-view", "pay-tap", "full-plan-shown", "pdf-download"], age: 6 },
    ];
    let eventCount = 0;
    for (const fixture of paths) {
      const visitorId = "seed-funnel-" + fixture.id;
      for (let index = 0; index < fixture.sequence.length; index++) {
        const event = fixture.sequence[index] as AnalyticsEvent, createdAt = now - fixture.age * 86400000 + index * 60000;
        await writeAnalytics(ctx, event, { visitorId, isTest: true, career: index > 1 ? fixture.career : undefined, entryPath: fixture.path, device: fixture.device, paymentMode: mode, seedBatch: analyticsFixtureBatch }, createdAt);
        eventCount++;
      }
    }
    return { visitors: paths.length, events: eventCount, seedBatch: analyticsFixtureBatch };
  },
});
export const removeAnalyticsFixtures = mutation({
  args: {}, returns: v.object({ deleted: v.number() }),
  handler: async ctx => {
    assertDev();
    const rows = await ctx.db.query("analyticsEvents").withIndex("by_seedBatch", q => q.eq("seedBatch", analyticsFixtureBatch)).take(1000);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length };
  },
});
