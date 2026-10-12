import { convexTest } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const mocks = vi.hoisted(() => ({ parse: vi.fn(), generate: vi.fn() }));
vi.mock("openai", () => {
  class FakeOpenAI {
    responses = { parse: mocks.parse };
    images = { generate: mocks.generate };
    static APIError = class extends Error {
      status = 500;
    };
  }
  return { default: FakeOpenAI };
});
const modules = import.meta.glob("./**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("Storyboard recovery through the action", () => {
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
    mocks.parse.mockResolvedValue({ output_parsed: scenes });
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
    expect(mocks.parse).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledTimes(4);
    mocks.generate.mockResolvedValue({ data: [{ b64_json: "dGVzdA==" }] });
    const retry = await t.action(api.ai.storyboard, {
      searchKey: "test-search",
      careerIndex: 0,
    });
    expect(retry.path).toBe("openai-image-retry");
    expect(retry.panels.every((p: any) => p.storageId && p.imageUrl)).toBe(
      true,
    );
    expect(mocks.parse).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledTimes(8);
    const cached = await t.action(api.ai.storyboard, {
      searchKey: "test-search",
      careerIndex: 0,
    });
    expect(cached.path).toBe("storyboard-cache");
    expect(mocks.generate).toHaveBeenCalledTimes(8);
    const used = await t.run((ctx) => ctx.db.query("usage").collect());
    expect(used[0].calls).toBe(9);
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
