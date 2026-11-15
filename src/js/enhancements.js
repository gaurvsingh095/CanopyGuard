/* CanopyGuard 2.x visual modules: Atmospheric Twin, Boundary Lens, Morning Replay, Evidence Lab.
 * Every verdict shown here comes from core.assess (the shared engine). Visual geometry, tracers,
 * sectors and receptor positions are illustrative and never represent measured or predicted drift. */
(function () {
  'use strict';
  const core = window.CanopyGuardCore;
  const suite = window.CANOPY_BENCHMARK || [];
  if (!core) throw Error('CanopyGuard core is unavailable');
  const $ = (id) => document.getElementById(id);

  const SECTOR_HALF = 29; // ° half-width of each downwind screening sector (drawn and tested identically)
  const NEAR_EDGE = 50; // ° within which a receptor is "near" a sector edge
  const CENTER = { x: 480, y: 310 };
  const DEFAULT_RECEPTORS = [
    { id: 'homes', name: 'Neighboring homes', type: 'Residences', x: 242, y: 128 },
    { id: 'habitat', name: 'Habitat buffer', type: 'Sensitive habitat', x: 570, y: 91 },
    { id: 'canal', name: 'Irrigation canal', type: 'Waterway', x: 670, y: 520 },
    { id: 'road', name: 'Field access road', type: 'Public access', x: 168, y: 371 },
  ];
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    yaw: -0.28, zoom: 1, playing: !reducedMotion, thermal: true, tracers: true,
    time: 0, last: 0, replayIdx: 0, replayPlaying: false, replayTimer: 0, filter: 'all',
    receptors: DEFAULT_RECEPTORS.map((r) => Object.assign({}, r)), activeDrag: null, focusReceptor: null,
  };

  const base = () => Object.assign({}, core.getState().data);
  const current = () => core.assess(base());
  const isValid = (r) => !r.alerts.some((a) => a.code === 'INVALID');
  const fmt = (n, d = 1) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—');
  const safe = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const rad = (x) => (x * Math.PI) / 180;
  const angDiff = (a, b) => { const d = (((a - b) % 360) + 360) % 360; return Math.min(d, 360 - d); };
  const downwind = (d) => (d + 180) % 360;
  const tone = (s) => (s === 'STOP' ? 'stop' : s === 'CAUTION' ? 'caution' : 'go');
  // Screen vector pointing TOWARD where the wind blows (north = up), from a meteorological FROM bearing.
  const towardVec = (fromDeg, len) => ({ x: Math.sin(rad(downwind(fromDeg))) * len, y: -Math.cos(rad(downwind(fromDeg))) * len });
  const bearingOf = (v) => (Math.atan2(v.x - CENTER.x, CENTER.y - v.y) * 180) / Math.PI;

  // Receptor alignment against the two TOWARD sectors; same rule for the map colour, list and count.
  function alignment(v, d) {
    const b = bearingOf(v);
    const lo = angDiff(b, downwind(d.dLow)),
      hi = angDiff(b, downwind(d.dHigh));
    const inLo = lo <= SECTOR_HALF,
      inHi = hi <= SECTOR_HALF;
    if (inLo || inHi) return { flag: 'aligned', label: inLo && inHi ? 'IN BOTH SECTORS' : inLo ? 'IN 5-FT SECTOR' : 'IN 30-FT SECTOR', off: Math.min(lo, hi) };
    if (Math.min(lo, hi) <= NEAR_EDGE) return { flag: 'between', label: 'NEAR SECTOR EDGE', off: Math.min(lo, hi) };
    return { flag: 'cross', label: 'OUTSIDE SECTORS', off: Math.min(lo, hi) };
  }

  function start() {
    const navigation = [['twin', 'Atmosphere twin', '◈'], ['boundary', 'Boundary lens', '⌁'], ['replay', 'Weather replay', '◷'], ['validation', 'Test benchmark', '✓']];
    const nav = $('nav');
    const before = nav.querySelector('[data-page="planner"]');
    navigation.forEach(([page, name, glyph]) => {
      const el = document.createElement('button');
      el.className = 'navbtn';
      el.type = 'button';
      el.setAttribute('data-page', page);
      el.innerHTML = `<span class="navGlyph" aria-hidden="true">${glyph}</span> ${name}`;
      el.addEventListener('click', () => go(page));
      nav.insertBefore(el, before);
    });
    document.querySelectorAll('[data-v2page]').forEach((el) => el.addEventListener('click', () => go(el.dataset.v2page)));

    // ----- twin controls -----
    $('resetOrbit').addEventListener('click', () => { state.yaw = -0.28; state.zoom = 1; drawTwin(); });
    $('orbitLeft').addEventListener('click', () => { state.yaw -= 0.22; drawTwin(); });
    $('orbitRight').addEventListener('click', () => { state.yaw += 0.22; drawTwin(); });
    $('zoomIn').addEventListener('click', () => setZoom(state.zoom + 0.15));
    $('zoomOut').addEventListener('click', () => setZoom(state.zoom - 0.15));
    $('scenePlay').addEventListener('click', () => { state.playing = !state.playing; syncPlayLabel(); drawTwin(); });
    $('toggleLayer').addEventListener('change', (e) => { state.thermal = e.target.checked; drawTwin(); });
    $('toggleTracer').addEventListener('change', (e) => { state.tracers = e.target.checked; drawTwin(); });
    syncPlayLabel();

    const canvas = $('twinCanvas');
    let pointer = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      pointer = { x: e.clientX, yaw: state.yaw };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pointer) return;
      state.yaw = pointer.yaw + (e.clientX - pointer.x) * 0.008;
      drawTwin();
    });
    canvas.addEventListener('pointerup', () => (pointer = null));
    canvas.addEventListener('pointercancel', () => (pointer = null));
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(state.zoom - e.deltaY * 0.0007); }, { passive: false });
    canvas.addEventListener('keydown', (e) => {
      const k = { ArrowLeft: () => (state.yaw -= 0.15), ArrowRight: () => (state.yaw += 0.15), '+': () => setZoom(state.zoom + 0.1), '=': () => setZoom(state.zoom + 0.1), '-': () => setZoom(state.zoom - 0.1) }[e.key];
      if (k) { e.preventDefault(); k(); drawTwin(); }
    });

    // ----- boundary lens -----
    $('boundaryReset').addEventListener('click', () => { state.receptors = DEFAULT_RECEPTORS.map((r) => Object.assign({}, r)); drawBoundary(); core.toast('Receptor layout reset'); });
    $('boundaryRefresh').addEventListener('click', () => { syncAll(); core.toast('Boundary lens redrawn from current readings'); });
    const map = $('boundarySVG');
    map.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-receptor]');
      if (!g) return;
      e.preventDefault();
      state.activeDrag = g.getAttribute('data-receptor');
      map.setPointerCapture(e.pointerId);
      placeReceptor(e);
    });
    map.addEventListener('pointermove', (e) => { if (state.activeDrag) placeReceptor(e); });
    // Block browser swipe/scroll gestures while a receptor is being dragged by touch.
    map.addEventListener('touchstart', (e) => { if (e.target.closest && e.target.closest('[data-receptor]')) e.preventDefault(); }, { passive: false });
    map.addEventListener('touchmove', (e) => { if (state.activeDrag) e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    const endDrag = () => { if (state.activeDrag) { state.activeDrag = null; renderReceptors(); } };
    map.addEventListener('pointerup', endDrag);
    map.addEventListener('pointercancel', endDrag);
    map.addEventListener('keydown', (e) => {
      const g = e.target.closest && e.target.closest('[data-receptor]');
      if (!g) return;
      const step = e.shiftKey ? 40 : 12;
      const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!mv) return;
      e.preventDefault();
      const r = state.receptors.find((x) => x.id === g.getAttribute('data-receptor'));
      r.x = Math.max(30, Math.min(930, r.x + mv[0]));
      r.y = Math.max(25, Math.min(585, r.y + mv[1]));
      state.focusReceptor = r.id;
      drawBoundary();
    });

    // ----- replay -----
    $('replayScrub').addEventListener('input', (e) => { const v = +e.target.value; stopReplay(); state.replayIdx = v; renderReplay(); });
    $('replayPlay').addEventListener('click', () => (state.replayPlaying ? stopReplay() : startReplay()));
    $('replayReset').addEventListener('click', () => { stopReplay(); state.replayIdx = 0; renderReplay(); });
    $('replayApply').addEventListener('click', () => {
      stopReplay();
      const f = frames[state.replayIdx];
      core.apply(makeFrame(state.replayIdx), 'replay:frame_' + f.time, 'simulated');
      core.toast('Synthetic frame ' + f.time + ' applied to the live dashboard and logged');
      go('overview');
    });
    $('replayExport').addEventListener('click', () =>
      core.download('canopyguard-morning-replay.json', JSON.stringify({
        source: 'synthetic',
        note: 'Illustrative scripted morning event; not a measured or predictive series. Times are date-free local clock labels.',
        engineVersion: window.CanopyGuardEngine.ENGINE_VERSION,
        frames: frames.map((f, i) => ({ time: f.time, readings: makeFrame(i), result: core.assess(makeFrame(i)).status, codes: core.assess(makeFrame(i)).alerts.map((a) => a.code) })),
      }, null, 2), 'application/json'));

    // ----- evidence lab -----
    buildFilter();
    $('benchmarkRun').addEventListener('click', () => { runBenchmark(); core.toast('All ' + suite.length + ' synthetic cases re-run against the live engine'); });
    $('exportBenchmark').addEventListener('click', () =>
      core.download('canopyguard-40-labeled-cases.json', JSON.stringify({ schemaVersion: '1.0', source: 'synthetic', engineVersion: window.CanopyGuardEngine.ENGINE_VERSION, results: lastRun, cases: suite }, null, 2), 'application/json'));
    $('validationFilter').addEventListener('change', (e) => { state.filter = e.target.value; runBenchmark(); });
    $('benchmarkTable').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-case]');
      if (!btn) return;
      const row = suite.find((x) => x.id === btn.dataset.case);
      if (!row) return;
      core.apply(row.readings, 'benchmark:' + row.id, 'simulated');
      core.toast('Synthetic case ' + row.id + ' loaded · ' + core.assess(base()).status);
      go('overview');
    });
    $('loadGroundBlindspot').addEventListener('click', () => {
      const r = suite.find((x) => x.id === 'B06') || suite.find((x) => x.category === 'hidden');
      if (!r) return;
      core.apply(r.readings, 'benchmark:' + r.id, 'simulated');
      go('twin');
    });
    $('benchmarkLive').addEventListener('click', () => go('lab'));

    core.subscribe(() => syncAll());
    core.onPage((page) => {
      if (page !== 'replay') stopReplay();
      if (page === 'twin') requestAnimationFrame(drawTwin);
      if (page === 'boundary') requestAnimationFrame(drawBoundary);
    });
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { drawTwin(); drawBoundary(); }, 60); });
    document.addEventListener('visibilitychange', () => { state.last = 0; if (document.hidden) stopReplay(); });

    runBenchmark();
    renderReplay();
    syncAll();
    requestAnimationFrame(tick);
  }

  function setZoom(z) { state.zoom = Math.max(0.6, Math.min(1.7, z)); drawTwin(); }
  function syncPlayLabel() {
    $('scenePlay').textContent = state.playing ? 'Ⅱ Pause motion' : '▶ Resume motion';
    $('scenePlay').setAttribute('aria-pressed', String(!state.playing));
  }
  function go(page) { core.nav(page); }

  function syncAll() {
    const d = base(), r = current(), valid = isValid(r);
    ['twinState', 'boundaryState'].forEach((id) => { $(id).textContent = r.status; $(id).className = 'v2-pill ' + tone(r.status); });
    $('twinVerdict').textContent = r.alerts[0]?.title || 'No configured weather triggers';
    $('twinExplanation').textContent = r.alerts[0]?.msg || 'Both heights are within the configured limits. This does not authorize application.';
    $('twinReasons').innerHTML = r.alerts.length
      ? r.alerts.map((a) => `<li class="${a.level === 'STOP' ? 'stop' : 'caution'}"><b>${safe(a.level)}</b> ${safe(a.title)}</li>`).join('')
      : '<li class="go"><b>GO</b> No configured weather triggers (weather screening only)</li>';
    $('twinTempHigh').textContent = fmt(d.tHigh) + '°F';
    $('twinTempLow').textContent = fmt(d.tLow) + '°F';
    $('twinWindHigh').textContent = fmt(d.wHigh) + ' mph · from ' + fmt(d.dHigh, 0) + '°';
    $('twinWindLow').textContent = fmt(d.wLow) + ' mph · from ' + fmt(d.dLow, 0) + '°';
    $('twinDelta').textContent = valid ? (r.delta > 0 ? '+' : '') + fmt(r.delta) + '°F' : '—';
    $('twinGap').textContent = valid ? fmt(r.windGap) + ' mph' : '—';
    $('twinTurn').textContent = valid ? fmt(r.turn, 0) + '°' : '—';
    $('twinGround').textContent = r.ground;
    $('twinPaired').textContent = r.status;
    $('twinPaired').className = 'v2-readoutSmall ' + tone(r.status);
    $('twinBlindSpot').textContent = !valid
      ? 'Readings are invalid — neither screen can be trusted until corrected.'
      : r.ground === 'LOOKS OK' && r.status !== 'GO'
        ? 'Ground-only station misses ' + r.alerts.length + ' risk signal' + (r.alerts.length === 1 ? '' : 's') + ' that the paired tower flags.'
        : r.ground === 'LOOKS OK'
          ? 'Both screens pass their wind checks. GO is weather screening only, not authorization.'
          : 'The ground-only wind check also fails here; the paired tower adds upper-air detail.';
    const src = core.getState().source;
    const srcLabel = src === 'imported' ? 'IMPORTED FILE' : src === 'manual' ? 'MANUAL ENTRY' : 'SIMULATED';
    $('twinInputQuality').textContent = !valid ? 'INVALID INPUT' : r.alerts.some((x) => x.code === 'STALE') ? 'STALE · RECHECK' : srcLabel + ' · ' + fmt(Math.max(d.ageLow, d.ageHigh), 0) + ' min old';
    $('boundaryDetails').textContent = !valid
      ? 'Readings are invalid, so no directional sectors are drawn.'
      : r.delta > 0
        ? 'Inversion measured: actual transport and dispersion are highly uncertain. Sectors show direction only.'
        : 'No inversion in these readings; wind direction is still only a directional screening clue, not a transport forecast.';
    $('boundaryWind').textContent = 'FROM ' + fmt(d.dLow, 0) + '° (5 ft) / ' + fmt(d.dHigh, 0) + '° (30 ft)';
    drawTwin();
    drawBoundary();
  }

  // ---------- Atmospheric twin (illustrative perspective projection) ----------
  function resize(c) {
    const box = c.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = box.width, h = box.height;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }
  function rand(k) { const a = Math.sin(k * 127.1 + 31.7) * 43758.5453; return a - Math.floor(a); }
  function project(x, y, z, w, h) {
    const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
    const rx = x * cy - z * sy, rz = x * sy + z * cy;
    const perspective = 660 / (660 + rz * 0.45);
    const s = Math.min(w / 730, h / 480) * state.zoom * perspective;
    return { x: w * 0.5 + rx * s, y: h * 0.65 + (rz * 0.61 - y * 1.32) * s, s, depth: rz };
  }
  const trees = [];
  for (let row = 0; row < 6; row++) for (let col = 0; col < 9; col++) trees.push({ x: -275 + col * 68, z: -145 + row * 57, r: 14 + rand(row * 9 + col) * 4, light: rand(200 + row * 9 + col) });
  const sparks = Array.from({ length: 215 }, (_, i) => ({ seed: i, spread: (rand(i + 71) - 0.5) * 185, age: rand(i + 17), y: rand(i + 89) }));

  function tick(t) {
    const sec = state.last ? Math.min(0.06, (t - state.last) / 1000) : 0;
    state.last = t;
    const visible = $('twin').classList.contains('active') && !document.hidden;
    if (state.playing && visible) { state.time += sec; drawTwin(); }
    requestAnimationFrame(tick);
  }
  function drawTwin() {
    const can = $('twinCanvas');
    if (!$('twin').classList.contains('active')) return;
    const size = resize(can);
    if (!size) return;
    const { ctx: c, w, h } = size, d = base(), r = current(), valid = isValid(r), inv = valid && r.delta > 0;
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0d2425'); sky.addColorStop(0.65, '#1b3b34'); sky.addColorStop(1, '#425443');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    // Thermal band: an explanatory highlight of the measured sign of ΔT, not a modeled layer.
    if (state.thermal && valid) {
      const grd = c.createLinearGradient(0, h * 0.12, 0, h * 0.82);
      grd.addColorStop(0, inv ? '#c7835b11' : '#7eb8a90a');
      grd.addColorStop(0.4, inv ? '#e5b47d3b' : '#9dd6b913');
      grd.addColorStop(1, inv ? '#f3ae6e12' : '#83bc9b03');
      c.fillStyle = grd;
      c.fillRect(0, h * 0.14, w, h * 0.73);
    }
    const poly = (points, color, stroke) => {
      c.beginPath();
      points.forEach((p, i) => { const q = project(p[0], p[1], p[2], w, h); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); });
      c.closePath(); c.fillStyle = color; c.fill();
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
    };
    poly([[-335, 0, -190], [335, 0, -190], [335, 0, 185], [-335, 0, 185]], '#2f4d36', '#57715a');
    for (let row = 0; row < 6; row++) { const z = -145 + row * 57; poly([[-318, 0.2, z - 13], [318, 0.2, z - 13], [318, 0.2, z + 13], [-318, 0.2, z + 13]], row % 2 ? '#365d40' : '#395b3b'); }
    // Compass: north is -z (matches the Boundary Lens, where north is up).
    const n0 = project(-300, 0.5, -120, w, h), n1 = project(-300, 0.5, -178, w, h);
    c.strokeStyle = '#e9f5d0'; c.lineWidth = 2; c.beginPath(); c.moveTo(n0.x, n0.y); c.lineTo(n1.x, n1.y); c.stroke();
    c.fillStyle = '#e9f5d0'; c.font = '800 12px DM Sans, sans-serif'; c.textAlign = 'center'; c.fillText('N', n1.x, n1.y - 6);
    const sorted = trees.slice().sort((a, b) => project(a.x, 0, a.z, w, h).depth - project(b.x, 0, b.z, w, h).depth);
    for (const t of sorted) {
      const bp = project(t.x, 0, t.z, w, h), mid = project(t.x, 34, t.z, w, h), cp = project(t.x, 49, t.z, w, h), sc = bp.s;
      c.fillStyle = '#091e1669'; c.beginPath(); c.ellipse(bp.x + 7 * sc, bp.y + 4 * sc, 24 * sc, 9 * sc, -0.3, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#b0a27a'; c.lineWidth = Math.max(1.3, 7 * sc); c.lineCap = 'round'; c.beginPath(); c.moveTo(bp.x, bp.y); c.lineTo(mid.x, mid.y); c.stroke();
      const radius = t.r * sc;
      const cg = c.createRadialGradient(cp.x - radius * 0.4, cp.y - radius * 0.4, 0, cp.x, cp.y, radius * 1.5);
      cg.addColorStop(0, t.light > 0.5 ? '#80a86c' : '#68965f'); cg.addColorStop(0.65, t.light > 0.5 ? '#477b55' : '#3f7650'); cg.addColorStop(1, '#224f38');
      c.fillStyle = cg; c.beginPath(); c.ellipse(cp.x, cp.y, radius * 1.45, radius * 0.93, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#8bbf8033'; c.beginPath(); c.ellipse(cp.x - radius * 0.25, cp.y - radius * 0.24, radius * 0.84, radius * 0.42, -0.2, 0, Math.PI * 2); c.fill();
    }
    // Tower (heights exaggerated for legibility).
    const pole1 = project(-4, 0, 2, w, h), pole2 = project(-4, 115, 2, w, h);
    c.strokeStyle = '#e2e9c1'; c.lineWidth = 3.8; c.beginPath(); c.moveTo(pole1.x, pole1.y); c.lineTo(pole2.x, pole2.y); c.stroke();
    const sensor = (alt, color, label, reading) => {
      const p = project(-4, alt, 2, w, h);
      c.fillStyle = color; c.beginPath(); c.arc(p.x, p.y, 6.6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#0c2a1b'; c.lineWidth = 2; c.stroke();
      c.font = '700 11px DM Sans, sans-serif'; c.textAlign = 'left';
      const text = label + ' · ' + reading, tw = c.measureText(text).width;
      c.fillStyle = '#0d2219c4'; c.fillRect(p.x + 14, p.y - 9, tw + 12, 18);
      c.fillStyle = '#edffe7'; c.fillText(text, p.x + 20, p.y + 4);
    };
    // Arrows point TOWARD (downwind) from each measured FROM bearing.
    function arrowAt(y, speed, fromDeg, color) {
      if (!Number.isFinite(speed) || !Number.isFinite(fromDeg)) return;
      const len = Math.max(45, Math.min(115, speed * 13));
      const dx = Math.sin(rad(downwind(fromDeg))) * len, dz = -Math.cos(rad(downwind(fromDeg))) * len;
      const p = project(-4, y, 2, w, h), q = project(-4 + dx, y, 2 + dz, w, h);
      c.strokeStyle = color; c.lineWidth = 3; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
      const a = Math.atan2(q.y - p.y, q.x - p.x);
      c.fillStyle = color; c.beginPath(); c.moveTo(q.x, q.y);
      c.lineTo(q.x - Math.cos(a - 0.48) * 13, q.y - Math.sin(a - 0.48) * 13);
      c.lineTo(q.x - Math.cos(a + 0.48) * 13, q.y - Math.sin(a + 0.48) * 13); c.fill();
    }
    if (valid) { arrowAt(88, d.wHigh, d.dHigh, '#ffc49a'); arrowAt(16, d.wLow, d.dLow, '#c8f392'); }
    if (state.tracers && valid) {
      const turnSigned = ((((d.dHigh - d.dLow) % 360) + 540) % 360) - 180; // shortest signed rotation
      for (const s of sparks) {
        const pAge = (s.age + state.time * (0.1 + Math.max(0, Math.min(15, d.wLow)) * 0.008)) % 1;
        const adv = pAge * 260;
        const bearing = rad(downwind(d.dLow + turnSigned * Math.min(1, s.y * 0.42)));
        const x = adv * Math.sin(bearing) + s.spread * 0.4;
        const z = adv * -Math.cos(bearing) + (rand(s.seed + 228) - 0.5) * 120 * (inv ? 0.47 : 1.12);
        const y = inv ? 8 + s.y * 18 : 8 + s.y * 23 + pAge * 88;
        const p = project(x - 15, y, z, w, h);
        if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
        const alpha = (1 - pAge) * (0.25 + 0.7 * s.y);
        c.fillStyle = (inv ? 'rgba(252,191,129,' : 'rgba(212,253,189,') + alpha.toFixed(3) + ')';
        c.beginPath(); c.arc(p.x, p.y, Math.max(0.65, 1.7 * p.s), 0, Math.PI * 2); c.fill();
      }
    }
    sensor(88, '#ffb28c', '30 FT', fmt(d.tHigh) + '°F');
    sensor(16, '#c9ec9c', '5 FT', fmt(d.tLow) + '°F');
    if (!valid) {
      c.fillStyle = '#0d2219e0'; c.fillRect(w / 2 - 170, h / 2 - 34, 340, 58);
      c.fillStyle = '#ffb9a8'; c.font = '800 14px DM Sans, sans-serif'; c.textAlign = 'center';
      c.fillText('INVALID OR MISSING READINGS', w / 2, h / 2 - 8);
      c.fillStyle = '#d8e8d6'; c.font = '600 11px DM Sans, sans-serif';
      c.fillText('Wind vectors and tracers are hidden until corrected.', w / 2, h / 2 + 12);
    }
    c.textAlign = 'left';
  }

  // ---------- Boundary lens (schematic) ----------
  function markScale() {
    const rect = $('boundarySVG').getBoundingClientRect();
    return rect.width ? Math.max(1, Math.min(2.1, 560 / rect.width)) : 1;
  }
  function renderReceptors() {
    const d = base(), r = current();
    if (!isValid(r)) {
      $('receptorList').innerHTML = state.receptors.map((v) => `<div class="v2-receptor"><div><strong>${safe(v.name)}</strong><small>${safe(v.type)}</small></div><em class="between">UNKNOWN</em></div>`).join('');
      $('boundaryAlignment').textContent = 'Unavailable (invalid readings)';
      return;
    }
    $('receptorList').innerHTML = state.receptors.map((v) => {
      const a = alignment(v, d);
      return `<div class="v2-receptor"><div><strong>${safe(v.name)}</strong><small>${safe(v.type)} · bearing ${Math.round((bearingOf(v) + 360) % 360)}° from block · ${Math.round(a.off)}° from nearest sector axis</small></div><em class="${a.flag}">${a.label}</em></div>`;
    }).join('');
    const n = state.receptors.filter((v) => alignment(v, d).flag === 'aligned').length;
    $('boundaryAlignment').textContent = n + ' of ' + state.receptors.length + ' receptors';
  }
  function sectorPath(cx, cy, fromDeg, r) {
    const pts = [`${cx},${cy}`];
    for (let a = fromDeg - SECTOR_HALF; a <= fromDeg + SECTOR_HALF + 0.001; a += 2) { const v = towardVec(a, r); pts.push(`${(cx + v.x).toFixed(1)},${(cy + v.y).toFixed(1)}`); }
    return 'M' + pts[0] + ' L' + pts.slice(1).join(' L') + ' Z';
  }
  function drawBoundary() {
    if (!$('boundary').classList.contains('active')) return;
    const d = base(), r = current(), valid = isValid(r), inv = valid && r.delta > 0, k = markScale();
    const svg = $('boundarySVG');
    let body = '<defs><linearGradient id="fieldBg" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#1c3c32"/><stop offset="1" stop-color="#122b22"/></linearGradient><radialGradient id="screenHot"><stop stop-color="#ed9756" stop-opacity=".57"/><stop offset="1" stop-color="#ed9756" stop-opacity="0"/></radialGradient></defs>';
    body += '<rect width="960" height="630" fill="url(#fieldBg)"/>';
    for (let i = 0; i < 17; i++) body += `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="630" stroke="#9fc4a7" stroke-opacity=".07"/>`;
    for (let i = 0; i < 11; i++) body += `<line x1="0" y1="${i * 63}" x2="960" y2="${i * 63}" stroke="#9fc4a7" stroke-opacity=".07"/>`;
    body += '<rect x="366" y="185" width="228" height="250" rx="16" fill="#3d6041" stroke="#bbda9b" stroke-width="2.5"/>';
    for (let row = 0; row < 6; row++) for (let col = 0; col < 5; col++) { const x = 394 + col * 42, y = 215 + row * 39; body += `<circle cx="${x}" cy="${y}" r="13" fill="${row % 2 ? '#729865' : '#5f895b'}" stroke="#87ae76"/><circle cx="${x - 3}" cy="${y - 3}" r="5" fill="#94b982" opacity=".6"/>`; }
    if (valid) {
      // Directional TOWARD sectors only — no predicted transport, distance or concentration.
      body += `<path d="${sectorPath(CENTER.x, CENTER.y, d.dLow, 540)}" fill="#b5ed8b" fill-opacity=".11" stroke="#b7e998" stroke-dasharray="6 8" stroke-opacity=".8" stroke-width="2"/>`;
      body += `<path d="${sectorPath(CENTER.x, CENTER.y, d.dHigh, 580)}" fill="#f6b277" fill-opacity=".13" stroke="#ffbf99" stroke-dasharray="8 7" stroke-opacity=".7" stroke-width="2"/>`;
      if (inv) { const v = towardVec(d.dLow, 120); body += `<ellipse cx="${CENTER.x + v.x}" cy="${CENTER.y + v.y}" rx="180" ry="125" fill="url(#screenHot)" opacity=".5"/>`; }
    }
    body += '<rect x="438" y="295" width="84" height="29" rx="8" fill="#203a2c" stroke="#c0e5a0"/><text x="480" y="314" font-size="11" font-weight="900" text-anchor="middle" fill="#d8fbc2">BLOCK A-07</text>';
    if (valid) {
      const point = (deg, col, text, dy) => { const p = towardVec(deg, 110); return `<line x1="480" y1="310" x2="${CENTER.x + p.x}" y2="${CENTER.y + p.y}" stroke="${col}" stroke-width="5"/><circle cx="${CENTER.x + p.x}" cy="${CENTER.y + p.y}" r="7" fill="${col}"/><text x="${CENTER.x + p.x + 13}" y="${CENTER.y + p.y + 3 + dy}" fill="${col}" font-size="${13 * k}" font-weight="800">${text}</text>`; };
      body += point(d.dLow, '#c4f59b', '5 FT →', -9) + point(d.dHigh, '#ffc19c', '30 FT →', 10);
    } else {
      body += `<text x="480" y="470" text-anchor="middle" font-size="${18 * k}" font-weight="900" fill="#ffb9a8">INVALID READINGS · NO SECTORS</text>`;
    }
    body += `<g transform="translate(906 22)"><path d="M0 0 L7 18 L0 14 L-7 18 Z" fill="#c9e7ce"/><text y="${34 + 4 * k}" font-size="${14 * k}" fill="#c9e7ce" font-weight="900" text-anchor="middle">N</text></g>`;
    const icons = { homes: '⌂', habitat: '♧', canal: '≈', road: '⬡' };
    for (const v of state.receptors) {
      const a = valid ? alignment(v, d) : { flag: 'unknown', label: 'UNKNOWN' };
      const hot = a.flag === 'aligned';
      body += `<g class="map-receptor" data-receptor="${v.id}" tabindex="0" role="button" aria-label="${safe(v.name)}: ${safe(a.label)}. Drag, or use arrow keys to move."><circle cx="${v.x}" cy="${v.y}" r="${23 * k}" fill="${hot ? '#ad654b' : '#284b3f'}" stroke="${hot ? '#fbc5ab' : '#b3d5b1'}" stroke-width="2.5"/><text x="${v.x}" y="${v.y + 8 * k}" text-anchor="middle" fill="#f7fdf3" font-size="${23 * k}" font-weight="700" aria-hidden="true">${icons[v.id]}</text><text x="${v.x}" y="${v.y + 23 * k + 16 * k}" text-anchor="middle" fill="#e8f4e7" font-size="${11 * k}" font-weight="800" aria-hidden="true">${safe(v.name)}</text></g>`;
    }
    svg.innerHTML = body;
    if (state.focusReceptor) { const el = svg.querySelector(`[data-receptor="${state.focusReceptor}"]`); if (el) el.focus(); state.focusReceptor = null; }
    renderReceptors();
    $('boundaryGround').textContent = r.ground;
    $('boundaryPaired').textContent = r.status;
    $('boundaryPaired').className = 'v2-readoutSmall ' + tone(r.status);
  }
  function placeReceptor(e) {
    const svg = $('boundarySVG'), ctm = svg.getScreenCTM();
    const r = state.receptors.find((x) => x.id === state.activeDrag);
    if (!r || !ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    r.x = Math.max(30, Math.min(930, pt.x));
    r.y = Math.max(25, Math.min(585, pt.y));
    drawBoundary();
  }

  // ---------- Morning replay: 17 synthetic frames, 05:30–09:30 ----------
  const r1 = (v) => Math.round(v * 10) / 10;
  const frames = Array.from({ length: 17 }, (_, i) => {
    const minutes = 5 * 60 + 30 + i * 15, t = i / 16;
    return {
      time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
      tLow: r1(61 + 27 * t), tHigh: r1(67 + 12 * t + Math.sin(t * 3) * 0.3),
      wLow: r1(4.6 + 1.3 * t), wHigh: r1(7.6 - 1.1 * t), dLow: Math.round(85 + 7 * t), dHigh: Math.round(139 - 38 * t),
    };
  });
  function makeFrame(i) {
    const d = Object.assign({}, base(), frames[i]);
    delete d.time;
    d.ageLow = 1; d.ageHigh = 1; d.volatility = 'low';
    if (!(Number.isFinite(d.windMin) && Number.isFinite(d.windMax) && d.windMax > d.windMin)) { d.windMin = 3; d.windMax = 10; }
    return d;
  }
  function startReplay() {
    if (state.replayIdx >= frames.length - 1) state.replayIdx = 0;
    state.replayPlaying = true;
    renderReplay();
    clearInterval(state.replayTimer);
    state.replayTimer = setInterval(() => {
      if (state.replayIdx >= frames.length - 1) { stopReplay(); return; }
      state.replayIdx++;
      renderReplay();
    }, reducedMotion ? 1800 : 1100);
  }
  function stopReplay() {
    clearInterval(state.replayTimer);
    if (state.replayPlaying) { state.replayPlaying = false; renderReplay(); }
  }
  function renderReplay() {
    const i = state.replayIdx, f = frames[i], r = core.assess(makeFrame(i));
    $('replayScrub').value = i;
    $('replayScrub').setAttribute('aria-valuetext', f.time + ', ' + r.status);
    $('replayClock').textContent = f.time;
    $('replayTemp').textContent = (r.delta > 0 ? '+' : '') + fmt(r.delta) + '°F';
    $('replayWind').textContent = fmt(f.wLow) + ' / ' + fmt(f.wHigh) + ' mph';
    $('replayStatus').textContent = r.status;
    $('replayStatus').className = 'v2-readout ' + tone(r.status);
    $('replayReason').textContent = r.alerts.length ? r.alerts.map((x) => x.title).join(' · ') : 'Two-height screening passes; verify actual field conditions and label.';
    $('replayCount').textContent = i + 1 + ' / ' + frames.length;
    $('replayPlay').textContent = state.replayPlaying ? 'Ⅱ Pause sequence' : i >= frames.length - 1 ? '↻ Play again' : '▶ Play sequence';
    $('replayPlay').setAttribute('aria-pressed', String(state.replayPlaying));
    $('replayTimeline').innerHTML = frames.map((v, j) => {
      const s = core.assess(makeFrame(j)).status;
      return `<button type="button" aria-label="Frame ${j + 1}, ${v.time}, ${s}" data-frame="${j}" class="${tone(s)} ${j === i ? 'selected' : ''}"></button>`;
    }).join('');
    $('replayTimeline').querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => { stopReplay(); state.replayIdx = +btn.dataset.frame; renderReplay(); }));
    $('replayGround').textContent = r.ground;
    $('replayPaired').textContent = r.status;
    $('replayPaired').className = 'v2-tagText ' + tone(r.status);
  }

  // ---------- Evidence lab ----------
  let lastRun = [];
  function buildFilter() {
    const counts = {};
    suite.forEach((x) => (counts[x.category] = (counts[x.category] || 0) + 1));
    const label = { clear: 'Clear conditions', inversion: 'Inversions', wind: 'Wind limits', shear: 'Wind shear', direction: 'Direction wrap-around', quality: 'Sensor quality', boundary: 'Threshold boundaries', combined: 'Combined hazards', product: 'Product volatility', hidden: 'Hidden-hazard set' };
    const opts = [['all', 'All cases (' + suite.length + ')'], ['ground-blind', 'Ground-blind conditions (computed)']]
      .concat(Object.keys(counts).sort().map((c) => [c, (label[c] || c) + ' (' + counts[c] + ')']))
      .concat([['failed', 'Failures only']]);
    $('validationFilter').innerHTML = opts.map(([v, t]) => `<option value="${safe(v)}">${safe(t)}</option>`).join('');
  }
  function runBenchmark() {
    const data = suite.map((row) => {
      const out = core.assess(row.readings), codes = out.alerts.map((x) => x.code);
      const pass = out.status === row.expected && (!row.expectedCode || codes.includes(row.expectedCode));
      return Object.assign({}, row, { actual: out.status, codes, ground: out.ground, pass });
    });
    lastRun = data.map((x) => ({ id: x.id, expected: x.expected, actual: x.actual, codes: x.codes, pass: x.pass }));
    const good = data.filter((x) => x.pass).length,
      hidden = data.filter((x) => x.ground === 'LOOKS OK' && x.actual !== 'GO').length,
      stops = data.filter((x) => x.actual === 'STOP').length;
    $('benchPassed').textContent = `${good}/${data.length}`;
    $('benchMissed').textContent = hidden;
    $('benchStops').textContent = stops;
    $('benchStatus').textContent = good === data.length ? 'ALL ' + data.length + ' RULE CHECKS PASS' : 'INVESTIGATE RULE FAILURE';
    $('benchStatus').className = 'v2-pill ' + (good === data.length ? 'go' : 'stop');
    const f = state.filter;
    const filtered = f === 'all' ? data : data.filter((x) => (f === 'ground-blind' ? x.ground === 'LOOKS OK' && x.actual !== 'GO' : f === 'failed' ? !x.pass : x.category === f));
    $('benchmarkCount').textContent = 'Showing ' + filtered.length + ' of ' + data.length + ' synthetic cases';
    $('benchmarkTable').innerHTML = filtered.length
      ? filtered.map((x) => `<tr><td>${safe(x.id)}</td><td>${safe(x.title)}</td><td>${safe(x.category)}</td><td>${safe(x.expected)}</td><td><span class="v2-tagText ${tone(x.actual)}">${safe(x.actual)}</span><small class="codes">${safe(x.codes.join(' · ') || '—')}</small></td><td>${safe(x.ground)}</td><td><span class="v2-tableStatus ${x.pass ? 'pass' : 'fail'}">${x.pass ? 'PASS' : 'FAIL'}</span></td><td><button type="button" class="v2-ctrl" data-case="${safe(x.id)}" aria-label="Load case ${safe(x.id)} into the live dashboard">Load</button></td></tr>`).join('')
      : `<tr><td colspan="8" class="v2-empty">${f === 'failed' ? 'No failing cases — every synthetic rule check passes.' : 'No cases in this group.'}</td></tr>`;
  }

  start();
})();
