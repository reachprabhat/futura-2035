import { useEffect, useState, type FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import "./milestone-one.css";
import CareerDay from "./CareerDay";
import CareerDayHeader from "./CareerDayHeader";
import { EXAMPLE_CAREERS, EXAMPLE_SECTION_SUBTITLE, EXAMPLE_SECTION_TITLE, type ExampleCareer } from "./exampleCareers";
import { SHOW_HOME_EXAMPLES } from "./config";
import { thumbnailImageUrl } from "./compressedAssets";
import { analyticsTracking, getVisitorAge, getVisitorId, setVisitorAge, visitorTracking, type VisitorAge } from "./visitorTracking";
import { sceneImageUrl } from "./compressedAssets";
import { displayAiText } from "./displayText";
import { formatINRRange } from "../convex/earnings2030s";
import { FaqBootstrap, ManagedFaqSection } from "./ManagedFaqs";

type Career = { title: string; description: string[]; whyItFits: string; salaryMinINR?: number; salaryMaxINR?: number; salaryBasis?: string; stability: string; overseas: string };
type Panel = { time?: string; caption: string; imageUrl: string | null; imageError?: string; sceneId?: string };
type Story = { title: string; status?: string; panels: Panel[]; path: string; error?: string; raw?: string; roleShort2030s?: string; earnings2030sLow?: number; earnings2030sHigh?: number; earnings2030sBasis?: string; heroSceneId?: string; heroImageUrl?: string | null };
type Results = { careers: Career[]; note: string; searchKey: string; path: string; stories?: (Story | null)[]; sources: { title: string; url: string }[] };
type Gender = "girl" | "boy" | "unspecified";
type Screen = "landing" | "input" | "results" | "detail" | "storyboard" | "example";
const interestOptions = ["Economics", "Book writing", "Food critique", "Gaming", "Music", "Solving puzzles"];
const hopeOptions = ["Good earning potential", "Stability", "Opportunities abroad"];
type IconName = "arrow" | "back" | "spark" | "bulb" | "branch" | "stairs" | "leaf" | "heart" | "compass" | "briefcase" | "rupee" | "globe" | "info" | "clock" | "edit" | "lock" | "plan" | "person";
function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />, back: <path d="m14 6-6 6 6 6" />,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /><path d="M20 2v4m-2-2h4" /></>,
    bulb: <><path d="M9 18h6M10 21h4M8.5 14.5a7 7 0 1 1 7 0c-1.2 1-1.5 2-1.5 3.5h-4c0-1.5-.3-2.5-1.5-3.5Z" /><path d="M12 7v4m-2-2h4" /></>,
    branch: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><circle cx="18" cy="17" r="2" /><path d="M8 19h3a3 3 0 0 0 3-3V8a3 3 0 0 1 3-3M11 16h2a3 3 0 0 0 3 3h0" /></>,
    stairs: <><path d="M4 20h5v-4h5v-4h5V8h1" /><path d="m17 5 4 3-4 3" /></>,
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
function ChoiceChips({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (option: string) => void }) {
  return <div className="m-choice-chips">{options.map(option => <button key={option} type="button" aria-pressed={selected.includes(option)} onClick={() => onToggle(option)}>{option}</button>)}</div>;
}
function ProfileCardContent({ label, values, onEdit }: { label: string; values: string; onEdit?: () => void }) {
  return <><Icon name="spark" /><div><span>{label}</span><strong>{values}</strong></div>{onEdit && <button type="button" onClick={onEdit}>Edit<Icon name="edit" /></button>}</>;
}
function ProfileCard({ label, values, onEdit, children }: { label: string; values: string; onEdit?: () => void; children?: React.ReactNode }) {
  if (children) return <div className="m-profile m-profile-with-content">
    <div className="m-profile-heading"><ProfileCardContent label={label} values={values} onEdit={onEdit} /></div>
    <div className="m-profile-expanded">{children}</div>
  </div>;
  return <div className="m-profile"><ProfileCardContent label={label} values={values} onEdit={onEdit} /></div>;
}
function PanelImage({ panel, index, cachedOnly, gender }: { panel: Panel; index: number; cachedOnly: boolean; gender: Gender | "" }) {
  const [loaded, setLoaded] = useState(false);
  const imageUrl = sceneImageUrl(panel.sceneId, gender, panel.imageUrl);
  return <div className="m-panel-image">{!loaded && <div className="m-placeholder"><Icon name="spark" /><span>{cachedOnly ? "No saved illustration yet" : panel.imageError ? "Illustration unavailable" : "Illustrating this moment…"}</span></div>}
    {imageUrl && <img src={imageUrl} alt={displayAiText(panel.caption)} className={loaded ? "image-visible" : ""} onLoad={() => setLoaded(true)} loading={index === 0 ? "eager" : "lazy"} />}</div>;
}
function hasUsableRange(low?: number, high?: number) { return typeof low === "number" && Number.isFinite(low) && low > 0 && typeof high === "number" && Number.isFinite(high) && high > low; }
function hasEarningsRange(career: Career, story?: Story | null) {
  return hasUsableRange(story?.earnings2030sLow, story?.earnings2030sHigh) || hasUsableRange(career.salaryMinINR, career.salaryMaxINR);
}
function Earnings({ career, story, perYear = false }: { career: Career; story?: Story | null; perYear?: boolean }) {
  const hasFutureRange = hasUsableRange(story?.earnings2030sLow, story?.earnings2030sHigh);
  const hasBaseline = hasUsableRange(career.salaryMinINR, career.salaryMaxINR);
  if (!hasFutureRange && !hasBaseline) return null;
  const low = hasFutureRange ? story!.earnings2030sLow! : career.salaryMinINR!;
  const high = hasFutureRange ? story!.earnings2030sHigh! : career.salaryMaxINR!;
  return <>
    <span className="m-earnings-label">{hasFutureRange ? "Indicative earning range in the 2030s" : "Today's range (2026)"}</span>
    <strong>{formatINRRange(low, high)}{perYear ? " per year" : ""}</strong>
    <small>{hasFutureRange ? "Indicative AI estimate for the 2030s, not a prediction or guarantee." : "Today's indicative range, not a guarantee."}</small>
  </>;
}
function Facts({ career, story }: { career: Career; story?: Story | null }) {
  return <dl className="m-facts">
    <div><dt><Icon name="briefcase" />Stability</dt><dd>{displayAiText(career.stability)}</dd></div>
    {hasEarningsRange(career, story) && <div><dt><Icon name="rupee" />Earnings</dt><dd><Earnings career={career} story={story} /></dd></div>}
    <div><dt><Icon name="globe" />Abroad</dt><dd>{displayAiText(career.overseas)}</dd></div>
  </dl>;
}
function CareerPossibilityCard({ career, index, reason, onPreview }: { career: Career; index: number; reason: string; onPreview: () => void }) {
  const saved = useQuery(api.plans.get, { title: career.title }) as { status?: string; plan?: { coreSkills?: string[]; skills?: string[]; projects?: { month?: number; title: string }[] } } | null | undefined;
  const skills = saved?.status === "ready" ? (saved.plan?.coreSkills ?? saved.plan?.skills ?? []).slice(0, 3) : [];
  return <article className={`m-career results-path-card tone-${index}`}>
    <div className="results-path-main">
      <p className="m-eyebrow"><span className="m-card-number">0{index + 1}</span> · A POSSIBLE PATHWAY</p>
      <h2>{displayAiText(career.title)}</h2>
      <p className="results-path-role">Illustrative role: {displayAiText(career.title)}</p>
      <p className="results-path-reason">{displayAiText(reason)}</p>
      <button className="m-primary" type="button" onClick={onPreview}>Preview this path <Icon name="arrow" /></button>
      {skills.length > 0 && <div className="m-chips results-path-skills">{skills.map((skill, i) => <span key={`${skill}-${i}`}>{displayAiText(skill)}</span>)}</div>}
    </div>
  </article>;
}
function ExampleCareerCard({ example, index, onOpen }: { example: ExampleCareer; index: number; onOpen: () => void }) {
  const image = thumbnailImageUrl(example.project.imageTheme, null);
  return <button type="button" className={`example-career-card example-career-card-${example.id}`} onClick={onOpen} aria-label={`View full 12-month plan for ${example.career}`}>
    <span className="example-card-tags"><span className="example-card-tag">{example.exampleTag}</span><span className="example-card-tag">{example.opportunityTag}</span></span>
    <span className="example-child">
      <span className="example-avatar" aria-hidden="true">{example.person.slice(0, 1)}</span>
      <span className="example-child-copy"><strong>{example.person}'s interests (age {example.age})</strong><span className="example-interest-chips">{example.interests.map(interest => <span key={interest}>{interest}</span>)}</span></span>
    </span>
    <span className="example-career-copy"><strong className="example-career-name">{example.career}</strong><span className="example-promise">{example.promise}</span><span className="example-description">{example.description}</span></span>
    <span className="example-opportunities">
      <span className="example-opportunity"><strong>Current opportunity</strong><span>{example.currentOpportunity.map(point => <span className="example-tick-point" key={point}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>{point}</span>)}</span></span>
      <span className="example-opportunity"><strong>Future opportunity</strong><span>{example.futureOpportunity.map(point => <span className="example-tick-point" key={point}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>{point}</span>)}</span></span>
    </span>
    <span className="example-month-one">
      <span className="example-month-heading">Month 1 · A first project</span>
      {image && <img src={image} alt="" loading="lazy" />}
      <strong>{example.project.title}</strong>
      <span className="example-project-description">{example.project.description}</span>
      <span className="example-project-chips">{example.project.skills.map(skill => <span key={skill}>{skill}</span>)}<span>{example.project.time}</span></span>
    </span>
    <span className="m-primary example-card-cta">View full 12-month plan for {example.career}<Icon name="arrow" /></span>
  </button>;
}
export default function MilestoneOne() {
  const recommend = useAction(api.ai.recommend), checkInputSafety = useAction(api.ai.checkInputSafety), logAnalytics = useMutation(api.planUnlocks.logAnalytics);
  const savePlanDisplay = useMutation(api.data.savePlanDisplay);
  const planPrice = useQuery(api.planUnlocks.price, {});
  const visitorId = useState(getVisitorId)[0];
  const [screen, setScreen] = useState<Screen>("landing"), [inputStep, setInputStep] = useState<1 | 2>(1);
  const [interestChoices, setInterestChoices] = useState<string[]>([]), [otherInterests, setOtherInterests] = useState("");
  const [hopeChoices, setHopeChoices] = useState<string[]>([]), [otherHopes, setOtherHopes] = useState("");
  const [childAge, setChildAge] = useState(() => String(getVisitorAge() ?? ""));
  const [childName, setChildName] = useState(() => sessionStorage.getItem("pathlight-child-name")?.trim().slice(0, 30) ?? "");
  const childNameForDisplay = childName.trim().slice(0, 30);
  const childNamePossessive = childNameForDisplay ? `${childNameForDisplay}'s` : "";
  function persistPlanDisplay(searchKey: string) {
    const sessionId = sessionStorage.getItem("pathlight-plan-display-session") ?? crypto.randomUUID();
    sessionStorage.setItem("pathlight-plan-display-session", sessionId);
    return savePlanDisplay({ sessionId, searchKey, childName: childNameForDisplay });
  }
  const interests = [...interestChoices, ...items(otherInterests)].join(", ");
  const hopes = [...hopeChoices, ...items(otherHopes)].join(", ");
  const [results, setResults] = useState<Results | null>(null), [selected, setSelected] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [gender, setGender] = useState<Gender | "">("girl");
  const [isExample, setIsExample] = useState(false);
  const [selectedExample, setSelectedExample] = useState<ExampleCareer | null>(null);
  const [favourite, setFavourite] = useState(false);
  useEffect(() => {
    if (screen !== "input" || inputStep !== 1 || !error) return;
    document.querySelector(".m-input-screen [role=alert]")?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [error, inputStep, screen]);
  // No authentication provider or signed-in visitor state exists in this app.
  const live = useQuery(api.data.stories, results ? { searchKey: results.searchKey, gender: gender || "unspecified" } : "skip") as (Story | null)[] | undefined;
  const career = results?.careers[selected], story = live?.[selected] ?? results?.stories?.[selected];
  const currentHero = useQuery(api.sceneLibrary.career, screen === "storyboard" && career ? { title: career.title, gender: gender || "unspecified" } : "skip") as Story | null | undefined;
  // Role summaries come from the live shared career record, never the saved result snapshot.
  const roleShortFor = (index: number, item: Career) => live?.[index]?.roleShort2030s?.trim() || (live ? item.description[0] : "");
  const go = (next: Screen) => { setError(""); setScreen(next); window.scrollTo({ top: 0, behavior: "instant" }); if (next === "landing") void logAnalytics({ event: "landing-view", tracking: analyticsTracking() }).catch(() => {}); };
  useEffect(() => { void logAnalytics({ event: "landing-view", tracking: analyticsTracking() }).catch(() => {}); }, [logAnalytics, visitorId]);
  function startSearch() {
    setSelectedExample(null); setIsExample(false);
    const tracking = analyticsTracking();
    void logAnalytics({ event: "landing-view", tracking, entryPath: "Search" }).catch(() => {});
    void logAnalytics({ event: "career-search", tracking, entryPath: "Search" }).catch(() => {});
    setInputStep(1); go("input");
  }
  async function continueFromInterests(e: FormEvent) {
    e.preventDefault();
    if (!interests.trim() || !gender) return;
    setBusy(true); setError("");
    try {
      const safety = await checkInputSafety({ value: interests, field: "interests" });
      if (!safety.safe) {
        setError(`Let's pick an interest that helps ${childNameForDisplay || "them"} grow. Try something they enjoy doing, like sports, music, building or writing.`);
        return;
      }
      setInputStep(2); window.scrollTo({ top: 0, behavior: "instant" });
    } catch (e) {
      setError(displayAiText(errorText(e)));
    } finally { setBusy(false); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!gender) return; setBusy(true); setError("");
    try {
      const safety = await checkInputSafety({ value: otherHopes, field: "hopes" });
      if (!safety.safe) {
        setError(`Let's focus on hopes that help ${childNameForDisplay || "your child"} grow, like meaningful work, stability or learning.`);
        return;
      }
      const tracking = analyticsTracking();
      void logAnalytics({ event: "landing-view", tracking, entryPath: "Search" }).catch(() => {});
      void logAnalytics({ event: "career-search", tracking, entryPath: "Search", gender: gender || "unspecified" }).catch(() => {});
      const value = await recommend({ interests, hopes, interestChips: interestChoices, otherInterests, hopeChips: hopeChoices, otherHopes, childName: childNameForDisplay, gender: gender || "unspecified", tracking: visitorTracking() }); await persistPlanDisplay(value.searchKey); setIsExample(false); setResults(value); setSelected(0); go("results");
    }
    catch (e) { setError(displayAiText(errorText(e))); } finally { setBusy(false); }
  }
  function openExample(example: ExampleCareer) { if (!SHOW_HOME_EXAMPLES) return; setSelectedExample(example); setIsExample(true); go("example"); }
  function openStory() {
    if (!results) return;
    go("storyboard");
  }
  return <div className="m1" data-screen={screen}>
    {screen !== "input" && <CareerDayHeader onHome={() => go("landing")} parentOnly={screen === "landing"} />}
    <FaqBootstrap />
    <main className={`m-main${screen !== "landing" && screen !== "storyboard" ? " m-main-inner" : ""}`}>
      {screen !== "landing" && screen !== "storyboard" && screen !== "input" && screen !== "example" && <button className="m-screen-back" type="button" onClick={() => screen === "detail" ? go("results") : go("landing")}>‹ {screen === "detail" ? "Back to possibilities" : "Back to Home"}</button>}
      {screen === "landing" && <section className="m-landing landing-v2">
        <p className="m-eyebrow landing-audience"><span aria-hidden="true" />FOR PARENTS OF 13–16-YEAR-OLDS</p>
        <h1>Help your child explore a future career.</h1>
        <p className="m-lede">A personalised 12-month plan for the AI age. One small project a month to discover what they enjoy.</p>
        <div className="m-chips landing-chips"><span>3 possible career paths</span><span>3–4 hours per project</span></div>
        <button className="m-primary landing-cta" onClick={startSearch}>See 3 career possibilities<Icon name="arrow" /></button>
        <p className="landing-price"><strong>Explore free. No sign-up.</strong>{planPrice !== undefined && <span>₹{planPrice} for one 12-month pathway plan.</span>}</p>
        {SHOW_HOME_EXAMPLES && <section className="landing-examples" aria-labelledby="landing-examples-title">
          <h2 id="landing-examples-title">{EXAMPLE_SECTION_TITLE}</h2><p className="landing-examples-subtitle">{EXAMPLE_SECTION_SUBTITLE}</p>
          <div className="landing-example-list">{EXAMPLE_CAREERS.map((example, index) => <ExampleCareerCard key={example.id} example={example} index={index} onOpen={() => openExample(example)} />)}</div>
        </section>}
        <section className="landing-steps"><h2>Three possibilities. One practical next step.</h2><ol>
          <li><b>1</b><div><h3>Start with their interests</h3><p>Add what your child enjoys and what matters to your family.</p></div></li>
          <li><b>2</b><div><h3>Imagine the work</h3><p>Explore a possible working day, the skills involved and a free first project.</p></div></li>
          <li><b>3</b><div><h3>Choose a plan to try</h3><p>Get 12 pathway-specific projects with instructions and success criteria.{planPrice !== undefined && <> ₹{planPrice} per plan.</>}</p></div></li>
        </ol></section>
        <ManagedFaqSection page="landing" className="landing-faq" />
        <div className="landing-bottom-cta"><button className="m-primary" onClick={startSearch}>See 3 career possibilities<Icon name="arrow" /></button>{SHOW_HOME_EXAMPLES && <p>Explore together. These examples are not a skill assessment or a prediction.</p>}<h2>A direction, not a destiny.</h2></div>
      </section>}
      {screen === "input" && <section className="m-input-screen">
        <button className="m-screen-back" type="button" onClick={() => inputStep === 2 ? (setError(""), setInputStep(1), window.scrollTo({ top: 0, behavior: "instant" })) : go("landing")}>{inputStep === 2 ? "← Back to your child" : "← Back to home"}</button>
        {inputStep === 1 ? <>
          <p className="m-eyebrow">STEP 1 OF 2 · YOUR CHILD</p>
          <h1>What does your child enjoy?</h1>
          <p className="m-lede">Start with what they choose to do, not what they are already good at.</p>
          <form onSubmit={continueFromInterests}>
            <section className="m-input-group">
              <label className="m-input-title" htmlFor="child-name">Enter your child's name</label>
              <input id="child-name" type="text" value={childName} placeholder="e.g. Aarav" maxLength={30} disabled={busy} onChange={e => { const value = e.target.value.slice(0, 30); setChildName(value); setError(""); sessionStorage.setItem("pathlight-child-name", value); }} onBlur={() => setChildName(value => value.trim().slice(0, 30))} />
            </section>
            <section className="m-input-group">
                <p className="m-input-title">{childNamePossessive ? `Select ${childNamePossessive} age` : "Select Age"}</p>
              <div className="m-choice-chips m-age-chips">{["13", "14", "15", "16"].map(age => <button key={age} type="button" aria-pressed={childAge === age} onClick={() => { setError(""); setChildAge(age); setVisitorAge(Number(age) as VisitorAge); }}>{age}</button>)}</div>
            </section>
              <section className="m-input-group">
                <label className="m-input-title" htmlFor="child-gender">{childNamePossessive ? `Select ${childNamePossessive} gender` : "Select Gender"}</label>
                <select id="child-gender" value={gender} required disabled={busy} onChange={e => { const picked = e.target.value as Gender | ""; setError(""); setGender(picked); if (picked) void logAnalytics({ event: "gender-picked", tracking: analyticsTracking(), entryPath: isExample ? "Example" : "Search", gender: picked }).catch(() => {}); }}><option value="girl">Girl</option><option value="boy">Boy</option><option value="unspecified">Prefer not to say</option></select>
              </section>
            <section className="m-input-group">
              <p className="m-input-title">Choose interests, or add your own</p>
              <ChoiceChips options={interestOptions} selected={interestChoices} onToggle={option => { setError(""); setInterestChoices(current => current.includes(option) ? current.filter(value => value !== option) : [...current, option]); }} />
              <label className="m-input-free-label" htmlFor="other-interests">{childNameForDisplay ? `What else does ${childNameForDisplay} enjoy?` : "What else do they enjoy?"}</label>
              <textarea id="other-interests" value={otherInterests} onChange={e => { setOtherInterests(e.target.value); setError(""); }} placeholder="For example: writing mysteries, comparing restaurant reviews…" maxLength={800} disabled={busy} />
              <p className="m-input-helper">One genuine interest is enough to start.</p>
            </section>
            {error && <div role="alert" className="m-error">{error}</div>}
            <button className="m-primary m-input-submit" type="submit" disabled={busy || !childAge || !gender || !interests.trim()}>Continue <span aria-hidden="true">→</span></button>
            <p className="m-input-reassurance">No account or payment needed to explore.</p>
          </form>
        </> : <>
          <p className="m-eyebrow">STEP 2 OF 2 · YOUR HOPES</p>
          <h1>What matters to you as a parent?</h1>
          <p className="m-lede">Choose what matters most as you explore possible futures.</p>
          <form onSubmit={submit}>
            <section className="m-input-group">
              <p className="m-input-title">Choose your hopes, or add your own</p>
              <ChoiceChips options={hopeOptions} selected={hopeChoices} onToggle={option => { setError(""); setHopeChoices(current => current.includes(option) ? current.filter(value => value !== option) : [...current, option]); }} />
              <label className="m-input-free-label" htmlFor="other-hopes">What else matters to you?</label>
              <textarea id="other-hopes" value={otherHopes} onChange={e => { setOtherHopes(e.target.value); setError(""); }} placeholder="For example: meaningful work, flexibility…" maxLength={800} disabled={busy} />
              <p className="m-input-helper">Your hopes can be edited as you explore.</p>
            </section>
            {error && <div role="alert" className="m-error">{error}</div>}
            <button className="m-primary m-input-submit" type="submit" disabled={busy || !hopes.trim()}>{busy ? "Exploring possible futures…" : "Continue"}{busy ? <span className="m-spinner" /> : <Icon name="arrow" />}</button>
            <p className="m-input-reassurance">No account or payment needed to explore.</p>
          </form>
        </>}
      </section>}
      {screen === "results" && results && <section id="pathways" className="results-v2">
        <p className="m-eyebrow results-v2-label">THREE STARTING POINTS · THE 2030s</p>
        <h1>{childNameForDisplay ? `Which direction would ${childNameForDisplay} enjoy exploring?` : "Which direction would they enjoy exploring?"}</h1>
        <p className="m-lede">Preview a possible working day and a first project. You are choosing something to try, not a career for life.</p>
        <section className="results-starting-point" aria-label="Your starting point">
          <div className="results-starting-heading"><h2>Your starting point</h2><button type="button" onClick={() => { setInputStep(1); go("input"); }}>Edit</button></div>
          {childNameForDisplay && <p><strong>Name:</strong> {childNameForDisplay}</p>}
          <p><strong>Interests:</strong> {items(interests).join(" · ") || "—"}</p>
          <p><strong>Your hopes:</strong> {items(hopes).join(" · ") || "—"}</p>
          <p className="results-starting-age">Age {childAge || getVisitorAge() || "—"} · Parent-led exploration</p>
        </section>
        {planPrice !== undefined && <p className="results-price">All three previews are free. Full 12-month plans are {money(planPrice)} each.</p>}
        <div className="m-career-list results-path-list">{results.careers.map((c, i) => <CareerPossibilityCard key={c.title} career={c} index={i} reason={c.whyItFits} onPreview={() => { setSelected(i); void logAnalytics({ event: "career-opened", tracking: analyticsTracking(), entryPath: isExample ? "Example" : "Search", career: c.title, gender: gender || "unspecified" }).catch(() => {}); go("detail"); }} />)}</div>
        <div className="m-research-note"><Icon name="info" /><div><p>Illustrative 2030s scenarios. Interest overlap is not a skill assessment.</p></div></div>
        <ManagedFaqSection page="results" className="landing-faq results-faq" />
      </section>}
      {screen === "detail" && career && <section className="m-detail">
        <div className={`m-detail-hero tone-${selected}`}><p className="m-eyebrow">A POSSIBLE FUTURE · THE 2030s</p><h1>{displayAiText(career.title)}</h1><p>{displayAiText(roleShortFor(selected, career))}</p><Chips text={interests} /></div>
        <section className="m-connection"><h2>Why this could <em>connect.</em></h2><p>{displayAiText(career.whyItFits)}</p></section>
        <button className="m-primary m-story-button" onClick={openStory}>Path to the future<Icon name="arrow" /></button>
        <ProfileCard label="What you hope for" values={items(hopes).map(value => value.charAt(0).toUpperCase() + value.slice(1)).join(" · ")} onEdit={() => go("input")}>
          {hasEarningsRange(career, story) && <><h3>Earning potential</h3><Earnings career={career} story={story} perYear /></>}<h3>Predictable employment</h3><p>{displayAiText(career.stability)}</p><h3>Working internationally</h3><p>{displayAiText(career.overseas)}</p>
        </ProfileCard>
      </section>}
      {screen === "storyboard" && career && results && <CareerDay key={career.title} title={career.title} searchKey={results.searchKey} careerIndex={selected} panels={story?.panels ?? []} heroSceneId={currentHero?.heroSceneId} heroImageUrl={currentHero?.heroImageUrl} gender={gender || "unspecified"} entryPath={isExample ? "Example" : "Search"} onBack={() => go("detail")} />}
      {SHOW_HOME_EXAMPLES && screen === "example" && selectedExample && <CareerDay key={`example-${selectedExample.id}`} title={selectedExample.career} searchKey="" careerIndex={0} panels={selectedExample.panels} heroSceneId={selectedExample.panels[0]?.sceneId} gender={selectedExample.gender} entryPath="Example" cachedOnly example={selectedExample} backLabel="Back to Home" onBack={() => { setSelectedExample(null); setIsExample(false); go("landing"); }} />}
      {error && screen !== "input" && <div className="m-error" role="alert"><Icon name="info" /><p>{error}</p></div>}
      {screen !== "landing" && <footer className="m-footer" id="m-perspective"><p>A direction, not a destiny.</p><span>Possibilities to explore together—not predictions or guarantees.</span><small>For parents of 13–16-year-olds</small></footer>}
    </main>
  </div>;
}
