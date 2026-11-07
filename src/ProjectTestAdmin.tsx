import React, { useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import BrandLogo from "./BrandLogo";
import { adminLockRemaining, recordAdminFailure, rememberedAdminKey, saveAdminSession } from "./adminSession";
import "./project-test-admin.css";

const presets = [
  { id: "A", label: "Drawing · beginner", profile: { age: 14, interests: "Drawing", strengths: "Visual thinking", competencyLevel: "beginner" } },
  { id: "B", label: "Drawing · advanced", profile: { age: 14, interests: "Drawing", strengths: "Visual thinking", competencyLevel: "advanced" } },
  { id: "C", label: "Robotics · beginner", profile: { age: 14, interests: "Robotics", strengths: "Visual thinking", competencyLevel: "beginner" } },
  { id: "D", label: "Debating · intermediate", profile: { age: 16, interests: "Debating", strengths: "Writing", competencyLevel: "intermediate" } },
];
type Profile = { age: string; interests: string; strengths: string; personalityTraits: string; competencyLevel: string; domain: string };
type Result = FunctionReturnType<typeof api.ai.testProjectSuggestions>;
type RunRecord = { id: string; label: string; profile: Profile; result?: Result; error?: string; createdAt: number };
const emptyProfile: Profile = { age: "", interests: "", strengths: "", personalityTraits: "", competencyLevel: "", domain: "" };

function CareerCards({ result }: { result: Result }) {
  return <>
    <p className="project-test-cost">Career-pick call: {result.careerPickCostINR === null ? "unknown" : `₹${result.careerPickCostINR.toFixed(4)}`} · Total run: {result.totalRunCostINR === null ? "unknown" : `₹${result.totalRunCostINR.toFixed(4)}`}</p>
    <div className="project-test-careers">{result.careers.map((career, index) => <section className="project-test-career" key={`${index}-${career.career}`}>
      <p className="eyebrow">CAREER 0{index + 1} · {career.domain}</p><h4>{career.career}</h4>
      <p><strong>Why it fits:</strong> {career.whyFits}</p>
      <p><strong>How hard is this?</strong> {career.howHardThisIs} A nearby path: {career.nearbyCareer}.</p>
      <p><strong>Earning potential:</strong> {career.earningPotential}</p>
      <p><strong>Working abroad:</strong> {career.workingAbroad}</p>
      <h5>Three important skills</h5><ul>{career.skills.map((skill, skillIndex) => <li key={skillIndex}><strong>{skill.name}</strong>{skill.name === career.closestSkill && <span className="project-test-closest"> · Closest already</span>}<br />{skill.evidence}{skill.name === career.closestSkill && <><br /><span>{career.closestSkillReason}</span></>}</li>)}</ul>
      <div className="project-test-project">
        {career.project.adultNote && <p className="project-test-adult-note"><strong>{career.project.adultNote}</strong></p>}
        <p className="eyebrow">SKILL-BUILDING PROJECT</p><h5>{career.project.title}</h5>
        <p><strong>Time:</strong> {career.project.timeEstimate}</p>
        <p><strong>Materials budget:</strong> {career.project.materialsBudget}</p>
        <h6>Materials</h6><ul>{career.project.materials.map((item, i) => <li key={i}>{item}</li>)}</ul>
        <h6>Steps</h6><ol>{career.project.steps.map((item, i) => <li key={i}>{item}</li>)}</ol>
        <p><strong>At the end:</strong> {career.project.endProduct}</p>
        <p><strong>Skills it builds:</strong> {career.project.skillsBuilt.join(", ")}</p>
      </div>
      <p className="project-test-cost">Career cost: {career.totalCostINR === null ? "unknown" : `₹${career.totalCostINR.toFixed(4)}`} <small>(career call {career.careerCallCostINR === null ? "unknown" : `₹${career.careerCallCostINR.toFixed(4)}`} + one third of career-pick call {career.allocatedCareerPickCostINR === null ? "unknown" : `₹${career.allocatedCareerPickCostINR.toFixed(4)}`})</small></p>
    </section>)}</div>
    <details className="raw-output"><summary>Raw result</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>
  </>;
}

function ProfileInputs({ profile }: { profile: Profile }) {
  return <dl className="project-test-inputs">
    <div><dt>Age</dt><dd>{profile.age || "(blank)"}</dd></div>
    <div><dt>Interests</dt><dd>{profile.interests || "(blank)"}</dd></div>
    <div><dt>Strengths</dt><dd>{profile.strengths || "(blank)"}</dd></div>
    <div><dt>Personality traits</dt><dd>{profile.personalityTraits || "(blank)"}</dd></div>
    <div><dt>Competency level</dt><dd>{profile.competencyLevel || "(blank)"}</dd></div>
    <div><dt>Domain</dt><dd>{profile.domain || "(none)"}</dd></div>
  </dl>;
}

function Run({ adminKey, lock }: { adminKey: string; lock: () => void }) {
  const runProfile = useAction(api.ai.testProjectSuggestions);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [busy, setBusy] = useState(false);

  async function callProfile(label: string, input: Profile) {
    try {
      const result = await runProfile({
        adminKey,
        profile: {
          age: input.age,
          interests: input.interests,
          strengths: input.strengths,
          personalityTraits: input.personalityTraits,
          competencyLevel: input.competencyLevel,
          ...(input.domain.trim() ? { domain: input.domain } : {}),
        },
      });
      setRuns(previous => [{ id: crypto.randomUUID(), label, profile: input, result, createdAt: Date.now() }, ...previous]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "This profile could not be generated.";
      if (/Admin access required/i.test(message)) { recordAdminFailure(); lock(); return; }
      setRuns(previous => [{ id: crypto.randomUUID(), label, profile: input, error: message, createdAt: Date.now() }, ...previous]);
    }
  }

  async function runCustom(event: React.FormEvent) {
    event.preventDefault(); setBusy(true);
    await callProfile("Custom profile", { ...profile });
    setBusy(false);
  }

  async function runPresets() {
    setBusy(true);
    for (const preset of presets) {
      const input: Profile = { age: String(preset.profile.age), interests: preset.profile.interests, strengths: preset.profile.strengths, personalityTraits: "", competencyLevel: preset.profile.competencyLevel, domain: "" };
      await callProfile(`Preset ${preset.id} · ${preset.label}`, input);
    }
    setBusy(false);
  }

  function update(field: keyof Profile, value: string) { setProfile(previous => ({ ...previous, [field]: value })); }
  return <main className="project-test-admin">
    <div className="project-test-top"><BrandLogo /><span className="pill">DEV ONLY · ADMIN</span><button className="text-button" onClick={lock}>Lock</button></div>
    <p className="eyebrow">MODEL INPUT COMPARISON</p>
    <h1>Career-to-project suggestions</h1>
    <p className="section-description">Enter any child profile and optional domain, or run the four presets. Each run uses four fresh AI calls and the usual daily limits.</p>

    <form className="project-test-form" onSubmit={runCustom}>
      <h2>Custom profile</h2>
      <label>Age<textarea rows={1} value={profile.age} onChange={event => update("age", event.target.value)} /></label>
      <label>Interests<textarea rows={2} value={profile.interests} onChange={event => update("interests", event.target.value)} /></label>
      <label>Strengths<textarea rows={2} value={profile.strengths} onChange={event => update("strengths", event.target.value)} /></label>
      <label>Personality traits<textarea rows={2} value={profile.personalityTraits} onChange={event => update("personalityTraits", event.target.value)} /></label>
      <label>Competency level<textarea rows={1} value={profile.competencyLevel} onChange={event => update("competencyLevel", event.target.value)} /></label>
      <label>Domain (optional)<textarea rows={1} placeholder="doctor, engineer, singer" value={profile.domain} onChange={event => update("domain", event.target.value)} /></label>
      <button className="primary project-test-run" disabled={busy}>{busy ? "Running…" : "Run this profile"}</button>
    </form>

    <section className="project-test-presets">
      <div><h2>Built-in profiles</h2><p>Run each preset separately and keep all four results in this session’s list.</p></div>
      <button className="primary" disabled={busy} onClick={runPresets}>{busy ? "Running presets…" : "Run all 4 presets"}</button>
    </section>

    <section className="project-test-history" aria-live="polite">
      <h2>Runs from this session</h2>
      {runs.length === 0 ? <p>No runs yet.</p> : runs.map(run => <article className="project-test-profile" key={run.id}>
        <header><div><h3>{run.label}</h3><p>{new Date(run.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p></div></header>
        <ProfileInputs profile={run.profile} />
        {run.error ? <p className="error" role="alert">{run.error}</p> : run.result ? <CareerCards result={run.result} /> : null}
      </article>)}
    </section>
  </main>;
}

export default function ProjectTestAdmin() {
  const [input, setInput] = useState("");
  const [adminKey, setAdminKey] = useState(rememberedAdminKey);
  const [keep, setKeep] = useState(false);
  function lock() { setAdminKey(""); setInput(""); }
  return adminKey ? <Run adminKey={adminKey} lock={lock} /> : <main className="project-test-admin">
    <BrandLogo /><span className="pill">DEV ONLY · ADMIN</span><h1>Project suggestion test</h1>
    <p className="section-description">Enter your separate admin key to run the test.</p>
    <form onSubmit={event => { event.preventDefault(); if (input.length < 10 || adminLockRemaining() > 0) return; saveAdminSession(input, keep); setAdminKey(input); }}>
      <label htmlFor="project-test-admin-key">Admin key</label><input id="project-test-admin-key" type="password" minLength={10} autoComplete="off" required value={input} onChange={event => setInput(event.target.value)} />
      <label><input type="checkbox" checked={keep} onChange={event => setKeep(event.target.checked)} /> Keep me signed in on this phone for 30 days</label>
      <button className="primary" disabled={adminLockRemaining() > 0}>Open test</button>
      {adminLockRemaining() > 0 && <p role="alert">Too many wrong attempts. Try again in {Math.ceil(adminLockRemaining() / 60000)} minutes.</p>}
    </form>
  </main>;
}
