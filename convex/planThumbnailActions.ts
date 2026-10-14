"use node";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
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
  const id = await ctx.runMutation(internal.costs.begin, metadata);
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

const ThemeTags = z.object({ tags: z.array(z.object({ month: z.number().int().min(1).max(12), themeId: z.enum(THUMBNAIL_THEME_IDS) })).length(12) });
async function ensureTagged(ctx: ActionCtx, title: string): Promise<any> {
  const planRow = await ctx.runQuery(internal.plans.internalGet, { title });
  if (planRow?.status !== "ready" || planRow.plan?.projects?.length !== 12) throw new ConvexError("The saved twelve-month plan is not ready for thumbnail matching yet.");
  const hasAllTags = planRow.plan.projects.every((project: any) => THUMBNAIL_THEME_IDS.includes(project.thumbnailThemeId));
  if (hasAllTags) return planRow.plan.projects.map((project: any) => ({ month: project.month, themeId: project.thumbnailThemeId }));
  const token = crypto.randomUUID(), cacheKey = thumbnailTagsKey(title);
  const claim = await ctx.runMutation(internal.planThumbnails.claimTags, { title, token });
  if (claim.state === "cached" && claim.row) {
    await ctx.runMutation(internal.costs.cache, { careerTitle: title, callType: "plan", stage: "plan-thumbnail-tag-cache", model: "gpt-4.1-mini", cacheKey });
    return claim.row.tags;
  }
  if (claim.state === "busy") return null;
  try {
    const response = await tracked(ctx, { careerTitle: title, callType: "plan", stage: "plan-thumbnail-tags", model: "gpt-4.1-mini", cacheKey, generationId: token }, () => client().responses.parse({
      model: "gpt-4.1-mini", max_output_tokens: 900, temperature: 0.1,
      input: [
        { role: "system", content: "Choose the best one photo theme for each of the twelve existing month projects. Match the actual activity and output, not the career name alone. Use only the supplied exact theme IDs. Every month must receive one theme; themes may repeat. Preserve the month numbers 1 through 12 in order. Return only the requested structured data. Do not rewrite the plan or request images." },
        { role: "user", content: JSON.stringify({ projects: planRow.plan.projects.map((project: any) => ({ month: project.month, title: project.title, build: project.build, skill: planRow.plan.skills?.[project.skillIndex] })), themes: THUMBNAIL_THEMES.map(({ id, title, activity }) => ({ id, title, activity })) }) },
      ], text: { format: zodTextFormat(ThemeTags, "month_thumbnail_theme_tags") },
    }));
    const tags = ThemeTags.parse(response.output_parsed).tags;
    if (tags.some((tag, index) => tag.month !== index + 1)) throw new Error("Theme tags must cover months one through twelve in order.");
    await ctx.runMutation(internal.planThumbnails.finishTags, { title, token, tags });
    return tags;
  } catch (e) {
    await ctx.runMutation(internal.planThumbnails.finishTags, { title, token, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
export const tagCachedPlan = action({
  args: { searchKey: v.string(), careerIndex: v.number() }, returns: v.any(),
  handler: async (ctx, { searchKey, careerIndex }): Promise<any> => {
    const search = await ctx.runQuery(internal.data.search, { key: searchKey });
    const career = search?.result.careers[careerIndex];
    if (!Number.isInteger(careerIndex) || !career) throw new ConvexError("Choose a career from your saved results first.");
    return ensureTagged(ctx, career.title);
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
