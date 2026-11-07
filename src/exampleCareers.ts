import type { Plan } from "./CareerDay";

export type ExampleDayMoment = { time: string; skill: string; why: string };
export type ExamplePanel = { time: string; caption: string; imageUrl: null; sceneId: string };
export type ExampleCareer = {
  id: "simran" | "aryan";
  person: string;
  age: number;
  gender: "girl" | "boy";
  exampleTag: string;
  opportunityTag: string;
  interests: string[];
  career: string;
  promise: string;
  description: string;
  currentOpportunity: string[];
  futureOpportunity: string[];
  dayDescription: string;
  dayMoments: ExampleDayMoment[];
  panels: ExamplePanel[];
  project: {
    title: string;
    description: string;
    skills: string[];
    time: string;
    imageTheme: string;
    successCriteria: string[];
  };
  plan: Plan;
};

const makePlan = (career: string, skills: string[], project: ExampleCareer["project"]): Plan => ({
  subtitle: `A first step toward ${career}`,
  skills,
  coreSkills: skills,
  projects: [{
    month: 1,
    title: project.title,
    projectDetails: project.description,
    targetSkill: project.skills[0],
    skillIndex: 0,
    panelIndex: 0,
    successCriteria: project.successCriteria,
    timeNeeded: project.time,
    thumbnailThemeId: project.imageTheme,
  }],
});

const simranSkills = ["User research", "Product thinking", "Clear communication", "Teamwork"];
const simranProject = {
  title: "Analyse a popular app and suggest 3 improvements",
  description: "Explore key screens, then note where a user might need clearer steps. Sketch three changes and share why they could help.",
  skills: ["User research", "Product thinking"],
  time: "3-4 hrs / month",
  imageTheme: "prototype-testing",
  successCriteria: ["Name three clear improvements", "Explain who each change helps"],
};

const aryanSkills = ["Quantum computing", "Mathematical thinking", "Simulation", "Explaining science"];
const aryanProject = {
  title: "Build a simple quantum simulation (with AI guidance)",
  description: "Use a guided model to explore a quantum idea and explain what you notice. Share what the simple simulation can and cannot show.",
  skills: ["Mathematical thinking", "Simulation"],
  time: "4-5 hrs / month",
  imageTheme: "lab-bench",
  successCriteria: ["Follow the guided simulation", "Explain one result in your own words"],
};

const simran: ExampleCareer = {
  id: "simran",
  person: "Simran",
  age: 14,
  gender: "girl",
  exampleTag: "EXAMPLE 1",
  opportunityTag: "TODAY'S OPPORTUNITY WITH AI",
  interests: ["Gaming", "Problem solving", "Technology", "Teamwork"],
  career: "Product Manager",
  promise: "Turn curiosity about apps into products people enjoy using.",
  description: "Product managers learn what people need, shape a product plan, and help teams build useful digital tools.",
  currentOpportunity: [
    "Teams bring design, technology and user needs together.",
    "AI tools are speeding up research and early product experiments.",
    "Clear priorities help teams decide what to improve next.",
  ],
  futureOpportunity: [
    "AI-supported products are likely to keep expanding.",
    "People will guide quality, privacy and inclusive design.",
    "Human judgment will help teams choose useful problems to solve.",
  ],
  dayDescription: "A product manager helps a team understand people’s needs and decide what a digital product should do next.",
  dayMoments: [
    { time: "9:00", skill: "User research", why: "Listen to people and learn where a product can work better." },
    { time: "11:00", skill: "Teamwork", why: "Bring designers and engineers together around one clear goal." },
    { time: "2:00", skill: "Prioritising", why: "Choose which useful change the team should try first." },
    { time: "4:00", skill: "Communication", why: "Explain decisions and share what the team learned." },
  ],
  panels: [
    { time: "9:00", caption: "Research user needs", imageUrl: null, sceneId: "research" },
    { time: "11:00", caption: "Collaborate with the team", imageUrl: null, sceneId: "meeting" },
    { time: "2:00", caption: "Plan product changes", imageUrl: null, sceneId: "whiteboard" },
    { time: "4:00", caption: "Present a clear update", imageUrl: null, sceneId: "presentation" },
  ],
  project: simranProject,
  plan: makePlan("Product Manager", simranSkills, simranProject),
};

const aryan: ExampleCareer = {
  id: "aryan",
  person: "Aryan",
  age: 15,
  gender: "boy",
  exampleTag: "EXAMPLE 2",
  opportunityTag: "FUTURE OPPORTUNITY",
  interests: ["Gaming", "Mathematics", "Science", "Technology"],
  career: "Quantum Architect",
  promise: "Use maths and science to explore what quantum tools could make possible.",
  description: "Quantum architects explore how quantum systems could tackle specialist problems, combining physics, maths and computing.",
  currentOpportunity: [
    "Quantum computing is moving from research toward early applications.",
    "Today’s teams combine physics, mathematics and computing.",
    "Many current roles focus on research, engineering and simulation.",
  ],
  futureOpportunity: [
    "Quantum tools may help with selected complex problems.",
    "New systems will need careful design, testing and explanation.",
    "Experts may connect quantum science with practical needs.",
  ],
  dayDescription: "A quantum architect explores how quantum computers and software could be designed for carefully chosen problems.",
  dayMoments: [
    { time: "9:00", skill: "Mathematical thinking", why: "Use mathematical ideas to describe a problem clearly." },
    { time: "11:00", skill: "Quantum concepts", why: "Explore how quantum systems behave through safe models." },
    { time: "2:00", skill: "Simulation", why: "Test ideas in a small computer model before drawing conclusions." },
    { time: "4:00", skill: "Explaining science", why: "Describe what the model shows and where it has limits." },
  ],
  panels: [
    { time: "9:00", caption: "Explore a maths question", imageUrl: null, sceneId: "research" },
    { time: "11:00", caption: "Study a quantum model", imageUrl: null, sceneId: "lab" },
    { time: "2:00", caption: "Test a simulation", imageUrl: null, sceneId: "coding" },
    { time: "4:00", caption: "Explain a science result", imageUrl: null, sceneId: "whiteboard" },
  ],
  project: aryanProject,
  plan: makePlan("Quantum Architect", aryanSkills, aryanProject),
};

export const EXAMPLE_SECTION_TITLE = "See how it works with real examples.";
export const EXAMPLE_SECTION_SUBTITLE = "Same child interests. Two very different possibilities.";
export const EXAMPLE_CAREERS = [simran, aryan] as const;
