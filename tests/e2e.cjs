'use strict';
// End-to-end browser regression for CanopyGuard (Playwright, real Chrome/Chromium).
//   node tests/e2e.cjs [path/to/index.html]   (default: ./index.html)
// Runs every journey at desktop 1440×900 and mobile 390×844, captures console errors, page errors,
// failed requests, screenshots (qa/screens) and writes qa/e2e-report.json.
// The only network dependency (Open-Meteo) is stubbed: once as an outage and once with a small
// clearly-labelled fixture, so the test never depends on or fabricates live weather.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { launch, instrument, newLog, ROOT } = require('./browser.cjs');

const FILE = path.resolve(process.argv[2] || path.join(ROOT, 'index.html'));
const APP_URL = 'file://' + FILE;
const OUT = path.join(ROOT, 'qa');
const SHOTS = path.join(OUT, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];
const PAGES = ['overview', 'lab', 'twin', 'boundary', 'replay', 'validation', 'planner', 'log', 'science'];
const results = [];

async function step(vp, name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ viewport: vp, name, pass: true, ms: Date.now() - t0 });
    process.stdout.write(`  PASS ${vp.padEnd(7)} ${name}\n`);
  } catch (e) {
    results.push({ viewport: vp, name, pass: false, ms: Date.now() - t0, error: String(e && e.message || e).slice(0, 600) });
    process.stdout.write(`  FAIL ${vp.padEnd(7)} ${name}\n       ${String(e && e.message || e).split('\n')[0]}\n`);
  }
}

const text = (p, id) => p.$eval('#' + id, (e) => e.textContent.trim());
async function nav(p, page, mobile) {
  if (mobile) {
    await p.click('#menuBtn');
    await p.waitForSelector('#sidebar.open');
  }
  await p.click(`.navbtn[data-page="${page}"]`);
  await p.waitForSelector(`#${page}.contentPage.active`);
  if (mobile) {
    await p.waitForFunction(() => !document.getElementById('sidebar').classList.contains('open'));
    await p.waitForTimeout(320); // let the 0.25s slide-out transition finish before touching the page
  }
}
async function download(p, trigger) {
  const [dl] = await Promise.all([p.waitForEvent('download'), trigger()]);
  const fp = await dl.path();
  return { name: dl.suggestedFilename(), body: fs.readFileSync(fp, 'utf8') };
}
async function loadScenario(p, key) {
  await p.click(`[data-demo="${key}"]`);
}

