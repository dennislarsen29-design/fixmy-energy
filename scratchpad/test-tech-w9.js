const { chromium } = require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/portal.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('x')}r.writeHead(200,{'Content-Type':f.endsWith('.js')?'application/javascript':'text/html'});r.end(fs.readFileSync(f))}).listen(8147);

let pass=0,fail=0;const T=(c,m)=>{c?pass++:fail++;console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗\x1b[0m ')+m)};
async function run(mode,role){
 const page=await (await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})).newPage();
 const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.route('**://*/**',r=>r.request().url().includes('localhost')?r.continue():r.fulfill({status:200,contentType:'application/javascript',body:''}));
 await page.addInitScript(m=>{window.alert=()=>{};const rf=window.fetch.bind(window);const J=(x,st)=>({ok:(st||200)<300,status:st||200,json:async()=>x,text:async()=>JSON.stringify(x)});
  window.fetch=async(u,o)=>{const s=String(u);
   if(s.includes('w9-api')){ if(m==='broken')return J({error:'W-9 storage is not configured yet (W9_ENC_KEY).'},500); return J({ok:true,submitted:m==='filed'}); }
   if(s.includes('/rest/v1/'))return J([]);if(s.includes('localhost'))return rf(u,o);return J({})};
  const tbl=t=>{const c={};['or','is','not','gte','lte','order','limit','range','in','ilike','select','neq','update','upsert','maybeSingle','single','insert','eq'].forEach(x=>c[x]=()=>c);
   c.then=r=>r({data:t==='rep_agreements'?[{id:1,agreement_version:'2026-10-15-enfin-dcb',signed_at:new Date().toISOString(),source:null},{id:2,agreement_version:'2026-11-13',signed_at:new Date().toISOString(),source:'sub_sheet_ack'}]:[],error:null});return c};
  window.supabase={createClient:()=>({from:tbl,auth:{},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),list:async()=>({data:[],error:null})})}})};},mode);
 await page.goto('http://localhost:8147/portal.html',{waitUntil:'domcontentloaded'});await page.waitForTimeout(400);
 await page.evaluate(async r=>{ if(r==='admin'){window.CURRENT_ROLE='admin';await loadAdminDashboard();} else {window.CURRENT_ROLE='tech';await loadSalesDashboard({id:'tech4',name:'Dennis Larsen',role:'tech',email:'d@x.com',home_zip:'92026',setter_comp_plan:'standard_20'});Object.keys(window.BB_TRAINING_MODULES||{}).forEach(k=>{window._bbCerts[k]={version:'t1',at:new Date().toISOString()}});} },role);
 await page.waitForTimeout(900);
 const o=await page.evaluate(()=>({form:!!document.querySelector('[id^=w9_]'),banner:!!document.getElementById('w9BrokenBar'),bannerTxt:(document.getElementById('w9BrokenBar')||{}).innerText||'',dash:/Leads|Pipeline|Appts|Doors|Dialing|Command|S\.U\.N/i.test((document.getElementById('dashBody')||{}).innerText||''),later:/Do this later/.test(document.body.innerText)}));
 o.errs=errs;await page.context().browser().close();return o;
}
(async()=>{
 console.log('\nTECH portal as Dennis (tech4):');
 let r=await run('none','tech');T(r.form&&!r.later,'no W-9 on file -> W-9 form shown and REQUIRED (no skip link)');T(!r.errs.length,'no page errors');
 r=await run('filed','tech');T(!r.form&&!r.banner&&r.dash,'W-9 on file -> straight into the portal');
 r=await run('broken','tech');T(r.banner&&/W9_ENC_KEY/.test(r.bannerTxt),'service broken -> red banner names the fix');T(!r.form&&r.dash,'service broken -> not locked out, portal still loads');
 console.log('\nADMIN portal:');
 r=await run('none','admin');T(r.form&&r.later,'no W-9 -> form shown, skippable');
 r=await run('broken','admin');T(r.banner,'service broken -> red banner');
 console.log(`\n${pass} passed, ${fail} failed`);srv.close();process.exit(fail?1:0);
})();
