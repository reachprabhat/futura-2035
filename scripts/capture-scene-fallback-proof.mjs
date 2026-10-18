import { chromium } from "@playwright/test";

const careers = [
  "Actuary",
  "Agricultural Scientist",
  "AI Engineer",
  "AI Safety Analyst",
  "Animator",
  "Assistive Technology Designer",
  "Author",
  "Automation Engineer",
  "Banker",
  "Bioinformatics Analyst",
  "Biomedical Engineer",
  "Biotechnology Researcher",
  "Career Adviser",
  "Chartered Accountant",
  "Circular Economy Specialist",
  "Civil Servant (IAS/IPS)",
  "Climate Data Analyst",
  "Cloud Engineer",
  "Community Health Worker",
  "Conservation Scientist",
  "Consumer Insights Analyst",
  "Content Strategist",
  "Corporate Lawyer",
  "Cybersecurity Analyst",
  "Data Analyst",
  "Data Scientist",
  "Digital Accessibility Specialist",
  "Digital Artist",
  "Doctor",
  "Documentary Filmmaker",
  "Economic Policy Analyst",
  "Economist",
  "Editor",
  "Energy Storage Engineer",
  "Environmental Scientist",
  "Financial Analyst",
  "Financial Planner",
  "Food Critic",
  "Food Safety Specialist",
  "Food Scientist",
  "Food Systems Analyst",
  "Game Designer",
  "Game Developer",
  "Genetic Counsellor",
  "Health Data Analyst",
  "Illustrator",
  "Industrial Designer",
  "Journalist",
  "Learning Designer",
  "Market Researcher",
  "Materials Scientist",
  "Medical Illustrator",
  "Medical Researcher",
  "Nurse",
  "Nutritionist",
  "Occupational Therapist",
  "Operations Research Analyst",
  "Performing Artist",
  "Physiotherapist",
  "Precision Farming Specialist",
  "Privacy Specialist",
  "Product Manager",
  "Psychologist",
  "Public Health Analyst",
  "Public Policy Analyst",
  "Renewable Energy Engineer",
  "Risk Analyst",
  "Robotics Engineer",
  "Science Communicator",
  "Simulation Designer",
  "Social Worker",
  "Software Engineer",
  "Sports Coach",
  "Sports Data Analyst",
  "Sports Physiotherapist",
  "Sports Psychologist",
  "Sports Scientist",
  "Sports Technology Engineer",
  "Supply Chain Analyst",
  "Sustainability Consultant",
  "Teacher",
  "Transport Planner",
  "Urban Planner",
  "User Experience Designer",
  "Water Engineer"
];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 1 });
  page.on("console", message => { if (message.type() === "error") console.log(`browser-console: ${message.text()}`); });
  page.on("requestfailed", request => console.log(`request-failed: ${request.url()} ${request.failure()?.errorText ?? ""}`));
  for (const title of careers) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    await page.goto(`http://127.0.0.1:5173/?career=${encodeURIComponent(title)}`, { waitUntil: "domcontentloaded" });
    await page.locator(".day-hero-image").first().waitFor({ state: "visible", timeout: 30000 });
    await page.locator(".day-moment").nth(3).waitFor({ state: "visible", timeout: 30000 });
    await page.locator(".day-moment-photo img").nth(3).waitFor({ state: "attached", timeout: 30000 });
    await page.locator(".day-moment").nth(3).scrollIntoViewIfNeeded();
    const slotState = await page.locator(".day-moment-photo").evaluateAll(nodes => nodes.map(node => ({ text: node.innerText, html: node.innerHTML })));
    if (slotState.length !== 4 || slotState.some(slot => !slot.html.includes("<img"))) {
      const text = await page.locator("body").innerText();
      throw new Error(`${title}: DEV scene slot image elements are missing: ${JSON.stringify(slotState)}; page=${text.slice(0, 900)}`);
    }
    await page.locator(".day-moment-photo img").nth(3).waitFor({ state: "visible", timeout: 30000 });
    await page.evaluate(async () => Promise.all([...document.querySelectorAll(".day-hero-image, .day-moment-photo img")].map(image => image.decode().catch(() => {}))));
    const images = await page.locator(".day-hero-image, .day-moment-photo img").evaluateAll(nodes => nodes.map(node => ({ src: node.currentSrc, naturalWidth: node.naturalWidth })));
    const fallbackCount = images.filter(image => image.src.includes("video-recording")).length;
    if (images.length !== 5 || images.some(image => image.naturalWidth === 0) || fallbackCount) {
      throw new Error(`${title}: expected five loaded scene images with no camera/microphone fallback; got ${JSON.stringify(images)}`);
    }
    const hero = await page.locator(".day-hero").boundingBox();
    const strip = await page.locator(".day-strip").boundingBox();
    const storyboard = await page.locator("#storyboard").boundingBox();
    if (!hero || !strip || !storyboard) throw new Error(`${title}: scene sections were not laid out.`);
    await page.screenshot({ path: `design/polish/scene-fallback-${slug}.png`, clip: { x: storyboard.x, y: hero.y, width: storyboard.width, height: strip.y + strip.height - hero.y } });
    console.log(`${title}: design/polish/scene-fallback-${slug}.png; ${images.length} loaded images; fallback=${fallbackCount}`);
  }
  console.log(`Captured ${careers.length} DEV-backed career screenshots.`);
} finally { await browser.close(); }
