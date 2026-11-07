const attemptsKey = "pathlight-admin-attempts";
const rememberedKey = "pathlight-admin-remembered";
const lockDuration = 15 * 60 * 1000;
const rememberDuration = 30 * 24 * 60 * 60 * 1000;
export function adminLockRemaining() {
  try { const record = JSON.parse(localStorage.getItem(attemptsKey) ?? "{}") as { until?: number }; return Math.max(0, (record.until ?? 0) - Date.now()); } catch { return 0; }
}
export function recordAdminFailure() {
  try {
    localStorage.removeItem(rememberedKey);
    const record = JSON.parse(localStorage.getItem(attemptsKey) ?? "{}") as { count?: number; until?: number };
    if ((record.until ?? 0) > Date.now()) return;
    const count = (record.count ?? 0) + 1;
    localStorage.setItem(attemptsKey, JSON.stringify(count >= 5 ? { count: 0, until: Date.now() + lockDuration } : { count }));
  } catch { /* Browser storage can be disabled. */ }
}
export function adminAttemptsLeft() {
  try { const record = JSON.parse(localStorage.getItem(attemptsKey) ?? "{}") as { count?: number }; return Math.max(0, 5 - (record.count ?? 0)); } catch { return 5; }
}
export function rememberedAdminKey() {
  try { const record = JSON.parse(localStorage.getItem(rememberedKey) ?? "null") as { key?: string; expires?: number } | null; if (record && (record.expires ?? 0) > Date.now()) return record.key ?? ""; localStorage.removeItem(rememberedKey); } catch { /* Browser storage can be disabled. */ }
  return "";
}
export function saveAdminSession(key: string, keep: boolean) {
  if (keep) localStorage.setItem(rememberedKey, JSON.stringify({ key, expires: Date.now() + rememberDuration }));
  else localStorage.removeItem(rememberedKey);
}
