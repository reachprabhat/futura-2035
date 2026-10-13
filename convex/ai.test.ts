/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { CAREER_CATALOG, CAREER_TITLES, CAREER_CATALOG_VERSION } from "./careerCatalog";
import { storyKey } from "./storyKey";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  parse: vi.fn(),
  generate: vi.fn(),
}));
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
    expect(JSON.parse(mocks.parse.mock.calls[0][0].input[1].content).careerCatalog).toHaveLength(80);
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
    await t.mutation(internal.data.claim, { key: "Economist", title: "Economist", token: "partial" });
    await t.mutation(internal.data.saveStory, { key: "Economist", token: "partial", status: "failed", panels: [{ time: "9 AM", caption: "Saved caption", illustration: "Saved scene" }] });
    vi.stubEnv("AI_ENABLED", "false");
    const result = await t.action(api.ai.recommend, { interests: " Economics ", hopes: "STABILITY" });
    expect(result.path).toBe("career-cache");
    expect(result.stories[0].panels[0].caption).toBe("Saved caption");
    expect(result.stories[1]).toBeNull();
    expect((await t.action(api.ai.storyboard, { searchKey: key, careerIndex: 0 })).path).toBe("storyboard-cache");
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
  it("has 80 unique plain titles and reuses the exact title across different searches", async () => {
    expect(CAREER_CATALOG).toHaveLength(80);
    expect(new Set(CAREER_TITLES).size).toBe(80);
    expect(CAREER_CATALOG.every(c => c.description.trim() && !c.description.includes("\n"))).toBe(true);
    expect(storyKey("Food Scientist")).toBe("Food Scientist");
    expect(storyKey("Older Career Name")).toBe("older career name");
    const t = convexTest(schema, modules);
    const id = await t.run(ctx => ctx.storage.store(new Blob(["existing image"], { type: "image/webp" })));
    const panels = Array.from({ length: 4 }, (_, i) => ({ time: `${i}`, caption: "Existing caption", illustration: "Existing scene", storageId: id }));
    await t.mutation(internal.data.claim, { key: "Food Scientist", title: "Food Scientist", token: "saved" });
    await t.mutation(internal.data.saveStory, { key: "Food Scientist", token: "saved", status: "ready", panels, raw: "{}" });
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
        "simple flat illustration, soft muted colours, clean lines, one or two people per panel, plain background, no detailed screens",
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
  it("starts every image before any completes and publishes each result immediately", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    await t.mutation(internal.data.saveSearch, { key: "parallel", result: { careers: [{ title: "Parallel Career" }] } });
    await t.mutation(internal.data.claim, { key: "parallel career", title: "Parallel Career", token: "prep" });
    await t.mutation(internal.data.saveStory, { key: "parallel career", token: "prep", status: "prepared",
      raw: JSON.stringify({ imageCharacter: "Fixed existing character" }),
      panels: Array.from({ length: 4 }, (_, i) => ({ time: `${i}`, caption: `Existing caption ${i}`, illustration: "Existing scene" })) });
    const resolvers: ((value: any) => void)[] = [];
    mocks.generate.mockImplementation(() => new Promise(resolve => resolvers.push(resolve)));
    const run = t.action(api.ai.storyboard, { searchKey: "parallel", careerIndex: 0 });
    for (let i = 0; i < 100 && resolvers.length < 4; i++) await new Promise(r => setTimeout(r, 1));
    expect(resolvers).toHaveLength(4);
    const image = { data: [{ b64_json: "dGVzdA==" }], usage: { input_tokens: 20, input_tokens_details: { text_tokens: 20, image_tokens: 0 }, output_tokens: 4160, total_tokens: 4180 } };
    resolvers[2](image);
    let partial: any;
    for (let i = 0; i < 100; i++) {
      partial = await t.query(internal.data.getStory, { key: "parallel career" });
      if (partial.panels[2].storageId) break;
      await new Promise(r => setTimeout(r, 1));
    }
    expect(partial.panels.filter((p: any) => p.storageId)).toHaveLength(1);
    expect(partial.status).toBe("generating");
    resolvers[0](image); resolvers[1](image); resolvers[3](image);
    await run;
    const final = await t.query(internal.data.getStory, { key: "parallel career" });
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
