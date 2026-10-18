const MIN_PLAN_HOURS = 3;
const MAX_PLAN_HOURS = 8;

export function normalizePlanTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const range = value.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  const single = range ? null : value.match(/\d+(?:\.\d+)?/);
  if (!range && !single) return null;

  const values = range ? [Number(range[1]), Number(range[2])] : [Number(single![0]), Number(single![0])];
  if (values.some(number => !Number.isFinite(number))) return null;
  const clamp = (number: number) => Math.max(MIN_PLAN_HOURS, Math.min(MAX_PLAN_HOURS, number));
  const [start, end] = values.map(clamp).sort((a, b) => a - b);
  return `${start}-${end} hrs / month`;
}
