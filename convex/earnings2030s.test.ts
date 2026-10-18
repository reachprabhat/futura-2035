import { describe, expect, it } from "vitest";
import { calculateEarnings2030s, formatINRRange } from "./earnings2030s";

describe("2030s earnings estimates", () => {
  it("grows stored ranges, adjusts demand, rounds to ₹50,000 and formats Indian currency", () => {
    const estimate = calculateEarnings2030s(1_000_000, 2_000_000, 10, "AI increases demand for data-led advice.");
    expect(estimate.low % 50_000).toBe(0);
    expect(estimate.high % 50_000).toBe(0);
    expect(estimate.basis).toContain("grown at 8%/yr, +10% as AI changes demand");
    expect(formatINRRange(estimate.low, estimate.high)).toMatch(/^₹[\d,]+–₹[\d,]+$/);
  });
  it("rejects invalid ranges, excessive adjustments and non-INR currencies", () => {
    expect(() => calculateEarnings2030s(100, 90, 0, "Reason.")).toThrow();
    expect(() => calculateEarnings2030s(100, 200, 31, "Reason.")).toThrow();
    expect(() => calculateEarnings2030s(100, 200, 0, "Demand rises in USD.")).toThrow();
  });
});
