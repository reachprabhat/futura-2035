export const GENERAL_PLAN_THUMBNAIL = "finished-project";

const skillThemes: Record<string, string> = {
  "data analysis": "laptop-charts",
  "stakeholder communication": "interview",
  "policy strategy": "planning-board",
  "presentation skills": "presentation-slides",
  "critical thinking": "reading-research",
  "research skills": "reading-research",
  research: "reading-research",
  "creative writing": "notebook-writing",
  editing: "notebook-writing",
  teaching: "workshop-class",
  "trend research": "laptop-charts",
  "culinary interviewing": "interview",
  "sensory presentation": "presentation-slides",
  "critical writing": "notebook-writing",
  "cultural awareness": "reading-research",
  storytelling: "video-recording",
};

export function skillThumbnailTheme(skill: string | undefined) {
  return skill ? skillThemes[skill.trim().toLocaleLowerCase()] : undefined;
}

export function resolveThumbnailTheme(projectTheme: string | undefined, targetSkill: string | undefined, available: ReadonlySet<string>) {
  const candidates = [projectTheme, skillThumbnailTheme(targetSkill), GENERAL_PLAN_THUMBNAIL];
  return candidates.find((themeId): themeId is string => Boolean(themeId && available.has(themeId)));
}
