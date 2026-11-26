(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const defaults = {
    ugvX: 0.20, ugvY: 1.60, ugvSpeed: 4.0,
    uavX: 1.60, uavY: 0.20, uavNominal: 15.0,
    batteryInit: 70, batteryReserve: 20, spareBattery: true,
    windSpeed: 4.0, windAngle: 0, clearance: 40,
    timeWindow: 30, serviceDuration: 10
  };

  // Numerical values below are the report's worked example (Section 3.7).
  // They are displayed as reference data and are NOT recalculated by this frontend.
  const candidates = {
    M1: {
      label: 'M1 · Recommended option', status: 'FEASIBLE', statusClass: 'tag-green',
      point: [0.40, 1.60], speed: '20.00', tUGV: '0.050', tUAV: '0.109', total: '0.276', wait: '3.5', waitResource: 'UGV',
      fuel: '0.117', battery: '42.23', score: '0.399', rank: 'RANK 1', feasible: true,
      explanation: 'The proposed method increases UAV speed against the headwind to reach M1 sooner. The UGV waits for 3.5 minutes, while the UAV battery use remains within the available 50% budget.'
    },
    M2: {
      label: 'M2 · Feasible alternative', status: 'FEASIBLE', statusClass: 'tag-green',
      point: [0.80, 1.60], speed: '13.54', tUGV: '0.150', tUAV: '0.150', total: '0.317', wait: '0.0', waitResource: 'None',
      fuel: '0.210', battery: '47.80', score: '0.529', rank: 'RANK 2', feasible: true,
      explanation: 'The optimized UAV speed synchronizes the two arrivals at M2. Hover waiting is eliminated, but the total compromise score is higher than the M1 recommendation.'
    },
    M3: {
      label: 'M3 · Infeasible option', status: 'INFEASIBLE', statusClass: 'tag-red',
      point: [1.60, 1.60], speed: '15.00*', tUGV: '0.350', tUAV: '0.093', total: '0.517+', wait: '15.4', waitResource: 'UAV',
      fuel: '0.490', battery: '138.79', score: '—', rank: 'NO FEASIBLE', feasible: false,
      explanation: 'M3 cannot satisfy the 30-minute mission time window in the worked example. At nominal speed, the UAV also exceeds the available battery budget. The system must not recommend this point.'
    }
  };

  let selectedCandidate = 'M1';
  let customInputs = false;
  let isAnimating = false;
  let animationStart = 0;
  let animationFrame = 0;
  let previewProgress = 0;
  let toastTimer;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function settings() {
    return {
      ugvX: +$('ugvX').value, ugvY: +$('ugvY').value, ugvSpeed: +$('ugvSpeed').value,
      uavX: +$('uavX').value, uavY: +$('uavY').value, uavNominal: +$('uavNominal').value,
      batteryInit: +$('batteryInit').value, batteryReserve: +$('batteryReserve').value,
      spareBattery: $('spareBattery').checked,
      windSpeed: +$('windSpeed').value, windAngle: +$('windAngle').value,
      clearance: +$('clearance').value, timeWindow: +$('timeWindow').value,
      serviceDuration: +$('serviceDuration').value
    };
  }

  function windDirectionLabel(degrees) {
    if (degrees === 0) return 'East';
    if (degrees === 90) return 'North';
    if (degrees === 180) return 'West';
    if (degrees === 270) return 'South';
    return 'Bearing';
  }

  function markCustom() {
    customInputs = true;
    const notice = $('customState');
    notice.hidden = false;
    $('approveDecision').disabled = true;
    $('overrideDecision').disabled = true;
    $('rejectDecision').disabled = true;
    const s = settings();
    const messages = [];
    if (!s.spareBattery) messages.push('Spare battery is unavailable; the model precondition is not satisfied.');
    if (s.batteryReserve >= s.batteryInit) messages.push('Minimum reserve must be lower than the initial battery level.');
    if ([s.ugvX, s.ugvY, s.uavX, s.uavY].some(v => !Number.isFinite(v) || v < 0 || v > 2)) messages.push('Vehicle coordinates must remain inside the 2.0 × 2.0 km field.');
    const strong = messages.length ? ` ${messages.join(' ')}` : '';
    notice.querySelector('span:last-child').innerHTML = `<b>Custom visual inputs detected.</b> The worked-example results remain unchanged and must not be interpreted as results for your edited scenario. Re-load report defaults to restore the documented reference case.${strong}`;
  }

  function updateInputs() {
    const s = settings();
    $('ugvSpeedValue').textContent = `${s.ugvSpeed.toFixed(1)} km/h`;
    $('uavNominalValue').textContent = `${s.uavNominal.toFixed(1)} km/h`;
    $('batteryInitValue').textContent = `${s.batteryInit}%`;
    $('batteryReserveValue').textContent = `${s.batteryReserve}%`;
    $('windSpeedValue').textContent = `${s.windSpeed.toFixed(1)} km/h`;
    $('windAngleValue').textContent = `${String(s.windAngle).padStart(3, '0')}° · ${windDirectionLabel(s.windAngle)}`;
    $('clearanceValue').textContent = `${s.clearance} m`;

    document.querySelectorAll('input[type="range"]').forEach(input => {
      const min = +input.min, max = +input.max, val = +input.value;
      const pct = ((val - min) / (max - min)) * 100;
      input.style.background = `linear-gradient(90deg, #54e2dc ${pct}%, #263d4a ${pct}%)`;
    });
    $('spareBattery').closest('.toggle-row').classList.toggle('toggle-off', !s.spareBattery);
    drawMissionScene();
  }

  function canvasContext(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
  }

  function makeMap(w, h) {
    const size = Math.min(w - 104, h - 82);
    const left = (w - size) / 2 + 5;
    const top = (h - size) / 2 + 4;
    return {
      left, top, size,
      x: v => left + (v / 2) * size,
      y: v => top + size - (v / 2) * size,
      r: v => (v / 2) * size
    };
  }

  function drawFieldGrid(ctx, map) {
    const { left, top, size } = map;
    ctx.save();
    ctx.fillStyle = '#0d2632';
    ctx.strokeStyle = 'rgba(119, 169, 180, .22)';
    ctx.lineWidth = 1;
    ctx.fillRect(left, top, size, size);
    ctx.strokeRect(left, top, size, size);
    // A fine 100 x 100 grid is represented by light sub-grid lines and 0.2 km labels.
    for (let i = 0; i <= 10; i++) {
      const p = left + (size * i / 10);
      const q = top + (size * i / 10);
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(116, 176, 187, .22)' : 'rgba(116, 176, 187, .09)';
      ctx.beginPath(); ctx.moveTo(p, top); ctx.lineTo(p, top + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left, q); ctx.lineTo(left + size, q); ctx.stroke();
      if (i % 2 === 0) {
        ctx.font = '9px DM Mono, monospace'; ctx.fillStyle = 'rgba(160, 187, 196, .72)';
        ctx.textAlign = 'center'; ctx.fillText((i / 5).toFixed(1), p, top + size + 17);
        ctx.textAlign = 'right'; ctx.fillText((2 - i / 5).toFixed(1), left - 9, q + 3);
      }
    }
    // Headland service road.
    const roadY = map.y(1.6);
    ctx.fillStyle = 'rgba(84, 226, 220, .075)';
    ctx.fillRect(left, roadY - 13, size, 26);
    ctx.strokeStyle = 'rgba(84, 226, 220, .20)';
    ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.moveTo(left, roadY); ctx.lineTo(left + size, roadY); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '8px DM Mono, monospace'; ctx.fillStyle = 'rgba(84,226,220,.72)'; ctx.textAlign = 'left';
    ctx.fillText('HEADLAND SERVICE ROAD', left + 8, roadY - 19);
    ctx.restore();
  }

  function drawRestrictedZone(ctx, map, x, y, radius, color, label, clearance) {
    const px = map.x(x), py = map.y(y), r = map.r(radius), rb = map.r(radius + clearance);
    ctx.save();
    ctx.beginPath(); ctx.arc(px, py, rb, 0, Math.PI * 2);
    ctx.fillStyle = `${color}12`; ctx.fill(); ctx.strokeStyle = `${color}80`; ctx.setLineDash([4, 5]); ctx.lineWidth = 1.1; ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = `${color}24`; ctx.fill(); ctx.strokeStyle = `${color}b0`; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 5, py - 5); ctx.lineTo(px + 5, py + 5); ctx.moveTo(px + 5, py - 5); ctx.lineTo(px - 5, py + 5);
    ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.font = '8px DM Mono, monospace'; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(label, px, py - rb - 8);
    ctx.restore();
  }

  function routeFor(id, s) {
    const start = [s.uavX, s.uavY];
    if (id === 'M1') return [start, [1.20, 0.60], [0.80, 1.00], [0.40, 1.40], [0.40, 1.60]];
    if (id === 'M2') return [start, [1.20, 0.60], [0.80, 1.00], [0.80, 1.60]];
    return [start, [1.60, 0.70], [1.60, 1.20], [1.60, 1.60]];
  }

  function pathPoint(points, t) {
    const lengths = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const len = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      lengths.push(len); total += len;
    }
    let target = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < lengths.length; i++) {
      if (target <= lengths[i] || i === lengths.length - 1) {
        const f = lengths[i] ? target / lengths[i] : 0;
        return [
          points[i][0] + (points[i + 1][0] - points[i][0]) * f,
          points[i][1] + (points[i + 1][1] - points[i][1]) * f
        ];
      }
      target -= lengths[i];
    }
    return points[points.length - 1];
  }

  function strokeRoute(ctx, map, points, color, dashed = false, width = 2.5) {
    ctx.save(); ctx.beginPath();
    points.forEach((p, i) => { const x = map.x(p[0]), y = map.y(p[1]); if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (dashed) ctx.setLineDash([7, 6]); ctx.stroke(); ctx.restore();
  }

  function drawUgv(ctx, x, y, label = 'UGV') {
    ctx.save(); ctx.translate(x, y);
    ctx.shadowColor = 'rgba(112,224,176,.55)'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#70e0b0'; ctx.strokeStyle = '#eafff4'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.roundRect(-10, -7, 20, 14, 4); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#0b382d'; ctx.fillRect(-5, -4, 10, 8);
    ctx.fillStyle = '#b6ffdb'; ctx.beginPath(); ctx.arc(-7, -9, 2.4, 0, Math.PI * 2); ctx.arc(7, -9, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.font = '9px DM Mono, monospace'; ctx.fillStyle = '#a7f3ce'; ctx.textAlign = 'left'; ctx.fillText(label, 15, -8);
    ctx.restore();
  }

  function drawUav(ctx, x, y, landed = false) {
    ctx.save();
    // Fixed 30 m layer is shown by a vertical projection stem while airborne.
    if (!landed) {
      ctx.strokeStyle = 'rgba(84,226,220,.55)'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x, y + 19); ctx.lineTo(x, y + 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(84,226,220,.9)'; ctx.font = '8px DM Mono, monospace'; ctx.textAlign = 'left'; ctx.fillText('30 m', x + 13, y - 13);
    }
    ctx.shadowColor = 'rgba(84,226,220,.65)'; ctx.shadowBlur = 15;
    ctx.fillStyle = landed ? '#a8e8e3' : '#54e2dc'; ctx.strokeStyle = '#e4ffff'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11); ctx.strokeStyle = '#54e2dc'; ctx.stroke();
    ctx.beginPath(); [[-11,0],[11,0],[0,-11],[0,11]].forEach(([dx,dy])=>{ctx.moveTo(x+dx-3,y+dy);ctx.arc(x+dx,y+dy,2,0,Math.PI*2)}); ctx.stroke();
    ctx.restore();
  }

  function drawCandidate(ctx, map, id) {
    const c = candidates[id], x = map.x(c.point[0]), y = map.y(c.point[1]);
    const selected = id === selectedCandidate;
    ctx.save();
    if (selected) { ctx.beginPath(); ctx.arc(x, y, 17 + Math.sin(Date.now()/380)*2, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(84,226,220,.55)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.fillStyle = selected ? '#54e2dc' : '#173c49'; ctx.strokeStyle = selected ? '#e1ffff' : '#77a6b2'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, selected ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = '9px DM Mono, monospace'; ctx.fillStyle = selected ? '#9dfcf2' : '#a6c0c9'; ctx.textAlign = 'center'; ctx.fillText(id, x, y - 14);
    ctx.restore();
  }

  function drawMissionScene() {
    const canvas = $('missionScene'); if (!canvas) return;
    const { ctx, w, h } = canvasContext(canvas);
    ctx.clearRect(0, 0, w, h);
    const s = settings(), map = makeMap(w, h), c = candidates[selectedCandidate];
    drawFieldGrid(ctx, map);
    // The obstacle sets are vehicle-specific in the report. UGV can use the UAV-only area and vice versa.
    drawRestrictedZone(ctx, map, 0.80, 1.00, 0.12, '#f4bd69', 'UGV RESTRICTED', s.clearance / 1000);
    drawRestrictedZone(ctx, map, 1.40, 1.00, 0.10, '#fb7a7a', 'UAV RESTRICTED', s.clearance / 1000);

    const node = c.point;
    const ugvStart = [s.ugvX, s.ugvY];
    const ugvRoute = [ugvStart, [node[0], ugvStart[1]], node];
    const uavRoute = routeFor(selectedCandidate, s);
    strokeRoute(ctx, map, ugvRoute, 'rgba(112,224,176,.96)', false, 3.2);
    strokeRoute(ctx, map, uavRoute, 'rgba(84,226,220,.92)', true, 2.6);

    // Planned UGV continuation to its depot/end point is a reference line only.
    ctx.save(); ctx.strokeStyle = 'rgba(112,224,176,.22)'; ctx.setLineDash([3, 6]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(map.x(node[0]), map.y(node[1])); ctx.lineTo(map.x(1.80), map.y(1.60)); ctx.stroke(); ctx.restore();

    // Candidate markers are all placed along the approved headland service road.
    Object.keys(candidates).forEach(id => drawCandidate(ctx, map, id));

    // Animation progresses each resource on its own illustrative route.
    let ugvT = 0, uavT = 0, landed = false;
    if (isAnimating) {
      ugvT = Math.min(1, previewProgress * 1.18);
      uavT = Math.min(1, previewProgress * 1.08);
      landed = previewProgress >= 0.70 && c.feasible;
    } else if (previewProgress >= 1) { ugvT = 1; uavT = 1; landed = true; }
    const ugvPos = [ugvStart[0] + (node[0] - ugvStart[0]) * ugvT, ugvStart[1] + (node[1] - ugvStart[1]) * ugvT];
    const uavPos = pathPoint(uavRoute, uavT);

    // Coordinate labels and vehicle symbols.
    ctx.save(); ctx.font = '8px DM Mono, monospace'; ctx.fillStyle = 'rgba(151,180,193,.75)'; ctx.textAlign = 'left';
    ctx.fillText('UGV LAYER · Z = 0', map.left + 7, map.top + map.size + 35);
    ctx.fillStyle = 'rgba(84,226,220,.85)'; ctx.fillText('UAV CRUISE LAYER · Z = 30 M', map.left + 7, map.top - 12);
    ctx.restore();
    drawUgv(ctx, map.x(ugvPos[0]), map.y(ugvPos[1]));
    drawUav(ctx, map.x(uavPos[0]), map.y(uavPos[1]) - (landed ? 0 : 10), landed);

    // Selected node label and service marker.
    const nx = map.x(node[0]), ny = map.y(node[1]);
    ctx.save(); ctx.strokeStyle = '#54e2dc'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(nx, ny + 14); ctx.lineTo(nx, ny + 31); ctx.stroke();
    ctx.font = '8px DM Mono, monospace'; ctx.fillStyle = '#9dfcf2'; ctx.textAlign = 'left'; ctx.fillText('BATTERY SWAP', nx + 12, ny + 28); ctx.restore();

    // Wind arrow uses report convention: 0 degrees points East.
    const a = -s.windAngle * Math.PI / 180;
    const ax = map.left + map.size - 50, ay = map.top + 34;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.strokeStyle = 'rgba(244,189,105,.88)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-17, 0); ctx.lineTo(17, 0); ctx.lineTo(10, -5); ctx.moveTo(17, 0); ctx.lineTo(10, 5); ctx.stroke();
    ctx.rotate(-a); ctx.font = '8px DM Mono, monospace'; ctx.fillStyle = '#f4bd69'; ctx.textAlign = 'right'; ctx.fillText(`${s.windSpeed.toFixed(1)} KM/H`, 24, 18); ctx.restore();
  }

  function drawHeroScene() {
    const canvas = $('heroScene'); if (!canvas) return;
    const { ctx, w, h } = canvasContext(canvas); ctx.clearRect(0, 0, w, h);
    const cx = w * .5, cy = h * .55;
    ctx.save();
    // stylized agricultural rows
    for (let i = -5; i <= 5; i++) {
      ctx.strokeStyle = 'rgba(123,178,176,.13)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + i * 42, cy - 98); ctx.lineTo(cx + i * 42 - 55, cy + 92); ctx.stroke();
    }
    for (let i = -3; i <= 3; i++) {
      ctx.strokeStyle = 'rgba(123,178,176,.10)'; ctx.beginPath(); ctx.moveTo(cx - 225, cy + i * 23); ctx.lineTo(cx + 225, cy + i * 23); ctx.stroke();
    }
    // headland road and service bay
    ctx.strokeStyle = 'rgba(112,224,176,.34)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(cx - 210, cy + 55); ctx.lineTo(cx + 210, cy + 55); ctx.stroke();
    ctx.strokeStyle = 'rgba(84,226,220,.7)'; ctx.setLineDash([4,5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx + 28, cy - 70); ctx.lineTo(cx + 28, cy + 55); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(cx + 28, cy + 55, 16, 0, Math.PI*2); ctx.strokeStyle = 'rgba(84,226,220,.5)'; ctx.stroke();
    // UGV
    ctx.fillStyle = '#70e0b0'; ctx.strokeStyle = '#eafff4'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.roundRect(cx - 158, cy + 43, 29, 19, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0b382d'; ctx.fillRect(cx - 150, cy + 48, 13, 9);
    // UAV at fixed height 30m
    const t = Date.now()/1000; const ux = cx + 145 + Math.sin(t*.55)*9, uy = cy - 74 + Math.cos(t*.55)*4;
    ctx.strokeStyle = 'rgba(84,226,220,.52)'; ctx.setLineDash([3,4]); ctx.beginPath(); ctx.moveTo(ux, uy+5); ctx.lineTo(ux, cy+55); ctx.stroke(); ctx.setLineDash([]);
    ctx.shadowColor = '#54e2dc'; ctx.shadowBlur = 15; ctx.fillStyle = '#54e2dc'; ctx.beginPath(); ctx.arc(ux, uy, 6, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#bffffb'; ctx.beginPath(); ctx.moveTo(ux-12,uy);ctx.lineTo(ux+12,uy);ctx.moveTo(ux,uy-12);ctx.lineTo(ux,uy+12);ctx.stroke();
    // soft field particles
    for (let i=0;i<18;i++) { const x=(i*67+t*5)%(w+10)-5, y=(i*31+Math.sin(t+i)*5)%h; ctx.fillStyle=`rgba(150,218,211,${.08+(i%3)*.04})`;ctx.fillRect(x,y,1.5,1.5); }
    ctx.restore();
  }

  function updateSelectedCandidate() {
    const c = candidates[selectedCandidate];
    $('selectedTitle').textContent = c.label;
    $('selectedStatus').textContent = c.status;
    $('selectedStatus').className = `tag ${c.statusClass}`;
    $('selectedMetrics').innerHTML = `
      <div><span>${selectedCandidate === 'M3' ? 'NOMINAL UAV SPEED*' : 'OPTIMAL UAV SPEED'}</span><b>${c.speed} <small>km/h</small></b></div>
      <div><span>TOTAL MISSION TIME</span><b>${c.total} <small>h</small></b></div>
      <div><span>UGV ARRIVAL TIME</span><b>${c.tUGV} <small>h</small></b></div>
      <div><span>UAV ARRIVAL TIME</span><b>${c.tUAV} <small>h</small></b></div>
      <div><span>${c.waitResource === 'UAV' ? 'UAV HOVER WAIT' : c.waitResource === 'UGV' ? 'UGV IDLE WAIT' : 'WAITING'}</span><b>${c.wait} <small>min · ${c.waitResource}</small></b></div>
      <div><span>FUEL PROXY</span><b>${c.fuel} <small>L*</small></b></div>
      <div><span>UAV BATTERY USED</span><b>${c.battery} <small>%</small></b></div>
      <div><span>OBJECTIVE SCORE J</span><b>${c.score}</b></div>`;
    $('decisionContextTitle').textContent = `Recommendation ready for review · ${selectedCandidate}`;
    $('decisionContextText').textContent = selectedCandidate === 'M1'
      ? 'M1 is the recommended rank-1 option in the report worked example. Approve it, reject the recommendation, or select another feasible bay and override.'
      : selectedCandidate === 'M2'
        ? 'M2 is a feasible rank-2 alternative in the report worked example. Use the override action to record a manager-selected alternative.'
        : 'M3 is infeasible in the report worked example. The interface must not allow an infeasible option to be approved or used as an override.';
    $('approveDecision').disabled = !c.feasible || selectedCandidate !== 'M1' || customInputs;
    $('overrideDecision').disabled = !c.feasible || selectedCandidate === 'M1' || customInputs;
    $('rejectDecision').disabled = customInputs;
    $('selectedExplanation').textContent = c.explanation;
    document.querySelectorAll('.candidate-card').forEach(btn => btn.classList.toggle('selected', btn.dataset.candidate === selectedCandidate));
    drawMissionScene();
  }

  function setTimeline(progress, finalInfeasible = false) {
    const stages = [
      [0.00, 'Ready for preview'], [0.16, 'UGV and UAV approaching'], [0.48, 'Rendezvous point reached'],
      [0.68, 'UAV landing at z = 0'], [0.82, 'Stationary battery swap'], [1.00, finalInfeasible ? 'Reference case: no feasible rendezvous' : 'Preview complete']
    ];
    let current = 0;
    stages.forEach(([p], i) => { if (progress >= p) current = i; });
    const stageLabel = finalInfeasible && progress >= 0.68 ? 'No feasible rendezvous · swap not started' : stages[current][1];
    $('missionStage').textContent = stageLabel;
    $('timelineFill').style.width = `${progress * 100}%`;
    document.querySelectorAll('.timeline-steps span').forEach((el, i) => {
      el.classList.toggle('current', i === Math.min(4, Math.max(0, current - 1)));
      el.classList.toggle('done', progress >= [0.16,0.48,0.68,0.82,1][i]);
    });
  }

  function toast(message) {
    const node = $('toast'); node.textContent = message; node.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
  }

  function stopPreview() {
    cancelAnimationFrame(animationFrame); isAnimating = false; animationStart = 0;
    $('runPreview').innerHTML = 'Preview battery swap <span>▷</span>';
  }

  function animate(now) {
    if (!isAnimating) return;
    if (!animationStart) animationStart = now;
    const elapsed = now - animationStart;
    previewProgress = Math.min(1, elapsed / 7200);
    drawMissionScene(); setTimeline(previewProgress, !candidates[selectedCandidate].feasible);
    if (previewProgress >= 1) {
      stopPreview(); $('sceneState').textContent = candidates[selectedCandidate].feasible ? 'VISUAL PREVIEW COMPLETE' : 'NO FEASIBLE RECOMMENDATION';
      if (candidates[selectedCandidate].feasible) toast('Visual battery-swap sequence completed. No vehicle control was issued.');
      else toast('M3 is infeasible in the report reference case; no service completion is shown.');
      return;
    }
    animationFrame = requestAnimationFrame(animate);
  }

  function startPreview() {
    stopPreview(); previewProgress = 0;
    if (reducedMotion) {
      previewProgress = 1; drawMissionScene(); setTimeline(1, !candidates[selectedCandidate].feasible);
      $('sceneState').textContent = candidates[selectedCandidate].feasible ? 'VISUAL PREVIEW COMPLETE' : 'NO FEASIBLE RECOMMENDATION'; return;
    }
    isAnimating = true; $('sceneState').textContent = `MOVING TO ${selectedCandidate}`;
    $('runPreview').innerHTML = 'Preview running <span>◌</span>';
    setTimeline(0, !candidates[selectedCandidate].feasible);
    animationFrame = requestAnimationFrame(animate);
  }

  function resetScene() {
    stopPreview(); previewProgress = 0;
    $('sceneState').textContent = 'READY FOR PREVIEW';
    setTimeline(0, !candidates[selectedCandidate].feasible); drawMissionScene();
  }

  function restoreDefaults() {
    Object.entries(defaults).forEach(([id, value]) => {
      const el = $(id); if (!el) return;
      if (el.type === 'checkbox') el.checked = value; else el.value = value;
    });
    customInputs = false; $('customState').hidden = true;
    selectedCandidate = 'M1'; updateInputs(); updateSelectedCandidate(); resetScene();
    toast('Report worked-example inputs restored.');
  }

  // Mobile navigation.
  $('mobileMenu').addEventListener('click', () => {
    const open = $('mainNav').classList.toggle('open'); $('mobileMenu').setAttribute('aria-expanded', String(open));
  });
  $('mainNav').querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    $('mainNav').classList.remove('open'); $('mobileMenu').setAttribute('aria-expanded', 'false');
  }));

  // Input interactions update only the visual scenario. They do not recompute model results.
  document.querySelectorAll('.controls-panel input').forEach(el => {
    el.addEventListener('input', () => { markCustom(); updateInputs(); if (isAnimating) resetScene(); });
    el.addEventListener('change', () => { markCustom(); updateInputs(); });
  });
  $('runPreview').addEventListener('click', startPreview);
  $('resetScene').addEventListener('click', resetScene);
  $('restoreInputs').addEventListener('click', restoreDefaults);
  document.querySelectorAll('.candidate-card').forEach(btn => btn.addEventListener('click', () => {
    selectedCandidate = btn.dataset.candidate; resetScene(); updateSelectedCandidate();
    $('sceneState').textContent = `${selectedCandidate} SELECTED`;
  }));

  const decisionRecords = [];
  function recordDecision(action) {
    if (customInputs) {
      toast('Reload report defaults before recording a decision. Custom inputs have no recalculated model result.');
      return;
    }
    const c = candidates[selectedCandidate];
    if (action === 'APPROVED' && selectedCandidate !== 'M1') return;
    if (action === 'OVERRIDE' && (!c.feasible || selectedCandidate === 'M1')) return;
    if (action === 'REJECTED' && selectedCandidate === 'M3') {
      // Rejecting the overall recommendation remains valid even when the highlighted alternative is infeasible.
    }
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const rationale = $('decisionRationale').value.trim() || (action === 'APPROVED' ? 'Manager approved the report reference recommendation.' : action === 'OVERRIDE' ? 'Manager selected a feasible alternative from the ranked list.' : 'Manager rejected the reference recommendation.');
    decisionRecords.unshift({ action, candidate: selectedCandidate, timestamp, rationale });
    $('decisionLog').innerHTML = decisionRecords.map(r => `
      <div class="decision-record">
        <span class="record-action ${r.action.toLowerCase()}">${r.action}</span>
        <div class="record-main"><b>${r.candidate} · ${r.timestamp}</b><small>${r.rationale.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}</small></div>
      </div>`).join('');
    $('decisionRationale').value = '';
    toast(`Manager decision recorded: ${action.toLowerCase()}.`);
  }
  $('approveDecision').addEventListener('click', () => recordDecision('APPROVED'));
  $('overrideDecision').addEventListener('click', () => recordDecision('OVERRIDE'));
  $('rejectDecision').addEventListener('click', () => recordDecision('REJECTED'));

  // Section reveal and active navigation.
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); revealObserver.unobserve(entry.target); }
    }), { threshold: .08 });
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
    const sections = [...document.querySelectorAll('main section[id]')];
    const navObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
    }), { rootMargin: '-35% 0px -55% 0px' });
    sections.forEach(section => navObserver.observe(section));
  } else {
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
  }

  updateInputs(); updateSelectedCandidate(); setTimeline(0); drawHeroScene();
  function heroLoop() { drawHeroScene(); requestAnimationFrame(heroLoop); }
  if (!reducedMotion) requestAnimationFrame(heroLoop);
  window.addEventListener('resize', () => { drawMissionScene(); drawHeroScene(); });
})();
