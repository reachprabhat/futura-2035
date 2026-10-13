import type { QueryCtx } from "./_generated/server";

export const PAUSED_MESSAGE = "Futura is paused for a moment, please try again later";
export function istToday(now = Date.now()) {
  const day = new Date(now + 19800000).toISOString().slice(0, 10);
  const start = Date.parse(`${day}T00:00:00+05:30`);
  return { day, start, end: start + 86400000 };
}
export function callCap() {
  const value = Number(process.env.AI_DAILY_CALL_CAP ?? 300);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
export function costCap() {
  const value = Number(process.env.DAILY_COST_CAP_INR ?? 200);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
// Budget estimates for our current bounded requests, not claimed invoice amounts.
// Unknown costs retain their estimate; pending calls reserve it atomically.
export function estimateINR(model: string) { return model === "gpt-image-1" ? 20 : 5; }
export async function todayControls(ctx: Pick<QueryCtx, "db">) {
  const { day, start, end } = istToday();
  let spendINR = 0, estimatedSpendINR = 0, callCount = 0, unknownCosts = 0;
  for await (const row of ctx.db.query("aiCalls").withIndex("by_cache_timestamp", q =>
    q.eq("cacheHit", false).gte("timestamp", start).lt("timestamp", end))) {
    callCount++;
    spendINR += row.costINR ?? 0;
    estimatedSpendINR += row.costINR ?? estimateINR(row.model);
    if (row.costINR === null) unknownCosts++;
  }
  const usage = await ctx.db.query("usage").withIndex("by_day", q => q.eq("day", day)).unique();
  callCount = Math.max(callCount, usage?.calls ?? 0);
  return { day, timezone: "Asia/Kolkata", spendINR, estimatedSpendINR, unknownCosts,
    callCount, dailyCallCap: callCap(), dailyCostCapINR: costCap(), aiEnabled: process.env.AI_ENABLED === "true" };
}
