/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { writeFileSync, mkdirSync } from "node:fs";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { CAREER_CATALOG, CAREER_TITLES, CAREER_CATALOG_VERSION } from "./careerCatalog";
import { genderStoryKey } from "./gender";
import { storyKey } from "./storyKey";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  parse: vi.fn(),
  generate: vi.fn(),
  retryDelay: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./imageRetry", async importOriginal => {
  const actual = await importOriginal<typeof import("./imageRetry")>();
  return { ...actual, withImageRateLimitRetry: <T>(call: () => Promise<T>) => actual.withImageRateLimitRetry(call, mocks.retryDelay) };
});
vi.mock("openai", () => {
  class FakeOpenAI {
    responses = { create: mocks.create, parse: mocks.parse };
    images = { generate: mocks.generate };
    static APIError = class extends Error {
      status = 500;
    };
  }
  return { default: FakeOpenAI };
});
const modules = import.meta.glob("./**/*.ts");
describe("Admin photographic comparison", () => {


  it("hides archived illustrations without deleting them or starting generation", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.data.saveSearch, { key: "archive-test", result: { careers: [discoveryCareer("Author")] } });
    await t.run(ctx => ctx.db.insert("storyboards", { title: "Author", key: "Author", gender: "girl", panels: [{ caption: "Old illustrated panel" }], status: "ready", token: "archive", lease: 0 }));
    for (const gender of ["girl", "boy", "unspecified"] as const)
      expect((await t.query(api.data.stories, { searchKey: "archive-test", gender }))[0]).toBeNull();
    expect((await t.query(internal.data.getStory, { key: "Author" }))?.token).toBe("archive");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled();
  });


});
beforeEach(() => {
  vi.stubEnv("AI_ENABLED", "true");
  vi.stubEnv("DAILY_COST_CAP_INR", "2000");
});
const discoveryCareer = (title: string) => ({ title, description: ["Future work.", "Human contribution."],
  whyItFits: "Personalised child and parent match.", salaryMinINR: 1000000, salaryMaxINR: 2000000,
  salaryBasis: "Illustrative India range.", overseas: "Possible.", stability: "Tradeoffs." });
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("Storyboard recovery through the action", () => {
  it("requires completed research and reuses trimmed lowercased inputs with AI off", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    mocks.create.mockResolvedValue({
      output: [
        {
          type: "web_search_call",
          status: "completed",
          action: {
            sources: [
              { title: "Workforce research", url: "https://www.weforum.org/" },
            ],
          },
        },
      ],
      output_text: "Published workforce research.",
    });
    mocks.parse.mockResolvedValue({
      output: [],
      output_parsed: { careers: ["Economist", "Author", "Food Scientist"].map(discoveryCareer), note: "Test research result" },
    });
    const args = {
      interests: "Economics, writing",
      hopes: "stability, overseas",
    };
    const first = await t.action(api.ai.recommend, args);
    expect(first.sources).toHaveLength(1);
    expect(first.stories).toEqual([null, null, null]);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(await t.run(ctx => ctx.db.query("storyboards").collect())).toHaveLength(0);
    expect((await t.run(ctx => ctx.db.query("aiCalls").collect())).map(row => row.callType)).toEqual(["careers", "careers"]);
    expect(first.careers.map((c: any) => c.title)).toEqual(["Economist", "Author", "Food Scientist"]);
    expect(JSON.parse(mocks.parse.mock.calls[0][0].input[1].content).careerCatalog).toHaveLength(85);
    expect(mocks.parse.mock.calls[0][0].input[1].content).toContain(
      "Published workforce research.",
    );
    vi.stubEnv("AI_ENABLED", "false");
    const cached = await t.action(api.ai.recommend, {
      interests: "  ECONOMICS, WRITING  ",
      hopes: " STABILITY, OVERSEAS ",
    });
    expect(cached.path).toBe("career-cache");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.parse).toHaveBeenCalledTimes(1);
    expect((await t.action(api.ai.recommend, { interests: "writing; Economics", hopes: "overseas,  stability" })).path).toBe("career-cache");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    await expect(t.action(api.ai.recommend, { interests: "writing, Cricket", hopes: "stability, overseas" })).rejects.toThrow(/Futura is paused/);
  });
  it("serves cached careers and partial storyboards while off without preparing missing stories", async () => {
    const t = convexTest(schema, modules);
    const key = JSON.stringify([CAREER_CATALOG_VERSION, "economics", "stability"]);
    await t.mutation(internal.data.saveSearch, { key, result: { careers: ["Economist", "Author", "Food Scientist"].map(discoveryCareer) } });
    await t.mutation(internal.data.claim, { key: genderStoryKey("Economist", "girl"), title: "Economist", token: "partial" });
    await t.mutation(internal.data.saveStory, { key: genderStoryKey("Economist", "girl"), token: "partial", status: "failed", panels: [{ time: "9 AM", caption: "Saved caption", illustration: "Saved scene" }] });
    vi.stubEnv("AI_ENABLED", "false");
    const result = await t.action(api.ai.recommend, { interests: " Economics ", hopes: "STABILITY" });
    expect(result.path).toBe("career-cache");
    expect(result.stories[0].panels[0].caption).toBe("Saved caption");
    expect(result.stories[1]).toBeNull();
    expect((await t.action(api.ai.storyboard, { searchKey: key, careerIndex: 0 })).path).toBe("storyboard-paused");
    await expect(t.action(api.ai.storyboard, { searchKey: key, careerIndex: 1 })).rejects.toThrow(/Futura is paused/);
    await expect(t.mutation(api.data.startStories, { searchKey: key, cachedOnly: true } as any)).rejects.toThrow();
    await t.mutation(api.data.startStories, { searchKey: key, careerIndex: 0, cachedOnly: true });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.parse).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
    expect((await t.run(ctx => ctx.db.query("aiCalls").collect())).every(row => row.cacheHit)).toBe(true);
  });
  it.each([
    ["Invented Future Job", "Author", "Food Scientist"],
    ["economist", "Author", "Food Scientist"],
    ["Economist", "Economist", "Food Scientist"],
    ["Economist", "Author"],
  ])("refuses invented, renamed, repeated or missing catalog titles: %j", async (...titles) => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    mocks.create.mockResolvedValue({ output: [{ type: "web_search_call", status: "completed", action: { sources: [] } }], output_text: "Research." });
    mocks.parse.mockResolvedValue({ output_parsed: { careers: titles.map(discoveryCareer), note: "Test result" } });
    await expect(t.action(api.ai.recommend, { interests: "Test", hopes: "Test" })).rejects.toThrow(/try again/);
    expect(await t.run(ctx => ctx.db.query("searches").collect())).toHaveLength(0);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("has 85 unique plain titles and reuses the exact title across different searches", async () => {
    expect(CAREER_CATALOG).toHaveLength(85);
    expect(new Set(CAREER_TITLES).size).toBe(85);
    expect(CAREER_CATALOG.every(c => c.description.trim() && !c.description.includes("\n"))).toBe(true);
    expect(storyKey("Food Scientist")).toBe("Food Scientist");
    expect(storyKey("Older Career Name")).toBe("older career name");
    const t = convexTest(schema, modules);
    const id = await t.run(ctx => ctx.storage.store(new Blob(["existing image"], { type: "image/webp" })));
    const panels = Array.from({ length: 4 }, (_, i) => ({ time: `${i}`, caption: "Existing caption", illustration: "Existing scene", storageId: id }));
    await t.mutation(internal.data.claim, { key: genderStoryKey("Food Scientist"), title: "Food Scientist", token: "saved" });
    await t.mutation(internal.data.saveStory, { key: genderStoryKey("Food Scientist"), token: "saved", status: "ready", panels, raw: "{}" });
    for (const searchKey of ["different-input-a", "different-input-b"]) {
      await t.mutation(internal.data.saveSearch, { key: searchKey, result: { careers: [discoveryCareer("Food Scientist")] } });
      const result = await t.action(api.ai.storyboard, { searchKey, careerIndex: 0 });
      expect(result.path).toBe("storyboard-cache");
      expect(result.panels.map((p: any) => p.storageId)).toEqual(panels.map(p => p.storageId));
    }
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("refuses recommendations when the research tool did not finish", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    mocks.create.mockResolvedValue({
      output: [],
      output_text: "Unsupported claims",
    });
    await expect(
      t.action(api.ai.recommend, {
        interests: "economics",
        hopes: "stability",
      }),
    ).rejects.toThrow(/try again/);
    expect(mocks.parse).not.toHaveBeenCalled();
  });



});
describe("Gender choices and shared career discovery", () => {
  it("uses the same career cache for girl, boy and unspecified and stores selection metadata", async () => {
    const t = convexTest(schema, modules);
    const key = JSON.stringify([CAREER_CATALOG_VERSION, "economics", "stability"]);
    const careers = ["Economist", "Author", "Food Scientist"].map(discoveryCareer);
    await t.mutation(internal.data.saveSearch, { key, result: { careers } });
    for (const gender of ["girl", "boy", "unspecified"] as const) {
      const result = await t.action(api.ai.recommend, { interests: "Economics", hopes: "Stability", gender });
      expect(result.searchKey).toBe(key); expect(result.path).toBe("career-cache"); expect(result.careers).toEqual(careers);
      expect((await t.query(internal.data.search, { key }))?.gender).toBe(gender);
    }
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.parse).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
    expect(await t.run(ctx => ctx.db.query("searches").collect())).toHaveLength(1);
  });
  it("never includes gender in either career prompt or starts a storyboard on discovery", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    mocks.create.mockResolvedValue({ output: [{ type: "web_search_call", status: "completed", action: { sources: [] } }], output_text: "Research" });
    mocks.parse.mockResolvedValue({ output_parsed: { careers: ["Economist", "Author", "Food Scientist"].map(discoveryCareer), note: "Evidence" } });
    await t.action(api.ai.recommend, { interests: "Economics", hopes: "Stability", gender: "boy" });
    expect(JSON.stringify(mocks.create.mock.calls)).not.toContain('"gender"');
    expect(JSON.stringify(mocks.parse.mock.calls)).not.toContain('"gender"');
    expect(await t.run(ctx => ctx.db.query("storyboards").collect())).toHaveLength(0);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("unspecified returns existing images and refuses a missing storyboard without scheduling or calling AI", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.data.saveSearch, { key: "choice", result: { careers: [discoveryCareer("Economist"), discoveryCareer("Author")] } });
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["saved"])));
    await t.mutation(internal.data.claim, { key: genderStoryKey("Economist", "girl"), title: "Economist", token: "girl", gender: "girl" });
    await t.mutation(internal.data.saveStory, { key: genderStoryKey("Economist", "girl"), token: "girl", status: "ready", panels: [{ caption: "Saved scene", storageId }] });
    expect((await t.query(api.data.stories, { searchKey: "choice", gender: "boy" }))[0]).toBeNull();
    expect((await t.query(api.data.stories, { searchKey: "choice", gender: "girl" }))[0].panels[0].storageId).toBe(storageId);
    await t.mutation(api.data.startStories, { searchKey: "choice", careerIndex: 0, gender: "unspecified" });
    await expect(t.mutation(api.data.startStories, { searchKey: "choice", careerIndex: 1, gender: "unspecified" })).rejects.toThrow(/No saved storyboard/);
    await expect(t.action(api.ai.storyboard, { searchKey: "choice", careerIndex: 1, gender: "unspecified" })).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.parse).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });

});

