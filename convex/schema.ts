import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { genderValidator } from "./gender";
import { failureDetailValidator } from "./storyboardErrors";
const careerPlanProjectValidator = v.object({
  month: v.number(), title: v.string(), skillIndex: v.number(), panelIndex: v.number(),
  build: v.optional(v.string()), projectDetails: v.optional(v.string()), targetSkill: v.optional(v.string()),
  successCriteria: v.optional(v.array(v.string())), timeNeeded: v.optional(v.string()),
  thumbnailThemeId: v.optional(v.string()),
});
const careerPlanValidator = v.object({ subtitle: v.string(), skills: v.array(v.string()), coreSkills: v.optional(v.array(v.string())), projects: v.array(careerPlanProjectValidator) });
export default defineSchema({
  faqs: defineTable({
    page: v.union(v.literal("landing"), v.literal("results")),
    question: v.string(), answer: v.string(), displayOrder: v.number(),
  }).index("by_page_order", ["page", "displayOrder"]),
  planThumbnailImages: defineTable({ key: v.string(), themeId: v.string(), token: v.string(), status: v.string(), storageId: v.optional(v.id("_storage")), compressedStorageId: v.optional(v.id("_storage")), compressedDigest: v.optional(v.string()), error: v.optional(v.union(v.string(), v.null())) }).index("by_key", ["key"]),
  planThumbnailLocks: defineTable({ key: v.string(), token: v.union(v.string(), v.null()) }).index("by_key", ["key"]),
  planThumbnailTags: defineTable({ key: v.string(), title: v.string(), token: v.string(), status: v.string(), lease: v.number(), tags: v.optional(v.array(v.object({ month: v.number(), themeId: v.string() }))), error: v.optional(v.union(v.string(), v.null())) }).index("by_key", ["key"]),
  sceneReferences: defineTable({ key: v.string(), storageId: v.id("_storage"), digest: v.optional(v.string()) }).index("by_key", ["key"]),
  sceneImages: defineTable({ key: v.string(), sceneId: v.string(), gender: v.union(v.literal("girl"), v.literal("boy")), token: v.string(), status: v.string(), storageId: v.optional(v.id("_storage")), compressedStorageId: v.optional(v.id("_storage")), compressedDigest: v.optional(v.string()), error: v.optional(v.union(v.string(), v.null())) }).index("by_key", ["key"]),
  sceneMappings: defineTable({ key: v.string(), title: v.string(), token: v.string(), status: v.string(), lease: v.number(), panels: v.optional(v.array(v.object({ time: v.string(), caption: v.string(), sceneId: v.string() }))), heroSceneId: v.optional(v.string()), role2030s: v.optional(v.string()), roleShort2030s: v.optional(v.string()), roleSafetyChecked: v.optional(v.boolean()), dayMoments2030s: v.optional(v.array(v.object({ time: v.string(), skill: v.string(), why: v.string() }))), salaryMinINR: v.optional(v.number()), salaryMaxINR: v.optional(v.number()), salaryBasis: v.optional(v.string()), baselineSource: v.optional(v.union(v.literal("stored"), v.literal("ai-estimated"))), earnings2030sLow: v.optional(v.number()), earnings2030sHigh: v.optional(v.number()), earnings2030sBasis: v.optional(v.string()), error: v.optional(v.union(v.string(), v.null())) }).index("by_key", ["key"]),
  role2030sGenerationBudget: defineTable({ key: v.string(), calls: v.number() }).index("by_key", ["key"]),
  careerEarningsErrors: defineTable({ title: v.string(), error: v.string(), timestamp: v.number() }).index("by_timestamp", ["timestamp"]),
  aiSafetyEvents: defineTable({ timestamp: v.number(), rule: v.string(), field: v.string() }).index("by_timestamp", ["timestamp"]),
  sceneLibraryLocks: defineTable({ key: v.string(), token: v.union(v.string(), v.null()) }).index("by_key", ["key"]),
  photoTests: defineTable({ key: v.string(), status: v.string(), storageId: v.optional(v.id("_storage")), error: v.optional(v.string()) }).index("by_key", ["key"]),
  careerPlans: defineTable({
    key: v.string(), title: v.string(), status: v.string(), token: v.string(), lease: v.number(), safetyChecked: v.optional(v.boolean()),
    plan: v.optional(careerPlanValidator), error: v.optional(v.union(v.string(), v.null())),
  }).index("by_key", ["key"]).index("by_status", ["status"]),
  appSettings: defineTable({ key: v.string(), value: v.union(v.number(), v.string()), updatedAt: v.number() }).index("by_key", ["key"]),
  planUnlockQuotes: defineTable({ token: v.string(), title: v.string(), gender: v.union(v.literal("girl"), v.literal("boy")), amount: v.number(), createdAt: v.number(), visitorId: v.optional(v.string()), ref: v.optional(v.string()), referrerDomain: v.optional(v.string()), device: v.optional(v.union(v.literal("mobile"), v.literal("desktop"))), isTest: v.optional(v.boolean()), usedRequestId: v.optional(v.id("planUnlockRequests")) }).index("by_token", ["token"]),
  planUnlockRequests: defineTable({ token: v.string(), quoteToken: v.string(), parentName: v.string(), mobile: v.string(), gender: v.union(v.literal("girl"), v.literal("boy")), career: v.string(), amount: v.number(), visitorId: v.optional(v.string()), ref: v.optional(v.string()), referrerDomain: v.optional(v.string()), device: v.optional(v.union(v.literal("mobile"), v.literal("desktop"))), isTest: v.optional(v.boolean()), createdAt: v.number(), status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")), statusAt: v.optional(v.number()) }).index("by_token", ["token"]).index("by_status", ["status"]),
  planUnlockEvents: defineTable({ event: v.union(v.literal("locked-card-view"), v.literal("pay-tap"), v.literal("payment-submitted"), v.literal("approved"), v.literal("rejected"), v.literal("download"), v.literal("share")), career: v.string(), gender: v.union(v.literal("girl"), v.literal("boy")), createdAt: v.number(), amount: v.optional(v.number()), visitorId: v.optional(v.string()), isTest: v.optional(v.boolean()), requestId: v.optional(v.id("planUnlockRequests")) }).index("by_createdAt", ["createdAt"]).index("by_requestId", ["requestId"]),
  analyticsEvents: defineTable({ event: v.union(v.literal("landing-view"), v.literal("example-viewed"), v.literal("gender-picked"), v.literal("career-search"), v.literal("career-opened"), v.literal("day-viewed"), v.literal("plan-preview-viewed"), v.literal("locked-card-view"), v.literal("pay-tap"), v.literal("full-plan-shown"), v.literal("payment-submitted"), v.literal("approved"), v.literal("rejected"), v.literal("pdf-download"), v.literal("whatsapp-share")), visitorId: v.string(), ref: v.optional(v.string()), referrerDomain: v.optional(v.string()), isTest: v.boolean(), createdAt: v.number(), career: v.optional(v.string()), gender: v.optional(v.union(v.literal("girl"), v.literal("boy"), v.literal("unspecified"))), age: v.optional(v.union(v.literal(13), v.literal(14), v.literal(15), v.literal(16))), amount: v.optional(v.number()), paymentMode: v.optional(v.union(v.literal("free_preview"), v.literal("paid"))), device: v.optional(v.union(v.literal("mobile"), v.literal("desktop"))), entryPath: v.optional(v.union(v.literal("Example"), v.literal("Search"), v.literal("Unknown"))), seedBatch: v.optional(v.string()) }).index("by_createdAt", ["createdAt"]).index("by_visitorId", ["visitorId"]).index("by_seedBatch", ["seedBatch"]),
  aiCalls: defineTable({
    careerTitle: v.string(), visitorId: v.optional(v.string()), isTest: v.optional(v.boolean()),
    callType: v.union(v.literal("careers"), v.literal("captions"), v.literal("panel image"), v.literal("plan")),
    stage: v.string(), model: v.string(),
    cacheKey: v.optional(v.string()),
    imageSize: v.optional(v.string()), imageQuality: v.optional(v.string()),
    usage: v.any(), cacheHit: v.boolean(), timestamp: v.number(),
    status: v.string(), costUSD: v.union(v.number(), v.null()), costINR: v.union(v.number(), v.null()),
    generationId: v.optional(v.string()), panel: v.optional(v.number()),
    requestId: v.optional(v.string()), webSearchCalls: v.optional(v.number()),
    fullStoryboardCompleted: v.optional(v.boolean()), error: v.optional(v.string()),
    pricingDate: v.string(), usdToInr: v.number(),
  }).index("by_timestamp", ["timestamp"]).index("by_generationId", ["generationId"]).index("by_cache_timestamp", ["cacheHit", "timestamp"]).index("by_cacheKey", ["cacheKey"]).index("by_visitorId", ["visitorId"]),
  planGenerationErrors: defineTable({ generationId: v.string(), careerTitle: v.string(), stage: v.string(), error: v.string(), timestamp: v.number(), visitorId: v.optional(v.string()), isTest: v.boolean() }).index("by_timestamp", ["timestamp"]).index("by_generationId", ["generationId"]),
  planGenerationBudgets: defineTable({ key: v.string(), calls: v.number() }).index("by_key", ["key"]),
  creativeSceneGenerationBudgets: defineTable({ key: v.string(), calls: v.number() }).index("by_key", ["key"]),
  usage: defineTable({ day: v.string(), calls: v.number() }).index("by_day", [
    "day",
  ]),
  searches: defineTable({ key: v.string(), result: v.any(), gender: v.optional(genderValidator) }).index("by_key", [
    "key",
  ]),
  planDisplayRecords: defineTable({ sessionId: v.string(), searchKey: v.string(), childName: v.string(), updatedAt: v.number() }).index("by_sessionId", ["sessionId"]),
  storyboards: defineTable({
    title: v.string(),
    gender: v.optional(genderValidator),
    key: v.string(),
    panels: v.any(),
    status: v.string(),
    lease: v.number(),
    token: v.string(),
    raw: v.optional(v.string()),
    lastError: v.optional(v.string()),
    failureDetails: v.optional(v.array(failureDetailValidator)),
    lastFailureAt: v.optional(v.number()),
  }).index("by_key", ["key"]),
});
