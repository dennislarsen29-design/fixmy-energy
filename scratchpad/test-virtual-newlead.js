/**
 * A Setter's booking must land on a closing Tech's portal.
 *
 * Rule (per Dennis 2026-08-12): if the setter is ALSO a Tech they keep it; if not it
 * goes to Dennis. The setter keeps read-only sight of it because their 20% rides on it.
 *
 *   node scratchpad/test-closer-routing.js
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'portal.html'), 'utf8');
let pass = 0, fail = 0;
const ok  = m => { pass++; console.log('  \x1b[32m✓\x1b[0m ' + m); };
const bad = m => { fail++; console.log('  \x1b[31m✗\x1b[0m ' + m); };

const srv = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/' || p === '/portal') p = '/portal.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync(f));
}).listen(8144);


const LEADS=[
 {id:'L1',first_name:'Lee',last_name:'Lead',email:'l@x.com',phone:'8015550101',address:'12 Test Rd, Salt Lake City, UT 84101',rep_id:'tech_cody',step:1,lead_category:'fixmy',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),monthly_bill:200},
 {id:'J1',first_name:'Tim',last_name:'Job',email:'t@x.com',phone:'8015550102',address:'9 Job St, Salt Lake City, UT 84101',rep_id:'tech_cody',step:6,sold_type:'diagnostic',lead_category:'fixmy',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),invoice_status:'paid'},
 {id:'A1',first_name:'Ann',last_name:'Axia',email:'a@x.com',phone:'8015550103',address:'3 Axia Ln, Provo, UT 84601',rep_id:'tech_cody',lead_category:'new_solar',solar_status:'ns_welcome_closed',sold_type:'new_solar',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),system_size:'6'},
];

const slotsFor=v=>[1,2,3].map(i=>{const d=new Date(Date.now()+i*86400000);d.setHours(10,0,0,0);const e=new Date(d.getTime()+(v?45:120)*60000);return{startISO:d.toISOString(),endISO:e.toISOString(),label:(v?'V ':'L ')+i};});
(async()=>{
 const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 async function run(name,address,pickMode){
  const page=await browser.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.route('**://*/**',r=>r.request().url().includes('localhost')?r.continue():r.fulfill({status:200,contentType:'application/javascript',body:''}));
  await page.addInitScript(()=>{
   window.__alerts=[];window.alert=m=>window.__alerts.push(String(m));window.confirm=()=>true;window.__inserts=[];window.__fetches=[];
   const rf=window.fetch.bind(window);
   window.fetch=async(u,o)=>{const s=String(u);window.__fetches.push({u:s,b:o&&o.body});
    const J=x=>({ok:true,status:200,json:async()=>x,text:async()=>JSON.stringify(x)});
    if(s.includes('w9-api'))return J({submitted:true,ok:true});
    if(s.includes('virtual-check')){const b=JSON.parse(o.body);return J(/Sebastopol/.test(b.address||'')?{ok:true,virtual:true,miles:480}:{ok:true,virtual:false,miles:12});}
    if(s.includes('ghl-slots')){const v=s.includes('virtual=1');return J({slots:window.__slots(v)});}
    if(s.includes('ghl-book'))return J({ok:true,appointmentId:'a1',contactId:'c1',virtual:JSON.parse(o.body).virtual===true,virtualNotice:JSON.parse(o.body).virtual?{ok:true,sms:{ok:true},email:{ok:true},sent_to:{phone:'(•••) ••• 0101',email:'l•••@x.com'}}:undefined});
    if(s.includes('home-match')||s.includes('referral-api'))return J({});
    if(s.includes('/rest/v1/'))return J([]);
    if(s.includes('localhost'))return rf(u,o);
    return J({});};
   const tbl=t=>{const c={};let last=null;
    ['or','is','not','gte','lte','order','limit','range','in','ilike','select','neq','update','upsert','maybeSingle','single'].forEach(m=>c[m]=()=>c);
    c.eq=()=>c;c.insert=v=>{if(t==='customers'){window.__inserts.push(v);last=v;}return c;};
    c.then=r=>{ if(last)return r({data:Object.assign({id:'new-1',created_at:new Date().toISOString()},last),error:null});
      if(t==='rep_agreements')return r({data:[{id:1,agreement_version:'2026-10-15-enfin-dcb',signed_at:new Date().toISOString(),source:null},{id:2,agreement_version:'2026-11-13',signed_at:new Date().toISOString(),source:'sub_sheet_ack'}],error:null});
      return r({data:[],error:null});};
    return c;};
   window.supabase={createClient:()=>({from:tbl,auth:{},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),list:async()=>({data:[],error:null})})}})};
  });
  await page.exposeFunction('__slotsNode',v=>slotsFor(v));
  await page.addInitScript(()=>{ window.__slots=v=>{const out=[];for(let i=1;i<=3;i++){const d=new Date(Date.now()+i*86400000);d.setHours(10,0,0,0);const e=new Date(d.getTime()+(v?45:120)*60000);out.push({startISO:d.toISOString(),endISO:e.toISOString(),label:(v?'V ':'L ')+i});}return out;}; });
  await page.goto('http://localhost:8144/portal.html',{waitUntil:'domcontentloaded'});await page.waitForTimeout(500);
  await page.evaluate(async()=>{window.CURRENT_ROLE='tech';
   await loadSalesDashboard({id:'tech_cody',name:'Cody Larsen',role:'tech',email:'c@x.com',w9_signed_at:new Date().toISOString(),home_zip:'84101',setter_comp_plan:'standard_20'});
   Object.keys(window.BB_TRAINING_MODULES||{}).forEach(m=>{window._bbCerts[m]={version:'t1',at:new Date().toISOString()}});});
  await page.waitForTimeout(400);
  await page.evaluate(()=>openNewLead('tech_cody','Cody Larsen',false));await page.waitForTimeout(700);
  await page.evaluate(a=>{const set=(i,v)=>{document.getElementById(i).value=v};set('nlFirst','Vic');set('nlLast','Tual');set('nlPhone','8015550177');set('nlEmail','v@x.com');set('nlAddr',a);},address);
  await page.waitForTimeout(2200);   // address watcher (1.5s) + check
  const r1=await page.evaluate(()=>({toggle:(document.getElementById('nlEvalModeWrap')||{}).innerText,slots:[...document.querySelectorAll('#nlSlotList button')].map(b=>b.innerText.trim()),slotCall:window.__fetches.filter(f=>/ghl-slots/.test(f.u)).map(f=>f.u.split('functions/')[1])}));
  if(pickMode){await page.evaluate(m=>nlEvmPick(m),pickMode);await page.waitForTimeout(500);}
  const r2=await page.evaluate(()=>({toggle:(document.getElementById('nlEvalModeWrap')||{}).innerText.replace(/\s+/g,' ').slice(0,200),slots:[...document.querySelectorAll('#nlSlotList button')].map(b=>b.innerText.trim())}));
  await page.evaluate(()=>{const b=document.querySelector('#nlSlotList button');if(b)b.click();});
  await page.evaluate(()=>createNewLead());await page.waitForTimeout(900);
  const out=await page.evaluate(()=>({ins:window.__inserts[0],book:(window.__fetches.find(f=>/ghl-book/.test(f.u))||{}).b,panel:(document.getElementById('newLeadPanel')||{}).innerText,alerts:window.__alerts}));
  console.log('\n== '+name);console.log(' first toggle:',r1.toggle.replace(/\s+/g,' ').slice(0,150));console.log(' slot calls:',r1.slotCall.join(', '),'| slots:',r2.slots.join(','));
  if(pickMode)console.log(' after pick',pickMode,':',r2.toggle.slice(0,120));
  const ins=out.ins||{};const bk=out.book?JSON.parse(out.book):{};
  console.log(' insert -> rep_id:',ins.rep_id,'eval_mode:',ins.eval_mode,'manual:',ins.eval_mode_manual,'| book virtual:',bk.virtual,'dur(min):',bk.startISO?(new Date(bk.endISO)-new Date(bk.startISO))/60000:'-');
  console.log(' confirmation:',(out.panel||'').replace(/\s+/g,' ').slice(0,260));
  console.log(' alerts:',out.alerts,'errors:',errs.length?errs:'none');
  await page.close();return {ins,bk,panel:out.panel,errs};
 }
 const far=await run('Far address (auto)','100 Far Rd, Sebastopol, CA 95472');
 const near=await run('Near address (auto)','200 Near St, San Diego, CA 92101');
 const forced=await run('Near address, forced Virtual by hand','200 Near St, San Diego, CA 92101','virtual');
 const forcedL=await run('Far address, forced Local by hand','100 Far Rd, Sebastopol, CA 95472','local');
 const T=(c,m)=>{if(c){pass++;console.log('  \x1b[32m✓\x1b[0m '+m)}else{fail++;console.log('  \x1b[31m✗\x1b[0m '+m)}};
 console.log('\n-- checks');
 T(far.bk.virtual===true&&far.ins.eval_mode==='virtual'&&!far.ins.eval_mode_manual,'far: books virtual, row virtual, auto (not locked)');
 T((new Date(far.bk.endISO)-new Date(far.bk.startISO))===45*60000,'far: 45-minute slot sent');
 T(far.ins.rep_id==='tech_cody','far: assigned to the Tech who set it (rep_id)');
 T(/Virtual evaluation booked/.test(far.panel||'')&&/Meet link sent/.test(far.panel||''),'far: confirmation says virtual + Meet link sent');
 T(near.bk.virtual===undefined&&near.ins.eval_mode==='local','near: local booking unchanged');
 T((new Date(near.bk.endISO)-new Date(near.bk.startISO))===120*60000,'near: 2-hour window unchanged');
 T(forced.bk.virtual===true&&forced.ins.eval_mode_manual===true,'forced virtual: books virtual and locks it');
 T(forcedL.bk.virtual===undefined&&forcedL.ins.eval_mode==='local'&&forcedL.ins.eval_mode_manual===true,'forced local: books local and locks it');
 T([far,near,forced,forcedL].every(x=>!x.errs.length),'no page errors');
 console.log(`\n${pass} passed, ${fail} failed`);await browser.close();srv.close();process.exit(fail?1:0);
})();