it("keeps an image committed before a stale failure save", async () => {
  const t = convexTest(schema, modules);
  const storageId = await t.run(ctx => ctx.storage.store(new Blob(["saved image"])));
  await t.mutation(internal.data.claim, { key: "preserve-image", title: "Author", token: "same-attempt", gender: "girl" });
  const original = [{ caption: "Preserved task", illustration: "Preserved scene" }];
  await t.mutation(internal.data.saveStory, { key: "preserve-image", token: "same-attempt", panels: original, status: "generating" });
  await t.mutation(internal.data.savePanel, { key: "preserve-image", token: "same-attempt", index: 0, panel: { ...original[0], storageId } });
  await t.mutation(internal.data.saveStory, { key: "preserve-image", token: "same-attempt", panels: original, status: "failed", lastError: "Later operation failed." });
  const row = await t.query(internal.data.getStory, { key: "preserve-image" });
  expect(row?.panels[0].storageId).toBe(storageId);
  expect(row?.lastError).toBe("Later operation failed.");
});
const planFixture = () => ({ subtitle: "Turn ideas into memorable stories.", skills: ["Research", "Writing", "Collaboration", "Communication"], projects: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, title: `Project ${i + 1}`, skillIndex: i % 4, panelIndex: i % 4, build: `Portfolio piece ${i + 1}` })) });
describe("Career plan text cache", () => {
  it("creates a plan only on its explicit screen request, once per career across searches", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules), plan = planFixture();
    for (const key of ["plan-search-a", "plan-search-b"]) await t.mutation(internal.data.saveSearch, { key, result: { careers: [discoveryCareer("Author")] } });
    expect(await t.query(api.plans.get, { title: "Author" })).toBeNull();
    expect(mocks.parse).not.toHaveBeenCalled(); expect(await t.run(ctx => ctx.db.query("aiCalls").collect())).toHaveLength(0);
    mocks.parse.mockResolvedValue({ output_parsed: plan, usage: { input_tokens: 1000, output_tokens: 500 } });
    expect(await t.action(api.ai.careerPlan, { searchKey: "plan-search-a", careerIndex: 0 })).toEqual(plan);
    vi.stubEnv("AI_ENABLED", "false");
    expect(await t.action(api.ai.careerPlan, { searchKey: "plan-search-b", careerIndex: 0 })).toEqual(plan);
    expect(mocks.parse).toHaveBeenCalledTimes(1); expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    const rows = await t.run(ctx => ctx.db.query("aiCalls").collect());
    expect(rows.map(r => [r.callType, r.stage, r.cacheHit])).toEqual([["plan", "12-month-plan", false], ["plan", "plan-cache", true]]);
    expect(rows[0].costINR).toBeCloseTo(0.108, 10); expect(rows[1].costINR).toBe(0);
    expect(await t.run(ctx => ctx.db.query("careerPlans").collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
  });
  it("refuses repeated months and duplicate skills instead of caching an invalid plan", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules), plan = planFixture();
    await t.mutation(internal.data.saveSearch, { key: "bad-plan", result: { careers: [discoveryCareer("Author")] } });
    plan.projects[1].month = 1; plan.skills[1] = plan.skills[0];
    mocks.parse.mockResolvedValue({ output_parsed: plan });
    await expect(t.action(api.ai.careerPlan, { searchKey: "bad-plan", careerIndex: 0 })).rejects.toThrow(/try again/);
    const saved = await t.query(api.plans.get, { title: "Author" });
    expect(saved?.status).toBe("failed"); expect(saved?.plan).toBeUndefined(); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("refuses a plan for a career outside the selected saved search", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.ai.careerPlan, { searchKey: "not-a-real-search", careerIndex: 0 })).rejects.toThrow(/saved results/);
    expect(mocks.parse).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
});


