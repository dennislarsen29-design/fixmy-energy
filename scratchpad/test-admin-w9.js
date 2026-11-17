const { chromium } = require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');let pass=0,fail=0;const T=(c,m)=>{c?pass++:fail++;console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗\x1b[0m ')+m)};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/portal.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('x')}r.writeHead(200,{'Content-Type':f.endsWith('.js')?'application/javascript':'text/html'});r.end(fs.readFileSync(f))}).listen(8145);
(async()=>{
 const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 for(const on of [false,true]){
  const page=await browser.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.route('**://*/**',r=>r.request().url().includes('localhost')?r.continue():r.fulfill({status:200,contentType:'application/javascript',body:''}));
  await page.addInitScript(sub=>{window.alert=()=>{};window.__w9=[];const rf=window.fetch.bind(window);const J=x=>({ok:true,status:200,json:async()=>x,text:async()=>JSON.stringify(x)});
   window.fetch=async(u,o)=>{const s=String(u);if(s.includes('w9-api')){window.__w9.push(JSON.parse(o.body));return J({submitted:sub})}if(s.includes('/rest/v1/'))return J([]);if(s.includes('localhost'))return rf(u,o);return J({})};
   const tbl=()=>{const c={};['or','is','not','gte','lte','order','limit','range','in','ilike','select','neq','update','upsert','maybeSingle','single','insert','eq'].forEach(m=>c[m]=()=>c);c.then=r=>r({data:[],error:null});return c};
   window.supabase={createClient:()=>({from:tbl,auth:{},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}}),list:async()=>({data:[],error:null})})}})};},on);
  await page.goto('http://localhost:8145/portal.html',{waitUntil:'domcontentloaded'});await page.waitForTimeout(400);
  await page.evaluate(async()=>{window.CURRENT_ROLE='admin';await loadAdminDashboard();});await page.waitForTimeout(800);
  const shown=await page.evaluate(()=>/W-9|Tax Form|Request for Taxpayer/i.test(document.body.innerText)&&!!document.querySelector('#w9_tin,[id^=w9_]'));
  const asked=await page.evaluate(()=>window.__w9.map(x=>x.member_id+':'+x.action));
  const later=await page.evaluate(()=>/Do this later/.test(document.body.innerText));
  if(!on){T(shown,'no W-9 on file -> form is shown on admin login');T(later,'it is skippable ("Do this later") so admin can never be locked out');T(asked.includes('tech4:status'),'it checks Dennis\'s own seat (tech4)');
    await page.evaluate(async()=>{await loadAdminDashboard();});await page.waitForTimeout(500);
    T((await page.evaluate(()=>window.__w9.filter(x=>x.action==='status').length))===1,'a second dashboard load in the same session does not ask again');}
  else T(!shown,'W-9 already on file -> nothing shown');
  T(!errs.length,'no page errors'+(errs.length?': '+errs[0]:''));await page.close();
 }
 console.log(`\n${pass} passed, ${fail} failed`);await browser.close();srv.close();process.exit(fail?1:0);
})();
