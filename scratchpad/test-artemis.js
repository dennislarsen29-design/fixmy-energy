const { chromium } = require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');let pass=0,fail=0;const T=(c,m)=>{c?pass++:fail++;console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗\x1b[0m ')+m)};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/portal.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('x')}r.writeHead(200,{'Content-Type':f.endsWith('.js')?'application/javascript':'text/html'});r.end(fs.readFileSync(f))}).listen(8148);
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});const page=await b.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.route('**://*/**',r=>r.request().url().includes('localhost')?r.continue():r.fulfill({status:200,contentType:'application/javascript',body:''}));
 await page.addInitScript(()=>{window.alert=()=>{};const J=x=>({ok:true,status:200,json:async()=>x,text:async()=>JSON.stringify(x)});const rf=window.fetch.bind(window);window.fetch=async(u,o)=>String(u).includes('localhost')?rf(u,o):J({});
  const tbl=()=>{const c={};['or','is','not','gte','lte','order','limit','range','in','ilike','select','neq','update','upsert','maybeSingle','single','insert','eq'].forEach(m=>c[m]=()=>c);c.then=r=>r({data:[],error:null});return c};
  window.supabase={createClient:()=>({from:tbl,auth:{},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})}})};});
 await page.goto('http://localhost:8148/portal.html',{waitUntil:'domcontentloaded'});await page.waitForTimeout(500);
 const cases=[['Salt Lake, UT','12 Test Rd, Salt Lake City, UT 84101',true],['Provo, Utah','3 Axia Ln, Provo, Utah 84601',true],['Denver, CO','5 Main St, Denver, CO 80202',true],['Cheyenne, WY','9 Elm St, Cheyenne, WY 82001',true],['San Diego, CA','200 Near St, San Diego, CA 92101',false],['Austin, TX','4 Congress Ave, Austin, TX 78701',false]];
 for(const [n,a,art] of cases){
  const r=await page.evaluate(a=>{const h=_proposalToolsRow({id:'x1',first_name:'A',last_name:'B',address:a,lead_category:'fixmy'},false);return {artemis:/>\s*&#128208; Artemis</.test(h),solargraf:/&#128208; SolarGraf</.test(h),url:(h.match(/sales\.artemis\.solar\/projects/)||[''])[0]};},a);
  T(art?(r.artemis&&!r.solargraf&&r.url):(r.solargraf&&!r.artemis),n+' -> '+(art?'Artemis button (not SolarGraf)':'SolarGraf button (not Artemis)'));
 }
 T(!errs.length,'no page errors');console.log(`\n${pass} passed, ${fail} failed`);await b.close();srv.close();process.exit(fail?1:0);
})();
