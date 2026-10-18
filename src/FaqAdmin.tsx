import React, { Component, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { FaqBootstrap, type FaqPage } from "./ManagedFaqs";
import BrandLogo from "./BrandLogo";
import "./plan-admin.css";

type Faq = { id: Id<"faqs">; page: FaqPage; question: string; answer: string; displayOrder: number };
type Draft = { question: string; answer: string };

function AdminFaqList({ adminKey, lock }: { adminKey: string; lock: () => void }) {
  const faqs = useQuery(api.faqs.adminList, { adminKey }) as Faq[] | undefined;
  const createFaq = useMutation(api.faqs.create);
  const updateFaq = useMutation(api.faqs.update);
  const removeFaq = useMutation(api.faqs.remove);
  const reorderFaqs = useMutation(api.faqs.reorder);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newFaqs, setNewFaqs] = useState<Record<FaqPage, Draft>>({ landing: { question: "", answer: "" }, results: { question: "", answer: "" } });
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(faq: Faq) {
    const draft = drafts[faq.id] ?? { question: faq.question, answer: faq.answer };
    setBusy(true); setError(""); setFeedback("");
    try {
      await updateFaq({ adminKey, id: faq.id, ...draft });
      setDrafts(current => ({ ...current, [faq.id]: draft })); setFeedback("FAQ saved.");
    } catch (reason) { setError(reason instanceof ConvexError ? String(reason.data) : "The FAQ could not be saved."); }
    finally { setBusy(false); }
  }

  async function add(page: FaqPage, event: React.FormEvent) {
    event.preventDefault(); const draft = newFaqs[page];
    setBusy(true); setError(""); setFeedback("");
    try {
      await createFaq({ adminKey, page, ...draft });
      setNewFaqs(current => ({ ...current, [page]: { question: "", answer: "" } })); setFeedback("FAQ added.");
    } catch (reason) { setError(reason instanceof ConvexError ? String(reason.data) : "The FAQ could not be added."); }
    finally { setBusy(false); }
  }

  async function remove(faq: Faq) {
    setBusy(true); setError(""); setFeedback("");
    try { await removeFaq({ adminKey, id: faq.id }); setFeedback("FAQ deleted."); }
    catch (reason) { setError(reason instanceof ConvexError ? String(reason.data) : "The FAQ could not be deleted."); }
    finally { setBusy(false); }
  }

  async function move(page: FaqPage, index: number, offset: -1 | 1) {
    const ordered = (faqs ?? []).filter(faq => faq.page === page);
    const next = index + offset;
    if (next < 0 || next >= ordered.length) return;
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    setBusy(true); setError(""); setFeedback("");
    try { await reorderFaqs({ adminKey, page, orderedIds: ordered.map(faq => faq.id) }); setFeedback("FAQ order saved."); }
    catch (reason) { setError(reason instanceof ConvexError ? String(reason.data) : "The FAQ order could not be saved."); }
    finally { setBusy(false); }
  }

  if (!faqs) return <p role="status">Loading FAQs…</p>;
  return <>
    <div className="plan-admin-top"><BrandLogo /><span className="plan-admin-badge">ADMIN · DEV</span><div><a className="plan-admin-link" href="/admin">Plan payments</a> <button className="plan-admin-link" type="button" onClick={lock}>Lock admin</button></div></div>
    <h1>Frequently asked questions</h1>
    <p className="plan-admin-intro">Edit the questions and answers shown on the landing and results pages.</p>
    {(["landing", "results"] as const).map(page => {
      const rows = faqs.filter(faq => faq.page === page);
      return <section className="faq-admin-page" key={page}>
        <h2>{page === "landing" ? "Landing page" : "Results screen"} <span>{rows.length}</span></h2>
        {rows.map((faq, index) => {
          const draft = drafts[faq.id] ?? { question: faq.question, answer: faq.answer };
          return <article className="faq-admin-item" key={faq.id}>
            <div className="faq-admin-item-heading"><strong>FAQ {index + 1}</strong><div>
              <button type="button" aria-label={`Move ${faq.question} up`} disabled={busy || index === 0} onClick={() => void move(page, index, -1)}>↑</button>
              <button type="button" aria-label={`Move ${faq.question} down`} disabled={busy || index === rows.length - 1} onClick={() => void move(page, index, 1)}>↓</button>
            </div></div>
            <label>Question<input value={draft.question} maxLength={300} onChange={event => setDrafts(current => ({ ...current, [faq.id]: { ...draft, question: event.target.value } }))} /></label>
            <label>Answer<textarea value={draft.answer} maxLength={4000} rows={4} onChange={event => setDrafts(current => ({ ...current, [faq.id]: { ...draft, answer: event.target.value } }))} /></label>
            <div className="faq-admin-actions"><button type="button" disabled={busy} onClick={() => void save(faq)}>Save answer</button><button type="button" className="faq-admin-delete" disabled={busy} onClick={() => void remove(faq)}>Delete</button></div>
          </article>;
        })}
        <form className="faq-admin-item faq-admin-add" onSubmit={event => void add(page, event)}>
          <strong>Add a FAQ</strong>
          <label>Question<input required maxLength={300} value={newFaqs[page].question} onChange={event => setNewFaqs(current => ({ ...current, [page]: { ...current[page], question: event.target.value } }))} /></label>
          <label>Answer<textarea required maxLength={4000} rows={3} value={newFaqs[page].answer} onChange={event => setNewFaqs(current => ({ ...current, [page]: { ...current[page], answer: event.target.value } }))} /></label>
          <button type="submit" disabled={busy}>Add FAQ</button>
        </form>
      </section>;
    })}
    {feedback && <p className="plan-admin-success" role="status">{feedback}</p>}
    {error && <p className="plan-admin-error" role="alert">{error}</p>}
  </>;
}

export default function FaqAdmin() {
  const [input, setInput] = useState(""), [adminKey, setAdminKey] = useState("");
  function lock() { setAdminKey(""); setInput(""); }
  return <main className="plan-admin faq-admin"><FaqBootstrap />{adminKey ? <FaqBoundary key={adminKey} reset={lock}><AdminFaqList adminKey={adminKey} lock={lock} /></FaqBoundary> : <>
    <div className="plan-admin-top"><BrandLogo /><span className="plan-admin-badge">ADMIN · DEV</span><a className="plan-admin-link" href="/admin">Plan payments</a></div>
    <h1>Frequently asked questions</h1><p>Enter your admin key to manage landing and results FAQs.</p>
    <form className="plan-admin-auth" onSubmit={event => { event.preventDefault(); setAdminKey(input); }}><label htmlFor="faq-admin-key">Admin key</label><input id="faq-admin-key" type="password" value={input} onChange={event => setInput(event.target.value)} autoComplete="off" required /><button type="submit">Open FAQ manager</button></form>
  </>}</main>;
}

class FaqBoundary extends Component<{ children: React.ReactNode; reset: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="plan-admin-error" role="alert"><p>Admin access required. Check your admin key.</p><button type="button" onClick={this.props.reset}>Try again</button></div> : this.props.children; }
}
