import { useState } from "react";
import { displayAiText } from "./displayText";
import { normalizePlanTime } from "../convex/planTime";

export type PlanMonthCardData = {
  month: number;
  title: string;
  skill: string;
  details: string;
  successCriteria: string[];
  time: string;
  themeId: string;
  imageUrl: string;
  fallbackImageUrl: string;
};

export function makePlanMonthCardData(
  project: { month: number; title: string; skillIndex: number; build?: string; projectDetails?: string; targetSkill?: string; successCriteria?: string[]; timeNeeded?: string; thumbnailThemeId?: string },
  skills: string[],
  imageByTheme: ReadonlyMap<string, string>,
): PlanMonthCardData {
  const fallbackImageUrl = imageByTheme.get("finished-project") ?? "";
  const requestedThemeId = project.thumbnailThemeId ?? "finished-project";
  const imageUrl = imageByTheme.get(requestedThemeId) ?? fallbackImageUrl;
  const themeId = imageByTheme.has(requestedThemeId) ? requestedThemeId : "finished-project";
  return {
    month: project.month,
    title: displayAiText(project.title),
    skill: displayAiText(project.targetSkill || skills[project.skillIndex] || ""),
    details: displayAiText(project.projectDetails || project.build || ""),
    successCriteria: (project.successCriteria ?? []).map(displayAiText),
    time: normalizePlanTime(project.timeNeeded) ?? "3-4 hrs / month",
    themeId,
    imageUrl,
    fallbackImageUrl,
  };
}

export function PlanMonthCard({ data, heading = "h2" }: { data: PlanMonthCardData; heading?: "h2" | "h3" }) {
  const [useFallback, setUseFallback] = useState(false);
  const Heading = heading;
  const imageUrl = useFallback ? data.fallbackImageUrl : data.imageUrl;
  return <>
    {imageUrl && <img className="day-plan-card-image" data-thumbnail-theme={data.themeId} src={imageUrl} alt="" loading="eager" decoding="async" onError={() => {
      if (!useFallback && data.fallbackImageUrl && data.imageUrl !== data.fallbackImageUrl) setUseFallback(true);
    }} />}
    <div className="day-plan-card-content">
      <span className="day-month-number">Month {data.month}</span>
      <Heading>{data.title}</Heading>
      <div className="day-plan-highlights">
        <div className="day-skill-highlight"><span>Skill you'll build</span><strong>{data.skill}</strong></div>
        <div className="day-plan-chip day-time-highlight"><strong>Time</strong><p>{data.time}</p></div>
      </div>
      <div className="day-full-plan-field"><h3>Project details</h3><p>{data.details}</p></div>
      <div className="day-full-plan-field"><h3>Success criteria</h3><ul>{data.successCriteria.map((line, index) => <li key={index}>{line}</li>)}</ul></div>
    </div>
  </>;
}
