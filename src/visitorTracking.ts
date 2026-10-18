const visitorStorageKey = "pathlight-visitor-id";
const testStorageKey = "pathlight-this-browser-is-me";
const attributionStorageKey = "pathlight-visitor-attribution";
const ageStorageKey = "pathlight-visitor-age";

type VisitorAttribution = { ref?: string; referrerDomain?: string };
export type VisitorAge = 13 | 14 | 15 | 16;

export function getVisitorId() {
  let id = localStorage.getItem(visitorStorageKey);
  if (!id) {
    id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(visitorStorageKey, id);
  }
  return id;
}

export function visitorTracking() {
  const visitorId = getVisitorId();
  let attribution: VisitorAttribution = {};
  try { attribution = JSON.parse(localStorage.getItem(attributionStorageKey) ?? "{}"); } catch { attribution = {}; }
  const queryRef = new URLSearchParams(window.location.search).get("ref");
  if (!attribution.ref && queryRef && /^[\w-]{1,80}$/.test(queryRef)) attribution.ref = queryRef;
  if (!attribution.referrerDomain && document.referrer) {
    try { attribution.referrerDomain = new URL(document.referrer).hostname; } catch { /* Ignore malformed referrers. */ }
  }
  localStorage.setItem(attributionStorageKey, JSON.stringify(attribution));
  return { visitorId, ...attribution, isTest: localStorage.getItem(testStorageKey) === "true", device: window.matchMedia("(max-width: 767px)").matches ? "mobile" as const : "desktop" as const };
}

export function getVisitorAge(): VisitorAge | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(ageStorageKey) ?? "null") as { visitorId?: string; age?: number } | null;
    const visitorId = localStorage.getItem(visitorStorageKey);
    return saved?.visitorId === visitorId && [13, 14, 15, 16].includes(saved.age ?? 0) ? saved.age as VisitorAge : undefined;
  } catch { return undefined; }
}

export function setVisitorAge(age: VisitorAge) {
  localStorage.setItem(ageStorageKey, JSON.stringify({ visitorId: getVisitorId(), age }));
}

export function analyticsTracking() {
  const age = getVisitorAge();
  return { ...visitorTracking(), ...(age ? { age } : {}) };
}

export function thisBrowserIsMe() {
  return localStorage.getItem(testStorageKey) === "true";
}

export function setThisBrowserIsMe(value: boolean) {
  localStorage.setItem(testStorageKey, String(value));
  window.dispatchEvent(new CustomEvent("pathlight-test-mode", { detail: value }));
}

export function lockedMessageForCareer(message: string, career: string, price: number) {
  const name = career.replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, "").trim();
  const firstWord = name.split(/\s+/)[0] ?? "career";
  const article = /^(?:[aeiou]|honest|hour|heir|mba|msc|fbi|ias|x-ray)/i.test(firstWord) ? "an" : "a";
  return message.replace(/\b(?:a|an)\s+\{career\}|\{career\}/gi, `${article} ${name}`).replaceAll("{price}", `\u20B9${price}`);
}
