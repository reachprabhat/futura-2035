export const THUMBNAIL_LIBRARY_VERSION = "plan-thumbnails-v1";
export const THUMBNAIL_THEMES = [
  { id: "laptop-charts", title: "Charts on a laptop", activity: "A laptop screen with a clean, unlabeled chart and a hand pointing to a trend; tidy desk with a blank notebook." },
  { id: "spreadsheet", title: "Spreadsheet and calculations", activity: "An open laptop showing an abstract, unreadable spreadsheet grid, calculator and pencil on a wooden desk." },
  { id: "notebook-writing", title: "Writing in a notebook", activity: "Close view of a hand writing in a plain notebook beside a capped pen and a cup of tea." },
  { id: "reading-research", title: "Reading printed research", activity: "Hands reviewing plain research pages beside a notebook; any marks are soft and unreadable." },
  { id: "interview", title: "Interview across a table", activity: "Two people seated across a small table in conversation, photographed from behind and softly out of focus; a notebook and recorder sharp in the foreground, no faces visible." },
  { id: "survey-form", title: "Survey form", activity: "A hand marking a simple paper survey with empty boxes and no readable words, clipboard and pencil on a bright desk." },
  { id: "sticky-note-brainstorm", title: "Sticky-note brainstorm", activity: "Colorful blank sticky notes arranged into groups on a wall, hands moving one note, no writing or faces." },
  { id: "prototype-testing", title: "Testing a small prototype", activity: "Hands testing a simple cardboard and paper prototype on a desk; marks indistinct and no hazardous tools." },
  { id: "planning-board", title: "Planning board", activity: "A tabletop project board with blank cards arranged in neat columns, a hand moving one card, no readable text." },
  { id: "presentation-slides", title: "Presenting slides", activity: "A laptop presenting a simple colorful slide to a small audience seen only from behind and out of focus; no visible faces or readable text." },
  { id: "workshop-class", title: "Workshop or class", activity: "Hands working together around a bright classroom table with notebooks and simple materials, people only as soft background silhouettes from behind." },
  { id: "coding-screen", title: "Coding screen", activity: "Hands at a keyboard with a monitor showing softly blurred code-like colored lines, no legible text, clean modern desk." },
  { id: "design-sketch", title: "Sketching a design", activity: "A hand sketching a product idea in a paper sketchbook with pencils and a ruler on a sunlit studio desk." },
  { id: "video-recording", title: "Recording a video", activity: "A compact camera and microphone recording a small tabletop demonstration, a notebook nearby, no person or readable labels." },
  { id: "poster-making", title: "Making a poster", activity: "Hands arranging simple shapes and charts on a clean poster board with glue stick and colored paper, no readable lettering." },
  { id: "lab-bench", title: "Laboratory bench", activity: "A bright safe laboratory bench with microscope, glassware and a sealed sample tray, no labels or people visible." },
  { id: "medical-tools", title: "Medical tools and health notes", activity: "A stethoscope and a few clean medical tools beside a blank health notebook on a bright clinic desk, no patient or readable writing." },
  { id: "model-making", title: "Making a small model", activity: "Hands carefully assembling a small anatomical or architectural teaching model from safe craft pieces on a table." },
  { id: "field-visit", title: "Field visit", activity: "A field notebook and tablet beside a sample jar on a wooden bench outdoors, leafy site softly blurred in warm daylight." },
  { id: "finished-project", title: "Finished project", activity: "A completed report, neat portfolio pages and a small handmade model arranged on a desk, hands setting down a pencil." },
  { id: "stage-rehearsal", title: "Stage rehearsal with a musical instrument and dance floor", activity: "A music stand and violin beside ballet shoes on a polished rehearsal floor with stage lights softly blurred; dancers only as distant silhouettes from behind, no faces." },
  { id: "kitchen-tasting", title: "Kitchen counter with ingredients being tasted and measured", activity: "Hands measuring spices and fresh ingredients into small bowls, a tasting spoon above a bright kitchen counter, no face or labels." },
  { id: "law-contract", title: "Law books and a signed contract on a desk", activity: "A few law books beside a contract page with a handwritten signature mark that is not legible, fountain pen and wooden desk, no names or readable text." },
] as const;

export type ThumbnailThemeId = typeof THUMBNAIL_THEMES[number]["id"];
export const THUMBNAIL_THEME_IDS = THUMBNAIL_THEMES.map(theme => theme.id) as [ThumbnailThemeId, ...ThumbnailThemeId[]];
export const thumbnailThemeKey = (themeId: string) => `${THUMBNAIL_LIBRARY_VERSION}:${themeId}`;
export const thumbnailTagsKey = (title: string) => `${THUMBNAIL_LIBRARY_VERSION}:tags:${title}`;
