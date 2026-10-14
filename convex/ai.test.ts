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
  it("creates only four medium Corporate Lawyer Boy panels in order and reuses the saved storyboard", async () => {
    vi.stubEnv("ADMIN_COSTS_KEY", "a".repeat(40));
    vi.stubEnv("CONVEX_CLOUD_URL", "https://doting-basilisk-558.convex.cloud");
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    let completed = 0;
    mocks.generate.mockImplementation(async request => {
      const row = await t.query(internal.data.getStory, { key: genderStoryKey("Corporate Lawyer", "boy") });
      expect(row?.panels.filter((p: any) => p.storageId)).toHaveLength(completed);
      expect(request.quality).toBe("medium");
      completed++;
      return { data: [{ b64_json: "dGVzdA==" }], usage: { input_tokens: 100, input_tokens_details: { text_tokens: 100, image_tokens: 0 }, output_tokens: 1056 } };
    });
    const args = { adminKey: "a".repeat(40) };
    await expect(t.action(api.ai.corporateLawyerStoryboard, { adminKey: "invalid" })).rejects.toThrow("Admin access required");
    const result = await t.action(api.ai.corporateLawyerStoryboard, args);
    expect(result.panels.every((p: any) => p.storageId)).toBe(true);
    expect(mocks.generate).toHaveBeenCalledTimes(4);
    expect(mocks.parse).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    const prompts = mocks.generate.mock.calls.map(([r]) => r.prompt);
    expect(new Set(prompts.map(p => p.split("\n")[0])).size).toBe(1);
    ["private modern office", "conference room", "law library", "office courtyard"].forEach((setting, i) => expect(prompts[i]).toContain(setting));
    expect((await t.run(ctx => ctx.db.query("aiCalls").collect())).filter(r => !r.cacheHit)).toHaveLength(4);
    await t.action(api.ai.corporateLawyerStoryboard, args);
    expect(mocks.generate).toHaveBeenCalledTimes(4);
    expect(await t.run(ctx => ctx.db.query("searches").collect())).toHaveLength(0);
    expect(await t.run(ctx => ctx.db.query("careerPlans").collect())).toHaveLength(0);
  });
  it("uses the default and medical outfits for the two fixed medium tests without extra AI calls", async () => {
    vi.stubEnv("ADMIN_COSTS_KEY", "a".repeat(40));
    vi.stubEnv("CONVEX_CLOUD_URL", "https://doting-basilisk-558.convex.cloud");
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    mocks.generate.mockResolvedValue({ data: [{ b64_json: "dGVzdA==" }] });
    for (const revision of ["outfit-boy-v1", "outfit-girl-v1"] as const) {
      const args = { adminKey: "a".repeat(40), quality: "medium" as const, revision };
      await expect(t.action(api.ai.photoTest, { ...args, quality: "high" })).rejects.toThrow("medium quality only");
      const first = await t.action(api.ai.photoTest, args);
      expect(first.prompt).toContain(revision === "outfit-boy-v1" ? "unstructured navy blazer over a plain white crew-neck top, no tie, no logos, neat and well-fitted" : "a clean white coat over a plain light-blue shirt");
      expect(first.prompt).not.toContain("soft grey cardigan");
      expect(first.prompt).not.toContain("dark casual shirt");
      expect((await t.action(api.ai.photoTest, args)).cached).toBe(true);
    }
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect((await t.run(ctx => ctx.db.query("aiCalls").collect())).map(r => r.careerTitle)).toEqual(["Corporate Lawyer", "Doctor"]);
    expect(await t.run(ctx => ctx.db.query("storyboards").collect())).toHaveLength(0);
  });
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
  it("refuses non-admin and wrong deployments before generating", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.ai.photoTest, { adminKey: "invalid", quality: "high" })).rejects.toThrow("Admin access required");
    vi.stubEnv("ADMIN_COSTS_KEY", "a".repeat(40));
    vi.stubEnv("CONVEX_CLOUD_URL", "https://wrong.convex.cloud");
    await expect(t.action(api.ai.photoTest, { adminKey: "a".repeat(40), quality: "high" })).rejects.toThrow("restricted");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("generates exactly one panel at each quality, logs both and never repeats", async () => {
    vi.stubEnv("ADMIN_COSTS_KEY", "a".repeat(40));
    vi.stubEnv("CONVEX_CLOUD_URL", "https://doting-basilisk-558.convex.cloud");
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    await t.run(ctx => ctx.db.insert("storyboards", { title: "Author", key: genderStoryKey("Author", "girl"), panels: [{ caption: "Reviews a manuscript at a writing desk" }], status: "ready", token: "existing", lease: 0 }));
    mocks.generate.mockResolvedValue({ data: [{ b64_json: "dGVzdA==" }], usage: { input_tokens: 100, input_tokens_details: { text_tokens: 100, image_tokens: 0 }, output_tokens: 1000 } });
    for (const quality of ["high", "medium"] as const) {
      const args = { adminKey: "a".repeat(40), quality };
      expect((await t.action(api.ai.photoTest, args)).cached).toBe(false);
      expect((await t.action(api.ai.photoTest, args)).cached).toBe(true);
    }
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.parse).not.toHaveBeenCalled();
    const [high, medium] = mocks.generate.mock.calls.map(([r]) => r);
    expect(high.prompt).toBe(medium.prompt);
    expect(high.prompt).toContain("20-year-old Indian woman");
    expect(high.prompt).toContain("Photorealistic");
    expect(high.quality).toBe("high"); expect(medium.quality).toBe("medium");
    const rows = await t.run(ctx => ctx.db.query("aiCalls").collect());
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.stage === "admin-photo-test" && r.costINR! > 0)).toBe(true);
    expect((await t.run(ctx => ctx.db.query("storyboards").collect()))[0].token).toBe("existing");
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
  it("keeps captions when images fail, retries only images, then returns saved images without AI calls", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    await t.mutation(internal.data.saveSearch, {
      key: "test-search",
      result: { careers: [{ title: "Test Career" }] },
    });
    const scenes = {
      character: "A consistent adult protagonist",
      panels: Array.from({ length: 4 }, (_, i) => ({
        time: `${9 + i}:00`,
        caption: `Test scene ${i + 1}`,
        illustration: `Test illustration ${i + 1}`,
      })),
    };
    mocks.parse
      .mockResolvedValueOnce({ output_parsed: scenes })
      .mockResolvedValueOnce({
        output_parsed: {
          age: 35,
          face: "oval face, dark eyes",
          hair: "black shoulder-length bob",
          clothing: "sage green kurta",
          skinTone: "medium brown",
        },
      });
    mocks.generate.mockRejectedValue(new Error("Simulated image failure"));
    const failed = await t.action(api.ai.storyboard, {
      searchKey: "test-search",
      careerIndex: 0,
    });
    expect(failed.panels.map((p: any) => p.caption)).toEqual(
      scenes.panels.map((p) => p.caption),
    );
    expect(failed.path).toBe(
      "openai-storyboard-and-images:captions-only-or-partial",
    );
    expect(failed.error).toContain("try again");
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    expect(mocks.generate).toHaveBeenCalledTimes(4);
    for (const [request] of mocks.generate.mock.calls) {
      expect(request.model).toBe("gpt-image-1");
      expect(request.quality).toBe("high");
      expect(request.prompt).toContain(
        "a single scene, one image, not a grid, collage, comic strip or multiple panels",
      );
      expect(request.prompt).toContain(
        "no text, letters, numbers, words, signs, charts or screens with writing anywhere in the image",
      );
      expect(request.prompt).toContain(
        "Photorealistic editorial workplace photography",
      );
      expect(request.prompt.split("\n")[0]).toBe(
        mocks.generate.mock.calls[0][0].prompt.split("\n")[0],
      );
    }
    mocks.generate.mockResolvedValue({ data: [{ b64_json: "dGVzdA==" }] });
    const retry = await t.action(api.ai.storyboard, {
      searchKey: "test-search",
      careerIndex: 0,
    });
    expect(retry.path).toBe("openai-image-retry");
    expect(retry.panels.every((p: any) => p.storageId && p.imageUrl)).toBe(
      true,
    );
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    expect(mocks.generate).toHaveBeenCalledTimes(8);
    vi.stubEnv("AI_ENABLED", "false");
    vi.stubEnv("DAILY_COST_CAP_INR", "1");
    const cached = await t.action(api.ai.storyboard, {
      searchKey: "test-search",
      careerIndex: 0,
    });
    expect(cached.path).toBe("storyboard-cache");
    expect(mocks.generate).toHaveBeenCalledTimes(8);
    const used = await t.run((ctx) => ctx.db.query("usage").collect());
    expect(used[0].calls).toBe(10);
  });
  it("finishes and saves each image before starting the next", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    await t.mutation(internal.data.saveSearch, { key: "parallel", result: { careers: [{ title: "Parallel Career" }] } });
    await t.mutation(internal.data.claim, { key: genderStoryKey("Parallel Career"), title: "Parallel Career", token: "prep" });
    await t.mutation(internal.data.saveStory, { key: genderStoryKey("Parallel Career"), token: "prep", status: "prepared",
      raw: JSON.stringify({ imageCharacter: "Fixed existing character" }),
      panels: Array.from({ length: 4 }, (_, i) => ({ time: `${i}`, caption: `Existing caption ${i}`, illustration: "Existing scene" })) });
    const resolvers: ((value: any) => void)[] = [];
    mocks.generate.mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    const run = t.action(api.ai.storyboard, { searchKey: "parallel", careerIndex: 0 });
    const image = { data: [{ b64_json: "dGVzdA==" }], usage: { input_tokens: 20, input_tokens_details: { text_tokens: 20, image_tokens: 0 }, output_tokens: 4160, total_tokens: 4180 } };
    for (let panel = 0; panel < 4; panel++) {
      for (let i = 0; i < 100 && resolvers.length < panel + 1; i++) await new Promise(r => setTimeout(r, 1));
      expect(resolvers).toHaveLength(panel + 1);
      const partial = await t.query(internal.data.getStory, { key: genderStoryKey("Parallel Career") });
      expect(partial?.panels.filter((p: any) => p.storageId)).toHaveLength(panel);
      resolvers[panel](image);
    }
    await run;
    const final = await t.query(internal.data.getStory, { key: genderStoryKey("Parallel Career") });
    expect(final?.panels.every((p: any) => p.storageId)).toBe(true);
    const calls = await t.run(ctx => ctx.db.query("aiCalls").collect());
    expect(calls.filter(c => c.fullStoryboardCompleted)).toHaveLength(1);
    expect(calls.every(c => c.costUSD === 0.1665)).toBe(true);
  });
  it("does not call OpenAI after the daily allowance is used, and still returns saved captions", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    vi.stubEnv("AI_DAILY_CALL_CAP", "1");
    const t = convexTest(schema, modules);
    await t.mutation(internal.data.saveSearch, {
      key: "test-search",
      result: { careers: [{ title: "Test Career" }] },
    });
    mocks.parse.mockResolvedValue({
      output_parsed: {
        character: "An adult",
        panels: Array.from({ length: 4 }, (_, i) => ({
          time: "09:00",
          caption: `Test caption ${i}`,
          illustration: "A test scene",
        })),
      },
    });
    const result = await t.action(api.ai.storyboard, {
      searchKey: "test-search",
      careerIndex: 0,
    });
    expect(result.panels).toHaveLength(4);
    expect(result.error).toContain("limit");
    expect(mocks.generate).not.toHaveBeenCalled();
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
  it("creates a separate boy version from identical saved scenes once, without replacing girl images", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    await t.mutation(internal.data.saveSearch, { key: "gender-story", result: { careers: [discoveryCareer("Economist")] } });
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["original girl image"])));
    const panels = Array.from({ length: 4 }, (_, i) => ({ time: `${i}:00`, caption: `Task ${i}`, illustration: `Scene ${i}`, storageId }));
    await t.mutation(internal.data.claim, { key: genderStoryKey("Economist", "girl"), title: "Economist", token: "girl", gender: "girl" });
    await t.mutation(internal.data.saveStory, { key: genderStoryKey("Economist", "girl"), token: "girl", status: "ready", panels, raw: JSON.stringify({ imageCharacter: "Original woman" }) });
    mocks.parse.mockResolvedValue({ output_parsed: { age: 30, face: "oval", hair: "short black", clothing: "navy suit", skinTone: "brown" } });
    mocks.generate.mockResolvedValue({ data: [{ b64_json: "dGVzdA==" }] });
    const result = await t.action(api.ai.storyboard, { searchKey: "gender-story", careerIndex: 0, gender: "boy" });
    expect(result.panels.map((p: any) => p.caption)).toEqual(panels.map(p => p.caption));
    expect(result.panels.map((p: any) => p.illustration)).toEqual(panels.map(p => p.illustration));
    expect(result.panels.every((p: any) => p.storageId !== storageId)).toBe(true);
    expect((await t.query(internal.data.getStory, { key: genderStoryKey("Economist", "girl") }))?.panels).toEqual(panels);
    expect(mocks.parse).toHaveBeenCalledTimes(1); expect(mocks.generate).toHaveBeenCalledTimes(4);
    expect(mocks.generate.mock.calls.every(call => call[0].prompt.includes("22-year-old Indian man"))).toBe(true);
    const cached = await t.action(api.ai.storyboard, { searchKey: "gender-story", careerIndex: 0, gender: "boy" });
    expect(cached.path).toBe("storyboard-cache"); expect(mocks.generate).toHaveBeenCalledTimes(4);
    expect((await t.query(api.data.stories, { searchKey: "gender-story", gender: "unspecified" }))[0].panels[0].storageId).toBe(storageId);
  });
});
describe("Explicit storyboard retries", () => {
  it("persists complete provider errors, without scheduling or automatically retrying", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    await t.mutation(internal.data.saveSearch, { key: "retry-errors", result: { careers: [discoveryCareer("Author")] } });
    await t.mutation(internal.data.claim, { key: genderStoryKey("Author", "girl"), title: "Author", token: "seed", gender: "girl" });
    const panels = Array.from({ length: 4 }, (_, i) => ({ caption: `Task ${i + 1}`, illustration: `Scene ${i + 1}` }));
    await t.mutation(internal.data.saveStory, { key: genderStoryKey("Author", "girl"), token: "seed", panels, status: "failed", raw: JSON.stringify({ imageCharacter: "Existing woman" }) });
    const error = Object.assign(new Error("429 rate_limit_exceeded: image requests exceeded the permitted rate; retry only after the next explicit click."), { status: 429, code: "rate_limit_exceeded", type: "rate_limit_error", request_id: "mock-request-429" });
    mocks.generate.mockRejectedValue(error);
    await t.action(api.ai.storyboard, { searchKey: "retry-errors", careerIndex: 0, gender: "girl" });
    const row = await t.query(internal.data.getStory, { key: genderStoryKey("Author", "girl") });
    expect(row?.status).toBe("failed"); expect(row?.lastError).toContain(error.message);
    expect(row?.failureDetails).toHaveLength(4);
    expect(row?.failureDetails?.every(d => d.message === error.message && d.status === 429 && d.code === "rate_limit_exceeded" && d.requestId === "mock-request-429" && d.stack?.includes(error.message))).toBe(true);
    expect(row?.panels.every((p: any) => p.imageErrorDetails.message === error.message)).toBe(true);
    await t.query(api.data.stories, { searchKey: "retry-errors", gender: "girl" });
    await t.query(api.data.stories, { searchKey: "retry-errors", gender: "girl" });
    await expect(t.mutation(api.data.startStories, { searchKey: "retry-errors", careerIndex: 0, gender: "girl" })).rejects.toThrow(/Open A day/);
    expect(mocks.generate).toHaveBeenCalledTimes(8);
    expect(mocks.retryDelay).toHaveBeenCalledTimes(4);
    expect(mocks.retryDelay.mock.calls.every(call => call[0] === 20000)).toBe(true);
    expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
    mkdirSync("artifacts", { recursive: true });
    writeFileSync("artifacts/mock-retry-failure-details.json", JSON.stringify(row?.failureDetails, null, 2));
  });
  it("retries only the three missing Author images and preserves the saved panel and girl/boy cache separation", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    await t.mutation(internal.data.saveSearch, { key: "retry-proof", result: { careers: [discoveryCareer("Author")] } });
    const firstImage = await t.run(ctx => ctx.storage.store(new Blob(["existing girl panel one"])));
    const panels = Array.from({ length: 4 }, (_, i) => ({ time: `${9 + i}:00`, caption: `Saved task ${i + 1}`, illustration: `Saved scene ${i + 1}`, ...(i === 0 ? { storageId: firstImage } : { imageError: "Previous image attempt failed." }) }));
    await t.mutation(internal.data.claim, { key: genderStoryKey("Author", "girl"), title: "Author", token: "seed", gender: "girl" });
    await t.mutation(internal.data.saveStory, { key: genderStoryKey("Author", "girl"), token: "seed", panels, status: "failed", raw: JSON.stringify({ imageCharacter: "Existing woman" }), lastError: "Previous image attempt failed." });
    const before = await t.query(internal.data.getStory, { key: genderStoryKey("Author", "girl") });
    await t.query(api.data.stories, { searchKey: "retry-proof", gender: "girl" });
    expect(mocks.generate).not.toHaveBeenCalled();
    mocks.generate.mockResolvedValue({ data: [{ b64_json: "bW9ja2VkLWltYWdl" }], usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } });
    await t.action(api.ai.storyboard, { searchKey: "retry-proof", careerIndex: 0, gender: "girl" });
    const after = await t.query(internal.data.getStory, { key: genderStoryKey("Author", "girl") });
    expect(after?._id).toBe(before?._id); expect(after?.status).toBe("ready"); expect(after?.panels[0]).toEqual(before?.panels[0]);
    expect(after?.panels.every((p: any) => p.storageId && !p.imageError)).toBe(true);
    expect(after?.panels.map((p: any) => p.caption)).toEqual(before?.panels.map((p: any) => p.caption));
    expect(after?.lastError).toBe(before?.lastError);
    expect(mocks.generate).toHaveBeenCalledTimes(3); expect(mocks.parse).not.toHaveBeenCalled();
    expect((await t.query(api.data.stories, { searchKey: "retry-proof", gender: "boy" }))[0]).toBeNull();
    await t.action(api.ai.storyboard, { searchKey: "retry-proof", careerIndex: 0, gender: "girl" });
    expect(mocks.generate).toHaveBeenCalledTimes(3);
    const mockRows = await t.run(ctx => ctx.db.query("aiCalls").collect());
    expect(mockRows.filter(r => !r.cacheHit).map(r => r.panel)).toEqual([2, 3, 4]);
    expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
    const snapshot = (row: any) => ({ _id: row._id, key: row.key, title: row.title, gender: row.gender, status: row.status, lastError: row.lastError, panels: row.panels });
    mkdirSync("artifacts", { recursive: true });
    writeFileSync("artifacts/mock-retry-proof.json", JSON.stringify({ before: snapshot(before), after: snapshot(after), mockImageRequests: mockRows.filter(r => !r.cacheHit).map(r => ({ panel: r.panel, status: r.status, costINR: r.costINR })), existingPanelPreserved: true, captionsPreserved: true, noScheduledFunctions: true, realCostINR: 0 }, null, 2));
    console.log("MOCK_RETRY_BEFORE " + JSON.stringify(snapshot(before)));
    console.log("MOCK_RETRY_AFTER " + JSON.stringify(snapshot(after)));
    console.log("MOCK_IMAGE_REQUESTS " + JSON.stringify(mockRows.filter(r => !r.cacheHit).map(r => ({ panel: r.panel, status: r.status, costINR: r.costINR }))));
    console.log("MOCK_RETRY_PROOF " + JSON.stringify({ requestedPanels: [2, 3, 4], existingPanelPreserved: true, captionsPreserved: true, noScheduledFunctions: true, realCostINR: 0 }));
  });
  it("stores text-stage failures even when no panels were created", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    await t.mutation(internal.data.saveSearch, { key: "text-failure", result: { careers: [discoveryCareer("Author")] } });
    mocks.parse.mockRejectedValue(new Error("Mock caption response did not satisfy the scene schema."));
    await t.action(api.ai.storyboard, { searchKey: "text-failure", careerIndex: 0, gender: "girl" });
    const key = genderStoryKey("Author", "girl");
    const row = await t.query(internal.data.getStory, { key });
    expect(row?.status).toBe("failed"); expect(row?.lastError).toContain("Mock caption response did not satisfy the scene schema.");
    expect(row?.failureDetails?.[0].stage).toBe("captions"); expect(mocks.generate).not.toHaveBeenCalled();
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


