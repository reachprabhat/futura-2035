import { describe, expect, it } from "vitest";
import { GENERAL_PLAN_THUMBNAIL, resolveThumbnailTheme } from "../src/thumbnailResolution";

const available = new Set(["laptop-charts", "interview", "reading-research", GENERAL_PLAN_THUMBNAIL]);

describe("resolveThumbnailTheme", () => {
  it("keeps a valid project theme ahead of the skill theme", () => {
    expect(resolveThumbnailTheme("laptop-charts", "Stakeholder Communication", available)).toBe("laptop-charts");
  });

  it("uses the target skill theme when the project theme is absent or unavailable", () => {
    expect(resolveThumbnailTheme(undefined, "Stakeholder Communication", available)).toBe("interview");
    expect(resolveThumbnailTheme("removed-theme", "Research", available)).toBe("reading-research");
  });

  it("uses the general library default when no skill theme is known", () => {
    expect(resolveThumbnailTheme(undefined, "Unmapped skill", available)).toBe(GENERAL_PLAN_THUMBNAIL);
  });
});
