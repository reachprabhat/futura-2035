/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, afterEach, vi } from "vitest";
import schema from "./schema";
import { internal, api } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());
describe("AI limits and reusable storyboards", () => {
  it("counts simultaneous reservations and refuses requests beyond the daily cap", async () => {
    vi.stubEnv("AI_DAILY_CALL_CAP", "3");
    const t = convexTest(schema, modules);
    const reservations = await Promise.allSettled(
      Array.from({ length: 8 }, () => t.mutation(internal.data.reserve, {})),
    );
    expect(reservations.filter((r) => r.status === "fulfilled")).toHaveLength(
      3,
    );
    expect(reservations.filter((r) => r.status === "rejected")).toHaveLength(5);
    const rows = await t.run((ctx) => ctx.db.query("usage").collect());
    expect(rows[0].calls).toBe(3);
  });
  it("resets the daily allowance on a new UTC day", async () => {
    vi.stubEnv("AI_DAILY_CALL_CAP", "1");
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("usage", { day: "2000-01-01", calls: 100 }),
    );
    await expect(t.mutation(internal.data.reserve, {})).resolves.toBeNull();
    await expect(t.mutation(internal.data.reserve, {})).rejects.toThrow(
      /limit/,
    );
  });
  it("allows only one active illustrator and rejects stale writes", async () => {
    const t = convexTest(schema, modules),
      args = { key: "test career", title: "Test Career" };
    expect(
      (await t.mutation(internal.data.claim, { ...args, token: "first" }))
        .state,
    ).toBe("claimed");
    expect(
      (await t.mutation(internal.data.claim, { ...args, token: "second" }))
        .state,
    ).toBe("busy");
    await t.mutation(internal.data.saveStory, {
      key: args.key,
      token: "second",
      status: "ready",
      panels: [],
    });
    expect(
      (await t.query(internal.data.getStory, { key: args.key }))?.status,
    ).toBe("generating");
    await t.mutation(internal.data.saveStory, {
      key: args.key,
      token: "first",
      status: "generating",
      panels: [{ caption: "Saved caption" }],
    });
    expect(
      (await t.mutation(internal.data.claim, { ...args, token: "third" }))
        .state,
    ).toBe("busy");
  });
  it("reuses completed storyboards and preserves captions on failed image retries", async () => {
    const t = convexTest(schema, modules),
      args = { key: "test career", title: "Test Career" };
    await t.mutation(internal.data.claim, { ...args, token: "first" });
    await t.mutation(internal.data.saveStory, {
      key: args.key,
      token: "first",
      status: "failed",
      panels: [{ caption: "Saved caption" }],
      raw: "raw scene output",
    });
    const retry = await t.mutation(internal.data.claim, {
      ...args,
      token: "retry",
    });
    expect(retry.state).toBe("claimed");
    expect(retry.row.panels[0].caption).toBe("Saved caption");
    await t.mutation(internal.data.saveStory, {
      key: args.key,
      token: "retry",
      status: "ready",
      panels: retry.row.panels,
    });
    expect(
      (await t.mutation(internal.data.claim, { ...args, token: "again" }))
        .state,
    ).toBe("cached");
  });
  it("refuses a career that did not come from an AI recommendation", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.ai.storyboard, { searchKey: "invented", careerIndex: 0 }),
    ).rejects.toThrow(/Choose a career/);
  });
});
