import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(540000);
const errors = [], actionResponses = [], measurements = [], snapshots = [];
page.on('pageerror', e => errors.push(e.message));
page.on('websocket', ws => ws.on('framereceived', ({payload}) => {
  try { const frame = JSON.parse(String(payload)); if (frame.type === 'ActionResponse') actionResponses.push(frame); } catch {}
}));
const startedAt = new Date().toISOString();
async function measure(index, label) {
  await page.evaluate(() => {
    window.__measure = null;
    const listener = e => {
      if (!e.target.closest('.career button')) return;
      const m = window.__measure = { click: performance.now(), firstCaptionSeconds: null, firstCaptionOnScreenSeconds: null, allImagesSeconds: null, arrivals: [] };
      const seen = new Set();
      function tick() {
        if (window.__measure !== m) return;
        const captions = [...document.querySelectorAll('#storyboard figcaption p')];
        const elapsed = (performance.now() - m.click) / 1000;
        if (captions.length === 4 && m.firstCaptionSeconds === null) m.firstCaptionSeconds = elapsed;
        if (captions[0] && m.firstCaptionOnScreenSeconds === null) {
          const box = captions[0].getBoundingClientRect();
          if (box.top >= 0 && box.bottom <= innerHeight) m.firstCaptionOnScreenSeconds = elapsed;
        }
        const images = [...document.querySelectorAll('#storyboard img')];
        for (let i = 0; i < images.length; i++) if (images[i].complete && images[i].naturalWidth && Number(getComputedStyle(images[i]).opacity) >= .99 && !seen.has(images[i].src)) {
          const figures = [...document.querySelectorAll('#storyboard figure')];
          seen.add(images[i].src); m.arrivals.push({ panel: figures.indexOf(images[i].closest('figure')) + 1, seconds: elapsed });
        }
        if (images.length === 4 && images.every(img => img.complete && img.naturalWidth > 0 && Number(getComputedStyle(img).opacity) >= .99)) m.allImagesSeconds ??= elapsed;
        if (m.allImagesSeconds === null || m.firstCaptionOnScreenSeconds === null) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    };
    document.addEventListener('click', listener, { capture: true, once: true });
  });
  await page.locator('.career button').nth(index).click();
  await page.waitForFunction(() => window.__measure?.firstCaptionSeconds !== null, null, { timeout: 20000 });
  if (label === 'fresh-first') await page.locator('#storyboard').screenshot({ path: 'artifacts/storyboard-placeholders-phone.png' });
  await page.waitForFunction(() => window.__measure?.allImagesSeconds !== null, null, { timeout: 540000 });
  const timing = await page.evaluate(() => window.__measure);
  const title = await page.locator('#storyboard .career-name').innerText();
  measurements.push({ label, career: title, ...timing });
  snapshots.push({ label, title, text: await page.locator('#storyboard').innerText(), storageUrls: await page.locator('#storyboard img').evaluateAll(imgs => imgs.map(i => i.src)) });
  console.log(JSON.stringify(measurements.at(-1)));
}
try {
  await page.goto('http://127.0.0.1:5173/');
  await page.getByLabel('What does your child enjoy?').fill('Economics, book writing, food critique');
  await page.getByLabel('What matters to you as a parent?').fill('good earning, stability, overseas');
  await page.locator('form button.primary').click();
  await page.locator('.career').first().waitFor({ timeout: 180000 });
  await measure(0, 'fresh-first');
  await measure(1, 'different-career');
  await measure(0, 'cached-first-again');
  await page.locator('#storyboard').screenshot({ path: 'artifacts/storyboard-phone-new.png' });
  await page.locator('.raw-output summary').click();
  await writeFile('artifacts/storyboard-raw-output.json', await page.locator('.raw-output pre').innerText());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await admin.goto('http://127.0.0.1:5173/admin/costs');
  if (await admin.locator('table').count()) throw Error('Admin rows exposed before key');
  await admin.getByLabel('Admin key').fill((await readFile('artifacts/admin-costs-key.txt','utf8')).trim());
  await admin.getByRole('button', { name: 'View costs' }).click();
  await admin.locator('table').waitFor();
  // Wait until all three background storyboards have reported completion.
  await admin.waitForFunction(() => [...document.querySelectorAll('tbody tr')].filter(tr => Number(tr.children[1]?.textContent) >= 1).length === 3, null, { timeout: 540000 });
  await admin.screenshot({ path: 'artifacts/admin-costs.png', fullPage: true });
  await admin.locator('.raw-output summary').click();
  const rows = JSON.parse(await admin.locator('.raw-output pre').innerText());
  await writeFile('artifacts/aiCalls.json', JSON.stringify(rows, null, 2));
  await writeFile('artifacts/admin-costs-text.txt', await admin.locator('main').innerText());
  await writeFile('artifacts/storyboard-cost-verification.json', JSON.stringify({ startedAt, endedAt: new Date().toISOString(), measurements, snapshots, overflow, errors, actionResponses, totalUSD: rows.reduce((s,r) => s + (r.costUSD ?? 0), 0), totalINR: rows.reduce((s,r) => s + (r.costINR ?? 0), 0) }, null, 2));
  if (overflow || errors.length) throw Error(JSON.stringify({overflow,errors}));
  console.log('Browser checks passed. Evidence saved in artifacts.');
} catch(e) {
  await page.screenshot({ path: 'artifacts/verification-failure.png', fullPage: true });
  await writeFile('artifacts/storyboard-cost-verification.json', JSON.stringify({ startedAt, measurements, snapshots, errors, actionResponses, failure: String(e), pageText: await page.locator('main').innerText() }, null, 2));
  throw e;
} finally { await browser.close(); }
