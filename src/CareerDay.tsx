import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../convex/_generated/api";
import "./career-day.css";
type Panel = { caption: string; imageUrl: string | null; time?: string };
type Plan = { subtitle: string; skills: string[]; projects: { month: number; title: string; skillIndex: number; build: string; panelIndex: number }[] };
const times = ["9:00", "11:00", "2:00", "4:00"];
const icons = ["chart", "people", "idea", "note"] as const;
function DayIcon({ kind }: { kind: typeof icons[number] }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === "chart" ? <><path d="M4 20V12h3v8m4 0V8h3v12m4 0V4h3v16M3 8l6-4 5 1 6-4" /></> : kind === "people" ? <><circle cx="9" cy="7" r="3" /><path d="M3 20v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v2" /></> : kind === "idea" ? <><path d="M8 15c-6-7 2-15 8-9 3 3 0 7-1 9M9 18h6m-5 3h4M12 9v6" /></> : <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>}</svg>;
}
export function captionLabel(caption: string) {
  const verb = caption.match(/\b(review\w*|draft\w*|discuss\w*|host\w*|write\w*|research\w*|collaborat\w*|present\w*|test\w*|meet\w*|prepar\w*|analy[sz]\w*|design\w*|explor\w*|educat\w*)\b/i)?.[0];
  const word = verb ?? caption.split(/\W+/).find(w => w.length > 3) ?? "Day";
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}
export default function CareerDay({ title, searchKey, careerIndex, panels, cachedOnly = false }: { title: string; searchKey: string; careerIndex: number; panels: Panel[]; cachedOnly?: boolean }) {
  const createPlan = useAction(api.ai.careerPlan);
  const saved = useQuery(api.plans.get, { title });
  const [returned, setReturned] = useState<Plan | null>(null), [error, setError] = useState(""), [full, setFull] = useState(false), [skillsOpen, setSkillsOpen] = useState(true);
  const requested = useRef("");
  useEffect(() => {
    if (cachedOnly) return;
    if (requested.current === title) return;
    requested.current = title;
    let active = true;
    createPlan({ searchKey, careerIndex }).then(value => { if (active && value) setReturned(value); }).catch(e => { if (active) setError(e instanceof ConvexError ? String(e.data) : "We could not prepare this plan. Please open the career again to retry."); });
    return () => { active = false; };
  }, [title, searchKey, careerIndex, createPlan, cachedOnly]);
  const plan: Plan | null = saved?.status === "ready" ? saved.plan : returned;
  const projects = plan?.projects.slice(0, full ? 12 : 3) ?? (cachedOnly ? Array.from({length:3}, (_, i) => ({month:i+1,title:"Project not available yet",skillIndex:i,build:"-",panelIndex:i})) : []);
  const skills = plan?.skills ?? (cachedOnly ? Array(4).fill("Skill unavailable") : []);
  const firstImage = panels[0]?.imageUrl;
  const fallbackImage = panels.find(p => p.imageUrl)?.imageUrl;
  return <section className="career-day" id="storyboard" aria-busy={!plan && !error && !cachedOnly}>
    <div className="day-hero">
      <div className="day-hero-copy"><p className="day-eyebrow">A DAY IN THE LIFE</p><h1>{title}</h1><p className="day-subtitle">{plan?.subtitle ?? "A working day, a world of possibilities."}</p></div>
      {firstImage ? <img className="day-hero-image" src={firstImage} alt={`A working day as an ${title}`} /> : <div className="day-hero-image day-image-placeholder" aria-label="No cached image">Image not saved yet</div>}
    </div>
    <div className="day-strip" aria-label="Four moments in the day">
      <svg className="day-wave" viewBox="0 0 390 120" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="day-wave-colours"><stop stopColor="#7655bc" /><stop offset=".33" stopColor="#478b73" /><stop offset=".67" stopColor="#be844c" /><stop offset="1" stopColor="#aa6a92" /></linearGradient></defs><path d="M-10 55C55 8 110 65 177 40S300 5 400 48V120H-10Z" fill="#f8f7fc"/><path d="M-10 48C55 1 110 58 177 33S300 -2 400 41" stroke="url(#day-wave-colours)" strokeWidth="8" fill="none" opacity=".24"/><path d="M-10 55C55 8 110 65 177 40S300 5 400 48" stroke="white" strokeWidth="4" fill="none"/></svg>
      {times.map((time, i) => <div className={`day-moment day-tone-${i}`} key={time}>
        <div className="day-moment-photo">{panels[i]?.imageUrl ? <img src={panels[i].imageUrl!} alt={panels[i].caption} /> : <div className="day-image-placeholder">No saved image</div>}</div>
        <span className="day-round-icon"><DayIcon kind={icons[i]} /></span><time>{time}</time><span className="day-moment-label">{panels[i]?.caption ? captionLabel(panels[i].caption) : "Day"}</span>
      </div>)}
    </div>
    <section className="day-card day-skills"><div className="day-card-heading"><div><h2>The skills behind the day</h2><p>Each part of the day builds a key skill.</p></div><button className="day-chevron" aria-label="Show skills behind the day" aria-expanded={skillsOpen} onClick={() => setSkillsOpen(value => !value)}>›</button></div>
      {skillsOpen && <div className="day-skill-grid">{times.map((_, i) => <div className={`day-skill day-tone-${i}`} key={i}><DayIcon kind={icons[i]} /><span>{skills[i] ?? "Preparing skill…"}</span></div>)}</div>}
    </section>
    <section className="day-card day-plan"><div className="day-card-heading"><div><h2>Your 12-month plan</h2><p>12 projects. Real skills. A clear path.</p></div><button className="day-chevron" aria-label="Show full 12-month plan" aria-expanded={full} disabled={!plan} onClick={() => setFull(value => !value)}>›</button></div>
      {error || saved?.status === "failed" ? <p className="day-plan-error" role="alert">{error || "This plan could not finish. Reopen the career to try again."}</p> : !plan && !cachedOnly ? <p className="day-plan-loading" role="status">Preparing your monthly projects…</p> : <ol className="day-timeline">{projects.map(project => {
        const image = panels[(project.month - 1) % 4]?.imageUrl ?? fallbackImage;
        return <li className={`day-month day-tone-${project.skillIndex}`} key={project.month}>
          <span className="day-timeline-dot" aria-hidden="true">{project.month === 1 ? "✓" : ""}</span><span className="day-month-number">Month {project.month}</span>
          <div className="day-project"><div className="day-project-copy"><h3>{project.title}</h3><span className="day-tag">{skills[project.skillIndex]}</span><p><strong>Build:</strong> {project.build}</p></div>{image ? <img className="day-project-image" src={image} alt={`Workday illustration related to ${skills[project.skillIndex]}`} /> : <div className="day-project-image day-image-placeholder">No saved image</div>}</div>
        </li>;
      })}</ol>}
    </section>
    <div className="day-sticky"><button className="m-primary" disabled={!plan} onClick={() => setFull(value => !value)}>{full ? "Show months 1 to 3" : "View full 12-month plan"}</button></div>
  </section>;
}
