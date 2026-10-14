import { useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import "./milestone-one.css";
import CareerDay from "./CareerDay";
import CareerDayHeader from "./CareerDayHeader";

type Career = { title: string; description: string[]; whyItFits: string; salaryMinINR: number; salaryMaxINR: number; salaryBasis: string; stability: string; overseas: string };
type Panel = { time?: string; caption: string; imageUrl: string | null; imageError?: string };
type Story = { title: string; status?: string; panels: Panel[]; path: string; error?: string; raw?: string };
type Results = { careers: Career[]; note: string; searchKey: string; path: string; stories?: (Story | null)[]; sources: { title: string; url: string }[] };
type Gender = "girl" | "boy" | "unspecified";
type Screen = "landing" | "input" | "results" | "detail" | "storyboard";
type IconName = "arrow" | "back" | "spark" | "leaf" | "heart" | "compass" | "briefcase" | "rupee" | "globe" | "info" | "clock" | "edit" | "lock" | "plan" | "person";
function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />, back: <path d="m14 6-6 6 6 6" />,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /><path d="M20 2v4m-2-2h4" /></>,
    leaf: <><path d="M19 4C8 2 3 8 6 15c6 6 15 0 13-11Z" /><path d="M4 21 16 9M9 15v-5" /></>,
    heart: <path d="M12 20 4 12C-2 5 7 0 12 7c5-7 14-2 8 5Z" />,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2 6-6 2 2-6Z" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V3h8v4M3 12c5 4 13 4 18 0M10 13h4" /></>,
    rupee: <><circle cx="12" cy="12" r="9" /><path d="M8 7h8M8 10h8M9 7c7 0 6 6 0 6l5 5" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    edit: <><path d="m4 16 12-12 4 4L8 20H4ZM13 7l4 4" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    plan: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v4H9ZM9 12h6M9 16h6" /></>,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  };
  return <svg className={`m-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const items = (text: string) => text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const errorText = (e: unknown) => e instanceof ConvexError ? String(e.data) : "We couldn’t finish that request. Please try again.";
function Chips({ text }: { text: string }) { return <div className="m-chips">{items(text).map((item, i) => <span key={`${item}-${i}`}>{item}</span>)}</div>; }
function PanelImage({ panel, index, cachedOnly }: { panel: Panel; index: number; cachedOnly: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return <div className="m-panel-image">{!loaded && <div className="m-placeholder"><Icon name="spark" /><span>{cachedOnly ? "No saved illustration yet" : panel.imageError ? "Illustration unavailable" : "Illustrating this moment…"}</span></div>}
    {panel.imageUrl && <img src={panel.imageUrl} alt={panel.caption} className={loaded ? "image-visible" : ""} onLoad={() => setLoaded(true)} loading={index === 0 ? "eager" : "lazy"} />}</div>;
}
function Facts({ career }: { career: Career }) {
  return <dl className="m-facts">
    <div><dt><Icon name="briefcase" />Stability</dt><dd>{career.stability}</dd></div>
    <div><dt><Icon name="rupee" />Earnings</dt><dd>{money(career.salaryMinINR)}–{money(career.salaryMaxINR)}<small>Illustrative annual range</small></dd></div>
    <div><dt><Icon name="globe" />Abroad</dt><dd>{career.overseas}</dd></div>
  </dl>;
}
export default function MilestoneOne() {
  const recommend = useAction(api.ai.recommend), example = useMutation(api.data.example);
  const [screen, setScreen] = useState<Screen>("landing"), [interests, setInterests] = useState(""), [hopes, setHopes] = useState("");
  const [results, setResults] = useState<Results | null>(null), [selected, setSelected] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [isExample, setIsExample] = useState(false);
  const [favourite, setFavourite] = useState(false);
  // No authentication provider or signed-in visitor state exists in this app.
  const isSignedIn = false;
  const showExplorationNav = !!results && ["results", "detail", "storyboard"].includes(screen);
  const live = useQuery(api.data.stories, results ? { searchKey: results.searchKey, gender: gender || "unspecified" } : "skip") as (Story | null)[] | undefined;
  const career = results?.careers[selected], story = live?.[selected] ?? results?.stories?.[selected];
  const go = (next: Screen) => { setError(""); setScreen(next); window.scrollTo({ top: 0, behavior: "instant" }); };
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!gender) return; setBusy(true); setError("");
    try { const value = await recommend({ interests, hopes, gender: gender || "unspecified" }); setIsExample(false); setResults(value); setSelected(0); go("results"); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function showExample() {
    setBusy(true); setError("");
    try { const value = await example({}); setInterests(value.interests); setHopes(value.hopes); setIsExample(true); setGender("unspecified"); setResults(value); setSelected(0); go("results"); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  function openStory() {
    if (!results) return;
    go("storyboard");
  }
  return <div className={`m1${showExplorationNav ? " m-with-nav" : ""}`} data-screen={screen}>
    {screen === "storyboard" ? <CareerDayHeader onBack={() => go("detail")} onHome={() => go("landing")} /> : <header className="m-header"><div className="m-header-inner"><button className="m-brand" onClick={() => go("landing")} aria-label="Futura 2035 home"><span className="m-brand-mark">f<span /></span><strong>Futura</strong><span className="m-year">2035</span></button><button className="m-info-button" aria-label="About these possibilities" onClick={() => document.getElementById("m-perspective")?.scrollIntoView({ behavior: "smooth" })}><Icon name="info" /></button></div></header>}
    {showExplorationNav && <nav className="m-exploration-nav" aria-label="Your exploration">
      <p className="m-eyebrow m-nav-eyebrow">YOUR EXPLORATION</p>
      <div className="m-nav-items">
        <button className="m-nav-item" aria-current="page" onClick={() => go("results")}><Icon name="compass" /><span>Futures</span></button>
        <button className="m-nav-item" disabled><Icon name="leaf" /><span>Skills<small>Coming soon</small></span></button>
        <button className="m-nav-item" disabled><Icon name="plan" /><span>Plan<small>Coming soon</small></span></button>
        {isSignedIn && <button className="m-nav-item"><Icon name="person" /><span>My space</span></button>}
      </div>
      <p className="m-nav-motto">A direction.<br />Not a destiny.</p>
    </nav>}
    <main className="m-main">
      {screen === "landing" && <section className="m-landing">
        <p className="m-eyebrow">BIG POSSIBILITIES. SMALL FIRST STEPS.</p>
        <h1>Their curiosity.<br />A world of<br /><em>possibility.</em></h1>
        <p className="m-lede">Connect what your child loves with what you hope for. Explore three possible futures—and picture a working day in 2035.</p>
        <div className="m-orbit" aria-label="From curiosity to possible futures"><svg className="m-orbit-line" viewBox="0 0 340 200" aria-hidden="true"><path d="M60 75C260 0 340 160 130 155" /></svg>
          <div className="m-float-card m-curiosity"><span className="m-icon-tile lavender"><Icon name="compass" /></span><p className="m-eyebrow">THEIR CURIOSITY</p><strong>A question worth exploring.</strong></div>
          <div className="m-float-card m-futures"><span className="m-icon-tile peach"><Icon name="compass" /></span><p className="m-eyebrow">POSSIBLE FUTURES</p><strong>More than one way forward.</strong></div>
          <div className="m-float-card m-day"><span className="m-icon-tile mint"><Icon name="leaf" /></span><p className="m-eyebrow">A DAY IN 2035</p><strong>Imagine. Question. Explore.</strong></div>
          <Icon name="spark" className="m-spark-one" /><Icon name="spark" className="m-spark-two" />
        </div>
        <button className="m-primary" onClick={() => go("input")}>Explore their possibilities<Icon name="arrow" /></button>
        <button className="m-example-link" onClick={showExample} disabled={busy}>{busy ? "Opening the saved example…" : "Take a look at an example"}<Icon name="arrow" /></button>
        <p className="m-reassurance"><Icon name="lock" />Two questions. No sign-up.</p>
        <div className="m-benefits">
          <div><span className="m-icon-tile lavender"><Icon name="compass" /></span><p><strong>Three directions, not one label</strong><span>Explore possibilities without closing doors.</span></p></div>
          <div><span className="m-icon-tile mint"><Icon name="leaf" /></span><p><strong>Make the future tangible</strong><span>See an illustrated day in a possible working life.</span></p></div>
          <div><span className="m-icon-tile peach"><Icon name="heart" /></span><p><strong>At your family’s pace</strong><span>A starting point for a conversation. Room for their own voice.</span></p></div>
        </div>
      </section>}
      {screen === "input" && <section className="m-input-screen">
        <button className="m-back" onClick={() => go("landing")}><Icon name="back" />Back to possibilities</button>
        <p className="m-eyebrow">TWO QUESTIONS · HORIZON 2035</p><h1>Start with their<br /><em>curiosity.</em></h1><p className="m-lede">What they love. What you hope for. There’s no perfect answer—just a place to begin.</p>
        <form onSubmit={submit}>
          <section className="m-input-card lavender"><label htmlFor="child-gender">Your child is</label><p>This only changes the illustrated character. Career suggestions stay the same.</p><select id="child-gender" value={gender} required disabled={busy} onChange={e => setGender(e.target.value as Gender | "")}><option value="" disabled>Select an option</option><option value="girl">Girl</option><option value="boy">Boy</option><option value="unspecified">Prefer not to say</option></select></section>
          <section className="m-input-card lavender"><div className="m-input-label"><span className="m-icon-tile"><Icon name="spark" /></span><p className="m-eyebrow">01 / YOUR CHILD</p></div><label htmlFor="interests">What does your child enjoy?</label><p>Subjects, activities, things they choose to read, make or discuss.</p><textarea id="interests" value={interests} onChange={e => setInterests(e.target.value)} placeholder="Economics, book writing, food critique" maxLength={800} required disabled={busy} /><Chips text={interests} /></section>
          <section className="m-input-card mint"><div className="m-input-label"><span className="m-icon-tile"><Icon name="heart" /></span><p className="m-eyebrow">02 / YOUR HOPES</p></div><label htmlFor="hopes">What matters to you as a parent?</label><p>Earning potential, stability, where they might work—or something else.</p><textarea id="hopes" value={hopes} onChange={e => setHopes(e.target.value)} placeholder="Good earning, stability, overseas" maxLength={800} required disabled={busy} /><Chips text={hopes} /></section>
          <button className="m-primary" disabled={busy || !gender || !interests.trim() || !hopes.trim()}>{busy ? "Exploring possible futures…" : "Explore their possibilities"}{busy ? <span className="m-spinner" /> : <Icon name="arrow" />}</button>
          <p className="m-reassurance"><Icon name="lock" />Two questions. No sign-up.</p>
        </form>
      </section>}
      {screen === "results" && results && <section id="pathways">
        <p className="m-eyebrow">{isExample ? "EXAMPLE POSSIBILITIES" : "YOUR POSSIBILITIES"} · HORIZON 2035</p><h1>Many possibilities.<br />One next <em>step.</em></h1><p className="m-lede">Three directions worth exploring. You don’t need to choose a career today.</p>
        <div className="m-profile"><Icon name="spark" /><div><span>Starting with their curiosity</span><strong>{items(interests).join(" · ")}</strong></div><button onClick={() => go("input")}>Edit<Icon name="edit" /></button></div>
        <div className="m-result-label"><strong>{results.careers.length} possible futures</strong><span>2035</span></div>
        <div className="m-career-list">{results.careers.map((c, i) => <article className={`m-career tone-${i}`} key={c.title}>
          <div className="m-card-top"><p className="m-eyebrow"><span className="m-card-number">0{i + 1}</span>A POSSIBLE FUTURE</p><h2>{c.title}</h2><p>{c.description[0]}</p><Chips text={interests} /></div>
          <div className="m-card-bottom"><Facts career={c} /><details className="m-fit"><summary><Icon name="compass" />Why this could connect</summary><p>{c.whyItFits}</p></details><button className={i === 0 ? "m-primary" : "m-secondary"} onClick={() => { setSelected(i); go("detail"); }}>Explore this future<Icon name="arrow" /></button></div>
        </article>)}</div>
        <div className="m-research-note"><Icon name="info" /><div><p>Illustrative 2035 scenarios. Interest overlap is not a skill assessment.</p><details><summary>How these possibilities were selected<Icon name="arrow" /></summary><p>{results.note}</p>{results.sources?.length > 0 && <ul>{results.sources.filter((s, i, a) => a.findIndex(t => t.url === s.url) === i).map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>}</details></div></div>
      </section>}
      {screen === "detail" && career && <section className="m-detail">
        <button className="m-back" onClick={() => go("results")}><Icon name="back" />All possibilities</button>
        <div className={`m-detail-hero tone-${selected}`}><p className="m-eyebrow">A POSSIBLE FUTURE · 2035</p><h1>{career.title}</h1><p>{career.description[0]}</p><Chips text={interests} /></div>
        <section className="m-connection"><h2>Why this could <em>connect.</em></h2><p>{career.whyItFits}</p></section>
        <button className="m-primary m-story-button" onClick={openStory}>A day in the life<Icon name="arrow" /></button>
        <details className="m-accordion" open><summary>Your hopes: {items(hopes).join(", ")}</summary><div><h3>Earning potential</h3><strong>{money(career.salaryMinINR)}–{money(career.salaryMaxINR)} per year</strong><p>{career.salaryBasis}</p><h3>Predictable employment</h3><p>{career.stability}</p><h3>Working internationally</h3><p>{career.overseas}</p></div></details>
        <details className="m-accordion" open><summary>The work in 2035</summary><div><p>{career.description[1]}</p></div></details>
      </section>}
      {screen === "storyboard" && career && results && <CareerDay key={career.title} title={career.title} searchKey={results.searchKey} careerIndex={selected} panels={story?.panels ?? []} />}
      {error && <div className="m-error" role="alert"><Icon name="info" /><p>{error}</p><button className="m-secondary" disabled={busy} onClick={() => screen === "landing" ? showExample() : screen === "storyboard" ? go("detail") : document.querySelector("form")?.requestSubmit()}>Try again<Icon name="arrow" /></button></div>}
      <footer className="m-footer" id="m-perspective"><p>A direction, not a destiny.</p><span>Possibilities to explore together—not predictions or guarantees.</span><small>Futura 2035 · For parents of 15–18-year-olds</small></footer>
    </main>
  </div>;
}
