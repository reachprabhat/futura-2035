import {spawnSync} from 'node:child_process';
const cli='node_modules/convex/bin/main.js';
const query=`return await ctx.db.query('appSettings').withIndex('by_key').order('asc').take(100);`;
for(const [label,deployment] of [['DEV','doting-basilisk-558'],['PROD','nautical-chicken-192']]){
 const r=spawnSync(process.execPath,[cli,'run','--inline-query',query,'--deployment',deployment],{encoding:'utf8',maxBuffer:2_000_000});
 if(r.status!==0)throw new Error(`${label}: ${r.stderr||r.stdout}`);
 const rows=JSON.parse(r.stdout).filter(row=>['locked-card-message','full-plan-price-inr'].includes(row.key)).map(row=>({key:row.key,value:row.value,updatedAt:row.updatedAt}));
 console.log(`${label}_STORED_PAYMENT_SETTINGS=${JSON.stringify(rows)}`);
}
