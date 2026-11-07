import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import "./career-day.css";
import { makePlanPdf, planPdfFileName } from "./planPdf";
import { analyticsTracking, lockedMessageForCareer, visitorTracking } from "./visitorTracking";
import { sceneImageUrl, thumbnailImageUrl, upiQrUrl } from "./compressedAssets";
import { CAREER_CATALOG } from "../convex/careerCatalog";
import { THUMBNAIL_THEME_IDS } from "../convex/thumbnailCatalog";import type { ExampleCareer } from "./exampleCareers";import { SHOW_HOME_EXAMPLES } from "./config";
import { resolveThumbnailTheme } from "./thumbnailResolution";
import { displayAiText } from "./displayText";
import { makePlanMonthCardData, PlanMonthCard } from "./PlanMonthCard";
type Panel = { caption: string; imageUrl: string | null; time?: string; sceneId?: string };
type PlanProject = { month: number; title: string; skillIndex: number; panelIndex: number; build?: string; projectDetails?: string; targetSkill?: string; successCriteria?: string[]; timeNeeded?: string; thumbnailThemeId?: string };
export type Plan = { subtitle: string; skills: string[]; coreSkills?: string[]; projects: PlanProject[] };
type RoleMoment2030s = { time: string; skill: string; why: string };
const times = ["9:00", "11:00", "2:00", "4:00"];
const momentDisplayTimes = ["9:00 am", "11:00 am", "2:00 pm", "4:00 pm"];
const icons = ["chart", "people", "idea", "note"] as const;
const upiId = "agarwal.prabhat3@ybl";
const upiPayee = "Prabhat Agarwal";
function upiPaymentUrl(amount: number) {
  const params = new URLSearchParams({ pa: upiId, pn: upiPayee, am: String(amount), cu: "INR", tn: "Pathlight plan" });
  return `upi://pay?${params.toString()}`;
}
function DayIcon({ kind }: { kind: typeof icons[number] }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === "chart" ? <><path d="M4 20V12h3v8m4 0V8h3v12m4 0V4h3v16M3 8l6-4 5 1 6-4" /></> : kind === "people" ? <><circle cx="9" cy="7" r="3" /><path d="M3 20v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v2" /></> : kind === "idea" ? <><path d="M8 15c-6-7 2-15 8-9 3 3 0 7-1 9M9 18h6m-5 3h4M12 9v6" /></> : <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>}</svg>;
}
export function captionLabel(caption: string) {
  const verb = caption.match(/\b(review\w*|draft\w*|discuss\w*|host\w*|write\w*|research\w*|collaborat\w*|present\w*|test\w*|meet\w*|prepar\w*|analy[sz]\w*|design\w*|explor\w*|educat\w*)\b/i)?.[0];
  const word = verb ?? caption.split(/\W+/).find(w => w.length > 3) ?? "Day";
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}
function shortMomentSkill(value: string) {
  const words = displayAiText(value).trim().split(/\s+/).filter(Boolean);
  return words.length > 3 ? words.slice(0, 3).join(" ") : words.join(" ");
}
function momentTime(value: string, index: number) {
  const clock = displayAiText(value).trim().replace(/\s*(?:am|pm)$/i, "");
  return clock ? `${clock} ${index < 2 ? "am" : "pm"}` : momentDisplayTimes[index];
}
function cleanSkillWhy(value: string) {
  const cleaned = displayAiText(value).trim().replace(/^In the 2030s,\s*(?:to\s+)?/i, "");
  return cleaned ? (cleaned[0].toUpperCase() + cleaned.slice(1)).replace(/AI-generated/gi, "AI\u2011generated") : "";
}function FullPlanBackLink({ title, onClick, bottom = false }: { title: string; onClick: () => void; bottom?: boolean }) {  return <button className={`day-full-plan-back${bottom ? " day-full-plan-back-bottom" : ""}`} type="button" onClick={onClick}>‹ Back to {displayAiText(title)}</button>;}
function updateQuery(values: Record<string, string | null>) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(values)) value === null ? url.searchParams.delete(key) : url.searchParams.set(key, value);
  history.replaceState({}, "", url);
}
function formatTimeNeeded(value: string) {
  return value.replace(/\b(\d+)\s*(?:[-–]\s*(\d+))?\s*hours?\s+over the month\b/i, (_match, start: string, end?: string) => `${start}${end ? `–${end}` : ""} hrs / month`);
}
export default function CareerDay({ title, searchKey, careerIndex, panels, heroSceneId, heroImageUrl, cachedOnly = false, gender = "unspecified", entryPath = "Unknown", onBack, backLabel = "Back to possibilities", example }: { title: string; searchKey: string; careerIndex: number; panels: Panel[]; heroSceneId?: string; heroImageUrl?: string | null; cachedOnly?: boolean; gender?: "girl" | "boy" | "unspecified"; entryPath?: "Example" | "Search" | "Unknown"; onBack?: () => void; backLabel?: string; example?: ExampleCareer }) {
  const createPlan = useAction(api.ai.careerPlan);
  const tagPlanThemes = useAction(api.planThumbnailActions.tagSavedPlanForViewer);
  const saved = useQuery(api.plans.get, example ? "skip" : { title });
  const savedRole2030s = useQuery(api.sceneLibrary.role2030s, example ? "skip" : { title }) as { role2030s?: string; dayMoments2030s?: RoleMoment2030s[] } | null | undefined;  const role2030s = example ? { role2030s: example.dayDescription, dayMoments2030s: example.dayMoments } : savedRole2030s;
  const thumbnailImages = useQuery(api.planThumbnails.images, example ? "skip" : {});
  const price = useQuery(api.planUnlocks.price, {});
  const paymentMode = useQuery(api.planUnlocks.paymentMode, {});
  const lockedMessage = useQuery(api.planUnlocks.lockedMessage, {});
  const beginCheckout = useMutation(api.planUnlocks.beginCheckout);
  const recordFreePreviewTap = useMutation(api.planUnlocks.recordFreePreviewTap);
  const createRequest = useMutation(api.planUnlocks.createRequest);
  const logEvent = useMutation(api.planUnlocks.logEvent);
  const logAnalytics = useMutation(api.planUnlocks.logAnalytics);
  const [returned, setReturned] = useState<Plan | null>(null), [error, setError] = useState(""), [needsReview, setNeedsReview] = useState(false), [skillsOpen, setSkillsOpen] = useState(true), [retryAttempt, setRetryAttempt] = useState(0);
  const [showFullPlan, setShowFullPlan] = useState(() => new URLSearchParams(location.search).get("plan") === "1");
  const [activeGender, setActiveGender] = useState(gender);
  const [checkoutToken, setCheckoutToken] = useState(() => new URLSearchParams(location.search).get("checkout") ?? "");
  const [requestToken, setRequestToken] = useState(() => new URLSearchParams(location.search).get("request") ?? "");
  const [parentName, setParentName] = useState(""), [mobile, setMobile] = useState(""), [requestError, setRequestError] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false), [fileBusy, setFileBusy] = useState(false);
  useEffect(() => {
    const syncPlanRoute = () => setShowFullPlan(new URLSearchParams(location.search).get("plan") === "1");
    window.addEventListener("popstate", syncPlanRoute);
    return () => window.removeEventListener("popstate", syncPlanRoute);
  }, []);
  const optimizedPanels = panels.map(panel => ({ ...panel, caption: displayAiText(panel.caption), imageUrl: sceneImageUrl(panel.sceneId, activeGender, panel.imageUrl) }));
  const viewLoggedFor = useRef("");
  const requested = useRef("");
  const tagsRequested = useRef("");
  useEffect(() => {
    if (cachedOnly || saved === undefined || (saved?.status === "ready" && saved.plan)) return;
    if (requested.current === title) return;
    requested.current = title;
    let active = true;
    createPlan({ searchKey, careerIndex, tracking: visitorTracking() }).then(value => { if (!active || !value) return; if (value.state === "needs-review") setNeedsReview(true); else setReturned(value); }).catch(e => { console.error("Career plan failed to load:", e); if (active) setError("We couldn't load this plan. Please try again."); });
    return () => { active = false; };
  }, [title, searchKey, careerIndex, createPlan, cachedOnly, saved, retryAttempt]);
  const plan: Plan | null = example?.plan ?? (saved?.status === "ready" && saved.plan ? saved.plan as Plan : returned);
  const orderedProjects = [...(plan?.projects ?? [])].sort((a, b) => a.month - b.month);
  const savedSubtitle = plan?.subtitle.trim() ? displayAiText(plan.subtitle.trim()) : undefined;
  const fullCareerDescription = CAREER_CATALOG.find(career => career.title === title)?.description;
  const fallbackHeroDescription = savedSubtitle && savedSubtitle.length >= 40 && !/[.!?…]$/u.test(savedSubtitle)
    ? fullCareerDescription ?? savedSubtitle
    : savedSubtitle ?? "A working day, a world of possibilities.";
  const heroDescription = example?.promise || role2030s?.role2030s?.trim() || fallbackHeroDescription;
  useEffect(() => {
    if (cachedOnly || !plan) return;
    if (tagsRequested.current === title) return;
    tagsRequested.current = title;
    tagPlanThemes({ title, tracking: visitorTracking() }).catch(() => { tagsRequested.current = ""; });
  }, [cachedOnly, plan, title, tagPlanThemes]);
  const quote = useQuery(api.planUnlocks.quote, checkoutToken ? { token: checkoutToken } : "skip");
  const requestStatus = useQuery(api.planUnlocks.requestStatus, requestToken ? { token: requestToken } : "skip");
  const effectiveGender = activeGender === "boy" ? "boy" : "girl";
  const isApproved = !example && Boolean(requestStatus?.status === "approved" && requestStatus.career === title && requestStatus.gender === effectiveGender);
  const canViewPlan = !example && (paymentMode === "free_preview" || isApproved);
  const dayLogged = useRef(false), previewLogged = useRef(false), fullPlanLogged = useRef(false);
  useEffect(() => {
    if (cachedOnly || dayLogged.current) return;
    dayLogged.current = true;
    void logAnalytics({ event: "day-viewed", tracking: analyticsTracking(), entryPath, career: title }).catch(() => {});
  }, [cachedOnly, entryPath, title, logAnalytics]);
  useEffect(() => {
    if (!plan || previewLogged.current) return;
    previewLogged.current = true;
    void logAnalytics({ event: "plan-preview-viewed", tracking: analyticsTracking(), entryPath, career: title }).catch(() => {});
  }, [plan, entryPath, title, logAnalytics]);
  useEffect(() => {
    if (!showFullPlan || !canViewPlan || !plan || fullPlanLogged.current) return;
    fullPlanLogged.current = true;
    void logAnalytics({ event: "full-plan-shown", tracking: analyticsTracking(), entryPath, career: title }).catch(() => {});
  }, [showFullPlan, canViewPlan, plan, entryPath, title, logAnalytics]);
  useEffect(() => {
    if (!showFullPlan || paymentMode === undefined || paymentMode === "free_preview") return;
    if (!requestToken || (requestStatus !== undefined && !isApproved)) {
      setShowFullPlan(false);
      updateQuery({ plan: null });
    }
  }, [showFullPlan, paymentMode, requestToken, requestStatus, isApproved]);
  const isPayScreen = Boolean(checkoutToken && !requestToken);
  const roleMoments = role2030s?.dayMoments2030s?.length === 4 ? role2030s.dayMoments2030s : null;
  const skills = roleMoments?.map(moment => moment.skill) ?? plan?.skills ?? [];
  const projects = orderedProjects.slice(0, showFullPlan ? 12 : 1);
  const firstImage = heroSceneId ? sceneImageUrl(heroSceneId, activeGender, heroImageUrl ?? null) : optimizedPanels[0]?.imageUrl;
  const savedThemeUrls = new Map<string, string | null>((thumbnailImages ?? []).map((item: any) => [item.themeId, item.imageUrl] as const));
  const themeImageById = new Map<string, string>();
  for (const themeId of THUMBNAIL_THEME_IDS) {
    const imageUrl = thumbnailImageUrl(themeId, savedThemeUrls.get(themeId) ?? null);
    if (imageUrl) themeImageById.set(themeId, imageUrl);
  }
  const availableThemeIds = new Set(themeImageById.keys());
  const displayProjects = orderedProjects.map(project => {
    const targetSkill = project.targetSkill ?? skills[project.skillIndex];
    const thumbnailThemeId = resolveThumbnailTheme(project.thumbnailThemeId, targetSkill, availableThemeIds);
    return {
      ...project,
      title: displayAiText(project.title),
      projectDetails: project.projectDetails ? displayAiText(project.projectDetails) : undefined,
      build: project.build ? displayAiText(project.build) : undefined,
      targetSkill: targetSkill ? displayAiText(targetSkill) : undefined,
      successCriteria: project.successCriteria?.map(displayAiText),
      timeNeeded: project.timeNeeded ? displayAiText(project.timeNeeded) : undefined,
      thumbnailThemeId,
    };
  });
  useEffect(() => {
    if (!plan || isPayScreen || isApproved || (requestToken && requestStatus === undefined)) return;
    const key = `${title}|${effectiveGender}|${requestToken || "new"}`;
    if (viewLoggedFor.current === key) return;
    viewLoggedFor.current = key;
    void logEvent({ event: "locked-card-view", career: title, gender: effectiveGender, tracking: visitorTracking(), entryPath, ...(requestToken ? { requestToken } : {}) }).catch(() => {});
  }, [plan, isPayScreen, isApproved, requestToken, requestStatus, effectiveGender, title, logEvent]);
  async function payTap() {
    const checkoutGender = effectiveGender;
    if (!plan) return;
    setRequestError("");
    try {
      if (paymentMode === "free_preview") {
        await recordFreePreviewTap({ career: title, gender: checkoutGender, tracking: visitorTracking(), entryPath });
        setActiveGender(checkoutGender);
        updateQuery({ gender: checkoutGender, checkout: null, pay: null, request: null, plan: "1" });
        setShowFullPlan(true);
        window.scrollTo(0, 0);
        return;
      }
      if (paymentMode !== "paid") return;
      const value = await beginCheckout({ career: title, gender: checkoutGender, tracking: visitorTracking(), entryPath });
      setActiveGender(checkoutGender);
      setCheckoutToken(value.token);
      updateQuery({ checkout: value.token, pay: "1", request: null, gender: checkoutGender });
    } catch { setRequestError("The payment screen could not open. Please try again."); }
  }
  async function paid(e: React.FormEvent) {
    e.preventDefault();
    if (!checkoutToken) return;
    setPaymentBusy(true); setRequestError("");
    try {
      const value = await createRequest({ quoteToken: checkoutToken, parentName, mobile, tracking: visitorTracking() });
      setRequestToken(value.token); setCheckoutToken("");
      updateQuery({ request: value.token, checkout: null, pay: null });
    } catch (reason) { setRequestError(reason instanceof ConvexError ? String(reason.data) : "We could not record the payment yet. Please try again."); }
    finally { setPaymentBusy(false); }
  }
  async function planFile() {
    if (!plan || !canViewPlan || fileBusy) return null;
    setFileBusy(true);
  try { return await makePlanPdf({ career: displayAiText(title), gender: activeGender === "girl" ? "Girl" : "Boy", panels: optimizedPanels, projects: displayProjects, skills: (plan.coreSkills?.length ? plan.coreSkills : skills).map(displayAiText), imageByTheme: themeImageById, dayDescription: role2030s?.role2030s }); }
    finally { setFileBusy(false); }
  }
  async function downloadPlan() {
    if (!canViewPlan) return;
    try {
      const blob = await planFile(); if (!blob) return;
      const fileUrl = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = fileUrl; anchor.download = planPdfFileName(title); anchor.click();
      setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
      await logEvent({ event: "download", career: title, gender: effectiveGender, ...(requestToken ? { requestToken } : {}), tracking: visitorTracking(), entryPath });
    } catch { setRequestError("The PDF could not be made. Check your connection and try again."); }
  }
  async function sharePlan() {
    if (!plan || !canViewPlan || fileBusy) return;
    const text = displayAiText(`Pathlight · ${title} — 12-month plan\n${orderedProjects.map(project => `Month ${project.month}: ${project.title}\n${project.projectDetails ?? project.build ?? ""}`).join("\n\n")}`);
    try {
      const blob = await planFile(); if (!blob) return;
      const file = new File([blob], planPdfFileName(title), { type: "application/pdf" });
      await logEvent({ event: "share", career: title, gender: effectiveGender, ...(requestToken ? { requestToken } : {}), tracking: visitorTracking(), entryPath });
      const supported = typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }));
      if (supported) await navigator.share({ files: [file], title: displayAiText(`${title} · 12-month plan`) });
      else location.assign(`https://wa.me/?text=${encodeURIComponent(text)}`);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setRequestError("Sharing could not start. Please try again.");
    }
  }
  function openFullPlan() {
    const url = new URL(location.href);
    url.searchParams.set("career", title);
    url.searchParams.set("gender", effectiveGender);
    if (requestToken) url.searchParams.set("request", requestToken);
    else url.searchParams.delete("request");
    url.searchParams.delete("checkout");
    url.searchParams.delete("pay");
    url.searchParams.set("plan", "1");
    history.pushState({ plan: true }, "", url);
    setShowFullPlan(true);
    window.scrollTo(0, 0);
  }
  function closeFullPlan() {
    const url = new URL(location.href);
    url.searchParams.delete("plan");
    history.replaceState({}, "", url);
    setShowFullPlan(false);
    window.scrollTo(0, 0);
  }
  if (isPayScreen) return <section className="career-day plan-pay-screen" id="storyboard">
      <button className="day-pay-back" type="button" onClick={() => { setCheckoutToken(""); updateQuery({ checkout: null, pay: null }); }}>‹ Back to {displayAiText(title)}</button>
    <div className="day-pay-card">
      <p className="day-eyebrow">FULL 12-MONTH PLAN</p><h1>Unlock the rest of the year</h1>
      <p className="day-pay-career">{displayAiText(title)} · {activeGender === "girl" ? "Girl" : "Boy"}</p>
      {quote ? <p className="day-pay-price">{"\u20B9"}{quote.amount}</p> : <p className="day-plan-loading" role="status">Loading this payment amount…</p>}
      {quote && <a className="m-primary day-upi-button" href={upiPaymentUrl(quote.amount)}>{"Pay "}{"\u20B9"}{quote.amount} with UPI app</a>}
      <img className="day-pay-qr" src={upiQrUrl} alt={quote ? `UPI QR code to pay ${"\u20B9"}${quote.amount}` : "UPI payment QR code"} />
      <p className="day-pay-instruction">{quote ? `Pay ${"\u20B9"}${quote.amount} from another phone by scanning this.` : "Paying from another phone? Scan this."}</p>
      <form onSubmit={paid} className="day-pay-form">
        <label htmlFor="parent-name">Parent name</label><input id="parent-name" value={parentName} onChange={event => setParentName(event.target.value)} autoComplete="name" minLength={2} maxLength={80} required />
        <label htmlFor="parent-mobile">Mobile number</label><input id="parent-mobile" type="tel" inputMode="tel" pattern="[0-9+ ()-]{10,20}" value={mobile} onChange={event => setMobile(event.target.value)} autoComplete="tel" required />
        {requestError && <p role="alert" className="day-pay-error">{displayAiText(requestError)}</p>}
        <button className="m-primary" type="submit" disabled={!quote || paymentBusy}>{paymentBusy ? "Saving…" : "I have paid"}</button>
      </form>
      {!quote && checkoutToken && <p role="alert" className="day-pay-error">This payment quote is unavailable. Return to the plan and start again.</p>}
    </div>
  </section>;
  if (showFullPlan) {
    if (saved?.status === "needs-review" || needsReview) return <section className="career-day day-full-plan" id="storyboard" aria-label={`${displayAiText(title)} plan review`}><p className="day-plan-error" role="status">This plan needs a quick review before it can be shown. Please check back later.</p></section>;
    if (paymentMode === undefined || !canViewPlan || !plan) return null;
    return <section className="career-day day-full-plan" id="storyboard" aria-label={`${displayAiText(title)} 12-month plan`}>
      <FullPlanBackLink title={title} onClick={closeFullPlan} />
      <header className="day-full-plan-heading"><p className="day-eyebrow">YOUR 12-MONTH PLAN</p><h1>{displayAiText(title)}</h1><p>Small projects that build from Month 1 through Month 12.</p></header>
      {role2030s?.role2030s?.trim() && <section className="day-full-plan-day-in-life"><h2>A day in the life</h2><p>{displayAiText(role2030s.role2030s.trim())}</p></section>}
      <section className="day-core-skills" aria-label="Skills your child will build"><h2>Skills your child will build</h2>{(() => {
        const rawCoreSkills = plan.coreSkills?.length ? plan.coreSkills : skills;
        const coreSkills = rawCoreSkills.map(displayAiText);
        const counts = rawCoreSkills.map((skill, index) => orderedProjects.filter(project => (project.targetSkill ?? skills[index]) === skill).length);
        const sameCounts = counts.length > 0 && counts.every(count => count === counts[0]);
        return <>
          {sameCounts && <p className="day-core-skill-summary">Each skill is practised in {counts[0]} {counts[0] === 1 ? "project" : "projects"}.</p>}
          <div className="day-core-skill-list">{coreSkills.map((skill, index) => <span className={`day-core-skill day-tone-${index % 4}`} key={skill}>{skill}{!sameCounts && <small>{counts[index]} {counts[index] === 1 ? "project" : "projects"}</small>}</span>)}</div>
        </>;
      })()}</section>
      <ol className="day-full-plan-list">{displayProjects.map(project => {
        const skillTone = project.skillIndex % 4;
        return <li className={`day-full-plan-card day-tone-${skillTone}`} key={project.month}>
          <PlanMonthCard data={makePlanMonthCardData(project, skills, themeImageById)} />
        </li>;
      })}</ol>
      <div className="day-full-plan-actions"><button className="m-primary" type="button" onClick={() => void downloadPlan()} disabled={fileBusy}>{fileBusy ? "Preparing PDF…" : "Download PDF"}</button><button className="m-secondary" type="button" onClick={() => void sharePlan()} disabled={fileBusy}>{fileBusy ? "Preparing PDF…" : "Share on WhatsApp"}</button>{requestError && <p role="alert" className="day-pay-error">{displayAiText(requestError)}</p>}</div>      {(!example || SHOW_HOME_EXAMPLES) && <FullPlanBackLink title={title} onClick={closeFullPlan} bottom />}
    </section>;
  }
  return <section className="career-day" id="storyboard" aria-busy={!plan && !error && !cachedOnly}>
    <button className="m-back day-screen-back" type="button" onClick={onBack ?? (() => location.assign("/"))}>‹ {displayAiText(backLabel)}</button>    {example && <section className={`day-example-context day-example-${example.gender}`} aria-label={`Example: ${example.person}, ${example.age}`}>      <div className="day-example-person"><span className="day-example-avatar" aria-hidden="true">{example.person.slice(0, 1)}</span><div><p className="day-eyebrow">Example: {example.person}, {example.age}</p><strong>{example.person}'s interests</strong></div></div>      <p className="day-example-description">{example.description}</p>      <div className="day-example-interests">{example.interests.map(interest => <span key={interest}>{interest}</span>)}</div>      <div className="day-example-opportunities">{[["Current opportunity", example.currentOpportunity], ["Future opportunity", example.futureOpportunity]].map(([heading, points]) => <section className="day-example-opportunity" key={heading as string}><h2>{heading as string}</h2><ul>{(points as string[]).map(point => <li key={point}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>{point}</li>)}</ul></section>)}</div>    </section>}
    <div className="day-hero">
      <div className="day-hero-copy"><p className="day-eyebrow">A DAY IN THE LIFE</p><h1>{displayAiText(title)}</h1><p className="day-subtitle">{displayAiText(heroDescription)}</p></div>
      {firstImage ? <img className="day-hero-image" src={firstImage} alt={`A working day as an ${displayAiText(title)}`} loading="eager" fetchPriority="high" /> : <div className="day-hero-image day-image-placeholder" aria-hidden="true" />}
    </div>
    <div className="day-strip" aria-label="Four moments in the day">
      <svg className="day-wave" viewBox="0 0 390 120" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="day-wave-colours"><stop stopColor="#7655bc" /><stop offset=".33" stopColor="#478b73" /><stop offset=".67" stopColor="#be844c" /><stop offset="1" stopColor="#aa6a92" /></linearGradient></defs><path d="M-10 55C55 8 110 65 177 40S300 5 400 48V120H-10Z" fill="#f8f7fc"/><path d="M-10 48C55 1 110 58 177 33S300 -2 400 41" stroke="url(#day-wave-colours)" strokeWidth="8" fill="none" opacity=".24"/><path d="M-10 55C55 8 110 65 177 40S300 5 400 48" stroke="white" strokeWidth="4" fill="none"/></svg>
      {times.map((time, i) => <div className={`day-moment day-tone-${i}`} key={time}>
        <div className="day-moment-photo">{optimizedPanels[i]?.imageUrl ? <img src={optimizedPanels[i].imageUrl!} alt={optimizedPanels[i].caption} loading="lazy" /> : <div className="day-image-placeholder">No saved image</div>}</div>
        <span className="day-round-icon"><DayIcon kind={icons[i]} /></span><time>{roleMoments ? momentTime(roleMoments[i].time, i) : momentDisplayTimes[i]}</time><span className="day-moment-label" lang="en">{roleMoments ? shortMomentSkill(roleMoments[i].skill) : panels[i]?.caption ? captionLabel(displayAiText(panels[i].caption)) : "Day"}</span>
      </div>)}
    </div>
    <section className="day-card day-skills"><div className="day-card-heading"><div><h2>The skills behind the day</h2><p>Each part of the day builds a key skill.</p></div><button className="day-chevron" aria-label="Show skills behind the day" aria-expanded={skillsOpen} onClick={() => setSkillsOpen(value => !value)}>›</button></div>
      {skillsOpen && <div className="day-skill-grid">{times.map((_, i) => <div className={`day-skill day-tone-${i}`} key={i}><DayIcon kind={icons[i]} /><span>{displayAiText(skills[i] ?? "").replace(/problem-solving/gi, "problem\u2011solving")}</span>{roleMoments && <p>{cleanSkillWhy(roleMoments[i].why)}</p>}</div>)}</div>}
    </section>
    <section className="day-card day-plan"><div className="day-card-heading"><div><h2>Your 12-month plan</h2><p>12 projects. Real skills. A clear path.</p></div></div>
      {error || saved?.status === "failed" ? <div className="day-plan-error" role="alert"><p>We couldn't load this plan. Please try again.</p><button className="m-secondary" type="button" onClick={() => { requested.current = ""; setError(""); setReturned(null); setRetryAttempt(value => value + 1); }}>Try again</button></div> : needsReview || saved?.status === "needs-review" ? <p className="day-plan-error" role="status">This plan needs a quick review before it can be shown. Please check back later.</p> : !plan ? <p className="day-plan-loading" role="status">Preparing your monthly projects…</p> : isApproved ? <button className="m-primary day-view-plan-button" type="button" onClick={openFullPlan}>View full 12-month plan</button> : <>
      <ol className="day-timeline">{projects.map(project => displayProjects.find(item => item.month === project.month) ?? project).map(project => {
          const skillTone = project.skillIndex % 4;
          return <li className={`day-month day-tone-${skillTone}`} key={project.month}>
            <div className="day-project">
              <PlanMonthCard heading="h3" data={makePlanMonthCardData(project, skills, themeImageById)} />
            </div>
          </li>;
        })}</ol>
        <div className="day-locked-plan" aria-label="Months two through twelve are locked">
          <h3>Months 2–12</h3>
          <div className="day-locked-months">{Array.from({ length: 11 }, (_, index) => index + 2).map(month => <div className="day-locked-month" key={month} aria-label={`Month ${month}, locked project`}><span>Month {month}</span><strong aria-hidden="true">A project is planned here</strong></div>)}</div>
          {price !== undefined && <>
            <p className="day-locked-price">Pay <strong>{"\u20B9"}{price}</strong> to view the full plan</p>
            {lockedMessage?.trim() && <p className="day-plan-pitch">{displayAiText(lockedMessageForCareer(lockedMessage, title, price))}</p>}
          </>}
          {requestStatus?.status === "pending" && requestStatus.career === title && requestStatus.gender === effectiveGender && <p className="day-payment-confirmation" role="status">Payment received for review. Your full plan unlocks once it is confirmed.</p>}
          {requestStatus?.status === "rejected" && <p className="day-pay-error" role="status">This payment needs another review. You can send a new request.</p>}
          {requestError && <p className="day-pay-error" role="alert">{displayAiText(requestError)}</p>}
          {requestStatus?.status !== "pending" && <button className="m-primary day-pay-button" type="button" onClick={() => void payTap()} disabled={paymentBusy}>Make Payment</button>}
        </div>
      </>}
    </section>
  </section>;
}
