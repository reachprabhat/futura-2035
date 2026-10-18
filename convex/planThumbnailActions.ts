"use node";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { readTracking, trackingString, trackingBoolean } from "./tracking";
import OpenAI from "openai";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { THUMBNAIL_THEMES, THUMBNAIL_THEME_IDS, thumbnailTagsKey, thumbnailThemeKey } from "./thumbnailCatalog";
import { withImageRateLimitRetry } from "./imageRetry";

const devOnly = () => {
  if (process.env.CONVEX_CLOUD_URL !== "https://doting-basilisk-558.convex.cloud") throw new ConvexError("Thumbnail generation is restricted to doting-basilisk-558 DEV.");
};
const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 150000 });
async function tracked<T extends { usage?: any; _request_id?: string | null }>(ctx: ActionCtx, metadata: any, call: () => Promise<T>) {
  const { visitorId, isTest, ...fields } = metadata;
  const costMetadata = { ...fields, tracking: { ...(visitorId ? { visitorId } : {}), ...(isTest !== undefined ? { isTest } : {}) } };
  const id = await ctx.runMutation(internal.costs.begin, costMetadata);
  try {
    const result = await call();
    await ctx.runMutation(internal.costs.finish, { id, usage: result.usage ?? null, ...(result._request_id ? { requestId: result._request_id } : {}), webSearchCalls: 0 });
    return result;
  } catch (e) {
    await ctx.runMutation(internal.costs.finish, { id, usage: null, webSearchCalls: 0, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export const generate = action({
  args: { adminKey: v.string(), themeId: v.string() }, returns: v.any(),
  handler: async (ctx, { adminKey, themeId }): Promise<any> => {
    devOnly();
    await ctx.runQuery(api.costs.controls, { adminKey });
    const theme = THUMBNAIL_THEMES.find(item => item.id === themeId);
    if (!theme) throw new ConvexError("Choose a theme from the plan thumbnail library.");
    const token = crypto.randomUUID(), key = thumbnailThemeKey(themeId);
    const claim = await ctx.runMutation(internal.planThumbnails.claimImage, { themeId, token });
    const metadata = { careerTitle: `Plan thumbnail: ${themeId}`, callType: "plan" as const, stage: "plan-thumbnail-image", model: "gpt-image-1", imageSize: "1024x1024", imageQuality: "low", cacheKey: key, generationId: token };
    if (claim.state === "cached") {
      await ctx.runMutation(internal.costs.cache, metadata);
      return { themeId, status: "ready", path: "plan-thumbnail-cache" };
    }
    const prompt = `Medium: photography, matching the saved Futura career detail reference. Palette: soft white and pale lavender background tones, natural wood, restrained purple #7655bc, mint #e8f4ed, warm peach #fcf0e6. Light: soft warm daylight from a nearby window. Materials: real wood, paper, glass, fabric and believable everyday objects. Mood: curious, grounded, optimistic. Subject: ${theme.activity} Composition: realistic editorial still-life photograph, square crop designed to remain clear when shown as a small rounded month-card thumbnail; one coherent activity, close enough to read at a glance. No identifiable faces; if people are needed show only hands or distant, blurred people from behind. No readable text, signatures with names, logos, brands, watermark, collage, illustration, CGI, plastic-looking surfaces, neon, lens flare or fake interface. Keep the scene naturally imperfect and plausible.`;
    try {
      const result = await withImageRateLimitRetry(() => tracked(ctx, metadata, () => client().images.generate({ model: "gpt-image-1", n: 1, size: "1024x1024", quality: "low", output_format: "webp", prompt })));
      const base64 = result.data?.[0]?.b64_json;
      if (!base64) throw new Error("No thumbnail image was returned.");
      const storageId = await ctx.storage.store(new Blob([Uint8Array.from(Buffer.from(base64, "base64"))], { type: "image/webp" }));
      await ctx.runMutation(internal.planThumbnails.finishImage, { themeId, token, storageId });
      return { themeId, status: "ready", path: "plan-thumbnail-generated" };
    } catch (e) {
      await ctx.runMutation(internal.planThumbnails.finishImage, { themeId, token, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },
});

// One-off, allowlisted correction for the three thumbnails requested on 2026-10-14.
// This path deliberately makes exactly one provider request and never changes tags/mappings.
const noTextReplacementSubjects: Record<string, string> = {
  "presentation-slides": "A laptop presenting a clean slide made only from simple abstract color blocks and shapes, with a small audience seen only from behind and softly out of focus; no visible faces.",
  "field-visit": "A clearly outdoor field research site in warm daylight, leafy ground and a softly blurred natural setting; close foreground view of a hand holding a clipboard and pencil while taking observations. This is outdoors, with no desk, no table and no indoor setting.",
  "law-contract": "A few substantial law books beside a contract sheet on a natural wooden desk, with a fountain pen and a simple abstract ink signature mark that is not a letter or word; no names and no visible writing.",
};
export const regenerateNoTextThumbnail = action({
  args: { adminKey: v.string(), themeId: v.string() }, returns: v.any(),
  handler: async (ctx, { adminKey, themeId }): Promise<any> => {
    devOnly();
    await ctx.runQuery(api.costs.controls, { adminKey });
    const subject = noTextReplacementSubjects[themeId];
    if (!subject) throw new ConvexError("Only the three approved no-text thumbnail themes can be replaced.");
    const token = crypto.randomUUID();
    const claim = await ctx.runMutation(internal.planThumbnails.claimReplacement, { themeId, token });
    if (claim.state !== "claimed") throw new ConvexError("The thumbnail replacement could not be claimed.");
    const generationId = `thumbnail-no-text-v1:${themeId}`;
    const metadata = { careerTitle: `Plan thumbnail: ${themeId}`, callType: "plan" as const, stage: "plan-thumbnail-replacement", model: "gpt-image-1", imageSize: "1024x1024", imageQuality: "low", cacheKey: thumbnailThemeKey(themeId), generationId };
    const prompt = `Medium: photography, matching the saved Futura career detail reference and the existing plan thumbnail library. Palette: soft white and pale lavender background tones, natural wood, restrained purple #7655bc, mint #e8f4ed, warm peach #fcf0e6. Light: soft warm daylight from a nearby window. Materials: real wood, paper, glass, fabric and believable everyday objects. Mood: curious, grounded, optimistic. Subject: ${subject} Composition: realistic editorial still-life photograph, square crop designed to remain clear when shown as a small rounded month-card thumbnail; one coherent activity, close enough to read at a glance. No identifiable faces; if people are needed show only hands or distant, blurred people from behind. No readable text, signatures with names, logos, brands, watermark, collage, illustration, CGI, plastic-looking surfaces, neon, lens flare or fake interface. Keep the scene naturally imperfect and plausible. no text, no letters, no words, no logos anywhere in the image`;
    try {
      // Intentionally no retry: this correction must account for exactly one image call per theme.
      const result = await tracked(ctx, metadata, () => client().images.generate({ model: "gpt-image-1", n: 1, size: "1024x1024", quality: "low", output_format: "webp", prompt }));
      const base64 = result.data?.[0]?.b64_json;
      if (!base64) throw new Error("No thumbnail image was returned.");
      const storageId = await ctx.storage.store(new Blob([Uint8Array.from(Buffer.from(base64, "base64"))], { type: "image/webp" }));
      await ctx.runMutation(internal.planThumbnails.finishReplacement, { themeId, token, storageId });
      return { themeId, status: "ready", generationId, prompt };
    } catch (e) {
      await ctx.runMutation(internal.planThumbnails.finishReplacement, { themeId, token });
      throw e;
    }
  },
});

const ThemeTags = z.object({ tags: z.array(z.object({ month: z.number().int().min(1).max(12), themeId: z.enum(THUMBNAIL_THEME_IDS) })).length(12) });
async function ensureTagged(ctx: ActionCtx, title: string, tracking: { visitorId?: string; isTest?: boolean } = {}): Promise<any> {
  const planRow = await ctx.runQuery(internal.plans.internalGet, { title });
  if (planRow?.status !== "ready" || !planRow.plan || planRow.plan.projects?.length !== 12) throw new ConvexError("The saved twelve-month plan is not ready for thumbnail matching yet.");
  const plan = planRow.plan;
  const projects = plan.projects.map((project: any) => ({ month: project.month, title: project.title, targetSkill: project.targetSkill, skillIndex: project.skillIndex }));
  const token = crypto.randomUUID(), cacheKey = thumbnailTagsKey(title, projects);
  const claim = await ctx.runMutation(internal.planThumbnails.claimTags, { title, token, projects });
  if (claim.state === "cached" && claim.row) {
    await ctx.runMutation(internal.costs.cache, { careerTitle: title, callType: "plan", stage: "plan-thumbnail-tag-cache", model: "gpt-4.1-mini", cacheKey, tracking });
    return claim.row.tags;
  }
  if (claim.state === "busy") return null;
  try {
    const response = await tracked(ctx, { careerTitle: title, callType: "plan", stage: "plan-thumbnail-tags", model: "gpt-4.1-mini", cacheKey, generationId: token, ...tracking }, () => client().responses.parse({
      model: "gpt-4.1-mini", max_output_tokens: 900, temperature: 0.1,
      input: [
        { role: "system", content: "Choose the best one photo theme for each of the twelve existing month projects. Match the actual activity and output, not the career name alone. Use only the supplied exact theme IDs. Every month must receive one theme; themes may repeat. Preserve the month numbers 1 through 12 in order. Return only the requested structured data. Do not rewrite the plan or request images." },
        { role: "user", content: JSON.stringify({ projects: plan.projects.map((project: any) => ({ month: project.month, title: project.title, build: project.projectDetails ?? project.build, skill: project.targetSkill ?? plan.skills?.[project.skillIndex] })), themes: THUMBNAIL_THEMES.map(({ id, title, activity }) => ({ id, title, activity })) }) },
      ], text: { format: zodTextFormat(ThemeTags, "month_thumbnail_theme_tags") },
    }));
    const tags = ThemeTags.parse(response.output_parsed).tags;
    if (tags.some((tag, index) => tag.month !== index + 1)) throw new Error("Theme tags must cover months one through twelve in order.");
    await ctx.runMutation(internal.planThumbnails.finishTags, { title, token, projects, tags });
    return tags;
  } catch (e) {
    await ctx.runMutation(internal.planThumbnails.finishTags, { title, token, projects, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
export const tagCachedPlan = action({
  args: { searchKey: v.string(), careerIndex: v.number(), tracking: v.optional(v.any()) }, returns: v.any(),
  handler: async (ctx, { searchKey, careerIndex, tracking: rawTracking }): Promise<any> => {
    const tracking = readTracking(rawTracking);
    const visitorId = trackingString(tracking.visitorId);
    const isTest = trackingBoolean(tracking.isTest);
    const search = await ctx.runQuery(internal.data.search, { key: searchKey });
    const career = search?.result.careers[careerIndex];
    if (!Number.isInteger(careerIndex) || !career) throw new ConvexError("Choose a career from your saved results first.");
    return ensureTagged(ctx, career.title, { visitorId, isTest });
  },
});
export const tagSavedPlanForViewer = action({
  args: { title: v.string(), tracking: v.optional(v.any()) }, returns: v.any(),
  handler: async (ctx, { title, tracking: rawTracking }): Promise<any> => {
    const tracking = readTracking(rawTracking);
    return ensureTagged(ctx, title, { visitorId: trackingString(tracking.visitorId), isTest: trackingBoolean(tracking.isTest) });
  },
});
export const tagSavedPlan = action({
  args: { adminKey: v.string(), title: v.string() }, returns: v.any(),
  handler: async (ctx, { adminKey, title }): Promise<any> => {
    devOnly();
    await ctx.runQuery(api.costs.controls, { adminKey });
    return ensureTagged(ctx, title);
  },
});

