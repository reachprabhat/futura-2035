export const PHOTO_STYLE = "Photorealistic editorial workplace photography, a real-looking Indian person, soft, warm daylight through a window in a modern workspace, shallow depth of field, warm fresh colours, realistic skin texture and natural proportions. Preserve the person's natural Indian skin tone; do not lighten or whiten skin. No illustration, vector art, cartoon, painting, CGI or plastic skin.";
export const DEFAULT_OUTFIT = "unstructured navy blazer over a plain white crew-neck top, no tie, no logos, neat and well-fitted";
export const HEALTH_OUTFIT = "a clean white coat over a plain light-blue shirt";
export const BOY_HEALTH_OUTFIT = "a clean white coat over the open-collar white shirt";
export const careerOutfit = (title: string) => /doctor|nurse|pharmac|clinical|medical|health|physiotherap|therapist|psychologist|nutritionist|genetic counsellor|biomedical/i.test(title) ? HEALTH_OUTFIT : DEFAULT_OUTFIT;
// Locked default identities; only the shared outfit selector varies by career.
export const PERSON_DEFAULTS = Object.freeze({ girl: "20-year-old Indian woman who looks like a final-year college student, fresh youthful face, light natural makeup, long voluminous dark wavy hair falling past her shoulders, gentle candid smile while looking down at a notebook she is writing in, soft grey cardigan over a white top, small earrings, light-medium wheatish skin tone, warm cafe with soft golden bokeh lights behind her, shallow depth of field", boy: "21-year-old Indian man, thick dark hair swept back with volume, thin dark metal rectangular glasses, light neat stubble, calm confident half-smile, navy blazer over an open-collar white shirt, natural light-medium skin tone matching the reference, soft warm indoor light" });
export const photoCharacter = (gender: "girl" | "boy", title = "Author") => {
  const description = PERSON_DEFAULTS[gender];
  if (gender === "boy") return careerOutfit(title) === HEALTH_OUTFIT
    ? `${description}. Medical outfit override: replace the navy blazer with ${BOY_HEALTH_OUTFIT}; retain the white shirt and all identity features.`
    : description;
  return description.replace("soft grey cardigan over a white top", careerOutfit(title));
};
export function photoPrompt(character: string, caption: string) {
  return [
    `Fixed protagonist, identical appearance in every panel: ${character}`,
    PHOTO_STYLE,
    "For both genders, use soft, warm daylight in a modern workspace. This shared lighting and setting takes priority over any cafe lighting in the person description. Match the reference style and mood, not the exact face; create an original fictional person.",
    "a single scene, one image, not a grid, collage, comic strip or multiple panels",
    "no text, letters, numbers, words, signs, charts or screens with writing anywhere in the image",
    "Exactly one human visible: the fixed protagonist. Other people remain off camera. Use a believable working environment with wood, paper and soft cotton textures. Blank paper only; screens closed or facing away. Candid medium shot at eye level, face and hands in focus, softly blurred workplace behind. No logos, watermarks, speech bubbles or inset portraits.",
    `Career activity: ${caption.slice(0, 600)}`,
  ].join("\n");
}

