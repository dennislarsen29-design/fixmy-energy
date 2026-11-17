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
(async()=>{
 const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const page=await browser.newPage();
 const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.route('**://*/**',r=>r.request().url().includes('localhost')?r.continue():r.fulfill({status:200,contentType:'application/javascript',body:''}));
 await page.addInitScript(L=>{
  window.__alerts=[];window.alert=m=>window.__alerts.push(String(m));window.confirm=()=>true;window.prompt=()=>'1';
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:cb=>cb({coords:{latitude:40.76,longitude:-111.89,accuracy:5,speed:0,heading:null}}),watchPosition:()=>1,clearWatch:()=>{}}});
  const rf=window.fetch.bind(window);
  window.fetch=async(u,o)=>{const s=String(u);
   if(s.includes('w9-api'))return{ok:true,status:200,json:async()=>({submitted:true,ok:true}),text:async()=>'{}'};
   if(s.includes('/rest/v1/'))return{ok:true,status:200,json:async()=>[],text:async()=>'[]',headers:{get:()=>null}};
   if(s.includes('localhost'))return rf(u,o);
   return{ok:true,status:200,json:async()=>({}),text:async()=>''};};
  const AV='x',SV='y';
  const tbl=t=>{const c={};let eqs={};
   ['or','is','not','gte','lte','order','limit','range','in','ilike','select','neq','insert','upsert','maybeSingle','single'].forEach(m=>c[m]=()=>c);
   c.update=v=>{ if(t==='customers'&&v&&v.proposal){window.__savedProposal=v.proposal;window.__updates=(window.__updates||[]).concat([v])} return c;};
   c.eq=(k,v)=>{eqs[k]=v;return c};
   c.then=r=>{
    if(t==='customers'&&eqs.id&&window.__savedProposal)return r({data:[Object.assign({},L.find(x=>x.id===eqs.id)||{},{proposal:window.__savedProposal})],error:null});
    if(t==='customers'&&!eqs.setter_name)return r({data:L,error:null});
    if(t==='rep_agreements')return r({data:[{id:1,agreement_version:'2026-10-15-enfin-dcb',signed_at:new Date().toISOString(),source:null},{id:2,agreement_version:'2026-11-13',signed_at:new Date().toISOString(),source:'sub_sheet_ack'}],error:null});
    if(t==='proposal_catalog')return r({data:[
      {option_key:'option1',service_type:'battery_retrofit',title:'Tesla Powerwall 3 (Retrofit)',default_price:9000,sort:1,active:true,sdcp_rebate:null},
      {option_key:'option2',service_type:'battery_retrofit',title:'Expansion Pack',default_price:7850,sort:2,active:true}],error:null});
    return r({data:[],error:null});};
   return c;};
  window.supabase={createClient:()=>({from:tbl,auth:{},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),list:async()=>({data:[],error:null}),upload:async()=>({data:{},error:null})})}})};
 },LEADS);
 await page.goto('http://localhost:8144/portal.html',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(500);
 await page.evaluate(async()=>{window.CURRENT_ROLE='tech';
  await loadSalesDashboard({id:'tech_cody',name:'Cody Larsen',role:'tech',email:'c@x.com',w9_signed_at:new Date().toISOString(),home_zip:'84101',setter_comp_plan:'standard_20'});
  Object.keys(window.BB_TRAINING_MODULES||{}).forEach(m=>{window._bbCerts[m]={version:'t1',at:new Date().toISOString()}});});
 await page.waitForTimeout(500);
 for(const v of ['leads','jobs','pipeline','appts','payroll','training','canvass','dialer']){
  const r=await page.evaluate(async v=>{try{salesSetView(v);}catch(e){return 'THROW '+e.message}
   await new Promise(r=>setTimeout(r,300));
   const root=document.getElementById('dashBody');if(!root)return 'no dashBody';
   const els=[...root.querySelectorAll('[onclick]')];const miss=[];
   els.forEach(e=>{const oc=e.getAttribute('onclick').replace(/event\.stopPropagation\(\);?\s*/g,'').replace(/^\s*return\s+/,'');const m=oc.match(/^\s*([A-Za-z_$][\w$.]*)\s*\(/);
    if(m){const n=m[1];let o=window;for(const p of n.split('.')){o=o&&o[p]}
     if(typeof o!=='function'){try{if(typeof eval(n)!=='function')miss.push(n)}catch(_){miss.push(n)}}}});
   return {count:els.length,miss:[...new Set(miss)],text:root.innerText.slice(0,80).replace(/\n/g,' | ')};},v);
  if(typeof r==='string')bad(v+': '+r);else if(r.miss.length)bad(v+': undefined handlers '+r.miss.join(','));else ok(v+': '+r.count+' clickables OK');
 }
 // card clicks
 await page.evaluate(()=>salesSetView('pipeline'));await page.waitForTimeout(300);
 for(const id of ['L1','J1','A1']){
  const r=await page.evaluate(async id=>{const out=[];
   for(const fn of ['salesEditLead','openProposalBuilder','openJob']){ if(typeof window[fn]!=='function'){out.push(fn+' missing');continue}}
   try{await salesEditLead(id);await new Promise(r=>setTimeout(r,300));out.push('editor:'+(document.getElementById('editorSlot')||document.body).innerText.length)}catch(e){out.push('editor THROW '+e.message)}
   return out;},id);
  console.log('   ',id,r.join(' '));
 }
 
 console.log('\n-- Internal Proposal Tool --');
 for(const id of ['L1','J1']){
  const r=await page.evaluate(async id=>{const o={};
   try{ await salesEditLead(id); await new Promise(r=>setTimeout(r,300));
     o.toolsRow=!!document.querySelector('[onclick*="openProposalBuilder"]');
     await openProposalBuilder(id); await new Promise(r=>setTimeout(r,500)); o.gateShown=[...document.querySelectorAll('div')].some(d=>/Site Evaluation/i.test(d.innerText||'')&&getComputedStyle(d).position==='fixed'); o.gateBtns=[...document.querySelectorAll('[onclick*="openEvalWizard"]')].length; await openProposalBuilder(id,undefined,true); await new Promise(r=>setTimeout(r,800));
     const m=document.getElementById('proposalModal'); o.modal=!!m; o.len=m?m.innerText.length:0;
     o.catalogBtns=m?[...m.querySelectorAll('[onclick]')].length:0;
     const miss=[];if(m)[...m.querySelectorAll('[onclick]')].forEach(e=>{const oc=e.getAttribute('onclick').replace(/event\.stopPropagation\(\);?\s*/g,'');const mm=oc.match(/^\s*(?:return\s+)?([A-Za-z_$][\w$.]*)\s*\(/);if(mm){let x=window;for(const p of mm[1].split('.'))x=x&&x[p];if(typeof x!=='function')miss.push(mm[1])}});
     o.miss=[...new Set(miss)];
     o.footer=m?[...m.querySelectorAll('#propFooterBuild button')].map(b=>b.innerText.trim()):[];
     const wait=t=>new Promise(r=>setTimeout(r,t)); document.querySelectorAll('#proposalModal').forEach(m=>m.remove()); window.__savedProposal=null; await openProposalBuilder(id,undefined,true); await wait(500);
     const snap=()=>{const m=document.getElementById('proposalModal');return m?m.innerText.replace(/\s+/g,' ').slice(0,260):'NO MODAL'};
     o.s1=snap();
     try{ _propApplyTemplate('battery'); await wait(300); o.items=_propBuilds.map(b=>b.lineItems.length); o.price=_propBuilds.map(b=>b.price); o.redline=_propBuilds.map(b=>b.redline);}catch(e){o.tplErr=e.message}
     try{ _propStepGo(1); await wait(500); o.step2=window._propStep; o.s2=snap(); }catch(e){o.s2err=e.message}
     try{ _propStepGo(1); await wait(700); o.step3=window._propStep; const lp=document.getElementById('propLivePreview'); o.livePreviewLen=lp?lp.innerText.length:-1;
          o.sendVisible=document.getElementById('propSendBtn').style.display!=='none'; o.approvalVisible=document.getElementById('propApprovalBtn').style.display!=='none'; }catch(e){o.s3err=e.message}
     try{ await previewProposal(id); await wait(500); o.previewOpen=!!document.querySelector('iframe, #propPreviewOverlay, [id*=review]'); }catch(e){o.prevErr=e.message}
     try{ const ok=await sendProposal(id,false,'draft'); o.draft=ok; }catch(e){o.draftErr=e.message}
     try{ if(typeof copyProposalLink==='function'){ await copyProposalLink(id); o.copy='ok'; } }catch(e){o.copyErr=e.message}
     try{ const ok=await sendProposal(id); o.send=ok; await wait(100); o.status=(document.getElementById('propSaveStatus')||{}).innerText; }catch(e){o.sendErr=e.message}
   }catch(e){o.THROW=e.message}
   return o;},id);
  console.log(id,JSON.stringify(r));
 }
 console.log('\n-- stability --');
 for(const v of ['jobs','pipeline','leads','appts']){
  const m=await page.evaluate(async v=>{salesSetView(v);await new Promise(r=>setTimeout(r,500));let n=0,rep=0;const b=document.getElementById('dashBody');
   const mo=new MutationObserver(l=>{n+=l.length;});mo.observe(b,{childList:true,subtree:true,attributes:true});
   const first=b.querySelector('button');await new Promise(r=>setTimeout(r,3000));mo.disconnect();
   return {mutations:n,sameFirstBtn:first===b.querySelector('button')};},v);
  console.log(v,JSON.stringify(m));
 }
 console.log('\n-- real clicks --');
 for(const view of ['jobs','pipeline','leads']){
  await page.evaluate(v=>{document.querySelectorAll('#proposalModal,#evGateModal').forEach(m=>m.remove());salesSetView(v)},view); await page.waitForTimeout(400);
  const btns=await page.evaluate(()=>[...document.querySelectorAll('#dashBody button')].map((b,i)=>({i,t:b.innerText.trim().slice(0,24),oc:(b.getAttribute('onclick')||'').slice(0,50),vis:!!(b.offsetWidth&&b.offsetHeight)})).filter(b=>/^(Open|Proposal|Open lead|Edit)/i.test(b.t)));
  console.log(view,'buttons:',btns.map(b=>b.t+(b.vis?'':'(hidden)')).join(' | '));
  for(const b of btns.filter(x=>x.vis).slice(0,6)){
    await page.evaluate(()=>{document.querySelectorAll('#proposalModal,#evGateModal').forEach(m=>m.remove());const e=document.getElementById('editorSlot');if(e)e.innerHTML='';});
    await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';window.scrollTo(0,0)});await page.waitForTimeout(700);
    await page.locator('#dashBody button').nth(b.i).click({timeout:3000}).catch(e=>console.log('  click fail',b.t,e.message.replace(/\n/g,' ').slice(0,600)));
    await page.waitForTimeout(700);
    const res=await page.evaluate(()=>({editor:((document.getElementById('editorSlot')||{}).innerText||'').length,modal:!!document.getElementById('proposalModal'),gate:!!document.getElementById('evGateModal')}));
    console.log('  click',b.t,'->',JSON.stringify(res), (res.editor||res.modal||res.gate)?'OK':'NOTHING HAPPENED');
  }
 }
 console.log('alerts after builder:',await page.evaluate(()=>window.__alerts));
 console.log('page errors:',errs.length?errs:'none');
 console.log('alerts:',await page.evaluate(()=>window.__alerts));
 console.log(`\n${pass} passed, ${fail} failed`);
 await browser.close();srv.close();process.exit(fail?1:0);
})();
