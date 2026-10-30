/* Solar day simulator: animated house, time-of-use rates and a Powerwall toggle (2026-10-30).
   Usage: SolarDaySim.mount(containerEl, { kw: <solar kW>, annualKwh: <home usage>, state: <object kept between re-renders> })
   Illustrative only: rates are approximate and the load shape is a typical California home scaled to the annual usage. */
(function(){
  var N=0, STYLE=false, CSS=".sds{\n  --ink:#0a111d; --panel:#111b2c; --panel2:#16233a; --line:rgba(255,255,255,.11);\n  --text:#e9eff8; --mute:#98a7bf;\n  --lime:#8DC63F; --sop:#4aa3ff; --op:#f5b83d; --on:#ff5a4a; --batt:#35d6c8;\n  --display:'Avenir Next','Segoe UI',system-ui,sans-serif;\n  --body:'Avenir Next','Segoe UI',system-ui,sans-serif;\n  --mono:ui-monospace,Menlo,Consolas,monospace;\n  color-scheme:dark;\n}\n.sds{font-family:var(--body);font-size:15px;line-height:1.5;color:var(--text);display:grid;gap:14px;text-align:left}\n.sds *{box-sizing:border-box}\n.sds .scene{position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--line);background:#000}\n.sds canvas{display:block;width:100%}\n.sds .hud{position:absolute;left:14px;top:12px;display:flex;flex-direction:column;gap:6px;align-items:flex-start;pointer-events:none}\n.sds .clock{font-family:var(--mono);font-size:clamp(1.5rem,5vw,2.2rem);font-weight:500;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.55);font-variant-numeric:tabular-nums}\n.sds .badge{font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:5px 11px;border-radius:100px;color:#07101c}\n.sds .cols{display:grid;grid-template-columns:1.05fr 1fr;gap:16px}\n@media(max-width:760px){.sds .cols{grid-template-columns:1fr}}\n.sds .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;min-width:0}\n.sds .card h2{font-family:var(--display);font-size:1rem;margin:0 0 12px;letter-spacing:.01em}\n.sds .chips{display:grid;grid-template-columns:1fr 1fr;gap:8px}\n.sds .chip{appearance:none;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:12px;padding:10px 12px;text-align:left;cursor:pointer;font:inherit;display:grid;gap:2px;width:auto;margin:0;transition:border-color .15s,background .15s}\n.sds .chip:hover{border-color:rgba(255,255,255,.3)}\n.sds .chip:focus-visible,.sds .sw:focus-visible,.sds .play:focus-visible,.sds input[type=range]:focus-visible{outline:2px solid var(--lime);outline-offset:2px}\n.sds .chip .n{font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;font-weight:700}\n.sds .chip .p{font-family:var(--mono);font-size:1.25rem;font-variant-numeric:tabular-nums}\n.sds .chip .t{font-size:.78rem;color:var(--mute)}\n.sds .chip.on{background:#1b2c47;box-shadow:inset 0 0 0 1px var(--c)}\n.sds .sliderRow{display:flex;gap:12px;align-items:center;margin-top:14px}\n.sds .play{appearance:none;border:0;border-radius:100px;background:var(--lime);color:#0b1a07;font-weight:700;padding:9px 16px;cursor:pointer;font:inherit;font-weight:700;width:auto;margin:0;white-space:nowrap}\n.sds input[type=range]{flex:1;min-width:0;height:10px;border-radius:6px;appearance:none;-webkit-appearance:none;margin:0;cursor:pointer;\n  background:linear-gradient(90deg,var(--sop) 0 25%,var(--op) 25% 66.667%,var(--on) 66.667% 87.5%,var(--op) 87.5% 100%)}\n.sds input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;border:3px solid var(--ink);box-shadow:0 0 0 2px #fff}\n.sds input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid var(--ink)}\n.sds .ticks{display:flex;justify-content:space-between;font-size:.68rem;color:var(--mute);margin-top:5px;font-family:var(--mono)}\n.sds .swRow{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}\n.sds .swRow b{display:block}\n.sds .swRow span{color:var(--mute);font-size:.82rem}\n.sds .sw{appearance:none;position:relative;width:62px;height:34px;border-radius:100px;border:0;background:#2a3850;cursor:pointer;flex:none;padding:0;margin:0;transition:background .2s}\n.sds .sw::after{content:\"\";position:absolute;top:4px;left:4px;width:26px;height:26px;border-radius:50%;background:#fff;transition:transform .2s}\n.sds .sw[aria-checked=true]{background:var(--batt)}\n.sds .sw[aria-checked=true]::after{transform:translateX(28px)}\n.sds .read{display:grid;grid-template-columns:1fr 1fr;gap:10px}\n.sds .m{background:var(--panel2);border-radius:12px;padding:10px 12px;min-width:0}\n.sds .m .l{font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;color:var(--mute);font-weight:700;display:flex;align-items:center;gap:6px}\n.sds .m .l i{width:9px;height:9px;border-radius:50%;display:inline-block}\n.sds .m .v{font-family:var(--mono);font-size:1.3rem;font-variant-numeric:tabular-nums;white-space:nowrap}\n.sds .m .v small{font-size:.75rem;color:var(--mute)}\n.sds .m .d{font-size:.76rem;color:var(--mute);min-height:1.2em}\n.sds .net{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}\n.sds .net .v{font-size:1.6rem}\n.sds .story{margin:12px 0 0;font-size:.9rem;color:var(--text);min-height:3em}\n.sds .day{display:grid;gap:10px}\n.sds .bar{display:grid;grid-template-columns:132px 1fr auto;gap:12px;align-items:center}\n@media(max-width:520px){.sds .bar{grid-template-columns:1fr auto}.sds .bar .track{grid-column:1/-1;order:3}}\n.sds .track{height:14px;border-radius:7px;background:#0d1626;overflow:hidden}\n.sds .track i{display:block;height:100%;border-radius:7px;transition:width .4s}\n.sds .bar .num{font-family:var(--mono);font-variant-numeric:tabular-nums;min-width:74px;text-align:right}\n.sds .save{font-family:var(--display);font-size:1.15rem;margin-top:4px}\n.sds .save b{color:var(--lime)}\n.sds .legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:.78rem;color:var(--mute);margin-top:12px}\n.sds .legend i{display:inline-block;width:18px;height:4px;border-radius:2px;margin-right:6px;vertical-align:middle}\n.sds .fine{font-size:.76rem;color:var(--mute);margin:0}\n@media(prefers-reduced-motion:reduce){.sds .chip,.sds .sw,.sds .sw::after,.sds .track i{transition:none}}", HTML="<section class=\"scene\" aria-label=\"Animated house with solar panels, utility meter and optional Tesla Powerwall\">\n    <canvas id=\"scene\"></canvas>\n    <div class=\"hud\"><div class=\"clock\" id=\"clock\">6:00 PM</div><div class=\"badge\" id=\"badge\">On-peak</div></div>\n  </section>\n\n  <div class=\"cols\">\n    <section class=\"card\">\n      <h2>Pick a time of use</h2>\n      <div class=\"chips\" id=\"chips\"></div>\n      <div class=\"sliderRow\">\n        <button class=\"play\" id=\"play\" type=\"button\">&#9654; Play the day</button>\n        <input id=\"time\" type=\"range\" min=\"0\" max=\"24\" step=\"0.25\" value=\"18\" aria-label=\"Time of day\">\n      </div>\n      <div class=\"ticks\"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>\n      <div class=\"swRow\">\n        <div><b>Tesla Powerwall 3</b><span id=\"swHint\">Turn it on to see the evening change.</span></div>\n        <button class=\"sw\" id=\"sw\" type=\"button\" role=\"switch\" aria-checked=\"false\" aria-label=\"Tesla Powerwall 3\"></button>\n      </div>\n    </section>\n\n    <section class=\"card\">\n      <h2>Right now at this time</h2>\n      <div class=\"read\">\n        <div class=\"m\"><div class=\"l\"><i style=\"background:var(--lime)\"></i>Solar making</div><div class=\"v\" id=\"rS\">0 <small>kW</small></div><div class=\"d\" id=\"dS\"></div></div>\n        <div class=\"m\"><div class=\"l\"><i style=\"background:#fff\"></i>Home using</div><div class=\"v\" id=\"rL\">0 <small>kW</small></div><div class=\"d\" id=\"dL\"></div></div>\n        <div class=\"m\"><div class=\"l\"><i style=\"background:var(--batt)\"></i>Powerwall</div><div class=\"v\" id=\"rB\">off</div><div class=\"d\" id=\"dB\"></div></div>\n        <div class=\"m\"><div class=\"l\"><i id=\"gDot\" style=\"background:var(--on)\"></i><span id=\"gLbl\">Grid</span></div><div class=\"v\" id=\"rG\">0 <small>kW</small></div><div class=\"d\" id=\"dG\"></div></div>\n        <div class=\"m net\"><div><div class=\"l\">Money this hour</div><div class=\"d\" id=\"dN\"></div></div><div class=\"v\" id=\"rN\">$0.00</div></div>\n      </div>\n      <p class=\"story\" id=\"story\"></p>\n    </section>\n  </div>\n\n  <section class=\"card\">\n    <h2>The whole day, with and without a Powerwall</h2>\n    <div class=\"day\">\n      <div class=\"bar\"><span>Solar only</span><div class=\"track\"><i id=\"b0\" style=\"background:var(--on)\"></i></div><span class=\"num\" id=\"n0\"></span></div>\n      <div class=\"bar\"><span>Solar + Powerwall</span><div class=\"track\"><i id=\"b1\" style=\"background:var(--batt)\"></i></div><span class=\"num\" id=\"n1\"></span></div>\n    </div>\n    <div class=\"save\" id=\"save\"></div>\n    <div class=\"legend\">\n      <span><i style=\"background:var(--lime)\"></i>Solar to home</span>\n      <span><i style=\"background:var(--op)\"></i>Selling to the grid</span>\n      <span><i style=\"background:var(--on)\"></i>Buying from the grid</span>\n      <span><i style=\"background:var(--batt)\"></i>Powerwall</span>\n    </div>\n    <p class=\"fine\" style=\"margin-top:10px\">Illustrative. About 5 kW of Tesla panels, a typical California home, and approximate rates of 38&cent; super off-peak, 50&cent; off-peak and 78&cent; on-peak, applied to power you buy and power you send out. Your plan and your real bill decide the final numbers.</p>\n  </section>\n";
  function mount(host, opts){
    opts=opts||{};
    if(!STYLE){ var st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st); STYLE=true; }
    var U='sds'+(++N)+'_';
    var root=document.createElement('div'); root.className='sds';
    root.innerHTML=HTML.replace(/id="([A-Za-z0-9_]+)"/g,'id="'+U+'$1"');
    host.innerHTML=''; host.appendChild(root);
    (function(){

  /* ---------- model ---------- */
  var RATE = {sop:.38, op:.50, on:.78};
  var PERIOD = {
    sop:{name:'Super off-peak', color:'#4aa3ff', short:'12–6 AM'},
    op: {name:'Off-peak',       color:'#f5b83d', short:''},
    on: {name:'On-peak',        color:'#ff5a4a', short:'4–9 PM'}
  };
  function periodAt(t){ t=((t%24)+24)%24; return t<6?'sop':(t>=16&&t<21)?'on':'op'; }
  var LOAD0=[.5,.45,.45,.45,.5,.6,.9,1.3,1.1,.8,.7,.7,.75,.75,.8,1.0,1.6,2.4,2.8,2.6,2.2,1.6,1.0,.7];
  var LOADK=1; if(opts.annualKwh>0){ var sum0=0; LOAD0.forEach(function(v){sum0+=v;}); LOADK=Math.max(.4,Math.min(3,opts.annualKwh/365/sum0)); }
  var LOAD=LOAD0.map(function(v){return v*LOADK;});
  var PEAK=(opts.kw>0?opts.kw:5)*0.72;
  function loadAt(t){ t=((t%24)+24)%24; var i=Math.floor(t), f=t-i; return LOAD[i]*(1-f)+LOAD[(i+1)%24]*f; }
  function solarAt(t){ t=((t%24)+24)%24; if(t<6.5||t>18.5) return 0; return PEAK*Math.pow(Math.sin(Math.PI*(t-6.5)/12),1.3); }
  var CAP=13.5, MAXKW=5, RESERVE=.1;
  // Whole-day simulation (two passes so the battery starts the day where it ended the last one).
  function simulate(batt){
    var dt=.05, soc=batt?.1*CAP:0, out=[], day=0;
    for(var pass=0;pass<2;pass++){
      out=[]; day=0;
      for(var t=0;t<24-1e-9;t+=dt){
        var S=solarAt(t), L=loadAt(t), per=periodAt(t), ch=0, dis=0;
        if(batt){
          if(per==='on'){ dis=Math.min(MAXKW, Math.max(0,L-S), Math.max(0,(soc-RESERVE*CAP)/dt)); }
          else if(S>L && soc<CAP){ ch=Math.min(MAXKW, S-L, (CAP-soc)/dt); }
        }
        soc+=(ch-dis)*dt;
        var imp=Math.max(0,L-S-dis), exp=Math.max(0,S-L-ch);
        out.push({t:t,S:S,L:L,ch:ch,dis:dis,imp:imp,exp:exp,soc:soc/CAP,per:per});
        day+=(imp-exp)*RATE[per]*dt;
      }
    }
    return {steps:out,net:day};
  }
  var SIM=[simulate(false),simulate(true)];
  function stateAt(t,batt){ var s=SIM[batt?1:0].steps; var i=Math.min(s.length-1,Math.round(((t%24)+24)%24/.05)); return s[i]; }

  /* ---------- state / DOM ---------- */
  var ST=opts.state||{}; var t=(typeof ST.t==='number'?ST.t:18), batt=!!ST.batt, playing=false, last=0, reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $=function(id){return root.querySelector('#'+U+id)};
  var chipsEl=$('chips'), CHIPS=[
    {k:'sop',t:3,   n:'Super off-peak', sub:'12 AM to 6 AM'},
    {k:'op', t:11,  n:'Off-peak',       sub:'6 AM to 4 PM, the sun fills the battery'},
    {k:'on', t:18,  n:'On-peak',        sub:'4 PM to 9 PM'},
    {k:'op', t:22.5,n:'Off-peak',       sub:'9 PM to midnight'}
  ];
  CHIPS.forEach(function(c,i){
    var b=document.createElement('button'); b.type='button'; b.className='chip'; b.dataset.i=i; b.style.setProperty('--c',PERIOD[c.k].color);
    b.innerHTML='<span class="n" style="color:'+PERIOD[c.k].color+'">'+c.n+'</span><span class="p">$'+RATE[c.k].toFixed(2)+'<span style="font-size:.8rem;color:var(--mute)"> /kWh</span></span><span class="t">'+c.sub+'</span>';
    b.addEventListener('click',function(){ playing=false; setPlay(); t=c.t; sync(); });
    chipsEl.appendChild(b);
  });
  function fmtTime(x){ x=((x%24)+24)%24; var h=Math.floor(x), m=Math.round((x-h)*60); if(m===60){h=(h+1)%24;m=0;} var ap=h>=12?'PM':'AM', hh=h%12===0?12:h%12; return hh+':'+(m<10?'0':'')+m+' '+ap; }
  var money=function(v){ return (v<0?'−':'')+'$'+Math.abs(v).toFixed(2); };
  function setPlay(){ $('play').innerHTML=playing?'&#10074;&#10074; Pause':'&#9654; Play the day'; }
  $('play').addEventListener('click',function(){ playing=!playing; setPlay(); });
  $('time').addEventListener('input',function(e){ playing=false; setPlay(); t=parseFloat(e.target.value); sync(); });
  $('sw').addEventListener('click',function(){ batt=!batt; $('sw').setAttribute('aria-checked',batt); $('swHint').textContent=batt?'On. It fills with spare midday sun and powers the home from 4 to 9 PM.':'Turn it on to see the evening change.'; sync(); });

  function sync(){
    ST.t=t; ST.batt=batt;
    var st=stateAt(t,batt), per=periodAt(t), rate=RATE[per];
    $('time').value=t; $('clock').textContent=fmtTime(t);
    var bd=$('badge'); bd.textContent=PERIOD[per].name+' · $'+rate.toFixed(2); bd.style.background=PERIOD[per].color;
    var cur=-1; CHIPS.forEach(function(c,i){ var on=false; if(i===0)on=t<6; else if(i===1)on=t>=6&&t<16; else if(i===2)on=t>=16&&t<21; else on=t>=21; chipsEl.children[i].classList.toggle('on',on); });
    $('rS').innerHTML=st.S.toFixed(1)+' <small>kW</small>'; $('dS').textContent=st.S>0.05?'Tesla panels on the roof':'Dark, nothing to make';
    $('rL').innerHTML=st.L.toFixed(1)+' <small>kW</small>'; $('dL').textContent=st.L>2?'Cooking, AC, lights, EV':'Fridge, lights, devices';
    if(batt){ $('rB').innerHTML=Math.round(st.soc*100)+'% <small>full</small>'; $('dB').textContent=st.ch>.05?'Charging '+st.ch.toFixed(1)+' kW from the sun':(st.dis>.05?'Powering the home, '+st.dis.toFixed(1)+' kW':'Holding'); }
    else { $('rB').textContent='off'; $('dB').textContent='No battery on the wall'; }
    var buying=st.imp>=st.exp;
    var g=buying?st.imp:st.exp;
    $('gLbl').textContent=buying?'Buying from grid':'Selling to grid'; $('gDot').style.background=buying?'var(--on)':'var(--op)';
    $('rG').innerHTML=g.toFixed(1)+' <small>kW</small>'; $('dG').textContent=g<.05?'Home is covered':(buying?'at $'+rate.toFixed(2)+' per kWh':'earning $'+rate.toFixed(2)+' per kWh');
    var net=(st.exp-st.imp)*rate;
    $('rN').textContent=money(net); $('rN').style.color=net>=0?'var(--lime)':'var(--on)'; $('dN').textContent=net>=0?'Credit earned':'Spent on grid power';
    var s;
    if(per==='on'&&!batt) s='4 to 9 PM is the most expensive power of the day. The sun is going down, so this home buys '+st.imp.toFixed(1)+' kW from the grid at $0.78 per kWh.';
    else if(per==='on'&&batt) s=(st.imp<.05?'The Powerwall carries the home through the peak. Nothing is bought at $0.78 per kWh.':'The Powerwall covers most of the peak, so only '+st.imp.toFixed(1)+' kW is bought at $0.78 per kWh.');
    else if(per==='sop') s='Night. The panels are off and the home buys a little power at the cheapest rate of the day, $0.38 per kWh.';
    else if(st.S>0.2&&st.exp>st.imp) s=batt&&st.ch>.1?'Spare sun fills the Powerwall first, then the rest is sold at $0.50 per kWh.':'The roof makes more than the home uses, so the extra is sold to the grid at $0.50 per kWh.';
    else if(st.S>0.2) s='The roof covers most of the home. Anything extra comes from the grid at $0.50 per kWh.';
    else s='Off-peak. The home buys power at $0.50 per kWh.';
    $('story').textContent=s;
  }
  function renderDay(){
    var a=SIM[0].net, b=SIM[1].net, mx=Math.max(Math.abs(a),Math.abs(b),1);
    $('n0').textContent=money(a); $('n1').textContent=money(b);
    $('b0').style.width=Math.max(4,Math.abs(a)/mx*100)+'%'; $('b1').style.width=Math.max(4,Math.abs(b)/mx*100)+'%';
    $('save').innerHTML='A Powerwall changes this day by <b>'+money(a-b)+'</b>, about <b>$'+Math.round((a-b)*365).toLocaleString('en-US')+'</b> a year at these rates.';
  }

  /* ---------- scene ---------- */
  var cv=$('scene'), ctx=cv.getContext('2d'), W=0,H=0,SC=1,dpr=1;
  function resize(){
    var r=cv.parentElement.getBoundingClientRect(); W=Math.max(300,r.width); H=W*.78; dpr=Math.min(2,window.devicePixelRatio||1);
    cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr); cv.style.height=H+'px'; ctx.setTransform(dpr,0,0,dpr,0,0); SC=W/15;
  }
  function P(x,y,z){ return [4.8*SC+(x-y)*.866*SC, 4.4*SC+(x+y)*.45*SC-z*SC]; }
  function hex(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
  function mix(a,b,f){ return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f]; }
  function rgb(c,a){ return 'rgba('+Math.round(c[0])+','+Math.round(c[1])+','+Math.round(c[2])+','+(a==null?1:a)+')'; }
  function smooth(a,b,x){ x=Math.max(0,Math.min(1,(x-a)/(b-a))); return x*x*(3-2*x); }
  var SKY=[[0,'#070b1d','#12204a'],[4.5,'#0d1330','#26305f'],[5.5,'#3a3a78','#e48b6b'],[7,'#6aa9e6','#d4e8f4'],[12,'#2f86dd','#a6d4f4'],[16.5,'#4a8bd2','#f1c08c'],[18,'#4d4f9a','#f08a5c'],[19,'#271f55','#c4605f'],[20.5,'#0b1030','#1a2450'],[24,'#070b1d','#12204a']];
  function skyAt(tt){ for(var i=0;i<SKY.length-1;i++){ if(tt>=SKY[i][0]&&tt<=SKY[i+1][0]){ var f=(tt-SKY[i][0])/(SKY[i+1][0]-SKY[i][0]); return [mix(hex(SKY[i][1]),hex(SKY[i+1][1]),f),mix(hex(SKY[i][2]),hex(SKY[i+1][2]),f)]; } } return [hex(SKY[0][1]),hex(SKY[0][2])]; }
  var STARS=[]; for(var i=0;i<70;i++) STARS.push([(i*73%100)/100,((i*47+13)%55)/100,.6+((i*31)%10)/10]);
  var CLOUDS=[[.1,.16,1],[.55,.1,1.3],[.82,.24,.8]];

  function poly(pts,fill,stroke,lw){
    ctx.beginPath(); for(var i=0;i<pts.length;i++){ var q=P(pts[i][0],pts[i][1],pts[i][2]); if(i)ctx.lineTo(q[0],q[1]); else ctx.moveTo(q[0],q[1]); } ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1;ctx.stroke();}
  }
  function box(x0,y0,z0,x1,y1,z1,top,right,left){
    poly([[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]],right);               // x=x1 face
    poly([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],left);                // y=y1 face
    poly([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],top);                 // roof
  }
  function pill(x,y,lines,color,align){
    ctx.font='700 '+Math.max(10,SC*.26)+'px '+'system-ui,-apple-system,Segoe UI,sans-serif'; var fs=Math.max(10,SC*.26), pad=Math.max(SC*.18,6), lh=Math.max(SC*.34,fs*1.4), w=0;
    lines.forEach(function(l){ w=Math.max(w,ctx.measureText(l).width); }); w+=pad*2; var h=lines.length*lh+pad*1.1;
    var x0=align==='r'?x-w:align==='c'?x-w/2:x, y0=y-h;
    ctx.fillStyle='rgba(8,14,26,.82)'; ctx.strokeStyle=color; ctx.lineWidth=1.5; rr(x0,y0,w,h,SC*.2); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.textBaseline='middle'; ctx.textAlign='left';
    lines.forEach(function(l,i){ ctx.fillStyle=i===0?color:'#fff'; ctx.fillText(l,x0+pad,y0+pad*.55+lh*(i+.5)); });
  }
  function rr(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

  // flow paths in world space
  var N={R:[6,2.2,3.1],H:[5.6,4.5,1.4],M:[8.15,.9,1.5],G:[10.5,1.2,4.2],PB:[8.3,2.65,1.55]};
  var PATH={
    solarHome:[N.R,[6,4.5,2.8],N.H],
    solarBatt:[N.R,[7.4,2.4,3.0],[8.2,2.65,2.4],N.PB],
    battHome:[[8.3,2.65,.9],[8.5,3.4,.25],[8.5,4.8,.25],[5.6,4.8,.25],N.H],
    export:[N.R,[7.5,1.3,3.0],[8.05,.9,2.3],N.M,[9.3,1.0,3.3],N.G],
    import:[N.G,[9.3,1.0,3.3],N.M,[8.5,.9,.1],[8.5,4.8,.1],[5.6,4.8,.1],N.H]
  };
  function pathPt(pts,u){
    var sp=pts.map(function(p){return P(p[0],p[1],p[2]);}), L=[0];
    for(var i=1;i<sp.length;i++) L.push(L[i-1]+Math.hypot(sp[i][0]-sp[i-1][0],sp[i][1]-sp[i-1][1]));
    var d=u*L[L.length-1]; for(var j=1;j<sp.length;j++){ if(d<=L[j]){ var f=(d-L[j-1])/(L[j]-L[j-1]||1); return [sp[j-1][0]+(sp[j][0]-sp[j-1][0])*f, sp[j-1][1]+(sp[j][1]-sp[j-1][1])*f]; } }
    return sp[sp.length-1];
  }
  function drawPath(pts,color,alpha){
    ctx.beginPath(); pts.forEach(function(p,i){ var q=P(p[0],p[1],p[2]); if(i)ctx.lineTo(q[0],q[1]); else ctx.moveTo(q[0],q[1]); });
    ctx.strokeStyle=color; ctx.globalAlpha=alpha; ctx.lineWidth=Math.max(1.5,SC*.07); ctx.setLineDash([SC*.12,SC*.16]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
  }
  function flow(pts,kw,color,time){
    if(kw<.05) return; drawPath(pts,color,.22);
    var n=Math.min(16,Math.max(2,Math.round(kw*3))), sp=.16+kw*.045;
    for(var i=0;i<n;i++){
      var u=reduce?(i+.5)/n:((time*sp+i/n)%1), q=pathPt(pts,u);
      ctx.shadowColor=color; ctx.shadowBlur=SC*.45; ctx.fillStyle=color; ctx.beginPath(); ctx.arc(q[0],q[1],Math.max(2.2,SC*.075+kw*SC*.012),0,6.283); ctx.fill(); ctx.shadowBlur=0;
    }
  }

  function draw(time){
    var st=stateAt(t,batt), per=periodAt(t);
    var alt=(t>=6&&t<=18)?Math.sin(Math.PI*(t-6)/12):-1, dark=1-smooth(-.06,.28,alt), light=.36+.64*(1-dark);
    ctx.clearRect(0,0,W,H);
    // sky
    var sk=skyAt(t), g=ctx.createLinearGradient(0,0,0,H*.62); g.addColorStop(0,rgb(sk[0])); g.addColorStop(1,rgb(sk[1])); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    // stars
    STARS.forEach(function(s){ var a=dark*.9*(.6+.4*Math.sin(time*1.3+s[0]*40)); if(a>0.02){ ctx.fillStyle='rgba(255,255,255,'+a+')'; ctx.beginPath(); ctx.arc(s[0]*W,s[1]*H,s[2]*(SC*.045),0,6.283); ctx.fill(); } });
    // sun / moon
    var sun=(t>=5.5&&t<=18.5), u=(t-6)/12;
    if(sun){ var sx=W*(.08+.84*Math.max(0,Math.min(1,u))), sy=H*.44-Math.sin(Math.PI*Math.max(0,Math.min(1,u)))*H*.36;
      var gl=ctx.createRadialGradient(sx,sy,0,sx,sy,SC*3.2); gl.addColorStop(0,'rgba(255,238,170,.75)'); gl.addColorStop(.25,'rgba(255,214,120,.28)'); gl.addColorStop(1,'rgba(255,200,100,0)'); ctx.fillStyle=gl; ctx.fillRect(sx-SC*3.3,sy-SC*3.3,SC*6.6,SC*6.6);
      ctx.fillStyle='#fff6d0'; ctx.beginPath(); ctx.arc(sx,sy,SC*.55,0,6.283); ctx.fill(); }
    var night=(t<5.5||t>18.5); if(night){ var v=((t-18+24)%24)/12; v=Math.max(0,Math.min(1,v)); var mx=W*(.1+.8*v), my=H*.4-Math.sin(Math.PI*v)*H*.3;
      var mg=ctx.createRadialGradient(mx,my,0,mx,my,SC*2); mg.addColorStop(0,'rgba(220,230,255,.35)'); mg.addColorStop(1,'rgba(220,230,255,0)'); ctx.fillStyle=mg; ctx.fillRect(mx-SC*2,my-SC*2,SC*4,SC*4); ctx.fillStyle='#f4f1e4'; ctx.beginPath(); ctx.arc(mx,my,SC*.5,0,6.283); ctx.fill(); ctx.fillStyle='rgba(150,155,170,.35)'; [[-.15,-.1,.14],[.18,.12,.1],[.05,.25,.07]].forEach(function(c){ ctx.beginPath(); ctx.arc(mx+c[0]*SC,my+c[1]*SC,c[2]*SC,0,6.283); ctx.fill(); }); }
    // clouds
    CLOUDS.forEach(function(c,i){ var cx=((c[0]+time*.004*(i+1))%1.3-.15)*W, cy=c[1]*H; ctx.fillStyle=rgb(mix([255,255,255],[60,70,110],dark),.55); [[0,0,1],[.7,.1,.75],[-.7,.12,.7],[.3,-.25,.7]].forEach(function(p){ ctx.beginPath(); ctx.ellipse(cx+p[0]*SC*c[2],cy+p[1]*SC*c[2],SC*1.0*p[2]*c[2],SC*.45*p[2]*c[2],0,0,6.283); ctx.fill(); }); });
    // distant hills + far ground
    var hz=4.1*SC; ctx.fillStyle=rgb(mix(hex('#5c7d62'),hex('#0b1424'),dark*.85)); ctx.beginPath(); ctx.moveTo(0,hz+SC*.3); for(var x=0;x<=W;x+=W/24){ ctx.lineTo(x,hz-SC*.35-Math.sin(x/W*7+1)*SC*.28-Math.sin(x/W*17)*SC*.1); } ctx.lineTo(W,hz+SC); ctx.lineTo(0,hz+SC); ctx.fill();
    ctx.fillStyle=rgb(mix(hex('#4c7a3f'),hex('#0e1b17'),dark*.88)); ctx.fillRect(0,hz,W,H-hz);
    // lawn slab
    poly([[-.5,-.5,0],[11,-.5,0],[11,4.8,0],[-.5,4.8,0]],rgb(mix(hex('#5f9448'),hex('#13261c'),dark*.88)),rgb(mix(hex('#78a85c'),hex('#1d3a2b'),dark*.8)),2);
    poly([[3.2,4.5,0],[7.6,4.5,0],[7.6,4.8,0],[3.2,4.8,0]],rgb(mix(hex('#c9c4b8'),hex('#2b3340'),dark*.85)));            // path
    // house
    var cB=function(h){ return rgb(mix([0,0,0],hex(h),light)); };
    box(0,0,0,3.8,4.5,4.0,cB('#565d68'),cB('#353b44'),cB('#454c57'));
    box(3.8,0,0,8,4.5,2.6,cB('#f1eee7'),cB('#cdc8bd'),cB('#e2ded4'));
    poly([[3.8,0,2.6],[3.8,4.5,2.6],[3.8,4.5,4.0],[3.8,0,4.0]],cB('#2d323a'));                                       // tall block, side face above roof
    // wood slats on tall block front
    for(var k=0;k<10;k++){ var xx=.25+k*.34; poly([[xx,4.5,.05],[xx+.14,4.5,.05],[xx+.14,4.5,4.0],[xx,4.5,4.0]],'rgba(176,122,76,'+(.55*light)+')'); }
    // windows (y=4.5 face): tall block + main
    function win(x0,x1,z0,z1,y,face){
      var pts=face==='y'?[[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]]:[[y,x0,z0],[y,x1,z0],[y,x1,z1],[y,x0,z1]];
      var glow=dark>.15?dark:0, interior=glow>0;
      var a=P.apply(null,pts[0]), b=P.apply(null,pts[2]); var gg=ctx.createLinearGradient(a[0],a[1],b[0],b[1]);
      if(interior){ gg.addColorStop(0,rgb([255,214,140],.55+.4*glow)); gg.addColorStop(1,rgb([255,176,90],.55+.4*glow)); }
      else { gg.addColorStop(0,rgb(mix(sk[1],[255,255,255],.25),.9)); gg.addColorStop(1,rgb(mix(sk[0],[40,70,110],.3),.95)); }
      poly(pts,gg,'#0b0f14',2);
    }
    win(5.0,7.7,.55,2.0,4.5,'y'); win(4.1,4.75,.55,2.0,4.5,'y');
    ctx.save(); poly([[.45,4.5,.5],[3.4,4.5,.5],[3.4,4.5,3.6],[.45,4.5,3.6]],null,null); ctx.restore();
    (function(){ var x0=.45,x1=3.4,z0=.5,z1=3.6, pts=[[x0,4.5,z0],[x1,4.5,z0],[x1,4.5,z1],[x0,4.5,z1]], a=P.apply(null,pts[0]), b=P.apply(null,pts[2]); var gg=ctx.createLinearGradient(a[0],a[1],b[0],b[1]);
      if(dark>.15){ gg.addColorStop(0,rgb([255,222,150],.6+.35*dark)); gg.addColorStop(1,rgb([255,184,98],.6+.35*dark)); } else { gg.addColorStop(0,rgb(mix(sk[1],[255,255,255],.2),.9)); gg.addColorStop(1,rgb(mix(sk[0],[40,70,110],.3),.95)); }
      poly(pts,gg,'#0b0f14',2); poly([[(x0+x1)/2,4.5,z0],[(x0+x1)/2+.04,4.5,z0],[(x0+x1)/2+.04,4.5,z1],[(x0+x1)/2,4.5,z1]],'#0b0f14'); poly([[x0,4.5,2.1],[x1,4.5,2.1],[x1,4.5,2.14],[x0,4.5,2.14]],'#0b0f14'); })();
    // door on right face
    poly([[8,3.5,.02],[8,4.2,.02],[8,4.2,2.0],[8,3.5,2.0]],cB('#7a5a3c'),'#2a1d12',1.5);
    // panels
    var prodF=Math.min(1,st.S/3.6), cols=4, rows=3;
    for(var i2=0;i2<cols;i2++) for(var j=0;j<rows;j++){
      var xa=4.3+i2*.85, xb=xa+.8, ya=.45+j*1.17, yb=ya+1.12, za=2.72+(ya-.45)*.05, zb=2.72+(yb-.45)*.05;
      var pa=P(xa,ya,za), pc=P(xb,yb,zb), pg=ctx.createLinearGradient(pa[0],pa[1],pc[0],pc[1]);
      var base=mix(hex('#0b1622'),hex('#1d3f5c'),prodF*.9); pg.addColorStop(0,rgb(mix([0,0,0],base,.5+.5*light))); pg.addColorStop(.5,rgb(mix([0,0,0],mix(base,[120,170,210],.18+.25*prodF),.5+.5*light))); pg.addColorStop(1,rgb(mix([0,0,0],base,.5+.5*light)));
      poly([[xa,ya,za],[xb,ya,za],[xb,yb,zb],[xa,yb,zb]],pg,'#05090e',1.4);
      ctx.strokeStyle='rgba(120,170,210,'+(.12+.12*prodF)+')'; ctx.lineWidth=1; ctx.beginPath();
      for(var c2=1;c2<4;c2++){ var q1=P(xa+(xb-xa)*c2/4,ya,za), q2=P(xa+(xb-xa)*c2/4,yb,zb); ctx.moveTo(q1[0],q1[1]); ctx.lineTo(q2[0],q2[1]); }
      for(var r2=1;r2<6;r2++){ var yy=ya+(yb-ya)*r2/6, zz=za+(zb-za)*r2/6, q3=P(xa,yy,zz), q4=P(xb,yy,zz); ctx.moveTo(q3[0],q3[1]); ctx.lineTo(q4[0],q4[1]); }
      ctx.stroke();
      if(prodF>.02){ var sh=(time*.35+i2*.18+j*.1)%1.6; ctx.save(); ctx.globalAlpha=.16*prodF; poly([[xa,ya,za],[xb,ya,za],[xb,yb,zb],[xa,yb,zb]],'rgba(255,240,180,1)'); ctx.restore(); }
    }
    // meter + powerwall mount
    var mt=P(8.02,.9,1.5); ctx.fillStyle='#d9dde3'; ctx.beginPath(); ctx.arc(mt[0],mt[1],SC*.2,0,6.283); ctx.fill(); ctx.strokeStyle='#59616d'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle=per==='on'?'#ff5a4a':(st.exp>st.imp?'#f5b83d':'#4aa3ff'); ctx.beginPath(); ctx.arc(mt[0],mt[1],SC*.07,0,6.283); ctx.fill();
    if(batt){
      box(8,2.3,.25,8.3,3.0,1.6,cB('#ffffff'),cB('#f4f6f8'),cB('#c9ced6'));
      var ic=batt&&(st.ch>.05||st.dis>.05); var lq=P(8.31,2.78,1.2), lq2=P(8.31,2.78,.5);
      ctx.strokeStyle=ic?'#35d6c8':'#9aa3ad'; ctx.lineWidth=SC*.06; ctx.lineCap='round'; ctx.shadowColor='#35d6c8'; ctx.shadowBlur=ic?SC*.4:0; ctx.beginPath(); ctx.moveTo(lq[0],lq[1]); ctx.lineTo(lq2[0],lq2[1]); ctx.stroke(); ctx.shadowBlur=0; ctx.lineCap='butt';
      var tq=P(8.31,2.5,1.35); ctx.fillStyle='#b32a2a'; ctx.font='800 '+SC*.26+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('T',tq[0],tq[1]);
    } else {
      ctx.setLineDash([SC*.12,SC*.12]); poly([[8.02,2.3,.25],[8.02,3.0,.25],[8.02,3.0,1.6],[8.02,2.3,1.6]],'rgba(255,255,255,.04)','rgba(255,255,255,.4)',1.5); ctx.setLineDash([]);
    }
    // pole + wires
    var p0=P(10.5,1.2,0), p1=P(10.5,1.2,4.3); ctx.strokeStyle=rgb(mix(hex('#5a4630'),hex('#1a1612'),dark*.7)); ctx.lineWidth=SC*.14; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.stroke();
    var a1=P(10.5,.55,4.15), a2=P(10.5,1.85,4.15); ctx.lineWidth=SC*.1; ctx.beginPath(); ctx.moveTo(a1[0],a1[1]); ctx.lineTo(a2[0],a2[1]); ctx.stroke(); ctx.lineCap='butt';
    var gp=P.apply(null,N.G), mp=P(8.15,.9,1.8); ctx.strokeStyle='rgba(20,24,30,.9)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(gp[0],gp[1]); ctx.quadraticCurveTo((gp[0]+mp[0])/2,(gp[1]+mp[1])/2+SC*.5,mp[0],mp[1]); ctx.stroke();
    var fe=P(12,-.5,4.4); ctx.beginPath(); ctx.moveTo(gp[0],gp[1]); ctx.quadraticCurveTo((gp[0]+fe[0])/2,(gp[1]+fe[1])/2+SC*.35,fe[0],fe[1]); ctx.stroke();
    // night light on lawn from windows
    if(dark>.2){ var wl=ctx.createRadialGradient(P(4,5.3,0)[0],P(4,5.3,0)[1],0,P(4,5.3,0)[0],P(4,5.3,0)[1],SC*3.4); wl.addColorStop(0,'rgba(255,205,120,'+(.28*dark)+')'); wl.addColorStop(1,'rgba(255,205,120,0)'); ctx.fillStyle=wl; ctx.fillRect(0,P(4,5.3,0)[1]-SC*2,W,SC*4.5); }

    // flows
    var solarToHome=Math.min(st.S,st.L), solarToBatt=st.ch, toGrid=st.exp;
    flow(PATH.solarHome,solarToHome,'#b6e65a',time);
    if(batt){ flow(PATH.solarBatt,solarToBatt,'#35d6c8',time); flow(PATH.battHome,st.dis,'#35d6c8',time); }
    flow(PATH.export,toGrid,'#f5b83d',time);
    flow(PATH.import,st.imp,'#ff5a4a',time);

    // labels
    var narrow=W<560; var rp=P(6,.2,3.55); if(!narrow) pill(rp[0],rp[1],['SOLAR',st.S.toFixed(1)+' kW'],'#b6e65a','c');
    var pc=PERIOD[per].color, gtop=P(10.5,1.2,4.9);
    var buying=st.imp>=st.exp&&st.imp>.05, selling=st.exp>st.imp&&st.exp>.05;
    var l1=PERIOD[per].name.toUpperCase()+'  $'+RATE[per].toFixed(2), l2=buying?('Buying '+st.imp.toFixed(1)+' kW  −$'+(st.imp*RATE[per]).toFixed(2)+'/hr'):selling?('Selling '+st.exp.toFixed(1)+' kW  +$'+(st.exp*RATE[per]).toFixed(2)+'/hr'):'No grid power needed';
    if(narrow){ pill(W-SC*.25,H-SC*.25,[l1,l2],pc,'r'); pill(SC*.25,H-SC*.25,['SOLAR  '+st.S.toFixed(1)+' kW'],'#b6e65a','l'); } else pill(Math.min(W-SC*.2,gtop[0]+SC*.9),gtop[1],[l1,l2],pc,'r');
    if(batt){ var bp=P(9.0,3.1,0); if(narrow) pill(SC*.25,H-SC*.25-SC*1.0,['POWERWALL '+Math.round(st.soc*100)+'%'],'#35d6c8','l'); else pill(bp[0]-SC*.2,bp[1]+SC*.75,['POWERWALL '+Math.round(st.soc*100)+'%'],'#35d6c8','c'); }
  }

  var t0=performance.now();
  function frame(now){
    if(!root.isConnected){ window.removeEventListener('resize',onResize); if(RO) RO.disconnect(); return; }
    var dt=Math.min(.1,(now-last)/1000); last=now;
    if(playing){ t=(t+dt*1.0)%24; if(!reduce||true) sync(); }
    draw((now-t0)/1000);
    requestAnimationFrame(frame);
  }
  var onResize=function(){ resize(); }; window.addEventListener('resize',onResize);
  resize(); renderDay(); $('sw').setAttribute('aria-checked',batt); sync();
  var RO=null; if(window.ResizeObserver){ RO=new ResizeObserver(resize); RO.observe(cv.parentElement); }
  requestAnimationFrame(function(n){ last=n; frame(n); });

    })();
  }
  window.SolarDaySim={mount:mount};
})();
