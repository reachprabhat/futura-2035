import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({headless:true});try {
const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto('http://127.0.0.1:5174');
await page.getByRole('button',{name:'Take a look at an example'}).click();await page.locator('#pathways').waitFor();
await page.getByRole('button',{name:'Explore this future'}).first().click();
const started=Date.now();await page.getByRole('button',{name:'A day in the life',exact:true}).click();await page.locator('#storyboard figure').nth(3).waitFor();
const elapsedMs=Date.now()-started;await page.locator('#storyboard img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
await page.screenshot({path:'artifacts/click-only/cached-click.png',fullPage:true});
const report={elapsedMs,panels:await page.locator('#storyboard figure').count(),images:await page.locator('#storyboard img').count(),text:await page.locator('#storyboard').innerText()};
await writeFile('artifacts/click-only/cached-click.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
