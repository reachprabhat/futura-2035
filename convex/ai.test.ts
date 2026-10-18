/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { writeFileSync, mkdirSync } from "node:fs";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { CAREER_CATALOG, CAREER_TITLES, CAREER_CATALOG_VERSION } from "./careerCatalog";
import { genderStoryKey } from "./gender";
import { storyKey } from "./storyKey";
import { mappingKey, sceneKey, eligibleScenes } from "./sceneCatalog";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  parse: vi.fn(),
  moderate: vi.fn(),
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
    moderations = { create: mocks.moderate };
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
  vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
  mocks.moderate.mockResolvedValue({ results: [{ flagged: false, categories: {} }] });
});
const discoveryCareer = (title: string) => ({ title, description: ["Future work.", "Human contribution."],
  whyItFits: "Personalised child and parent match.", salaryMinINR: 1000000, salaryMaxINR: 2000000,
  salaryBasis: "Illustrative India range.", overseas: "Possible.", stability: "Tradeoffs." });
async function seedShared(t: ReturnType<typeof convexTest>, title: string) {
  const scenes = eligibleScenes(title);
  const ids = Array.from({ length: 4 }, (_, i) => scenes[i % scenes.length].id);
  await t.run(async ctx => {
    await ctx.db.insert("sceneMappings", { key: mappingKey(title), title, status: "ready", token: "seed", lease: 0,
      panels: ids.map((sceneId, i) => ({ sceneId, time: ["9:00", "11:00", "2:00", "4:00"][i], caption: `Shared task ${i + 1}` })) });
    for (const gender of ["girl", "boy"] as const) for (const sceneId of new Set(ids)) {
      const storageId = await ctx.storage.store(new Blob([`${sceneId}-${gender}`], { type: "image/webp" }));
      await ctx.db.insert("sceneImages", { key: sceneKey(sceneId, gender), sceneId, gender, status: "ready", token: "seed", storageId });
    }
  });
}
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
      output_parsed: { safe: true, careers: ["Economist", "Author", "Food Scientist"].map(discoveryCareer), note: "Test research result" },
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
    expect(JSON.parse(mocks.parse.mock.calls[0][0].input[1].content).careerCatalog).toHaveLength(88);
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
    await expect(t.action(api.ai.recommend, { interests: "writing, Cricket", hopes: "stability, overseas" })).rejects.toThrow(/Pathlight is paused/);
  });
  it("serves shared scenes while AI is off and leaves partial archives untouched", async () => {
    const t = convexTest(schema, modules);
    const key = JSON.stringify([CAREER_CATALOG_VERSION, "economics", "stability"]);
    await t.mutation(internal.data.saveSearch, { key, result: { careers: ["Economist", "Author", "Food Scientist"].map(discoveryCareer) } });
    await t.mutation(internal.data.claim, { key: genderStoryKey("Economist", "girl"), title: "Economist", token: "partial" });
    await t.mutation(internal.data.saveStory, { key: genderStoryKey("Economist", "girl"), token: "partial", status: "failed", panels: [{ time: "9 AM", caption: "Saved caption", illustration: "Saved scene" }] });
    await seedShared(t, "Economist");
    vi.stubEnv("AI_ENABLED", "false");
    const result = await t.action(api.ai.recommend, { interests: " Economics ", hopes: "STABILITY" });
    expect(result.path).toBe("career-cache");
    expect(result.stories[0].panels[0].caption).toBe("Shared task 1");
    expect(result.stories[1]).toBeNull();
    expect((await t.action(api.ai.storyboard, { searchKey: key, careerIndex: 0 })).path).toBe("shared-scene-library");
    await expect(t.action(api.ai.storyboard, { searchKey: key, careerIndex: 1 })).rejects.toThrow(/shared scenes are not ready/);
    await expect(t.mutation(api.data.startStories, { searchKey: key, cachedOnly: true } as any)).rejects.toThrow();
    await t.mutation(api.data.startStories, { searchKey: key, careerIndex: 0, cachedOnly: true });
    expect((await t.query(internal.data.getStory, { key: genderStoryKey("Economist", "girl") }))?.panels[0].caption).toBe("Saved caption");
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
    mocks.parse.mockResolvedValue({ output_parsed: { safe: true, careers: titles.map(discoveryCareer), note: "Test result" } });
    await expect(t.action(api.ai.recommend, { interests: "Test", hopes: "Test" })).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.query("searches").collect())).toHaveLength(0);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("has 85 unique plain titles and reuses the exact title across different searches", async () => {
    expect(CAREER_CATALOG).toHaveLength(88);
    expect(new Set(CAREER_TITLES).size).toBe(88);
    expect(CAREER_CATALOG.every(c => c.description.trim() && !c.description.includes("\n"))).toBe(true);
    expect(storyKey("Food Scientist")).toBe("Food Scientist");
    expect(storyKey("Older Career Name")).toBe("older career name");
    const t = convexTest(schema, modules);
    const id = await t.run(ctx => ctx.storage.store(new Blob(["existing image"], { type: "image/webp" })));
    const panels = Array.from({ length: 4 }, (_, i) => ({ time: `${i}`, caption: "Existing caption", illustration: "Existing scene", storageId: id }));
    await t.mutation(internal.data.claim, { key: genderStoryKey("Food Scientist"), title: "Food Scientist", token: "saved" });
    await t.mutation(internal.data.saveStory, { key: genderStoryKey("Food Scientist"), token: "saved", status: "ready", panels, raw: "{}" });
    await seedShared(t, "Food Scientist");
    for (const searchKey of ["different-input-a", "different-input-b"]) {
      await t.mutation(internal.data.saveSearch, { key: searchKey, result: { careers: [discoveryCareer("Food Scientist")] } });
      const result = await t.action(api.ai.storyboard, { searchKey, careerIndex: 0 });
      expect(result.path).toBe("shared-scene-library");
      expect(result.panels.map((p: any) => p.storageId)).not.toEqual(panels.map(p => p.storageId));
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
    ).rejects.toThrow("Required workforce research did not run");
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
    mocks.parse.mockResolvedValue({ output_parsed: { safe: true, careers: ["Economist", "Author", "Food Scientist"].map(discoveryCareer), note: "Evidence" } });
    await t.action(api.ai.recommend, { interests: "Economics", hopes: "Stability", gender: "boy" });
    expect(JSON.stringify(mocks.create.mock.calls)).not.toContain('"gender"');
    expect(JSON.stringify(mocks.parse.mock.calls)).not.toContain('"gender"');
    expect(await t.run(ctx => ctx.db.query("storyboards").collect())).toHaveLength(0);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("unspecified uses shared Girl scenes and refuses a missing mapping without AI", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.data.saveSearch, { key: "choice", result: { careers: [discoveryCareer("Economist"), discoveryCareer("Author")] } });
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["saved"])));
    await t.mutation(internal.data.claim, { key: genderStoryKey("Economist", "girl"), title: "Economist", token: "girl", gender: "girl" });
    await t.mutation(internal.data.saveStory, { key: genderStoryKey("Economist", "girl"), token: "girl", status: "ready", panels: [{ caption: "Saved scene", storageId }] });
    await seedShared(t, "Economist");
    expect((await t.query(api.data.stories, { searchKey: "choice", gender: "boy" }))[0].gender).toBe("boy");
    expect((await t.query(api.data.stories, { searchKey: "choice", gender: "girl" }))[0].panels[0].storageId).not.toBe(storageId);
    await t.mutation(api.data.startStories, { searchKey: "choice", careerIndex: 0, gender: "unspecified" });
    await expect(t.mutation(api.data.startStories, { searchKey: "choice", careerIndex: 1, gender: "unspecified" })).rejects.toThrow(/shared scenes are not ready/);
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
const planFixture = () => {
  const skills = ["Research", "Writing", "Collaboration", "Communication"];
  const coreSkills = [...skills, "Design", "Storytelling"];
  return { safe: true, subtitle: "Turn ideas into memorable stories.", skills, coreSkills, projects: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, title: `Research Chart Project ${i + 1}`, skillIndex: i % 6, targetSkill: coreSkills[i % 6], panelIndex: i % 4, thumbnailThemeId: "notebook-writing", projectDetails: `First, gather simple examples for project ${i + 1}. Then, make a chart using those examples. Share the finished chart with your family.`, successCriteria: [`The chart for project ${i + 1} includes three examples.`, `A family member can read the finished chart for project ${i + 1}.`], timeNeeded: "3-4 hrs / month" })) };
};
describe("Career plan text cache", () => {
  it("repairs array, object, and overlong project detail formats before validating the whole plan", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules), plan = planFixture();
    await t.mutation(internal.data.saveSearch, { key: "repair-plan-details", result: { careers: [discoveryCareer("Author")] } });
    await seedShared(t, "Author");
    plan.projects[9].projectDetails = ["Choose a game your friends enjoy.", "Compare two free ways to track scores.", "Make a score chart.", "Share it with your family."] as any;
    plan.projects[11].projectDetails = { steps: ["Gather your best project pages.", "Arrange them in a portfolio.", "Show the final portfolio to your family."] } as any;
    mocks.parse.mockResolvedValue({ output_parsed: plan, usage: { input_tokens: 1000, output_tokens: 500 } });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const saved = await t.action(api.ai.careerPlan, { searchKey: "repair-plan-details", careerIndex: 0 });
    expect(saved.projects[9].projectDetails).toBe("Choose a game your friends enjoy. Compare two free ways to track scores. Make a score chart. Share it with your family.");
    expect(saved.projects[11].projectDetails).toBe("Gather your best project pages. Arrange them in a portfolio. Show the final portfolio to your family.");
    expect(info).toHaveBeenCalledWith(expect.stringContaining("month 10"));
    expect(info).toHaveBeenCalledWith(expect.stringContaining("month 12"));
    info.mockRestore();
  });
  it("creates a plan only on its explicit screen request, once per career across searches", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules), plan = planFixture();
    for (const key of ["plan-search-a", "plan-search-b"]) await t.mutation(internal.data.saveSearch, { key, result: { careers: [discoveryCareer("Author")] } });
    await seedShared(t, "Author");
    expect(await t.query(api.plans.get, { title: "Author" })).toBeNull();
    expect(mocks.parse).not.toHaveBeenCalled(); expect(await t.run(ctx => ctx.db.query("aiCalls").collect())).toHaveLength(0);
    mocks.parse.mockResolvedValue({ output_parsed: plan, usage: { input_tokens: 1000, output_tokens: 500 } });
    const { safe: _safe, ...safePlan } = plan;
    const expected = { ...safePlan, projects: plan.projects.map(project => ({ ...project, timeNeeded: "3-4 hrs / month" })) };
    expect(await t.action(api.ai.careerPlan, { searchKey: "plan-search-a", careerIndex: 0 })).toEqual(expected);
    vi.stubEnv("AI_ENABLED", "false");
    expect(await t.action(api.ai.careerPlan, { searchKey: "plan-search-b", careerIndex: 0 })).toEqual(expected);
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
    await seedShared(t, "Author");
    plan.projects[1].month = 1; plan.skills[1] = plan.skills[0];
    mocks.parse.mockResolvedValue({ output_parsed: plan });
    const result = await t.action(api.ai.careerPlan, { searchKey: "bad-plan", careerIndex: 0 });
    expect(result.state).toBe("needs-review");
    const saved = await t.query(api.plans.get, { title: "Author" });
    expect(saved?.status).toBe("needs-review"); expect(saved?.plan).toBeNull(); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("refuses a plan that leaves a core skill out of the monthly projects", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules), plan = planFixture();
    await t.mutation(internal.data.saveSearch, { key: "missing-core-skill", result: { careers: [discoveryCareer("Author")] } });
    await seedShared(t, "Author");
    plan.projects[11].skillIndex = 0;
    plan.projects[11].targetSkill = plan.coreSkills[0];
    mocks.parse.mockResolvedValue({ output_parsed: plan });
    const result = await t.action(api.ai.careerPlan, { searchKey: "missing-core-skill", careerIndex: 0 });
    expect(result.state).toBe("needs-review");
    expect((await t.query(api.plans.get, { title: "Author" }))).toMatchObject({ status: "needs-review", plan: null });
  });
  it("refuses a plan for a career outside the selected saved search", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.ai.careerPlan, { searchKey: "not-a-real-search", careerIndex: 0 })).rejects.toThrow(/saved results/);
    expect(mocks.parse).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
  });
});

