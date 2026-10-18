/** Tracking is analytics-only. Keeping this permissive lets new attribution fields
 * pass through older clients and servers without breaking the main request. */
export function readTracking(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function trackingString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function trackingBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
