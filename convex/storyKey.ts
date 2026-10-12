import { CAREER_TITLES } from "./careerCatalog";
// Catalog careers use their exact title. Preserve older saved careers under their existing keys.
export const storyKey = (s: string) => CAREER_TITLES.some(title => title === s) ? s : s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
