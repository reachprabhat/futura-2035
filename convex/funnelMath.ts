export type Path = "Example" | "Search" | "Unknown";
export type FunnelEvent = { event: string; visitorId: string; createdAt: number; entryPath?: Path; career?: string; device?: "mobile" | "desktop"; paymentMode?: "free_preview" | "paid" };
export const funnelOrder = [
  { key: "landing-view", label: "Landing view" },
  { key: "branch", label: "Example possibilities viewed / Career search" },
  { key: "career-opened", label: "Career opened" },
  { key: "day-viewed", label: "Day in the life viewed" },
  { key: "plan-preview-viewed", label: "Plan preview (Month 1) viewed" },
  { key: "locked-card-view", label: "Locked card viewed" },
  { key: "pay-tap", label: "Make Payment tap" },
  { key: "full-plan-shown", label: "Full plan shown" },
  { key: "pdf-download", label: "PDF download" },
  { key: "whatsapp-share", label: "WhatsApp share" },
] as const;

function first(rows: FunnelEvent[], event: string) {
  return rows.filter(row => row.event === event).sort((a, b) => a.createdAt - b.createdAt)[0];
}
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}
function inferredPath(rows: FunnelEvent[]): Path {
  const initial = first(rows, "landing-view")?.entryPath;
  if (initial && initial !== "Unknown") return initial;
  const example = first(rows, "example-viewed"), search = first(rows, "career-search");
  if (example && (!search || example.createdAt <= search.createdAt)) return "Example";
  if (search) return "Search";
  return "Unknown";
}
function selectedEvent(rows: FunnelEvent[], index: number, path?: "Example" | "Search") {
  if (index !== 1) return first(rows, funnelOrder[index].key);
  if (path === "Example") return first(rows, "example-viewed");
  if (path === "Search") return first(rows, "career-search");
  return first(rows, "example-viewed") ?? first(rows, "career-search");
}
function rowsFor(events: FunnelEvent[], path?: "Example" | "Search") {
  const groups = new Map<string, FunnelEvent[]>();
  for (const event of events) {
    const group = groups.get(event.visitorId) ?? [];
    group.push(event);
    groups.set(event.visitorId, group);
  }
  return [...groups].filter(([, rows]) => !path || inferredPath(rows) === path);
}
function makePath(events: FunnelEvent[], path?: "Example" | "Search") {
  const groups = rowsFor(events, path);
  const reachedBefore = new Set<string>();
  return funnelOrder.map((step, index) => {
    const reachedNow = new Set<string>(), times: number[] = [];
    for (const [visitorId, rows] of groups) {
      const current = selectedEvent(rows, index, path);
      if (!current || (index > 0 && !reachedBefore.has(visitorId))) continue;
      reachedNow.add(visitorId);
      if (index > 0) {
        const previous = selectedEvent(rows, index - 1, path);
        if (previous) times.push(Math.max(0, current.createdAt - previous.createdAt));
      }
    }
    const previousCount = index === 0 ? reachedNow.size : reachedBefore.size;
    const startCount = groups.filter(([, rows]) => Boolean(first(rows, "landing-view"))).length;
    const visitors = reachedNow.size;
    const result = {
      event: step.key, label: step.label, visitors,
      percentStart: index === 0 ? (visitors ? 100 : 0) : startCount ? Math.round(visitors / startCount * 100) : 0,
      dropPercent: index === 0 || previousCount === 0 ? 0 : Math.max(0, Math.round((previousCount - visitors) / previousCount * 100)),
      medianMs: median(times),
    };
    reachedBefore.clear();
    for (const visitorId of reachedNow) reachedBefore.add(visitorId);
    return result;
  });
}
function furthest(rows: FunnelEvent[]) {
  const path = inferredPath(rows), branch = path === "Example" ? "example-viewed" : path === "Search" ? "career-search" : "example-viewed";
  let last = -1;
  for (let index = 0; index < funnelOrder.length; index++) {
    const event = index === 1 ? first(rows, branch) : first(rows, funnelOrder[index].key);
    if (!event) break;
    last = index;
  }
  return last;
}
export function buildFunnelMath(events: FunnelEvent[]) {
  const people = rowsFor(events);
  const stopped = new Map<string, number>();
  for (const [, rows] of people) {
    const index = furthest(rows);
    if (index >= 0) {
      const path = inferredPath(rows), label = index === 1 ? path === "Example" ? "Example possibilities viewed" : path === "Search" ? "Career search" : funnelOrder[0].label : funnelOrder[index].label, key = path + "|" + label;
      stopped.set(key, (stopped.get(key) ?? 0) + 1);
    }
  }
  const combined = makePath(events);
  return {
    funnels: { Example: makePath(events, "Example"), Search: makePath(events, "Search"), combined },
    stopped: [...stopped].map(([key, visitors]) => { const [entryPath, step] = key.split("|"); return { entryPath, step, visitors }; }),
    visitors: people.map(([visitorId, rows]) => {
      const end = furthest(rows), path = inferredPath(rows);
      return { visitorId, furthestStep: end < 0 ? "No funnel step" : funnelOrder[end].label, entryPath: path, device: rows.find(row => row.device)?.device ?? "Unknown" };
    }),
  };
}
