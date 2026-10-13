import { chromium } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference as ref } from 'convex/server';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const dir='artifacts/click-only'; await mkdir(dir,{recursive:true});
const client=new ConvexHttpClient('https://doting-basilisk-558.convex.cloud');
const adminKey=(await readFile('artifacts/admin-costs-key.txt','utf8')).trim();
async function rows(){let cursor=null, all=[];do {const p=await client.query(ref('costs:rows'),{adminKey,paginationOpts:{numItems:100,cursor}});all.push(...p.page);cursor=p.isDone?null:p.continueCursor;}while(cursor);return all;}
const baseline=await rows(), ids=new Set(baseline.map(r=>r._id));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const input={interests:`Restoring antique maps, wetland birds, tactile museum exhibits; observation ${Date.now()}`,hopes:'Stable meaningful work in India, accessible public education and environmental care'};
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try {
 await page.goto('http://127.0.0.1:5174');
 await page.getByRole('button',{name:'Explore their possibilities'}).click();
 await page.locator('#interests').fill(input.interests);await page.locator('#hopes').fill(input.hopes);
 const startedAt=Date.now();await page.locator('form button').click();
 await page.locator('#pathways').waitFor({timeout:180000});
 console.log('RESULTS_READY; waiting 60 seconds without clicking');
 await page.waitForTimeout(60000);
 const resultsEnd=Date.now(), beforeClick=(await rows()).filter(r=>!ids.has(r._id));
 await writeFile(`${dir}/results-window.json`,JSON.stringify(beforeClick,null,2));
 console.log('RESULTS_ROWS '+JSON.stringify(beforeClick));
 if(beforeClick.some(r=>r.callType!=='careers'))throw Error('Automatic storyboard call detected');
 const clickIds=new Set((await rows()).map(r=>r._id));
 await page.getByRole('button',{name:'Explore this future'}).first().click();
 const career=await page.locator('.m-detail h1').innerText();
 const clickedAt=Date.now();await page.getByRole('button',{name:'A day in the life',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('#storyboard img').length===4||!!document.querySelector('.m-error'),{},{timeout:240000}).catch(()=>{});
 await page.waitForTimeout(1500);
 const afterClick=(await rows()).filter(r=>!clickIds.has(r._id));
 await writeFile(`${dir}/click-window.json`,JSON.stringify(afterClick,null,2));
 await page.screenshot({path:`${dir}/after-click.png`,fullPage:true});
 console.log('CLICK_ROWS '+JSON.stringify(afterClick));
 const report={input,startedAt,resultsEnd,clickedAt,career,errors,text:await page.locator('main').innerText()};
 await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));
 console.log('REPORT '+JSON.stringify(report));
}finally{await browser.close();}