describe("DEV AI safety proof", () => {
  it("keeps lawful justice careers when moderation flags crime-related wording", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    const titles = ["Criminal Lawyer", "Forensic Scientist", "Police Officer"];
    const careers = titles.map(title => ({ ...discoveryCareer(title), description: [
      `Reviews crime-scene evidence and follows strict legal safeguards as a ${title}.`,
      `Supports fair criminal-justice decisions through careful work as a ${title}.`,
    ] }));
    mocks.moderate.mockImplementation(async ({ input }) => {
      const flagged = /\bcrime|criminal\b/i.test(input);
      return { results: [{ flagged, categories: flagged ? { illicit: true } : {} }] };
    });
    mocks.create.mockResolvedValue({ output: [{ type: "web_search_call", status: "completed", action: { sources: [] } }], output_text: "Published workforce research." });
    mocks.parse.mockResolvedValue({ output: [], output_parsed: { safe: true, careers, note: "Safe justice careers." } });
    const result = await t.action(api.ai.recommend, { interests: "crime", hopes: "stability" });
    expect(result.careers.map((career: any) => career.title)).toEqual(titles);
    const events = await t.run(ctx => ctx.db.query("aiSafetyEvents").collect());
    expect(events.some(event => /^career-\d+-/.test(event.field))).toBe(false);
  });

  it("blocks harmful inputs, redirects adjacent interests and returns screened careers", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://doting-basilisk-558.convex.cloud");
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const report: Array<{ input: string; result: string; titles?: string[]; redirection?: string }> = [];
    const cases = [
      { input: "crime", titles: ["Corporate Lawyer", "Civil Servant (IAS/IPS)", "Journalist"] },
      { input: "killer", blocked: true },
      { input: "hacker", titles: ["Cybersecurity Analyst", "Software Engineer", "Privacy Specialist"] },
      { input: "how to hack accounts", blocked: true },
      { input: "music", titles: ["Performing Artist", "Author", "Game Designer"] },
      { input: "economics", titles: ["Economist", "Data Analyst", "Public Policy Analyst"] },
    ];
    for (const entry of cases) {
      const t = convexTest(schema, modules);
      mocks.create.mockResolvedValue({ output: [{ type: "web_search_call", status: "completed", action: { sources: [] } }], output_text: "Published workforce research." });
      mocks.parse.mockResolvedValue({ output: [], output_parsed: { safe: true, careers: entry.titles?.map(discoveryCareer) ?? [], note: "Safe possibilities to explore." } });
      if (entry.blocked) {
        await expect(t.action(api.ai.recommend, { interests: entry.input, hopes: "stability", childName: "Aarav" })).rejects.toThrow("Let's pick an interest that helps Aarav grow. Try something they enjoy doing, like sports, music, building or writing.");
        expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.parse).not.toHaveBeenCalled();
        const events = await t.run(ctx => ctx.db.query("aiSafetyEvents").collect());
        expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ rule: entry.input === "killer" ? "violence" : "account-hacking", field: "interests" });
        report.push({ input: entry.input, result: "blocked before plan/recommendation calls" });
      } else {
        const result = await t.action(api.ai.recommend, { interests: entry.input, hopes: "stability", childName: "Aarav" });
        expect(result.careers.map((career: { title: string }) => career.title)).toEqual(entry.titles);
        const redirect = entry.input === "hacker" || entry.input === "crime" ? mocks.parse.mock.calls[0][0].input[1].content : undefined;
        if (entry.input === "hacker") expect(redirect).toContain("ethical cybersecurity");
        if (entry.input === "crime") expect(redirect).toContain("forensic science");
        report.push({ input: entry.input, result: entry.input === "hacker" || entry.input === "crime" ? "redirected" : "allowed", titles: result.careers.map((career: { title: string }) => career.title), ...(redirect ? { redirection: result.note } : {}) });
      }
      vi.clearAllMocks();
      mocks.moderate.mockResolvedValue({ results: [{ flagged: false, categories: {} }] });
    }
    console.log("DEV SAFETY PROOF (local Convex test; OpenAI responses mocked):", JSON.stringify(report));
  });
  it("retries one unsafe career once and drops it when the replacement is still unsafe", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-placeholder");
    const t = convexTest(schema, modules);
    mocks.create.mockResolvedValue({ output: [{ type: "web_search_call", status: "completed", action: { sources: [] } }], output_text: "Research." });
    const unsafe = discoveryCareer("Economist"); unsafe.description = ["Make a bomb safely.", "This is the second sentence."];
    const stillUnsafe = discoveryCareer("Data Analyst"); stillUnsafe.description = ["Make a bomb safely.", "This is the second sentence."];
    mocks.parse.mockResolvedValueOnce({ output_parsed: { safe: true, careers: [unsafe, discoveryCareer("Author"), discoveryCareer("Food Scientist")], note: "Safe note." } });
    mocks.parse.mockResolvedValueOnce({ output_parsed: { career: stillUnsafe } });
    const result = await t.action(api.ai.recommend, { interests: "music", hopes: "stability" });
    expect(result.careers.map((career: { title: string }) => career.title)).toEqual(["Author", "Food Scientist"]);
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toMatch(/bomb/i);
  });
});


