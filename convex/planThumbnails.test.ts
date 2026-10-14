/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { thumbnailTagsKey, thumbnailThemeKey, THUMBNAIL_THEMES } from "./thumbnailCatalog";
import { storyKey } from "./storyKey";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), parse: vi.fn() }));
vi.mock("openai", () => ({ default: class { images = { generate: mocks.generate }; responses = { parse: mocks.parse }; } }));
const modules = import.meta.glob("./**/*.ts");
const adminKey = "a".repeat(40);
beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://doting-basilisk-558.convex.cloud");
  vi.stubEnv("ADMIN_COSTS_KEY", adminKey);
  vi.stubEnv("OPENAI_API_KEY", "test-placeholder");
  vi.stubEnv("AI_ENABLED", "true");
  vi.stubEnv("DAILY_COST_CAP_INR", "10000");
  vi.stubEnv("AI_DAILY_CALL_CAP", "300");
  mocks.generate.mockReset().mockResolvedValue({ data: [{ b64_json: "dGVzdA==" }], usage: { input_tokens: 20, input_tokens_details: { text_tokens: 20, image_tokens: 0 }, output_tokens: 276 } });
  mocks.parse.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it("defines the 23 gender independent thumbnail themes", () => {
  expect(THUMBNAIL_THEMES).toHaveLength(23);
  expect(new Set(THUMBNAIL_THEMES.map(theme => theme.id)).size).toBe(23);
  expect(THUMBNAIL_THEMES.find(theme => theme.id === "stage-rehearsal")?.activity).toContain("violin");
  expect(THUMBNAIL_THEMES.find(theme => theme.id === "kitchen-tasting")?.activity).toContain("measuring");
  expect(THUMBNAIL_THEMES.find(theme => theme.id === "law-contract")?.activity).toContain("signature");
});

it("generates and stores each low quality theme once, with a real aiCalls row", async () => {
  const t = convexTest(schema, modules);
  const args = { adminKey, themeId: "laptop-charts" };
  expect((await t.action(api.planThumbnailActions.generate, args)).path).toBe("plan-thumbnail-generated");
  expect((await t.action(api.planThumbnailActions.generate, args)).path).toBe("plan-thumbnail-cache");
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(mocks.generate.mock.calls[0][0]).toMatchObject({ model: "gpt-image-1", n: 1, size: "1024x1024", quality: "low", output_format: "webp" });
  expect(mocks.generate.mock.calls[0][0].prompt).toContain("No identifiable faces");
  expect((await t.query(api.planThumbnails.images, {})).find((item: any) => item.themeId === "laptop-charts")?.status).toBe("ready");
  expect((await t.run(ctx => ctx.db.query("aiCalls").collect())).map(row => [row.stage, row.imageQuality, row.cacheHit])).toEqual([["plan-thumbnail-image", "low", false], ["plan-thumbnail-image", "low", true]]);
});

it("tags an existing plan with one cached text call and exposes the tags on its cached projects", async () => {
  const t = convexTest(schema, modules);
  const plan = { subtitle: "A year of curious ideas.", skills: ["Research", "Writing", "Analysis", "Making"], projects: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, title: `Project ${i + 1}`, skillIndex: i % 4, panelIndex: i % 4, build: `Outcome ${i + 1}` })) };
  await t.mutation(internal.data.saveSearch, { key: "tag-search", result: { careers: [{ title: "Author" }] } });
  await t.run(ctx => ctx.db.insert("careerPlans", { key: storyKey("Author"), title: "Author", status: "ready", token: "plan", lease: 0, plan }));
  const tags = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, themeId: THUMBNAIL_THEMES[i % THUMBNAIL_THEMES.length].id }));
  mocks.parse.mockResolvedValue({ output_parsed: { tags }, usage: { input_tokens: 500, output_tokens: 100 } });
  expect(await t.action(api.planThumbnailActions.tagCachedPlan, { searchKey: "tag-search", careerIndex: 0 })).toEqual(tags);
  const saved = await t.query(api.plans.get, { title: "Author" });
  expect(saved?.plan.projects.map((project: any) => project.thumbnailThemeId)).toEqual(tags.map(tag => tag.themeId));
  expect(await t.action(api.planThumbnailActions.tagCachedPlan, { searchKey: "tag-search", careerIndex: 0 })).toEqual(tags);
  expect(mocks.parse).toHaveBeenCalledTimes(1);
  const row = await t.query(internal.planThumbnails.getTags, { title: "Author" });
  expect(row).toMatchObject({ key: thumbnailTagsKey("Author"), status: "ready", tags });
  expect(await t.query(internal.planThumbnails.getImage, { themeId: "laptop-charts" })).toBeNull();
});
