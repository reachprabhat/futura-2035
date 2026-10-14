import { expect, it } from "vitest";
import { careerOutfit, DEFAULT_OUTFIT, HEALTH_OUTFIT, photoCharacter } from "./photoPrompt";
it("uses one fixed outfit for both genders, with the health exception", () => {
  for (const title of ["Doctor", "Nurse", "Pharmacist", "Clinical Researcher", "Physiotherapist", "Public Health Analyst"])
    expect(careerOutfit(title)).toBe(HEALTH_OUTFIT);
  for (const title of ["Author", "Corporate Lawyer", "Economist", "Performing Artist"])
    for (const gender of ["boy", "girl"] as const) expect(photoCharacter(gender, title)).toContain(DEFAULT_OUTFIT);
  for (const gender of ["boy", "girl"] as const) expect(photoCharacter(gender, "Doctor")).toContain(HEALTH_OUTFIT);
});
