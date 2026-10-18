import React, { Component, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { displayAiText } from "./displayText";
import BrandLogo from "./BrandLogo";
import "./plan-admin.css";
import { setThisBrowserIsMe, thisBrowserIsMe } from "./visitorTracking";

type Step = { event: string; label: string; visitors: number; percentStart: number; dropPercent: number; medianMs: number | null };
type TimelineRow = { event: string; visitorId: string; isTest: boolean; createdAt: number; career?: string; amount?: number; paymentMode?: string; device?: string; entryPath?: string; ref?: string };
type VisitorRow = { visitorId: string; firstSeen: number; careersOpened: string[]; furthestStep: string; entryPath: string; device: string; paid: boolean; aiCalls: number; aiCost: number; timeline: TimelineRow[] };
type VisitorSummary = { visitorId: string; ref: string; firstSeen: number; lastSeen: number; device: string; furthestStep: string; paid: boolean };
type AnalyticsData = { funnels: { Example: Step[]; Search: Step[]; combined: Step[] }; stopped: { entryPath: string; step: string; visitors: number }[]; visitors: VisitorRow[]; visitorSummaries: VisitorSummary[]; untaggedCount: number; refs: string[]; topCareers: { career: string; opens: number }[]; paymentTapsByCareer: { career: string; taps: number }[]; careers: string[]; totals: { visitors: number; aiCalls: number; aiCost: number; averagePerVisitor: number; averagePerPayingParent: number; payingParents: number; revenue: number }; truncated: boolean };
const dateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function csv(name: string, rows: string[][]) {
  const content = rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
const when = (time: number) => new Date(time).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const rupees = (amount: number) => `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const duration = (ms: number | null) => ms === null ? "—" : ms < 60000 ? `${Math.round(ms / 1000)} sec` : ms < 3600000 ? `${Math.round(ms / 60000)} min` : `${(ms / 3600000).toFixed(1)} hr`;
function deploymentName() {
  try { return new URL(import.meta.env.VITE_CONVEX_URL).hostname.split(".")[0].toUpperCase(); } catch { return "DEPLOYMENT UNKNOWN"; }
}
function FunnelTable({ title, rows }: { title: string; rows: Step[] }) {
  return <section className="analytics-funnel-panel"><h3>{title}</h3><table className="analytics-table"><thead><tr><th>Step</th><th>Visitors</th><th>% start</th><th>% drop</th><th>Median from previous</th></tr></thead><tbody>{rows.map((row, index) => { const label = index === 1 ? title === "Example path" ? "Example possibilities viewed" : title === "Search path" ? "Career search" : "Example view or career search" : row.label; return <tr key={row.event}><th>{index + 1}. {label}</th><td>{row.visitors}</td><td>{row.percentStart}%</td><td>{index ? `${row.dropPercent}%` : "—"}</td><td>{duration(row.medianMs)}</td></tr>; })}</tbody></table></section>;
}
function AnalyticsReport({ adminKey }: { adminKey: string }) {
  const now = new Date(), earlier = new Date(now); earlier.setDate(now.getDate() - 30);
  const [startDate, setStartDate] = useState(dateInput(earlier)), [endDate, setEndDate] = useState(dateInput(now));
  const [includeTest, setIncludeTest] = useState(false), [isMe, setIsMe] = useState(thisBrowserIsMe()), [career, setCareer] = useState(""), [device, setDevice] = useState(""), [ref, setRef] = useState("");
  const start = new Date(`${startDate}T00:00:00`).getTime(), end = new Date(`${endDate}T23:59:59.999`).getTime();
  const args = Number.isFinite(start) && Number.isFinite(end) && start <= end ? { adminKey, start, end, includeTest, ...(career ? { career } : {}), ...(device ? { device: device as "mobile" | "desktop" } : {}), ...(ref ? { ref } : {}) } : "skip";
  const data = useQuery(api.planUnlocks.analyticsFunnel, args) as AnalyticsData | undefined;
  if (!data) return <p role="status">Loading visitor analytics…</p>;
  const exportFunnel = () => csv("pathlight-funnel.csv", [["Entry path", "Step", "Visitors", "% of start", "% drop", "Median time from previous step"], ...([ ["Example", data.funnels.Example], ["Search", data.funnels.Search], ["Combined", data.funnels.combined] ] as [string, Step[]][]).flatMap(([path, rows]) => rows.map(row => [path, row.label, String(row.visitors), String(row.percentStart), String(row.dropPercent), duration(row.medianMs)]))]);
  const exportVisitors = () => csv("pathlight-visitors.csv", [["Visitor ID", "Ref", "First seen", "Careers opened", "Furthest step", "Entry path", "Device", "Paid", "AI calls", "AI cost (INR)"], ...data.visitors.map(row => [row.visitorId, data.visitorSummaries.find(item => item.visitorId === row.visitorId)?.ref ?? "", when(row.firstSeen), row.careersOpened.map(displayAiText).join("; "), row.furthestStep, row.entryPath, row.device, row.paid ? "yes" : "no", String(row.aiCalls), String(row.aiCost)])]);
  const exportCareers = () => csv("pathlight-top-careers.csv", [["Career", "Unique opens"], ...data.topCareers.map(row => [displayAiText(row.career), String(row.opens)])]);
  const exportTimeline = () => csv("pathlight-timelines.csv", [["Visitor ID", "Ref", "Time", "Event", "Career", "Entry path", "Device", "Payment mode", "Amount (INR)"], ...data.visitors.flatMap(visitor => visitor.timeline.map(row => [visitor.visitorId, row.ref ?? data.visitorSummaries.find(item => item.visitorId === visitor.visitorId)?.ref ?? "", when(row.createdAt), row.event, displayAiText(row.career ?? ""), row.entryPath ?? visitor.entryPath, row.device ?? visitor.device, row.paymentMode ?? "", row.amount === undefined ? "" : String(row.amount)]))]);
  return <>
    <div className="plan-admin-top"><BrandLogo /><span className="plan-admin-badge">ADMIN · {deploymentName()}</span><a className="plan-admin-link" href="/admin">Plan payments</a></div>
    <h1>Visitor analytics</h1>
    <div className="analytics-controls">
      <label>From <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
      <label>To <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      <label>Career <select value={career} onChange={event => setCareer(event.target.value)}><option value="">All careers</option>{data.careers.map(item => <option key={item}>{displayAiText(item)}</option>)}</select></label>
      <label>Device <select value={device} onChange={event => setDevice(event.target.value)}><option value="">All devices</option><option value="mobile">Mobile</option><option value="desktop">Desktop</option></select></label>
      <label>Ref <select value={ref} onChange={event => setRef(event.target.value)}><option value="">All refs</option>{data.refs.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="analytics-check"><input type="checkbox" checked={includeTest} onChange={event => setIncludeTest(event.target.checked)} /> Include test data</label>
      <label className="analytics-check"><input type="checkbox" checked={isMe} onChange={event => { setIsMe(event.target.checked); setThisBrowserIsMe(event.target.checked); }} /> this browser is me</label>
    </div>
    {data.truncated && <p className="plan-admin-error">This date range reached the 5,000-row read limit. Narrow the dates to see a complete view.</p>}
    <section className="analytics-section"><div className="analytics-heading"><h2>Unique visitors ({data.totals.visitors})</h2><span>Untagged (before tracking): {data.untaggedCount}</span></div><div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Ref</th><th>First seen</th><th>Last seen</th><th>Device</th><th>Furthest step reached</th><th>Paid</th></tr></thead><tbody>{data.visitorSummaries.length ? data.visitorSummaries.map(row => <tr key={row.visitorId}><td>{row.ref}</td><td>{when(row.firstSeen)}</td><td>{when(row.lastSeen)}</td><td>{row.device}</td><td>{row.furthestStep}</td><td>{row.paid ? "yes" : "no"}</td></tr>) : <tr><td colSpan={6}>No tagged visitors in this date range.</td></tr>}</tbody></table></div></section>
    <section className="analytics-section"><div className="analytics-heading"><h2>Parent journey</h2><button type="button" onClick={exportFunnel}>Download funnel CSV</button></div>
      <div className="analytics-funnels"><FunnelTable title="Example path" rows={data.funnels.Example} /><FunnelTable title="Search path" rows={data.funnels.Search} /></div>
      <FunnelTable title="Combined total" rows={data.funnels.combined} />
    </section>
    <section className="analytics-section"><div className="analytics-heading"><h2>Where they stopped</h2></div><table className="analytics-table analytics-stopped"><thead><tr><th>Entry path</th><th>Furthest completed step</th><th>Visitors who ended here</th></tr></thead><tbody>{data.stopped.length ? data.stopped.map((row, index) => <tr key={`${row.entryPath}-${row.step}-${index}`}><td>{row.entryPath}</td><td>{row.step}</td><td>{row.visitors}</td></tr>) : <tr><td colSpan={3}>No completed steps in this date range.</td></tr>}</tbody></table></section>
    <section className="analytics-section"><div className="analytics-heading"><h2>Costs and revenue</h2></div><div className="analytics-metrics"><p>Total AI cost<strong>{rupees(data.totals.aiCost)}</strong></p><p>Average per visitor<strong>{rupees(data.totals.averagePerVisitor)}</strong></p><p>Average per paying parent<strong>{rupees(data.totals.averagePerPayingParent)}</strong></p><p>Approved revenue<strong>{rupees(data.totals.revenue)}</strong></p><p>AI calls<strong>{data.totals.aiCalls}</strong></p><p>Paying parents<strong>{data.totals.payingParents}</strong></p></div></section>
    <section className="analytics-section"><div className="analytics-heading"><h2>Visitors ({data.visitors.length})</h2><button type="button" onClick={exportVisitors}>Download CSV</button></div><div className="analytics-visitor-list">{data.visitors.length ? data.visitors.map(row => <details className="analytics-visitor" key={row.visitorId}><summary><span className="analytics-visitor-id">{row.visitorId === "unknown" ? "unknown" : row.visitorId.slice(0, 12)}</span><span>{when(row.firstSeen)}</span><span>{row.entryPath} · {row.device}</span><span>{row.careersOpened.map(displayAiText).join(", ") || "No careers opened"}</span><span>{row.furthestStep}</span><span>{row.aiCalls} AI · {rupees(row.aiCost)}</span></summary><div className="analytics-timeline"><h3>Visitor timeline</h3>{row.timeline.length ? row.timeline.map((event, index) => <p key={`${event.createdAt}-${event.event}-${index}`}><time>{when(event.createdAt)}</time><strong>{event.event.replaceAll("-", " ")}</strong>{event.career && <span>{displayAiText(event.career)}</span>}{event.entryPath && <span>{event.entryPath}</span>}{event.device && <span>{event.device}</span>}{event.paymentMode && <span>{event.paymentMode.replaceAll("_", " ")}</span>}</p>) : <p>No events in this date range.</p>}</div></details>) : <p>No visitors in this date range.</p>}</div></section>
    <section className="analytics-section"><div className="analytics-heading"><h2>Top careers opened</h2><button type="button" onClick={exportCareers}>Download CSV</button></div><div className="analytics-careers">{data.topCareers.length ? data.topCareers.map(row => <p key={row.career}><span>{displayAiText(row.career)}</span><strong>{row.opens}</strong></p>) : <p>No career opens in this date range.</p>}</div></section>
    <section className="analytics-section"><div className="analytics-heading"><h2>Make Payment taps</h2></div><div className="analytics-careers">{data.paymentTapsByCareer.length ? data.paymentTapsByCareer.map(row => <p key={row.career}><span>{displayAiText(row.career)}</span><strong>{row.taps}</strong></p>) : <p>No Make Payment taps in this date range.</p>}</div></section>
    <section className="analytics-section"><div className="analytics-heading"><h2>Event timelines</h2><button type="button" onClick={exportTimeline}>Download CSV</button></div><p>Download visitor events with time, career, path, device, and payment mode.</p></section>
  </>;
}
export default function AnalyticsAdmin() {
  const [input, setInput] = useState(""), [adminKey, setAdminKey] = useState("");
  return <main className="plan-admin analytics-admin">{adminKey ? <AnalyticsBoundary><AnalyticsReport adminKey={adminKey} /></AnalyticsBoundary> : <><div className="plan-admin-top"><BrandLogo /><span className="plan-admin-badge">ADMIN · {deploymentName()}</span><a className="plan-admin-link" href="/admin">Plan payments</a></div><h1>Visitor analytics</h1><p>Enter your admin key to view visitor activity, costs, and approved revenue.</p><form className="plan-admin-auth" onSubmit={event => { event.preventDefault(); setAdminKey(input); }}><label htmlFor="analytics-admin-key">Admin key</label><input id="analytics-admin-key" type="password" value={input} onChange={event => setInput(event.target.value)} autoComplete="off" required /><button type="submit">Open analytics</button></form></>}</main>;
}
class AnalyticsBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="plan-admin-error" role="alert"><p>Admin access required. Check your admin key.</p><a href="/admin/analytics">Try again</a></div> : this.props.children; }
}
