export const NOMINAL_SALARY_GROWTH_RATE = 0.08;
export const SALARY_BASE_YEAR = 2026;
export const SALARY_ESTIMATE_YEAR = 2032;
export const EARNINGS_ROUNDING_STEP_INR = 50_000;

export type Earnings2030sEstimate = {
  low: number;
  high: number;
  adjustmentPercent: number;
  reason: string;
  basis: string;
};

export function calculateEarnings2030s(baseLow: number, baseHigh: number, adjustmentPercent: number, reason: string, baselineSource: "stored" | "ai-estimated" = "stored"): Earnings2030sEstimate {
  if (!Number.isFinite(baseLow) || !Number.isFinite(baseHigh) || baseLow <= 0 || baseHigh <= baseLow) throw new Error("The stored 2026 salary range is invalid.");
  if (!Number.isFinite(adjustmentPercent) || adjustmentPercent < -30 || adjustmentPercent > 30) throw new Error("The AI demand adjustment must be between -30% and +30%.");
  const cleanedReason = reason.replace(/\s+/g, " ").trim();
  if (!cleanedReason || /(?:\$|\b(?:USD|EUR|GBP|dollars?|euros?|pounds?)\b)/i.test(cleanedReason)) throw new Error("The AI reason must be one line and contain no non-INR currency.");
  const growth = (1 + NOMINAL_SALARY_GROWTH_RATE) ** (SALARY_ESTIMATE_YEAR - SALARY_BASE_YEAR);
  const multiplier = growth * (1 + adjustmentPercent / 100);
  const round = (value: number) => Math.round(value / EARNINGS_ROUNDING_STEP_INR) * EARNINGS_ROUNDING_STEP_INR;
  const unroundedLow = baseLow * multiplier;
  const unroundedHigh = baseHigh * multiplier;
  const low = round(unroundedLow);
  const high = round(unroundedHigh);
  if (low >= high) throw new Error("The estimated low must be below the high.");
  const allowedRangeRatio = Math.min(baseHigh / baseLow, 8);
  if (unroundedHigh > unroundedLow * allowedRangeRatio + 1e-7 || high > low * 8) throw new Error("The estimated range must not exceed the 2026 range ratio or the 8× cap.");
  const direction = adjustmentPercent > 0 ? `+${adjustmentPercent}%` : `${adjustmentPercent}%`;
  const baseDescription = baselineSource === "ai-estimated" ? "AI-estimated 2026 Indian metro range" : "2026 stored India range";
  const basis = `${baseDescription} grown at ${Math.round(NOMINAL_SALARY_GROWTH_RATE * 100)}%/yr, ${direction} as AI changes demand: ${cleanedReason}`;
  return { low, high, adjustmentPercent, reason: cleanedReason, basis };
}

export function formatINRRange(low: number, high: number): string {
  const format = (value: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;
  return `${format(low)}–${format(high)}`;
}
