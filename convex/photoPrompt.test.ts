import { expect, it } from "vitest";
import { careerOutfit, DEFAULT_OUTFIT, HEALTH_OUTFIT, BOY_HEALTH_OUTFIT, PERSON_DEFAULTS, photoCharacter } from "./photoPrompt";
it("preserves the exact Boy v2 identity with its white-shirt medical exception", () => {
  for (const title of ["Doctor", "Nurse", "Pharmacist", "Clinical Researcher", "Physiotherapist", "Public Health Analyst"])
    expect(careerOutfit(title)).toBe(HEALTH_OUTFIT);
  for (const title of ["Author", "Corporate Lawyer", "Economist", "Performing Artist"])
    { expect(photoCharacter("girl", title)).toContain(DEFAULT_OUTFIT); expect(photoCharacter("boy", title)).toBe(PERSON_DEFAULTS.boy); }
  expect(PERSON_DEFAULTS.boy).toBe("21-year-old Indian man, thick dark hair swept back with volume, thin dark metal rectangular glasses, light neat stubble, calm confident half-smile, navy blazer over an open-collar white shirt, natural light-medium skin tone matching the reference, soft warm indoor light");
  expect(photoCharacter("girl", "Doctor")).toContain(HEALTH_OUTFIT);
  expect(photoCharacter("boy", "Doctor")).toContain(PERSON_DEFAULTS.boy);
  expect(photoCharacter("boy", "Doctor")).toContain(BOY_HEALTH_OUTFIT);
  expect(photoCharacter("boy", "Doctor")).not.toContain("light-blue");
});
