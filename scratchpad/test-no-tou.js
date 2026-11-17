const { chromium } = require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');let pass=0,fail=0;const T=(c,m)=>{c?pass++:fail++;console.log((c?'  \x1b[32m✓\x1b[0m ':'  \x1b[31m✗\x1b[0m ')+m)};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/portal.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end('x')}r.writeHead(200,{'Content-Type':f.endsWith('.js')?'application/javascript':'text/html'});r.end(fs.readFileSync(f))}).listen(8149);
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});const page=await b.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.route('**://*/**',r=>r.request().url().includes('localhost')?r.continue():r.fulfill({status:200,contentType:'application/javascript',body:''}));
 await page.addInitScript(()=>{window.alert=()=>{};const J=x=>({ok:true,status:200,json:async()=>x,text:async()=>JSON.stringify(x)});const rf=window.fetch.bind(window);window.fetch=async(u,o)=>String(u).includes('localhost')?rf(u,o):J({});
  const tbl=()=>{const c={};['or','is','not','gte','lte','order','limit','range','in','ilike','select','neq','update','upsert','maybeSingle','single','insert','eq'].forEach(m=>c[m]=()=>c);c.then=r=>r({data:[],error:null});return c};
  window.supabase={createClient:()=>({from:tbl,auth:{},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:''}})})}})};});
 await page.goto('http://localhost:8149/portal.html',{waitUntil:'domcontentloaded'});await page.waitForTimeout(500);
 const states=await page.evaluate(()=>[['12 Test Rd, Salt Lake City, UT 84101'],['5 Main St, Denver, CO 80202'],['9 Elm St, Cheyenne, WY 82001'],['4 Congress Ave, Austin, TX 78701'],['1 Strip, Las Vegas, NV 89101'],['2 Desert Dr, Phoenix, AZ 85001'],['200 Near St, San Diego, CA 92101'],['200 Near St, San Diego, CA, 92101'],['3 Ocean Ave, Carlsbad, California 92008'],['no state here']].map(([a])=>[a,window._isNonCaLead({address:a})]));
 const exp=[true,true,true,true,true,true,false,false,false,false];
 states.forEach(([a,v],i)=>T(v===exp[i],a+' -> '+(v?'non-CA (hide TOU)':'CA / unknown (keep TOU)')));
 for(const [name,addr,hide] of [['Utah','12 Test Rd, Salt Lake City, UT 84101',true],['California','200 Near St, San Diego, CA 92101',false]]){
  const r=await page.evaluate(a=>{try{_evRec={id:'x',address:a,first_name:'A',last_name:'B',system_size:'6'};const h=_evQuoyaPageHtml(typeof _evSteps==='function'?_evSteps():[]);return {mount:/evSdsMount/.test(h),title:/A day on your roof/.test(h),len:h.length};}catch(e){return {err:e.message}}},addr);
  if(r.err){T(false,name+': page threw '+r.err);continue}
  T(hide?(!r.mount&&!r.title):(r.mount&&r.title),name+' Analysis page -> '+(hide?'no "A day on your roof"':'keeps "A day on your roof"'));
 }
 T(!errs.length,'no page errors'+(errs.length?': '+errs[0]:''));console.log(`\n${pass} passed, ${fail} failed`);await b.close();srv.close();process.exit(fail?1:0);
})();
