(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const defaults = { altA:120, speedA:12, loadA:2, altB:85, speedB:10, loadB:1, wind:4, windDir:45, environment:'nominal' };
  let isAnimating = false;
  let animationStart = 0;
  let animationFrame = 0;
  let previewProgress = 0;
  let toastTimer;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const settings = () => ({
    altA:+$('altA').value, speedA:+$('speedA').value, loadA:+$('loadA').value,
    altB:+$('altB').value, speedB:+$('speedB').value, loadB:+$('loadB').value,
    wind:+$('wind').value, windDir:+$('windDir').value, environment:$('environment').value
  });

  function updateInputs() {
    const s = settings();
    $('altAValue').textContent = `${s.altA} m`;
    $('speedAValue').textContent = `${s.speedA} m/s`;
    $('loadAValue').textContent = `${s.loadA.toFixed(1)} kg`;
    $('altBValue').textContent = `${s.altB} m`;
    $('speedBValue').textContent = `${s.speedB} m/s`;
    $('loadBValue').textContent = `${s.loadB.toFixed(1)} kg`;
    $('windValue').textContent = `${s.wind} m/s`;
    $('windDirValue').textContent = `${String(s.windDir).padStart(3,'0')}°`;
    $('windTelemetry').innerHTML = `${s.wind} <small>m/s</small>`;
    $('windMeterFill').style.width = `${(s.wind/15)*100}%`;
    document.querySelectorAll('input[type="range"]').forEach(input => {
      const min = +input.min, max = +input.max, val = +input.value;
      const pct = ((val-min)/(max-min))*100;
      input.style.background = `linear-gradient(90deg, #54e2dc ${pct}%, #263d4a ${pct}%)`;
    });
    drawMissionScene();
  }

  function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width * ratio));
    const h = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio,0,0,ratio,0,0);
    return {ctx,w:rect.width,h:rect.height};
  }

  function project3D(x,y,z,w,h,scale=1) {
    const cx=w*.51, cy=h*.53;
    const s=Math.min(w,h)*.065*scale;
    return {x:cx+(x-y)*s, y:cy+(x+y)*s*.34-z*s*.72};
  }

  function drawGrid(ctx,w,h,compact=false) {
    ctx.save();
    const extent=compact?5:6;
    for(let i=-extent;i<=extent;i++){
      const a=project3D(-extent,i,0,w,h,compact?1.05:1.1);
      const b=project3D(extent,i,0,w,h,compact?1.05:1.1);
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle='rgba(115,171,185,.14)';ctx.lineWidth=1;ctx.stroke();
      const c=project3D(i,-extent,0,w,h,compact?1.05:1.1);
      const d=project3D(i,extent,0,w,h,compact?1.05:1.1);
      ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.strokeStyle='rgba(115,171,185,.14)';ctx.stroke();
    }
    // Side vertical axis ticks
    const axisBase=project3D(-extent,-extent,0,w,h,compact?1.05:1.1);
    const axisTop=project3D(-extent,-extent,4,w,h,compact?1.05:1.1);
    ctx.beginPath();ctx.moveTo(axisBase.x,axisBase.y);ctx.lineTo(axisTop.x,axisTop.y);ctx.strokeStyle='rgba(84,226,220,.35)';ctx.stroke();
    for(let i=1;i<=4;i++){
      const p=project3D(-extent,-extent,i,w,h,compact?1.05:1.1);
      ctx.beginPath();ctx.moveTo(p.x-4,p.y);ctx.lineTo(p.x+4,p.y);ctx.strokeStyle='rgba(84,226,220,.35)';ctx.stroke();
    }
    ctx.restore();
  }

  function drawZone(ctx,w,h) {
    const pts=[project3D(-.9,.1,0,w,h),project3D(.1,-.9,0,w,h),project3D(1.1,.1,0,w,h),project3D(.1,1.1,0,w,h)];
    ctx.save();
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.closePath();
    ctx.fillStyle='rgba(251,122,122,.11)';ctx.fill();ctx.strokeStyle='rgba(251,122,122,.55)';ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([]);
    const mid=project3D(.1,.1,0,w,h);ctx.font='8px DM Mono, monospace';ctx.fillStyle='rgba(251,150,150,.8)';ctx.textAlign='center';ctx.fillText('RESTRICTED',mid.x,mid.y+3);
    ctx.restore();
  }

  function drawDrone(ctx,p,color,label,phase=0) {
    ctx.save();
    ctx.shadowColor=color;ctx.shadowBlur=15;
    ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.shadowBlur=0;
    ctx.beginPath();ctx.arc(p.x,p.y,10+Math.sin(phase)*2,0,Math.PI*2);ctx.strokeStyle=color+'70';ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();ctx.moveTo(p.x-12,p.y);ctx.lineTo(p.x+12,p.y);ctx.moveTo(p.x,p.y-12);ctx.lineTo(p.x,p.y+12);ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.stroke();
    ctx.font='9px DM Mono, monospace';ctx.fillStyle=color;ctx.textAlign='left';ctx.fillText(label,p.x+14,p.y-9);
    ctx.restore();
  }

  function drawPath(ctx,points,color,dash=[6,5]) {
    ctx.save();ctx.beginPath();points.forEach((p,i)=>{const q=project3D(p[0],p[1],p[2],ctx.canvas.clientWidth,ctx.canvas.clientHeight);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y)});
    ctx.strokeStyle=color;ctx.lineWidth=1.7;ctx.setLineDash(dash);ctx.stroke();ctx.restore();
  }

  function drawMissionScene() {
    const canvas=$('missionScene'); if(!canvas) return;
    const {ctx,w,h}=resizeCanvas(canvas);ctx.clearRect(0,0,w,h);
    const s=settings();
    const t=previewProgress;
    drawGrid(ctx,w,h,false);drawZone(ctx,w,h);
    const altitudeScale=1/200;
    const zA=(s.altA*altitudeScale)*4.2, zB=(s.altB*altitudeScale)*4.2;
    const aStart=[-4.1,2.8,zA], bStart=[4.0,-2.8,zB], meet=[.25,.1,Math.max(zA,zB)*.75+0.3];
    const aNow=aStart.map((v,i)=>v+(meet[i]-v)*t);
    const bNow=bStart.map((v,i)=>v+(meet[i]-v)*t);
    const pathA=[aStart,[-2.6,1.9,zA+.25],[-1.1,.6,zA+.3],meet];
    const pathB=[bStart,[2.7,-1.8,zB+.3],[1.4,-.6,zB+.15],meet];
    drawPath(ctx,pathA,'rgba(84,226,220,.8)');drawPath(ctx,pathB,'rgba(167,139,250,.85)');
    const pA=project3D(...aNow,w,h),pB=project3D(...bNow,w,h),pMeet=project3D(...meet,w,h);
    [pA,pB].forEach((p,i)=>{ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,project3D(i===0?aNow[0]:bNow[0],i===0?aNow[1]:bNow[1],0,w,h).y);ctx.strokeStyle=i===0?'rgba(84,226,220,.24)':'rgba(167,139,250,.24)';ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([])});
    ctx.save();ctx.beginPath();ctx.arc(pMeet.x,pMeet.y,18+Math.sin(Date.now()/500)*2,0,Math.PI*2);ctx.strokeStyle='rgba(84,226,220,.5)';ctx.stroke();ctx.beginPath();ctx.arc(pMeet.x,pMeet.y,3,0,Math.PI*2);ctx.fillStyle='#54e2dc';ctx.fill();ctx.restore();
    drawDrone(ctx,pA,'#54e2dc','ALPHA',Date.now()/300);drawDrone(ctx,pB,'#a78bfa','BETA',Date.now()/300+1.4);
    // wind vector
    const angle=s.windDir*Math.PI/180;const wxv=Math.cos(angle),wyv=Math.sin(angle);
    const wp=project3D(-4.6,-3.1,2.9,w,h);ctx.save();ctx.translate(wp.x,wp.y);ctx.rotate(angle*.5);ctx.strokeStyle='rgba(244,189,105,.75)';ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-18,0);ctx.lineTo(18,0);ctx.lineTo(11,-5);ctx.moveTo(18,0);ctx.lineTo(11,5);ctx.stroke();ctx.font='8px DM Mono, monospace';ctx.fillStyle='rgba(244,189,105,.9)';ctx.fillText(`${s.wind} m/s WIND`,-22,16);ctx.restore();
    // scenario label
    ctx.font='8px DM Mono, monospace';ctx.fillStyle='rgba(151,180,193,.8)';ctx.fillText(`ALT A ${s.altA}m  /  ALT B ${s.altB}m`,w-180, h-18);
  }

  function drawHeroScene() {
    const canvas=$('heroScene'); if(!canvas)return;
    const {ctx,w,h}=resizeCanvas(canvas);ctx.clearRect(0,0,w,h);
    drawGrid(ctx,w,h,true);
    const meet=project3D(0,0,1.3,w,h,1.05);
    // luminous target rings
    ctx.save();[22,35,49].forEach((r,i)=>{ctx.beginPath();ctx.ellipse(meet.x,meet.y,r,r*.42,0,0,Math.PI*2);ctx.strokeStyle=`rgba(84,226,220,${.38-i*.1})`;ctx.setLineDash([3,6]);ctx.stroke()});ctx.setLineDash([]);ctx.restore();
    const seconds=Date.now()/1000;
    const a=[-3.3+Math.sin(seconds*.45)*.12,2.3,2.4],b=[3.1,-2.3,1.5];
    const aP=project3D(...a,w,h,1.05),bP=project3D(...b,w,h,1.05);
    ctx.save();ctx.setLineDash([5,6]);ctx.lineWidth=1.5;ctx.strokeStyle='rgba(84,226,220,.65)';ctx.beginPath();ctx.moveTo(aP.x,aP.y);ctx.lineTo(meet.x,meet.y);ctx.stroke();ctx.strokeStyle='rgba(167,139,250,.7)';ctx.beginPath();ctx.moveTo(bP.x,bP.y);ctx.lineTo(meet.x,meet.y);ctx.stroke();ctx.restore();
    drawDrone(ctx,aP,'#54e2dc','',seconds);drawDrone(ctx,bP,'#a78bfa','',seconds+1);
    // faint floating particles
    for(let i=0;i<22;i++){const x=(i*71+seconds*8)%(w+20)-10;const y=(i*37+Math.sin(seconds+i)*8)%h;ctx.fillStyle=`rgba(160,210,218,${.15+(i%4)*.05})`;ctx.fillRect(x,y,1.3,1.3)}
  }

  function animate(now) {
    if(!isAnimating)return;
    if(!animationStart)animationStart=now;
    const elapsed=now-animationStart;
    previewProgress=Math.min(1,elapsed/5200);
    drawMissionScene();
    if(previewProgress>=1){isAnimating=false;$('sceneState').textContent='VISUAL PREVIEW COMPLETE';toast('Visual preview completed. Decision engine is not connected yet.');return;}
    animationFrame=requestAnimationFrame(animate);
  }

  function startPreview() {
    cancelAnimationFrame(animationFrame);isAnimating=true;animationStart=0;previewProgress=0;
    $('sceneState').textContent='AGENTS IN MOTION';
    if(reducedMotion){previewProgress=1;drawMissionScene();isAnimating=false;$('sceneState').textContent='VISUAL PREVIEW COMPLETE';return;}
    animationFrame=requestAnimationFrame(animate);
  }

  function resetPreview() {
    cancelAnimationFrame(animationFrame);isAnimating=false;animationStart=0;previewProgress=0;
    $('sceneState').textContent='READY FOR PREVIEW';drawMissionScene();
  }

  function restoreDefaults() {
    Object.entries(defaults).forEach(([id,value])=>$(id).value=value);
    updateInputs();resetPreview();toast('Scenario inputs restored to default values.');
  }

  function toast(message) {
    const node=$('toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),3000);
  }

  // Mobile navigation
  $('mobileMenu').addEventListener('click',()=>{
    const open=$('mainNav').classList.toggle('open');$('mobileMenu').setAttribute('aria-expanded',String(open));
  });
  $('mainNav').querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{$('mainNav').classList.remove('open');$('mobileMenu').setAttribute('aria-expanded','false')}));

  // Input listeners
  document.querySelectorAll('input[type="range"], select').forEach(el=>el.addEventListener('input',()=>{updateInputs();if(isAnimating)resetPreview()}));
  $('runPreview').addEventListener('click',startPreview);
  $('resetScene').addEventListener('click',resetPreview);
  $('restoreInputs').addEventListener('click',restoreDefaults);

  // Section reveal and active navigation
  const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');revealObserver.unobserve(entry.target)}}),{threshold:.08});
  document.querySelectorAll('.reveal').forEach(el=>revealObserver.observe(el));
  const sections=[...document.querySelectorAll('main section[id]')];
  const navObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){document.querySelectorAll('.nav-link').forEach(link=>link.classList.toggle('active',link.getAttribute('href')===`#${entry.target.id}`))}}),{rootMargin:'-35% 0px -55% 0px'});
  sections.forEach(section=>navObserver.observe(section));

  updateInputs();drawHeroScene();
  function heroLoop(){drawHeroScene();requestAnimationFrame(heroLoop)}
  if(!reducedMotion)requestAnimationFrame(heroLoop);
  window.addEventListener('resize',()=>{drawMissionScene();drawHeroScene()});
  $('environment').addEventListener('change',()=>{
    const v=$('environment').value;
    if(v==='crosswind')$('wind').value=Math.max(8,+$('wind').value);
    if(v==='nominal')$('wind').value=4;
    if(v==='variable')$('wind').value=10;
    updateInputs();
  });
})();
