import { describe, expect, it } from "vitest";
import { displayAiText } from "../src/displayText";

describe("displayAiText", () => {
  it("uses the 2030s after common prepositions", () => {
    expect(displayAiText("In 2035, x")).toBe("In the 2030s, x");
    expect(displayAiText("by 2035")).toBe("by the 2030s");
    expect(displayAiText("by the 2035")).toBe("by the 2030s");
  });

  it("keeps the grammar clean when old text already says 'the'", () => {
    expect(displayAiText("the 2035 job market")).toBe("the 2030s job market");
    expect(displayAiText("The 2035 job market")).toBe("The 2030s job market");
    expect(displayAiText("in the 2035")).toBe("in the 2030s");
    expect(displayAiText("the the 2035")).toBe("the 2030s");
    expect(displayAiText("In the 2030s, x")).toBe("In the 2030s, x");
  });
});
