import { expect, it } from "vitest";
import { buildFunnelMath, type FunnelEvent } from "./funnelMath";

it("keeps each funnel step within its previous completed cohort", () => {
  const events: FunnelEvent[] = [
    { visitorId: "one", entryPath: "Search", event: "landing-view", createdAt: 1 },
    { visitorId: "one", entryPath: "Search", event: "career-search", createdAt: 2 },
    { visitorId: "one", entryPath: "Search", event: "career-opened", createdAt: 3 },
    { visitorId: "two", entryPath: "Search", event: "landing-view", createdAt: 1 },
    { visitorId: "two", entryPath: "Search", event: "career-opened", createdAt: 3 },
  ];
  const rows = buildFunnelMath(events).funnels.Search;
  expect(rows.map(row => row.visitors)).toEqual([2, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
  expect(rows.every(row => row.dropPercent >= 0)).toBe(true);
});

it("counts a repeated step once per visitor and reports the furthest completed step", () => {
  const events: FunnelEvent[] = [
    { visitorId: "repeat", entryPath: "Example", event: "landing-view", createdAt: 1 },
    { visitorId: "repeat", entryPath: "Example", event: "example-viewed", createdAt: 2 },
    { visitorId: "repeat", entryPath: "Example", event: "example-viewed", createdAt: 3 },
    { visitorId: "repeat", entryPath: "Example", event: "career-opened", createdAt: 4 },
  ];
  const result = buildFunnelMath(events);
  expect(result.funnels.Example.map(row => row.visitors)).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
  expect(result.visitors).toEqual([{ visitorId: "repeat", furthestStep: "Career opened", entryPath: "Example", device: "Unknown" }]);
  expect(result.stopped).toEqual([{ entryPath: "Example", step: "Career opened", visitors: 1 }]);
});