async function run(vpDef, browser) {
  const vp = vpDef.name, mobile = vpDef.isMobile;
  const log = newLog();
  const context = await browser.newContext({ viewport: vpDef.viewport, deviceScaleFactor: vpDef.deviceScaleFactor, isMobile: vpDef.isMobile, hasTouch: vpDef.hasTouch, acceptDownloads: true, timezoneId: 'America/Phoenix', locale: 'en-US' });
  await instrument(context, log);
  let forecastMode = 'outage';
  await context.route(/api\.open-meteo\.com/, (route) => {
    if (forecastMode === 'outage') return route.abort('internetdisconnected');
    const now = Math.floor(Date.now() / 3600000) * 3600;
    const time = Array.from({ length: 24 }, (_, i) => now + i * 3600);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hourly: { time, wind_speed_10m: time.map((_, i) => [2, 4, 6, 12][i % 4]), precipitation_probability: time.map((_, i) => (i % 5 === 0 ? 40 : 5)), temperature_2m: time.map(() => 70), wind_direction_10m: time.map(() => 90) } }) });
  });
  const p = await context.newPage();
  const t0 = Date.now();
  await p.goto(APP_URL);
  await p.waitForSelector('#statusMain', { state: 'attached' });
  const loadMs = Date.now() - t0;
  // Expected network attempts that are not failures of the app: the stubbed outage.
  const ignoreFailed = (s) => /open-meteo/.test(s);

  await step(vp, 'app loads with anchor STOP + version tag', async () => {
    assert.strictEqual(await text(p, 'statusMain'), 'STOP');
    assert.match(await text(p, 'statusSubtitle'), /inversion/i);
    assert.strictEqual(await text(p, 'groundVerdict'), 'LOOKS OK');
    assert.strictEqual(await text(p, 'tempMetric'), '+5.1°F');
    assert.strictEqual(await text(p, 'sourcePill'), 'SIMULATED READINGS');
    const ver = await p.$eval('meta[name="canopyguard-version"]', (m) => m.content);
    assert.match(ver, /^2\.1\.0\+[0-9a-f]{12}$/);
  });

  await step(vp, 'every navigation item opens its page, sets title, aria-current and #hash', async () => {
    for (const pg of PAGES) {
      await nav(p, pg, mobile);
      const cur = await p.$eval(`.navbtn[data-page="${pg}"]`, (b) => b.getAttribute('aria-current'));
      assert.strictEqual(cur, 'page', pg);
      assert.strictEqual(new URL(p.url()).hash, '#' + pg);
      assert.ok((await text(p, 'pageTitle')).length > 5);
      await p.waitForTimeout(250);
      await p.screenshot({ path: path.join(SHOTS, `${vp}-${pg}.png`) });
    }
    await p.goBack();
    await p.waitForSelector('#log.contentPage.active');
    await nav(p, 'overview', mobile);
  });

  if (mobile) {
    await step(vp, 'mobile menu opens, scrim and Escape close it', async () => {
      await p.click('#menuBtn');
      await p.waitForSelector('#sidebar.open');
      assert.strictEqual(await p.$eval('#menuBtn', (b) => b.getAttribute('aria-expanded')), 'true');
      await p.waitForTimeout(350);
      await p.screenshot({ path: path.join(SHOTS, `${vp}-menu-open.png`) });
      await p.mouse.click(370, 400);
      await p.waitForFunction(() => !document.getElementById('sidebar').classList.contains('open'));
      await p.click('#menuBtn');
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => !document.getElementById('sidebar').classList.contains('open'));
    });
    await step(vp, 'no horizontal page overflow on any page', async () => {
      for (const pg of PAGES) {
        await nav(p, pg, true);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(over <= 1, `${pg} overflows by ${over}px`);
      }
      await nav(p, 'overview', true);
    });
    await step(vp, 'touch targets on primary controls ≥ 40px', async () => {
      const small = await p.evaluate(() => [...document.querySelectorAll('.contentPage.active button, .topbar button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 40).map((b) => b.id || b.textContent.trim().slice(0, 20)));
      assert.deepStrictEqual(small, []);
    });
  }

  await step(vp, 'each scenario: same verdict on overview, lab, twin, boundary; reasons present', async () => {
    const want = { inversion: 'STOP', shear: 'STOP', calm: 'STOP', gusty: 'STOP', clear: 'GO', volatile: 'CAUTION', stale: 'STOP' };
    for (const [key, status] of Object.entries(want)) {
      await nav(p, 'overview', mobile);
      await loadScenario(p, key);
      assert.strictEqual(await text(p, 'statusMain'), status, key);
      assert.strictEqual(await text(p, 'labResult'), status, key + ' lab');
      assert.strictEqual(await text(p, 'twinState'), status, key + ' twin');
      assert.strictEqual(await text(p, 'boundaryState'), status, key + ' boundary');
      assert.strictEqual(await text(p, 'multiVerdict'), status);
      const alerts = await p.$$eval('#alerts .alert', (a) => a.length);
      assert.ok(alerts >= 1);
      if (status !== 'GO') assert.ok(!(await p.$('#alerts .alert.green')));
      const pressed = await p.$eval(`[data-demo="${key}"]`, (b) => b.getAttribute('aria-pressed'));
      assert.strictEqual(pressed, 'true');
    }
    const heroLabel = await p.$eval('#heroLayerLabel', (e) => e.textContent);
    assert.match(heroLabel, /NO WARM LAYER/); // stale scenario has upper cooler → no warm layer drawn
    await loadScenario(p, 'inversion');
    assert.match(await p.$eval('#heroLayerLabel', (e) => e.textContent), /WARM AIR ALOFT/);
  });

  await step(vp, 'weather lab: exact 3/10 mph boundaries, 359°/1°, invalid input, reset', async () => {
    await nav(p, 'lab', mobile);
    const set = async (vals) => { for (const [id, v] of Object.entries(vals)) await p.fill('#' + id, String(v)); await p.click('#assessBtn'); };
    await set({ tempLow: 76, tempHigh: 74, speedLow: 3, speedHigh: 10, dirLow: 359, dirHigh: 1, ageLow: 1, ageHigh: 1, windMin: 3, windMax: 10 });
    // 3 and 10 are inside limits, but a 7 mph gap is severe shear → STOP for that reason only.
    assert.strictEqual(await text(p, 'labResult'), 'STOP');
    assert.strictEqual(await text(p, 'labReasons'), 'SEVERE_SHEAR');
    await set({ speedLow: 3, speedHigh: 3 });
    assert.strictEqual(await text(p, 'labResult'), 'GO');
    await set({ speedLow: 10, speedHigh: 10 });
    assert.strictEqual(await text(p, 'labResult'), 'GO');
    assert.strictEqual(await text(p, 'turnMetric'), '2°');
    assert.strictEqual(await text(p, 'sourcePill'), 'MANUAL ENTRY');
    await set({ tempHigh: '' });
    assert.strictEqual(await text(p, 'labResult'), 'STOP');
    assert.strictEqual(await text(p, 'labReasons'), 'INVALID');
    assert.strictEqual(await p.$eval('#tempHigh', (e) => e.getAttribute('aria-invalid')), 'true');
    assert.strictEqual(await text(p, 'upperPair'), '—°F');
    assert.strictEqual(await text(p, 'groundVerdict'), 'UNKNOWN');
    const bodyText = await p.evaluate(() => document.body.innerText);
    assert.ok(!/NaN|Infinity|undefined/.test(bodyText), 'NaN/undefined leaked into UI');
    await set({ tempHigh: 75, speedLow: 200 });
    assert.strictEqual(await text(p, 'labReasons'), 'INVALID');
    await set({ speedLow: 5, ageHigh: -3 });
    assert.strictEqual(await text(p, 'labReasons'), 'INVALID');
    await set({ ageHigh: 11 });
    assert.match(await text(p, 'labReasons'), /STALE/);
    await set({ ageHigh: 1, windMin: 8, windMax: 6 });
    assert.strictEqual(await text(p, 'labReasons'), 'INVALID');
    await p.screenshot({ path: path.join(SHOTS, `${vp}-lab-invalid.png`), fullPage: false });
    await p.click('#resetLab');
    assert.strictEqual(await text(p, 'labResult'), 'STOP');
    assert.strictEqual(await p.inputValue('#tempHigh'), '78.1');
    assert.strictEqual(await text(p, 'sourcePill'), 'SIMULATED READINGS');
  });

  await step(vp, 'invalid readings: twin and boundary show explicit invalid state, no NaN', async () => {
    await nav(p, 'lab', mobile);
    await p.fill('#dirHigh', '');
    await p.click('#assessBtn');
    await nav(p, 'twin', mobile);
    assert.strictEqual(await text(p, 'twinInputQuality'), 'INVALID INPUT');
    await nav(p, 'boundary', mobile);
    assert.match(await p.$eval('#boundarySVG', (s) => s.textContent), /INVALID READINGS/);
    assert.match(await text(p, 'boundaryAlignment'), /Unavailable/);
    const html = await p.$eval('#boundarySVG', (s) => s.innerHTML);
    assert.ok(!/NaN/.test(html));
    await p.screenshot({ path: path.join(SHOTS, `${vp}-boundary-invalid.png`) });
    await nav(p, 'lab', mobile);
    await p.click('#resetLab');
  });

  await step(vp, 'atmospheric twin: pause/resume, orbit, zoom, layer toggles, keyboard; canvas renders', async () => {
    await nav(p, 'twin', mobile);
    const hash = () => p.$eval('#twinCanvas', (c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 997) h = (h * 31 + d[i]) >>> 0; return h; });
    await p.waitForTimeout(300);
    const a = await hash();
    await p.waitForTimeout(300);
    assert.notStrictEqual(a, await hash(), 'tracers should animate');
    await p.click('#scenePlay');
    assert.match(await text(p, 'scenePlay'), /Resume/);
    const b = await hash(); await p.waitForTimeout(300);
    assert.strictEqual(b, await hash(), 'paused scene must be still');
    await p.click('#orbitLeft'); const c = await hash(); assert.notStrictEqual(b, c);
    await p.click('#orbitRight'); await p.click('#zoomIn'); await p.click('#zoomOut');
    await p.uncheck('#toggleTracer'); await p.uncheck('#toggleLayer');
    const d = await hash(); await p.check('#toggleTracer'); await p.check('#toggleLayer');
    assert.notStrictEqual(d, await hash());
    await p.focus('#twinCanvas'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('+');
    await p.click('#resetOrbit');
    if (!mobile) {
      const box = await p.$eval('#twinCanvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x + 120, box.y, { steps: 6 }); await p.mouse.up();
      await p.mouse.wheel(0, -300);
    }
    const dpr = await p.$eval('#twinCanvas', (c) => c.width / c.getBoundingClientRect().width);
    assert.ok(dpr >= 0.99 && dpr <= 2.01, 'canvas DPR scaling ' + dpr);
    await p.click('#scenePlay');
    assert.match(await text(p, 'twinWindLow'), /from 85°/);
    assert.match(await text(p, 'twinReasons'), /STOP/);
    await p.screenshot({ path: path.join(SHOTS, `${vp}-twin-anchor.png`) });
  });

  await step(vp, 'twin animation frame budget (≥ 30 fps while visible)', async () => {
    await nav(p, 'twin', mobile);
    const fps = await p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); })(); }));
    results.push({ viewport: vp, name: 'metric: twin fps', pass: true, value: Math.round(fps) });
    assert.ok(fps >= 30, 'fps ' + fps);
  });

  await step(vp, 'boundary lens: drag + keyboard move change alignment; reset restores; FROM/TOWARD', async () => {
    await nav(p, 'boundary', mobile);
    const flag = (id) => p.$eval(`#boundarySVG [data-receptor="${id}"]`, (g) => g.getAttribute('aria-label'));
    assert.match(await flag('homes'), /IN 30-FT SECTOR/);
    assert.match(await text(p, 'boundaryAlignment'), /^2 of 4/);
    // Drag homes to the upwind (east) side: FROM 85° wind blows toward ~265°, so east is upwind.
    const ctm = async (x, y) => p.$eval('#boundarySVG', (s, [x, y]) => { const pt = new DOMPoint(x, y).matrixTransform(s.getScreenCTM()); return { x: pt.x, y: pt.y }; }, [x, y]);
    await p.$eval('#boundarySVG', (s) => s.scrollIntoView({ block: 'center' }));
    const from = await ctm(242, 128), to = await ctm(860, 300);
    if (mobile) {
      // Real touch drag through the Chrome DevTools protocol (touchStart → touchMove × 8 → touchEnd).
      const cdp = await context.newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
      for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(to.x, to.y, { steps: 8 }); await p.mouse.up();
    }
    const dbg = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return (e && e.outerHTML.slice(0,160).replace(/\s+/g,' ')) + ' svgTop=' + document.getElementById('boundarySVG').getBoundingClientRect().top + ' y=' + y + ' cx=' + document.querySelector('#boundarySVG [data-receptor="homes"] circle').getAttribute('cx'); }, [from.x, from.y]);
    assert.match(await flag('homes'), /OUTSIDE SECTORS/, dbg);
    assert.match(await text(p, 'boundaryAlignment'), /^1 of 4/);
    await p.screenshot({ path: path.join(SHOTS, `${vp}-boundary-dragged.png`) });
    await p.focus('#boundarySVG [data-receptor="canal"]');
    for (let i = 0; i < 4; i++) await p.keyboard.press('Shift+ArrowLeft');
    const focused = await p.evaluate(() => document.activeElement.getAttribute('data-receptor'));
    assert.strictEqual(focused, 'canal', 'focus kept after keyboard move');
    await p.click('#boundaryReset');
    assert.match(await flag('homes'), /IN 30-FT SECTOR/);
    assert.match(await text(p, 'boundaryWind'), /FROM 85° \(5 ft\) \/ 137° \(30 ft\)/);
    // Sector geometry: the 5-ft arrow tip must point TOWARD 265° (west, slightly south) from the block centre.
    const tip = await p.$eval('#boundarySVG line[stroke-width="5"]', (l) => ({ x: +l.getAttribute('x2'), y: +l.getAttribute('y2') }));
    const bearing = (Math.atan2(tip.x - 480, 310 - tip.y) * 180 / Math.PI + 360) % 360;
    assert.ok(Math.abs(bearing - 265) < 1, 'toward bearing ' + bearing);
  });

  await step(vp, 'replay: 17 frames, play advances & stops at end, scrub/timeline pause, leaving page stops, apply logs', async () => {
    await nav(p, 'replay', mobile);
    assert.strictEqual(await p.$$eval('#replayTimeline button', (b) => b.length), 17);
    assert.strictEqual(await text(p, 'replayClock'), '05:30');
    assert.strictEqual(await text(p, 'replayStatus'), 'STOP');
    await p.click('#replayPlay');
    assert.match(await text(p, 'replayPlay'), /Pause/);
    await p.waitForFunction(() => document.getElementById('replayClock').textContent !== '05:30', null, { timeout: 4000 });
    await p.fill('#replayScrub', '8'); await p.dispatchEvent('#replayScrub', 'input');
    assert.match(await text(p, 'replayPlay'), /Play/);
    assert.strictEqual(await text(p, 'replayClock'), '07:30');
    const statuses = await p.$$eval('#replayTimeline button', (b) => b.map((x) => x.getAttribute('aria-label').split(', ').pop()));
    assert.ok(statuses.includes('STOP') && statuses.includes('GO'), 'verdict changes across the morning: ' + statuses.join());
    await p.click('#replayTimeline button[data-frame="16"]');
    assert.strictEqual(await text(p, 'replayClock'), '09:30');
    assert.match(await text(p, 'replayPlay'), /Play again/);
    await p.click('#replayPlay');
    await nav(p, 'overview', mobile);
    const clk = await text(p, 'replayClock');
    await p.waitForTimeout(1500);
    assert.strictEqual(await text(p, 'replayClock'), clk, 'replay must stop when leaving the page');
    await nav(p, 'replay', mobile);
    await p.click('#replayTimeline button[data-frame="14"]');
    const frameStatus = await text(p, 'replayStatus');
    await p.click('#replayApply');
    await p.waitForSelector('#overview.contentPage.active');
    assert.strictEqual(await text(p, 'statusMain'), frameStatus);
    assert.match(await p.$eval('#recentTable tbody tr', (r) => r.textContent), /replay:frame_09:00/);
    const ex = await download(p, async () => { await nav(p, 'replay', mobile); await p.click('#replayExport'); });
    const j = JSON.parse(ex.body);
    assert.strictEqual(j.frames.length, 17); assert.strictEqual(j.source, 'synthetic');
  });

  await step(vp, 'evidence lab: 40/40, 21 ground-blind, filters incl. empty state, load case, export', async () => {
    await nav(p, 'validation', mobile);
    assert.strictEqual(await text(p, 'benchPassed'), '40/40');
    assert.strictEqual(await text(p, 'benchMissed'), '21');
    assert.strictEqual(await text(p, 'benchStops'), '23');
    const opts = await p.$$eval('#validationFilter option', (o) => o.map((x) => x.value));
    for (const v of opts) {
      await p.selectOption('#validationFilter', v);
      const rows = await p.$$eval('#benchmarkTable tr', (r) => r.length);
      assert.ok(rows >= 1, v);
      if (v === 'ground-blind') assert.strictEqual(rows, 21);
      if (v === 'all') assert.strictEqual(rows, 40);
      if (v === 'failed') assert.match(await p.$eval('#benchmarkTable', (t) => t.textContent), /No failing cases/);
    }
    await p.selectOption('#validationFilter', 'ground-blind');
    await p.click('#benchmarkRun');
    await p.screenshot({ path: path.join(SHOTS, `${vp}-validation-groundblind.png`) });
    const firstId = await p.$eval('#benchmarkTable [data-case]', (b) => b.dataset.case);
    const expected = await p.$eval('#benchmarkTable tr td:nth-child(4)', (td) => td.textContent);
    await p.click('#benchmarkTable [data-case]');
    await p.waitForSelector('#overview.contentPage.active');
    assert.strictEqual(await text(p, 'statusMain'), expected);
    assert.strictEqual(await text(p, 'groundVerdict'), 'LOOKS OK');
    assert.match(await p.$eval('#recentTable tbody tr', (r) => r.textContent), new RegExp('benchmark:' + firstId));
    await nav(p, 'validation', mobile);
    const ex = await download(p, () => p.click('#exportBenchmark'));
    const j = JSON.parse(ex.body);
    assert.strictEqual(j.cases.length, 40); assert.strictEqual(j.results.filter((r) => r.pass).length, 40);
    await p.click('#loadGroundBlindspot');
    await p.waitForSelector('#twin.contentPage.active');
    await nav(p, 'validation', mobile);
    await p.click('#benchmarkLive');
    await p.waitForSelector('#lab.contentPage.active');
  });

  await step(vp, 'overview: weather shift, record decision, customize link, judge buttons, view-log link', async () => {
    await nav(p, 'overview', mobile);
    await loadScenario(p, 'clear');
    assert.strictEqual(await text(p, 'statusMain'), 'GO');
    await p.click('#simulateShift');
    assert.strictEqual(await text(p, 'statusMain'), 'STOP');
    assert.match(await text(p, 'signalRow'), /INVERSION/);
    const before = await p.$$eval('#recentTable tbody tr', (r) => r.length);
    await p.click('#captureTop');
    assert.match(await text(p, 'toast'), /Decision recorded · STOP/);
    assert.ok((await p.$$eval('#recentTable tbody tr', (r) => r.length)) >= Math.min(4, before));
    await p.click('[data-v2page="twin"]'); await p.waitForSelector('#twin.contentPage.active');
    await nav(p, 'overview', mobile);
    await p.click('[data-v2page="validation"]'); await p.waitForSelector('#validation.contentPage.active');
    await nav(p, 'overview', mobile);
    await p.click('#openLab'); await p.waitForSelector('#lab.contentPage.active');
    await nav(p, 'overview', mobile);
    await p.click('[data-goto="log"]'); await p.waitForSelector('#log.contentPage.active');
    await nav(p, 'overview', mobile);
    await loadScenario(p, 'inversion');
    await p.screenshot({ path: path.join(SHOTS, `${vp}-overview-anchor.png`), fullPage: true });
  });

  await step(vp, 'import: valid file w/ timestamps, file w/o timestamps (fail-safe), malformed, wrong shape', async () => {
    await nav(p, 'lab', mobile);
    const sample = await download(p, () => p.click('#sampleTowerBtn'));
    const s = JSON.parse(sample.body);
    assert.ok(s.observedAt_5ft.endsWith('Z'));
    const upload = async (name, body) => p.setInputFiles('#jsonInput', { name, mimeType: 'application/json', buffer: Buffer.from(body) });
    await upload('tower.json', sample.body);
    await p.waitForFunction(() => /Imported tower\.json/.test(document.getElementById('importNote').textContent));
    assert.strictEqual(await text(p, 'labResult'), 'STOP');
    assert.match(await text(p, 'labReasons'), /INVERSION/);
    assert.strictEqual(await text(p, 'sourcePill'), 'IMPORTED FILE');
    const now = Date.now();
    await upload('clear.json', JSON.stringify([{ temp_5ft: 77, temp_30ft: 75, wind_speed_5ft: 5.5, wind_speed_30ft: 6.4, wind_direction_5ft: 110, wind_direction_30ft: 124, observedAt: new Date(now - 120000).toISOString() }, { temp_5ft: 1 }]));
    await p.waitForFunction(() => /clear\.json \(first of 2 rows\)/.test(document.getElementById('importNote').textContent));
    assert.strictEqual(await text(p, 'labResult'), 'GO');
    await upload('nostamp.json', JSON.stringify({ tLow: 77, tHigh: 75, wLow: 5.5, wHigh: 6.4, dLow: 110, dHigh: 124 }));
    await p.waitForFunction(() => /nostamp\.json/.test(document.getElementById('importNote').textContent));
    assert.strictEqual(await text(p, 'labResult'), 'STOP', 'missing timestamps must not look fresh');
    assert.strictEqual(await text(p, 'labReasons'), 'INVALID');
    await upload('future.json', JSON.stringify({ tLow: 77, tHigh: 75, wLow: 5.5, wHigh: 6.4, dLow: 110, dHigh: 124, observedAt: new Date(now + 3600000).toISOString() }));
    await p.waitForFunction(() => /future\.json/.test(document.getElementById('importNote').textContent));
    assert.strictEqual(await text(p, 'labReasons'), 'INVALID');
    await upload('noTZ.json', JSON.stringify({ tLow: 77, tHigh: 75, wLow: 5.5, wHigh: 6.4, dLow: 110, dHigh: 124, observedAt: '2026-11-15T10:00:00' }));
    await p.waitForFunction(() => /noTZ\.json/.test(document.getElementById('importNote').textContent));
    assert.strictEqual(await text(p, 'labReasons'), 'INVALID');
    const before = await p.inputValue('#tempLow');
    await upload('broken.json', '{"tLow": 70,,,');
    await p.waitForFunction(() => /rejected/.test(document.getElementById('importNote').textContent));
    assert.strictEqual(await p.inputValue('#tempLow'), before, 'malformed import must not change readings');
    await upload('shape.json', JSON.stringify({ tLow: 'warm', tHigh: 70, wLow: 5, wHigh: 5, dLow: 1, dHigh: 2 }));
    await p.waitForFunction(() => /Invalid tLow/.test(document.getElementById('importNote').textContent));
    await upload('big.json', 'x'.repeat(1024 * 1024 + 10));
    await p.waitForFunction(() => /larger than 1 MB/.test(document.getElementById('toast').textContent));
    await p.click('#resetLab');
  });

  await step(vp, 'planner: illustrative default, offline failure is labelled, fixture load labelled regional, PT times', async () => {
    await nav(p, 'planner', mobile);
    assert.match(await text(p, 'forecastSource'), /ILLUSTRATIVE/);
    assert.strictEqual(await p.$$eval('#forecastGrid .forecastHour', (x) => x.length), 12);
    forecastMode = 'outage';
    await p.click('#loadForecast');
    await p.waitForFunction(() => /UNAVAILABLE/.test(document.getElementById('forecastSource').textContent));
    assert.match(await text(p, 'forecastStatus'), /illustrative placeholders, not a forecast/);
    forecastMode = 'fixture';
    await p.click('#loadForecast');
    await p.waitForFunction(() => /REGIONAL MODEL/.test(document.getElementById('forecastSource').textContent));
    const hours = await p.$$eval('#forecastGrid .forecastHour', (x) => x.map((h) => h.className + '|' + h.textContent));
    assert.strictEqual(hours.length, 12);
    assert.ok(hours.every((h) => / PT/.test(h)));
    assert.ok(hours.some((h) => /good/.test(h)) && hours.some((h) => /bad/.test(h)));
    assert.match(await text(p, 'forecastLimits'), /3\.0–10\.0 mph/);
    await p.screenshot({ path: path.join(SHOTS, `${vp}-planner-regional-fixture.png`) });
  });

  await step(vp, 'decision log: timezone column, CSV (formula-injection safe) + JSON exports, print, clear w/ empty state', async () => {
    await nav(p, 'log', mobile);
    const head = await p.$eval('#fullLogTable thead', (t) => t.textContent);
    assert.match(head, /TIME \(MST\)/);
    // Seed a hostile entry as if stored by an older version / tampered storage, then reload.
    await p.evaluate(() => {
      const h = JSON.parse(localStorage.getItem('canopyguard-audit-v1'));
      h.unshift({ at: new Date().toISOString(), kind: '=HYPERLINK("http://x","y")', source: '@evil', status: 'STOP', codes: ['INVERSION'], reasons: ['+cmd'], readings: { tLow: -5, tHigh: 1, wLow: 5, wHigh: 5, dLow: 1, dHigh: 2, ageLow: 1, ageHigh: 1, volatility: 'low', windMin: 3, windMax: 10, method: '-x' } });
      h.push({ junk: true }, { at: 'not a date', status: 'GO' }, { at: new Date().toISOString(), status: 'MAYBE' });
      localStorage.setItem('canopyguard-audit-v1', JSON.stringify(h));
    });
    await p.reload();
    await p.waitForSelector('#statusMain', { state: 'attached' });
    await nav(p, 'log', mobile);
    const csv = await download(p, () => p.click('#exportCsv'));
    assert.match(csv.name, /^canopyguard-decisions-\d{8}T\d{6}Z\.csv$/);
    const lines = csv.body.replace(/^﻿/, '').split('\r\n');
    assert.match(lines[0], /^timestamp_utc,event,source,status/);
    const hostile = lines.find((l) => /HYPERLINK/.test(l));
    assert.ok(hostile.includes(`"'=HYPERLINK`), 'formula must be neutralised');
    assert.ok(hostile.includes(`"'@evil"`) && hostile.includes(`"'+cmd"`) && hostile.includes(`"'-x"`));
    assert.ok(hostile.includes(',-5,'), 'negative numbers stay numeric');
    assert.ok(!lines.some((l) => /MAYBE|not a date|junk/.test(l)), 'malformed stored entries dropped');
    assert.ok(lines.slice(1).every((l) => /^"\d{4}-\d{2}-\d{2}T[\d:.]+Z"/.test(l)), 'UTC timestamps');
    const js = await download(p, () => p.click('#exportJson'));
    const j = JSON.parse(js.body);
    assert.ok(Array.isArray(j.entries) && j.entries.length >= 3 && /Not a regulatory/.test(j.note));
    await p.evaluate(() => { window.__printed = 0; window.print = () => window.__printed++; });
    await p.click('#printLog');
    assert.strictEqual(await p.evaluate(() => window.__printed), 1);
    await p.screenshot({ path: path.join(SHOTS, `${vp}-log.png`) });
    p.once('dialog', (d) => d.dismiss());
    await p.click('#clearLog');
    assert.ok((await p.$$eval('#fullLogTable tbody tr', (r) => r.length)) > 0, 'dismissed confirm keeps log');
    p.once('dialog', (d) => d.accept());
    await p.click('#clearLog');
    assert.match(await p.$eval('#fullLogTable', (t) => t.textContent), /No assessments recorded yet/);
    assert.strictEqual(await p.$eval('#exportCsv', (b) => b.disabled), true);
    await p.click('#captureTop');
    assert.strictEqual(await p.$eval('#exportCsv', (b) => b.disabled), false);
  });

  await step(vp, 'storage failure and log rotation are handled', async () => {
    await p.evaluate(() => {
      const h = []; for (let i = 0; i < 300; i++) h.push({ at: new Date(Date.now() - i * 1000).toISOString(), kind: 'seed', source: 'simulated', status: 'GO', codes: [], reasons: [], readings: {} });
      localStorage.setItem('canopyguard-audit-v1', JSON.stringify(h));
    });
    await p.reload(); await p.waitForSelector('#statusMain', { state: 'attached' });
    await p.click('#captureTop');
    assert.match(await text(p, 'toast'), /rotated out/);
    assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('canopyguard-audit-v1')).length), 300);
    await p.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
    await p.click('#captureTop');
    assert.match(await text(p, 'toast'), /storage is unavailable or full/);
    await p.evaluate(() => localStorage.clear());
  });

  await step(vp, 'deep link #boundary opens the Boundary Lens directly', async () => {
    const q = await context.newPage();
    await q.goto(APP_URL + '#boundary');
    await q.waitForSelector('#boundary.contentPage.active');
    assert.ok((await q.$$eval('#boundarySVG [data-receptor]', (r) => r.length)) === 4);
    await q.close();
  });

  await step(vp, 'accessibility scan (axe-core): no critical/serious violations on key pages', async () => {
    const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
    const all = [];
    for (const pg of ['overview', 'lab', 'twin', 'boundary', 'replay', 'validation', 'planner', 'log', 'science']) {
      await nav(p, pg, mobile);
      await p.waitForTimeout(150); // #toast excluded: it is only low-contrast mid fade-in (opacity transition)
      await p.evaluate(axe);
      const res = await p.evaluate(async () => (await window.axe.run({ exclude: [['#toast']] }, { resultTypes: ['violations'] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0] && v.nodes[0].target.join(' ') })));
      res.forEach((v) => all.push(Object.assign({ page: pg }, v)));
    }
    results.push({ viewport: vp, name: 'metric: axe violations (all impacts)', pass: true, value: all });
    const bad = all.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    assert.deepStrictEqual(bad, []);
  });

  await step(vp, 'no JS exceptions, console errors or unexpected failed requests', async () => {
    const failed = log.failedRequests.filter((s) => !ignoreFailed(s));
    assert.deepStrictEqual(log.pageErrors, []);
    assert.deepStrictEqual(log.consoleErrors.filter((s) => !/open-meteo|ERR_INTERNET_DISCONNECTED/.test(s)), []);
    assert.deepStrictEqual(failed, []);
  });
  results.push({ viewport: vp, name: 'metric: initial load to interactive (ms, file://)', pass: true, value: loadMs });
  results.push({ viewport: vp, name: 'diagnostics', pass: true, value: log });
  await context.close();
}

(async () => {
  console.log('CanopyGuard E2E · ' + FILE);
  const browser = await launch();
  console.log('Browser: ' + browser.version());
  for (const vp of VIEWPORTS) {
    console.log(`\n[${vp.name} ${vp.viewport.width}×${vp.viewport.height}]`);
    await run(vp, browser);
  }
  await browser.close();
  const tests = results.filter((r) => !/^metric|^diagnostics/.test(r.name));
  const failed = tests.filter((r) => !r.pass);
  fs.writeFileSync(path.join(OUT, 'e2e-report.json'), JSON.stringify({ file: FILE, at: new Date().toISOString(), passed: tests.length - failed.length, total: tests.length, results }, null, 2));
  console.log(`\n${tests.length - failed.length}/${tests.length} browser checks passed (report: qa/e2e-report.json, screenshots: qa/screens/)`);
  if (failed.length) process.exitCode = 1;
})();
