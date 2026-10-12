import React, { Component, useEffect, useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { USD_TO_INR, PRICING_DATE, PRICING_URL } from "../convex/pricing";

function Report({ adminKey, lock }: { adminKey: string; lock: () => void }) {
  const { results, status, loadMore } = usePaginatedQuery(api.costs.rows, { adminKey }, { initialNumItems: 100 });
  useEffect(() => { if (status === "CanLoadMore") loadMore(100); }, [status, loadMore]);
  const groups = new Map<string, { title: string; generated: number; hits: number; usd: number; inr: number; unknown: number }>();
  for (const row of results) {
    const g = groups.get(row.careerTitle) ?? { title: row.careerTitle, generated: 0, hits: 0, usd: 0, inr: 0, unknown: 0 };
    g.generated += row.fullStoryboardCompleted ? 1 : 0;
    g.hits += row.cacheHit ? 1 : 0;
    g.usd += row.costUSD ?? 0; g.inr += row.costINR ?? 0;
    g.unknown += row.costUSD === null ? 1 : 0;
    groups.set(g.title, g);
  }
  const all = [...groups.values()], usd = all.reduce((s, g) => s + g.usd, 0), inr = all.reduce((s, g) => s + g.inr, 0);
  return <>
    <div className="section-top"><span className="pill">ADMIN ONLY · DEV</span><button className="text-button" onClick={lock}>Lock costs</button></div>
    <h1>AI costs</h1>
    <p className="section-description">Recorded OpenAI usage. All background storyboards count toward spending, including those a parent does not open.</p>
    <h2>${usd.toFixed(6)} · ₹{inr.toFixed(4)}</h2>
    {status !== "Exhausted" && <p role="status">Loading all recorded calls… totals are partial.</p>}
    <div className="cost-table"><table><thead><tr><th>Career</th><th>Storyboards generated</th><th>Cache hits</th><th>Total USD / INR</th><th>Average per full storyboard USD / INR</th></tr></thead><tbody>
      {all.map(g => <tr key={g.title}><td>{g.title}</td><td>{g.generated}</td><td>{g.hits}</td><td>${g.usd.toFixed(6)} / ₹{g.inr.toFixed(4)}{g.unknown > 0 && <p>{g.unknown} calls have unknown or pending cost</p>}</td><td>{g.generated ? `$${(g.usd / g.generated).toFixed(6)} / ₹${(g.inr / g.generated).toFixed(4)}` : "—"}</td></tr>)}
    </tbody></table></div>
    <p className="note">Average includes recorded caption, character and image costs, divided by completed storyboards. Career discovery is shared and shown separately. Tracking began with this change; earlier calls are not reconstructed. INR uses a fixed ₹{USD_TO_INR} per USD. Missing usage stays unknown; it is never treated as a free call.</p>
    <details className="raw-output"><summary>aiCalls rows ({results.length})</summary><pre>{JSON.stringify(results, null, 2)}</pre></details>
    <p><a href={PRICING_URL}>Official OpenAI pricing</a> · prices checked {PRICING_DATE}</p>
  </>;
}
class CostErrorBoundary extends Component<{ children: React.ReactNode; reset: () => void }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="error" role="alert"><p>Admin access required. Check your admin key.</p><button className="primary" onClick={this.props.reset}>Try again</button></div> : this.props.children; }
}
export default function AdminCosts() {
  const [input, setInput] = useState(""), [adminKey, setAdminKey] = useState("");
  function lock() { setAdminKey(""); setInput(""); }
  return <main className="admin-costs">{adminKey ? <CostErrorBoundary reset={lock}><Report adminKey={adminKey} lock={lock} /></CostErrorBoundary> : <>
    <h1>Admin costs</h1><p className="section-description">Enter your separate admin key to view costs.</p>
    <form onSubmit={e => { e.preventDefault(); setAdminKey(input); }}><label htmlFor="admin-key">Admin key</label><input id="admin-key" type="password" value={input} onChange={e => setInput(e.target.value)} autoComplete="off" required /><button className="primary">View costs</button></form>
  </>}</main>;
}
