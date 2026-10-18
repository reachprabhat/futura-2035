import { careerOutfit, HEALTH_OUTFIT } from "./photoPrompt";

export const LIBRARY_VERSION = "shared-scenes-v1";
export const CREATIVE_CAREERS = [
  "Digital Accessibility Specialist", "User Experience Designer", "Game Designer",
  "Simulation Designer", "Digital Artist", "Animator", "Illustrator", "Author",
  "Content Strategist", "Editor", "Documentary Filmmaker", "Learning Designer",
  "Industrial Designer", "Performing Artist", "Assistive Technology Designer",
] as const;
export const isCreativeCareer = (title: string) => (CREATIVE_CAREERS as readonly string[]).includes(title);
export const SCENE_CATALOG = [
  { id: "research", title: "Research at a laptop", health: false, activity: "Researching at a wooden desk with a laptop facing away, writing observations in a blank notebook." },
  { id: "meeting", title: "Client or stakeholder meeting", health: false, activity: "Discussing a proposal at a meeting table, making an open hand gesture to someone off camera, closed folders nearby." },
  { id: "whiteboard", title: "Planning a solution", health: false, activity: "Standing beside a blank whiteboard, holding a marker while thinking through a solution with colleagues off camera." },
  { id: "presentation", title: "Presenting findings or teaching", health: false, activity: "Standing in a bright meeting space explaining findings or a lesson to an audience off camera, holding blank notes." },
  { id: "documents", title: "Reviewing documents", health: false, activity: "Carefully reviewing blank document pages at a wooden desk, making notes with a pen." },
  { id: "coding", title: "Building or testing software", health: false, activity: "Working intently at a software workstation, hands on a keyboard, monitor facing away from the camera." },
  { id: "lab", title: "Inspecting a laboratory sample", health: false, activity: "Visually inspecting a sealed harmless sample at a clean laboratory bench. No hazardous handling, protective equipment requirement, or lab coat; retain the fixed navy outfit." },
  { id: "field", title: "Site or field observation", health: false, activity: "Observing a landscaped outdoor site, recording findings in a blank notebook, modern buildings and greenery softly blurred behind. No construction hazards." },
  { id: "sketching", title: "Creative sketching", health: false, activity: "Developing a creative concept with a pencil and sketchbook at a bright studio desk, pages angled away so no markings are visible." },
  { id: "interview", title: "Interviewing a person", health: false, activity: "Listening thoughtfully to an interviewee off camera, pen poised over a blank notebook in a quiet meeting corner." },
  { id: "prototype", title: "Making a tabletop prototype", health: false, activity: "Carefully assembling a simple safe tabletop prototype using plain modular pieces in a bright design workshop. No power tools or hazardous materials." },
  { id: "practice", title: "Demonstrating or rehearsing a skill", health: false, activity: "Standing in an open light-filled practice studio, demonstrating a gentle movement with a poised expressive hand gesture to learners off camera." },
  { id: "health-research", title: "Health research and reviewing notes", health: true, activity: "Reviewing research notes at a desk in a bright modern medical workspace, laptop facing away, blank notebook and pen nearby." },
  { id: "consultation", title: "Patient consultation", health: true, activity: "Listening attentively to a patient off camera in a welcoming consultation room, holding a blank medical folder." },
  { id: "health-planning", title: "Planning a health project or care approach", health: true, activity: "Planning a health project or care approach at a medical team meeting table, organising blank notes and discussing next steps with colleagues off camera." },
  { id: "health-explanation", title: "Explaining health findings or guidance", health: true, activity: "Explaining health findings or guidance in a bright medical education room, holding a plain anatomical model, addressing listeners off camera." },
  { id: "creative-hero", title: "Creative studio hero", health: false, creative: true, activity: "At an inviting Indian creative studio desk, considering a sketchbook and a small finished design; quiet, natural window light and an uncluttered background." },
  { id: "creative-brief", title: "Exploring a creative brief", health: false, creative: true, activity: "Reviewing a simple visual brief and blank reference cards at a light-filled Indian design studio desk." },
  { id: "creative-making", title: "Making a first draft", health: false, creative: true, activity: "Sketching a first idea with pencil and paper at a tidy studio desk, tools and materials kept simple and believable." },
  { id: "creative-feedback", title: "Reviewing creative work", health: false, creative: true, activity: "Considering a draft displayed on a board and listening to collaborators off camera in a welcoming creative studio." },
  { id: "creative-share", title: "Sharing a finished idea", health: false, creative: true, activity: "Presenting a finished creative idea to an audience off camera in a small studio or community stage space." },
] as const;
export const sceneKey = (sceneId: string, gender: "girl" | "boy") => `${LIBRARY_VERSION}:${sceneId}:${gender}`;
export const mappingKey = (title: string) => `${LIBRARY_VERSION}:${title}`;
export const eligibleScenes = (title: string) => isCreativeCareer(title)
  ? SCENE_CATALOG.filter(scene => "creative" in scene && scene.creative)
  : SCENE_CATALOG.filter(s => !("creative" in s && s.creative) && s.health === (careerOutfit(title) === HEALTH_OUTFIT));
