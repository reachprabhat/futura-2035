/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { CAREER_CATALOG } from "./careerCatalog";
import { SCENE_CATALOG, eligibleScenes } from "./sceneCatalog";
import { genderStoryKey } from "./gender";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), parse: vi.fn() }));
vi.mock("openai", () => ({ toFile: async (blob: Blob) => blob, default: class { images = { generate: mocks.generate, edit: mocks.generate }; responses = { parse: mocks.parse }; } }));
const retryDelay = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("./imageRetry", async importOriginal => {
  const actual = await importOriginal<typeof import("./imageRetry")>();
  return { ...actual, withImageRateLimitRetry: <T>(call: () => Promise<T>) => actual.withImageRateLimitRetry(call, retryDelay) };
});
const modules = import.meta.glob("./**/*.ts");
async function testBackend() {
  const t = convexTest(schema, modules);
  const storageId = await t.run(ctx => ctx.storage.store(new Blob(["locked boy"], { type: "image/png" })));
  await t.mutation(api.sceneLibrary.saveBoyReference, { adminKey, storageId, digest: "test-locked-boy" });
  return t;
}
const adminKey = "a".repeat(40);
const imageUsage = { input_tokens: 100, input_tokens_details: { text_tokens: 100, image_tokens: 0 }, output_tokens: 1056 };
const panels = (health = false) => ["9:00", "11:00", "2:00", "4:00"].map((time, i) => ({ time, caption: `Task ${i + 1}`, sceneId: (health ? ["health-research", "consultation", "health-planning", "health-explanation"] : ["research", "documents", "meeting", "presentation"])[i] }));
beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://doting-basilisk-558.convex.cloud");
  vi.stubEnv("ADMIN_COSTS_KEY", adminKey);
  vi.stubEnv("OPENAI_API_KEY", "test-placeholder");
  vi.stubEnv("AI_ENABLED", "true");
  vi.stubEnv("DAILY_COST_CAP_INR", "10000");
  vi.stubEnv("AI_DAILY_CALL_CAP", "300");
  mocks.generate.mockReset(); mocks.parse.mockReset(); retryDelay.mockClear();
  mocks.generate.mockResolvedValue({ data: [{ b64_json: "dGVzdA==" }], usage: imageUsage });
  mocks.parse.mockResolvedValue({ output_parsed: { panels: panels() }, usage: { input_tokens: 100, output_tokens: 100 } });
});
afterEach(() => vi.unstubAllEnvs());

