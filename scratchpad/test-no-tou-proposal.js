const { chromium } = require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');let pass=0,fail=0;const T=(c,m)=>{c?pass++:fail++;console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗\x1b[0m ')+m)};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/proposal-preview')p='/proposal-preview.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('x')}r.writeHead(200,{'Content-Type':f.endsWith('.js')?'application/javascript':'text/html'});r.end(fs.readFileSync(f))}).listen(8150);
const PROPOSAL=()=>({status:'sent',usage_kwh:9000,options:[{id:'o1',title:'Tesla Powerwall 3',price:17500,redline:12500,line_items:[{id:'pw3_retrofit',name:'Tesla Powerwall 3 (Retrofit)',price:17500}],
  prod_data:{hasBattery:true,batteryUnits:1,storageKwh:13.5,batteryArbitrageKwh:2000,annualUsageKwh:9000},savings:{moderate:{monthly:52,annual:620}}}]});
async function run(addr){
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});const page=await b.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.route('**://*/**',r=>r.request().url().includes('localhost')?r.continue():r.fulfill({status:200,contentType:'application/javascript',body:''}));
 await page.addInitScript(([addr,prop])=>{window.alert=()=>{};const J=x=>({ok:true,status:200,json:async()=>x,text:async()=>JSON.stringify(x)});const rf=window.fetch.bind(window);window.fetch=async(u,o)=>String(u).includes('localhost')?rf(u,o):J({note:'',guidance:null});
  const cust={id:'c1',first_name:'Pat',last_name:'Lee',address:addr,phone:'8015550199',access_code:'8015550199',monthly_bill:'150',email:'p@x.com',proposal:prop,notes:'[]'};
  const tbl=()=>{const c={};['or','is','not','gte','lte','order','limit','range','in','ilike','select','neq','update','upsert','maybeSingle','single','insert','eq'].forEach(m=>c[m]=()=>c);c.then=r=>r({data:[cust],error:null});return c};
  window.supabase={createClient:()=>({from:tbl,auth:{},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})}})};},[addr,PROPOSAL()]);
 await page.goto('http://localhost:8150/proposal-preview.html?id=c1&view=customer&code=8015550199',{waitUntil:'domcontentloaded'});await page.waitForTimeout(1500);
 const o=await page.evaluate(()=>({txt:document.body.innerText.replace(/\s+/g,' '),tou:/Time-of-Use Savings/i.test(document.body.innerText),shift:/load shifting|shifts your power use off peak/i.test(document.body.innerText),state:(document.querySelector('.state')||{}).innerText||''}));
 o.errs=errs;await b.close();return o;
}
(async()=>{
 const ca=await run('200 Near St, San Diego, CA 92101');
 const ut=await run('12 Test Rd, Salt Lake City, UT 84101');
 const co=await run('5 Main St, Denver, CO 80202');
 console.log('   page loaded?',ca.state||'yes','|',ut.state||'yes');
 console.log('   CA savings:',(ca.txt.match(/\$\d+\s*\/\s*mo[^.]{0,40}/g)||[]).slice(0,4),'| UT savings:',(ut.txt.match(/\$\d+\s*\/\s*mo[^.]{0,40}/g)||[]).slice(0,4));T(ca.tou,'California: Time-of-Use Savings section still shown');
 T(ca.shift,'California: load-shifting dollars still part of the savings');
 T(!ut.tou&&!ut.shift,'Utah: no Time-of-Use section and no load-shifting line');
 T(!/Solar production/i.test(ut.txt)&&/Utility bill after the upgrade[^$]*\$150/i.test(ut.txt),'Utah: battery-only proposal claims no bill savings (bill after upgrade = today\'s $150)');
 T(!co.tou&&!co.shift,'Colorado: no Time-of-Use section and no load-shifting line');
 T(![ca,ut,co].some(x=>x.errs.length),'no page errors'+([ca,ut,co].find(x=>x.errs.length)?': '+[ca,ut,co].find(x=>x.errs.length).errs[0]:''));
 console.log(`\n${pass} passed, ${fail} failed`);srv.close();process.exit(fail?1:0);
})();
