import React, { Component, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import "./plan-admin.css";
import { lockedMessageForCareer, setThisBrowserIsMe, thisBrowserIsMe } from "./visitorTracking";
import { displayAiText } from "./displayText";
import BrandLogo from "./BrandLogo";

function AdminReport({ adminKey, lock }: { adminKey: string; lock: () => void }) {
  const [includeTest, setIncludeTest] = useState(false);
  const data = useQuery(api.planUnlocks.adminData, { adminKey, includeTest });
  const qualityReviews = useQuery(api.plans.qualityReviewList, { adminKey });
  const savePrice = useMutation(api.planUnlocks.savePrice);
  const saveLockedMessage = useMutation(api.planUnlocks.saveLockedMessage);
  const savePaymentMode = useMutation(api.planUnlocks.savePaymentMode);
  const reviewRequest = useMutation(api.planUnlocks.reviewRequest);
  const [price, setPrice] = useState(""), [priceMessage, setPriceMessage] = useState(""), [message, setMessage] = useState(""), [messageFeedback, setMessageFeedback] = useState(""), [busyRequest, setBusyRequest] = useState(""), [error, setError] = useState("");
  const [priceLoaded, setPriceLoaded] = useState(false);
  const [modeFeedback, setModeFeedback] = useState("");
  const [isMe, setIsMe] = useState(thisBrowserIsMe());
  useEffect(() => { if (data && !priceLoaded) { setPrice(String(data.price)); setMessage(data.lockedMessage ?? ""); setPriceLoaded(true); } }, [data, priceLoaded]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setPriceMessage(""); setError("");
    const amount = Number(price);
    if (!Number.isInteger(amount) || amount < 1 || amount > 9999) { setError("Enter a whole-rupee price from ₹1 to ₹9,999."); return; }
    try { await savePrice({ adminKey, value: amount }); setPriceMessage("Price saved. New checkouts will use this amount."); }
    catch (reason) { setError(reason instanceof ConvexError ? String(reason.data) : "The price could not be saved."); }
  }
  async function saveMessage(e: React.FormEvent) {
    e.preventDefault(); setMessageFeedback(""); setError("");
    try { await saveLockedMessage({ adminKey, value: message }); setMessageFeedback("Message saved."); }
    catch (reason) { setError(reason instanceof ConvexError ? String(reason.data) : "The message could not be saved."); }
  }
  async function changePaymentMode(value: "free_preview" | "paid") {
    setModeFeedback("Saving payment mode…"); setError("");
    try { await savePaymentMode({ adminKey, value }); setModeFeedback(`Payments set to ${value === "free_preview" ? "Free preview" : "Paid"}.`); }
    catch (reason) { setModeFeedback(""); setError(reason instanceof ConvexError ? String(reason.data) : "Payment mode could not be saved."); }
  }
  async function review(requestId: string, decision: "approved" | "rejected") {
    setBusyRequest(requestId); setError("");
    try { await reviewRequest({ adminKey, requestId: requestId as Id<"planUnlockRequests">, decision }); }
    catch (reason) { setError(reason instanceof ConvexError ? String(reason.data) : "The request could not be updated."); }
    finally { setBusyRequest(""); }
  }
  if (!data) return <p role="status">Loading plan payments…</p>;
  return <>
    <div className="plan-admin-top"><BrandLogo /><span className="plan-admin-badge">ADMIN · DEV</span><button className="plan-admin-link" type="button" onClick={lock}>Lock admin</button></div>
    <h1>Plan payments</h1>
    <p className="plan-admin-intro">Set the amount parents see and review payment requests. Approval unlocks only the career and child on that request.</p>
    <p className="plan-admin-intro">AI safety blocks recorded: <strong>{data.aiSafetyBlockCount}</strong></p>
    <section className="plan-admin-section"><h2>Career plans needing review <span>{qualityReviews?.length ?? "…"}</span></h2>
      {!qualityReviews ? <p role="status">Loading saved plans to check…</p> : qualityReviews.length === 0 ? <p>No saved plans need review.</p> : <ul>{qualityReviews.map(row => <li key={row.id}><details><summary><strong>{displayAiText(row.title)}</strong> · plan {row.id} · months {row.issues.map(issue => issue.month).join(", ")}</summary>
        {(row.plan?.projects ?? []).map((project: { month: number; title?: string; projectDetails?: string; build?: string; successCriteria?: string[]; timeNeeded?: string }) => { const issue = row.issues.find(item => item.month === project.month); return <div key={project.month}><h3>Month {project.month}</h3>{issue && <p>{issue.issues.map(displayAiText).join("; ")}</p>}<p><strong>{displayAiText(project.title ?? "Untitled project")}</strong></p><p>{displayAiText(project.projectDetails ?? project.build ?? "No project details saved.")}</p><ul>{(project.successCriteria ?? []).map((item: string, index: number) => <li key={index}>{displayAiText(item)}</li>)}</ul><p>Time: {displayAiText(project.timeNeeded ?? "Missing")}</p></div>; })}
      </details></li>)}</ul>}
    </section>
    <label className="plan-admin-test-toggle"><input type="checkbox" checked={includeTest} onChange={event => setIncludeTest(event.target.checked)} /> Include test data</label>
    <fieldset className="plan-admin-price plan-admin-payment-mode"><legend>Payments</legend><label htmlFor="payment-mode">Payments: Free preview / Paid</label><select id="payment-mode" value={data.paymentMode} onChange={event => void changePaymentMode(event.target.value as "free_preview" | "paid")}><option value="free_preview">Free preview</option><option value="paid">Paid</option></select>{modeFeedback && <p role="status" className="plan-admin-success">{modeFeedback}</p>}</fieldset>
    <section className="plan-admin-section"><h2>Careers missing 2030s earnings <span>{Array.isArray(data.missing2030sEarnings) ? data.missing2030sEarnings.length : "—"}</span></h2>
      {!Array.isArray(data.missing2030sEarnings) ? <p role="status">This DEV backend needs the earnings-status update before it can show this list.</p> : data.missing2030sEarnings.length === 0 ? <p>Every career has a saved 2030s range.</p> : <ul>{data.missing2030sEarnings.map((row: { title: string; reason: string }) => <li key={row.title}><strong>{displayAiText(row.title)}:</strong> {displayAiText(row.reason)}</li>)}</ul>}
    </section>
    <form className="plan-admin-price" onSubmit={save}>
      <label htmlFor="plan-price">Plan price ({"\u20B9"})</label>
      <div><input id="plan-price" aria-label={`Plan price (\u20B9)`} type="number" min="1" max="9999" step="1" required value={price} onChange={event => setPrice(event.target.value)} /><button type="submit">Save</button></div>
      <p>Current price: {"\u20B9"}{data.price}. Existing requests keep the amount shown when they opened payment.</p>
      {priceMessage && <p role="status" className="plan-admin-success">{priceMessage}</p>}
    </form>
    <form className="plan-admin-price plan-admin-message" onSubmit={saveMessage}>
      <label htmlFor="locked-card-message">Locked card message</label>
      <textarea id="locked-card-message" rows={3} maxLength={500} value={message} onChange={event => setMessage(event.target.value)} />
      <p>Use <code>{"{career}"}</code> and <code>{"{price}"}</code> where the career name or live price should appear.</p>
      {message.trim() && <div className="plan-admin-previews"><p><strong>Doctor:</strong> {displayAiText(lockedMessageForCareer(message, "Doctor", data.price))}</p><p><strong>Author:</strong> {displayAiText(lockedMessageForCareer(message, "Author", data.price))}</p></div>}
      <button type="submit">Save message</button>
      {messageFeedback && <p role="status" className="plan-admin-success">{messageFeedback}</p>}
    </form>
    <label className="plan-admin-test-toggle"><input type="checkbox" checked={isMe} onChange={event => { setIsMe(event.target.checked); setThisBrowserIsMe(event.target.checked); }} /> this browser is me <small>My visits will be marked as test.</small></label>
    {error && <p className="plan-admin-error" role="alert">{error}</p>}
    <section className="plan-admin-section"><h2>Pending requests <span>{data.pending.length}</span></h2>
      {data.pending.length === 0 ? <p>No pending requests.</p> : <div className="plan-admin-request-list">
        {data.pending.map((request: any) => <article className="plan-admin-request" key={request._id} aria-label={`${request.parentName}, ${request.career}`}>
          <div className="plan-admin-request-heading"><strong>{request.parentName}</strong><span>{request.gender === "girl" ? "Girl" : "Boy"}</span></div>
          <p><a href={`tel:${request.mobile}`}>{request.mobile}</a> · {displayAiText(request.career)}</p>
          <p className="plan-admin-request-amount">{"\u20B9"}{request.amount} <span>{new Date(request.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></p>
          <div className="plan-admin-actions"><button type="button" disabled={busyRequest === request._id} onClick={() => void review(request._id, "approved")}>Approve</button><button className="reject" type="button" disabled={busyRequest === request._id} onClick={() => void review(request._id, "rejected")}>Reject</button></div>
        </article>)}
      </div>}
    </section>
    <section className="plan-admin-section"><h2>Payment funnel</h2><p>Each row is one recorded view or action.</p>
      <div className="plan-admin-table-wrap"><table><thead><tr><th>Event</th><th>Career</th><th>Child</th><th>Amount</th><th>Time</th></tr></thead><tbody>
        {data.events.map((event: any) => <tr key={event._id}><td>{event.event}</td><td>{displayAiText(event.career)}</td><td>{event.gender === "girl" ? "Girl" : "Boy"}</td><td>{event.amount === undefined ? "—" : `\u20B9${event.amount}`}</td><td>{new Date(event.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td></tr>)}
      </tbody></table></div>
    </section>
    <p><a href="/admin/analytics">Open visitor analytics</a></p><p><a href="/admin/costs">Open existing AI cost report</a></p><p><a href="/admin/faqs">Manage landing and results FAQs</a></p>
  </>;
}

export default function PlanAdmin() {
  const [input, setInput] = useState(""), [adminKey, setAdminKey] = useState("");
  function lock() { setAdminKey(""); setInput(""); }
  return <main className="plan-admin">{adminKey ? <AdminReportBoundary key={adminKey} reset={lock}><AdminReport adminKey={adminKey} lock={lock} /></AdminReportBoundary> : <>
    <BrandLogo /><h1>Plan payments</h1><p>Enter your admin key to manage price and payment requests.</p><form className="plan-admin-auth" onSubmit={event => { event.preventDefault(); setAdminKey(input); }}><label htmlFor="plan-admin-key">Admin key</label><input id="plan-admin-key" type="password" value={input} onChange={event => setInput(event.target.value)} autoComplete="off" required /><button type="submit">Open plan payments</button></form>
  </>}</main>;
}

class AdminReportBoundary extends Component<{ children: React.ReactNode; reset: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="plan-admin-error" role="alert"><p>Admin access required. Check your admin key.</p><button type="button" onClick={this.props.reset}>Try again</button></div> : this.props.children; }
}