it("defines 16 scenes with at least three outfit-compatible choices for all 85 careers", () => {
  expect(SCENE_CATALOG).toHaveLength(16);
  expect(CAREER_CATALOG).toHaveLength(85);
  for (const career of CAREER_CATALOG) expect(eligibleScenes(career.title).length).toBeGreaterThanOrEqual(3);
});
it("generates each scene and gender once at medium, preserves locked identities, and logs actual cost", async () => {
  const t = await testBackend();
  for (const gender of ["girl", "boy"] as const) {
    const args = { adminKey, sceneId: "research", gender };
    expect((await t.action(api.libraryActions.generateScene, args)).path).toBe("shared-scene-generated");
    expect((await t.action(api.libraryActions.generateScene, args)).path).toBe("shared-scene-cache");
    await t.action(api.libraryActions.generateScene, { ...args, sceneId: "consultation" });
  }
  expect(mocks.generate).toHaveBeenCalledTimes(4);
  for (const [request] of mocks.generate.mock.calls) {
    expect(request).toMatchObject({ model: "gpt-image-1", n: 1, quality: "medium", size: "1024x1024" });
    expect(request.prompt).toContain("Exactly one human visible");
  }
  const prompts = mocks.generate.mock.calls.map(([r]) => r.prompt);
  expect(prompts[0]).toContain("20-year-old Indian woman");
  expect(prompts[2]).toContain("21-year-old Indian man");
  expect(prompts[0]).toContain("unstructured navy blazer");
  expect(prompts[1]).toContain("a clean white coat over a plain white shirt");
  expect(prompts[3]).toContain("a clean white coat over the open-collar white shirt");
  expect(mocks.generate.mock.calls[0][0].image).toBeUndefined();
  for (const index of [1, 2, 3]) expect(mocks.generate.mock.calls[index][0].image).toBeDefined();
  expect(mocks.parse).not.toHaveBeenCalled();
  const rows = await t.run(ctx => ctx.db.query("aiCalls").collect());
  expect(rows.filter(r => !r.cacheHit)).toHaveLength(4);
  expect(rows.filter(r => r.cacheHit).every(r => r.costUSD === 0)).toBe(true);
  expect(rows.find(r => !r.cacheHit)?.costUSD).toBeCloseTo(0.04274);
});
it("blocks concurrent image generation across different scenes and genders", async () => {
  const t = await testBackend();
  await t.mutation(internal.sceneLibrary.claimImage, { sceneId: "research", gender: "girl", token: "first" });
  await expect(t.action(api.libraryActions.generateScene, { adminKey, sceneId: "meeting", gender: "boy" })).rejects.toThrow("Another shared scene");
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("records a failed attempt and never silently generates or bills it again", async () => {
  const t = await testBackend();
  mocks.generate.mockRejectedValue(new Error("provider timeout"));
  const args = { adminKey, sceneId: "research", gender: "girl" as const };
  await expect(t.action(api.libraryActions.generateScene, args)).rejects.toThrow("provider timeout");
  await expect(t.action(api.libraryActions.generateScene, args)).rejects.toThrow("already has a generation attempt");
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  const rows = await t.run(ctx => ctx.db.query("aiCalls").collect());
  expect(rows[0]).toMatchObject({ status: "failed", costUSD: null });
  expect((await t.query(api.sceneLibrary.inventory, {})).scenes[0].status).toBe("failed");
});
it("refuses wrong deployment, non-admin, disabled AI and exhausted budget without provider calls", async () => {
  const t = await testBackend(), args = { adminKey, sceneId: "research", gender: "boy" as const };
  vi.stubEnv("CONVEX_CLOUD_URL", "https://wrong.convex.cloud");
  await expect(t.action(api.libraryActions.generateScene, args)).rejects.toThrow("restricted");
  vi.stubEnv("CONVEX_CLOUD_URL", "https://doting-basilisk-558.convex.cloud");
  await expect(t.action(api.libraryActions.generateScene, { ...args, adminKey: "invalid" })).rejects.toThrow("Admin access");
  vi.stubEnv("AI_ENABLED", "false");
  await expect(t.action(api.libraryActions.generateScene, args)).rejects.toThrow("paused");
  vi.stubEnv("AI_ENABLED", "true"); vi.stubEnv("DAILY_COST_CAP_INR", "0");
  await expect(t.action(api.libraryActions.generateScene, { ...args, sceneId: "meeting" })).rejects.toThrow("paused");
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("caches one mapping per career across genders and searches, with no per-career image calls", async () => {
  const t = await testBackend();
  for (const key of ["search-a", "search-b"]) await t.mutation(internal.data.saveSearch, { key, result: { careers: [{ title: "Corporate Lawyer" }] } });
  await expect(t.action(api.ai.storyboard, { searchKey: "search-a", careerIndex: 0, gender: "girl" })).rejects.toThrow(/shared scenes are not ready/);
  await t.action(api.libraryActions.prepareCareer, { adminKey, title: "Corporate Lawyer" });
  for (const gender of ["girl", "boy"] as const) {
    const result = await t.action(api.ai.storyboard, { searchKey: gender === "girl" ? "search-a" : "search-b", careerIndex: 0, gender });
    expect(result.panels).toHaveLength(4);
    expect(result.path).toBe("shared-scene-library");
  }
  expect(mocks.parse).toHaveBeenCalledTimes(1);
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(await t.run(ctx => ctx.db.query("storyboards").collect())).toHaveLength(0);
});
it("uses the same four stored scenes for different careers without copying images or editing archives", async () => {
  const t = await testBackend();
  for (const sceneId of ["research", "documents", "meeting", "presentation"]) await t.action(api.libraryActions.generateScene, { adminKey, sceneId, gender: "boy" });
  for (const title of ["Corporate Lawyer", "Banker"]) await t.action(api.libraryActions.prepareCareer, { adminKey, title });
  const lawyer = await t.query(api.sceneLibrary.career, { title: "Corporate Lawyer", gender: "boy" });
  const banker = await t.query(api.sceneLibrary.career, { title: "Banker", gender: "boy" });
  if (!lawyer || !banker) throw new Error("Both mapped careers must be available.");
  expect(lawyer.panels.map((p: any) => p.storageId)).toEqual(banker.panels.map((p: any) => p.storageId));
  expect(lawyer.status).toBe("ready");
  const key = genderStoryKey("Corporate Lawyer", "boy");
  await t.mutation(internal.data.claim, { key, title: "Corporate Lawyer", token: "archive", gender: "boy" });
  await t.mutation(internal.data.saveStory, { key, token: "archive", panels: [{ caption: "Archived task", time: "9:00", storageId: lawyer.panels[1].storageId }], status: "ready" });
  const before = await t.query(internal.data.getStory, { key });
  await t.action(api.libraryActions.prepareCareer, { adminKey, title: "Corporate Lawyer" });
  expect(await t.query(internal.data.getStory, { key })).toEqual(before);
  expect((await t.query(api.data.cachedCareer, { title: "Corporate Lawyer", gender: "boy" }))?.panels[0].caption).toBe("Task 1");
  expect((await t.query(api.sceneLibrary.career, { title: "Corporate Lawyer", gender: "boy" }))?.panels).toHaveLength(4);
});
it("rejects scene IDs outside the career outfit group", async () => {
  const t = await testBackend();
  for (const bad of [panels(), panels(true).map(p => ({ ...p, sceneId: "invented" }))]) {
    mocks.parse.mockResolvedValue({ output_parsed: { panels: bad } });
    await expect(t.action(api.libraryActions.prepareCareer, { adminKey, title: "Doctor" })).rejects.toThrow();
  }
  expect(mocks.generate).not.toHaveBeenCalled();
});
it("retires the old per-career photo API", async () => {
  const t = await testBackend();
  await expect(t.action(api.ai.photoTest, { adminKey, quality: "medium" })).rejects.toThrow("retired");
  expect(mocks.generate).not.toHaveBeenCalled();
});

it("retries a 429 once after 20 seconds, with separate ledger rows and one saved image", async () => {
  const t = await testBackend();
  mocks.generate.mockRejectedValueOnce(Object.assign(new Error("429 rate limit"), { status: 429 }));
  const result = await t.action(api.libraryActions.generateScene, { adminKey, sceneId: "research", gender: "boy" });
  expect(result.status).toBe("ready");
  expect(mocks.generate).toHaveBeenCalledTimes(2);
  expect(retryDelay).toHaveBeenCalledExactlyOnceWith(20000);
  const rows = await t.run(ctx => ctx.db.query("aiCalls").collect());
  expect(rows.map(r => r.status)).toEqual(["failed", "succeeded"]);
  expect((await t.query(api.sceneLibrary.inventory, {})).scenes.filter((s: any) => s.status === "ready")).toHaveLength(1);
});
it("stops provider calls when the shared-library ledger has passed 250 rupees", async () => {
  const t = await testBackend();
  await t.run(ctx => ctx.db.insert("aiCalls", { careerTitle: "Shared scene", callType: "panel image", stage: "shared-scene-image", model: "gpt-image-1", cacheKey: "shared-scenes-v1:prior:boy", usage: null, cacheHit: false, timestamp: Date.now(), status: "succeeded", costUSD: 251 / 90, costINR: 251, pricingDate: "2026-10-12", usdToInr: 90 }));
  await expect(t.action(api.libraryActions.generateScene, { adminKey, sceneId: "research", gender: "girl" })).rejects.toThrow("250 limit");
  expect(mocks.generate).not.toHaveBeenCalled();
  expect((await t.query(api.sceneLibrary.totals, { adminKey })).overBudget).toBe(true);
});

it("assigns the four canonical app times even when model time labels differ", async () => {
  const t = await testBackend();
  mocks.parse.mockResolvedValue({ output_parsed: { panels: panels().map(p => ({ ...p, time: "9 AM" })) } });
  const result = await t.action(api.libraryActions.prepareCareer, { adminKey, title: "Corporate Lawyer" });
  expect(result.panels.map((p: any) => p.time)).toEqual(["9:00", "11:00", "2:00", "4:00"]);
  expect(mocks.generate).not.toHaveBeenCalled();
});
