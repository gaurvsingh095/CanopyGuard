'use strict';
// Records the CanopyGuard demo: a real, headed Chrome session on a virtual display, captured with
// ffmpeg x11grab while Playwright performs genuine clicks/drags on the built index.html.
// Captions and the cursor marker are a recording-only overlay injected by this script (they are not
// part of the app). Every reading shown comes from the app's own simulated scenarios.
//   DISPLAY=:99 node demo/record-demo.cjs <out-dir>
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { instrument, newLog, ROOT } = require('../tests/browser.cjs');
const { chromium } = require('playwright');

const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'demo', 'out'));
fs.mkdirSync(OUT, { recursive: true });
const RAW = path.join(OUT, 'raw-capture.mp4');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERLAY = `
(() => {
  if (document.getElementById('demoCap')) return;
  const st = document.createElement('style');
  st.textContent = '#demoCap{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:1040px;width:max-content;background:rgba(10,28,20,.94);color:#f4fbef;font:600 19px/1.45 "DM Sans",sans-serif;padding:13px 22px;border-radius:14px;z-index:99999;box-shadow:0 10px 40px rgba(0,0,0,.35);border:1px solid rgba(200,239,128,.35);text-align:center;transition:opacity .35s;pointer-events:none}#demoCap small{display:block;font:800 10px/1.4 "DM Sans",sans-serif;letter-spacing:.16em;color:#c8ef80;margin-bottom:3px}#demoCap:empty{opacity:0}#demoCursor{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,236,120,.35);border:2px solid #ffe878;z-index:99998;pointer-events:none;transition:transform .12s;left:-40px;top:-40px}#demoCursor.down{transform:scale(.65);background:rgba(255,236,120,.75)}';
  document.head.appendChild(st);
  const cap = document.createElement('div'); cap.id = 'demoCap'; document.body.appendChild(cap);
  const cur = document.createElement('div'); cur.id = 'demoCursor'; document.body.appendChild(cur);
  addEventListener('mousemove', e => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', () => cur.classList.add('down'), true);
  addEventListener('mouseup', () => cur.classList.remove('down'), true);
  window.__cap = (label, t) => { cap.innerHTML = t ? '<small>' + label + '</small>' + t : ''; };
})();`;

(async () => {
  const ffStart = Date.now();
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-video_size', '1920x1080', '-framerate', '30', '-draw_mouse', '0', '-i', process.env.DISPLAY || ':99',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', RAW], { stdio: ['pipe', 'inherit', 'inherit'] });
  // App-mode window (no browser UI) sized 1440×810 CSS px at 1.333× → exactly 1920×1080 on screen.
  const context = await chromium.launchPersistentContext(fs.mkdtempSync('/tmp/cg-rec-'), {
    executablePath: fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined, headless: false, viewport: null,
    acceptDownloads: true, timezoneId: 'America/Phoenix', locale: 'en-US',
    args: ['--app=data:text/html,<title>CanopyGuard</title>', '--window-position=0,0', '--window-size=1440,810', '--force-device-scale-factor=1.3333333', '--no-first-run', '--noerrdialogs', '--disable-infobars'],
  });
  const log = newLog();
  await instrument(context, log);
  const p = context.pages()[0] || (await context.newPage());
  await p.goto('file://' + path.join(ROOT, 'index.html'));
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForSelector('#statusMain');
  await p.evaluate(OVERLAY);
  await p.evaluate(() => { document.getElementById('toast').classList.remove('show'); window.scrollTo(0, 0); });
  await sleep(1200);

  const t0 = Date.now();
  const cues = [];
  let open = null;
  const now = () => (Date.now() - t0) / 1000;
  async function cap(label, text) {
    if (open) { open.end = now(); cues.push(open); }
    open = text ? { start: now(), label, text } : null;
    await p.evaluate(([l, t]) => window.__cap(l, t), [label, text || '']);
  }
  let mx = 720, my = 400;
  async function moveTo(x, y, ms = 650) {
    const steps = Math.max(8, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      await p.mouse.move(mx + (x - mx) * e, my + (y - my) * e);
      await sleep(ms / steps);
    }
    mx = x; my = y;
  }
  async function center(sel) {
    await p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 120) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
    await sleep(450);
    return p.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  }
  async function click(sel, pause = 500) {
    const c = await center(sel);
    await moveTo(c.x, c.y);
    await p.mouse.down(); await sleep(90); await p.mouse.up();
    await sleep(pause);
  }
  async function scrollTo(y, ms = 900) {
    await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), y);
    await sleep(ms);
  }
  async function hideToast() { await p.evaluate(() => document.getElementById('toast').classList.remove('show')); }
  async function until(sec) { const w = sec * 1000 - (Date.now() - t0); if (w > 0) await sleep(w); }

  // ---------- 0:00–0:20 · the ground-only blind spot ----------
  await cap('CANOPYGUARD · SPRAY OR WAIT?', 'A single 5-ft weather station can say “looks OK” while the air above the orchard says stop.');
  await moveTo(900, 500, 800);
  await sleep(2200);
  await scrollTo(560);
  await cap('THE BLIND SPOT · SIMULATED SCENARIO', 'Hidden-inversion scenario: 5-ft wind 5.0 mph sits inside the 3–10 mph range → the ground-only check reads LOOKS OK.');
  const gv = await center('#groundVerdict');
  await moveTo(gv.x, gv.y, 900);
  await until(12);
  const mv = await center('#multiVerdict');
  await moveTo(mv.x, mv.y, 900);
  await cap('THE BLIND SPOT · SIMULATED SCENARIO', 'The paired 5 ft + 30 ft tower sees 78.1 °F aloft vs 73.0 °F near the ground — an inversion → STOP.');
  await until(20);

  // ---------- 0:20–0:55 · multi-height STOP + twin ----------
  await scrollTo(0, 900);
  await cap('DATA & REASONS FIRST', 'ΔT +5.1 °F (30 ft − 5 ft), 4.5 mph speed shear, 52° direction shift. Every STOP lists its reasons.');
  const hero = await center('#statusMain');
  await moveTo(hero.x + 40, hero.y, 800);
  await sleep(2500);
  const al = await center('#alerts');
  await moveTo(al.x, al.y - 20, 900);
  await until(30);
  await click('.navbtn[data-page="twin"]', 900);
  await cap('ATMOSPHERIC TWIN · ILLUSTRATIVE', 'Live-linked to the same readings: warm layer aloft, 5-ft and 30-ft wind arrows pointing downwind (readings are FROM).');
  await sleep(2500);
  const cv = await center('#twinCanvas');
  await moveTo(cv.x - 120, cv.y + 40, 700);
  await p.mouse.down();
  for (let i = 1; i <= 40; i++) { await p.mouse.move(cv.x - 120 + i * 6, cv.y + 40); await sleep(30); }
  await p.mouse.up(); mx = cv.x + 120; my = cv.y + 40;
  await sleep(600);
  await cap('ATMOSPHERIC TWIN · ILLUSTRATIVE', 'Drag to orbit, zoom, pause. Tracers explain stratification only — they are not spray, drift or concentration.');
  await click('#zoomIn', 350); await click('#zoomIn', 600);
  await click('#scenePlay', 1200);
  await click('#scenePlay', 600);
  await until(52);
  await click('#resetOrbit', 400);
  await until(55);

  // ---------- 0:55–1:25 · boundary lens ----------
  await click('.navbtn[data-page="boundary"]', 900);
  await cap('BOUNDARY LENS · SCREENING ONLY', 'Sectors show where each height’s wind blows TOWARD (±29°). Neighboring homes sit in the 30-ft sector.');
  await sleep(1200);
  const homes = await center('#boundarySVG [data-receptor="homes"]');
  await moveTo(homes.x, homes.y, 900);
  await sleep(4200);
  const target = await p.$eval('#boundarySVG', (s) => { const pt = new DOMPoint(840, 250).matrixTransform(s.getScreenCTM()); return { x: pt.x, y: pt.y }; });
  await cap('BOUNDARY LENS · SCREENING ONLY', 'Drag a receptor upwind and its alignment updates instantly — the list and count use the same rule as the map.');
  await p.mouse.down();
  await moveTo(target.x, target.y, 1800);
  await p.mouse.up();
  await sleep(3500);
  const list = await center('#receptorList');
  await moveTo(list.x, list.y, 900);
  await until(76);
  await cap('BOUNDARY LENS · SCREENING ONLY', 'Schematic only: not a map, plume, distance, exposure or regulatory buffer prediction.');
  await click('#boundaryReset', 1200);
  await until(85);

  // ---------- 1:25–1:55 · replay ----------
  await click('.navbtn[data-page="replay"]', 800);
  await cap('MORNING REPLAY · 17 SYNTHETIC FRAMES', 'A scripted 05:30–09:30 morning. Each frame runs through the same engine as the live dashboard.');
  await sleep(1000);
  await click('#replayPlay', 300);
  await sleep(6000);
  await cap('MORNING REPLAY · 17 SYNTHETIC FRAMES', 'Watch the verdict change as the inversion erodes — STOP turns to GO when 30 ft is no longer warmer.');
  await until(103);
  await click('#replayTimeline button[data-frame="13"]', 1400);
  await cap('MORNING REPLAY · 17 SYNTHETIC FRAMES', 'Pick a frame and apply it to the live dashboard; it is logged with a timestamp. Synthetic — not a forecast.');
  await sleep(1500);
  await click('#replayApply', 600);
  await sleep(1500);
  await scrollTo(0, 400);
  await until(115);

  // ---------- 1:55–2:27 · evidence lab ----------
  await hideToast();
  await click('.navbtn[data-page="validation"]', 900);
  await cap('EVIDENCE LAB · 40 SYNTHETIC CASES', '40/40 labeled synthetic rule checks pass in the browser — the same engine file the Node regression suite runs.');
  const k = await center('#benchPassed');
  await moveTo(k.x, k.y, 800);
  await sleep(2500);
  const k2 = await center('#benchMissed');
  await moveTo(k2.x, k2.y, 800);
  await cap('EVIDENCE LAB · 40 SYNTHETIC CASES', '21 constructed cases hide a caution or stop from a ground-only wind screen. Constructed examples — not field accuracy.');
  await sleep(2500);
  const sel = await center('#validationFilter');
  await moveTo(sel.x, sel.y, 700);
  await p.selectOption('#validationFilter', 'ground-blind');
  await sleep(2400);
  await until(140);
  await cap('EVIDENCE LAB · 40 SYNTHETIC CASES', 'Load any case: the live dashboard, twin and log update together.');
  await click('#benchmarkTable tr:nth-child(3) [data-case]', 1500);
  await scrollTo(0, 400);
  await until(147);

  // ---------- 2:27–2:50 · log + export ----------
  await hideToast();
  await click('#captureTop', 900);
  await click('.navbtn[data-page="log"]', 900);
  await cap('DECISION LOG · BROWSER-LOCAL', 'Every decision is timestamped with its readings, reasons and data source — scenarios, replay and benchmark loads included.');
  await sleep(2800);
  const [dl] = await Promise.all([p.waitForEvent('download'), click('#exportCsv', 300)]);
  await dl.saveAs(path.join(OUT, 'demo-export-' + dl.suggestedFilename()));
  await cap('DECISION LOG · BROWSER-LOCAL', 'CSV / JSON export in UTC. Local records — not a regulatory or tamper-evident record.');
  await until(161);
  await click('.navbtn[data-page="overview"]', 600);
  await scrollTo(0, 300);
  await cap('CANOPYGUARD 2.1', 'See the inversion a ground station misses — explained, logged, exportable. Weather screening only; labels and on-site checks still govern.');
  await until(170);
  await cap(null, null);
  await sleep(300);
  const dur = now();

  fs.writeFileSync(path.join(OUT, 'cues.json'), JSON.stringify({ offset: (t0 - ffStart) / 1000, duration: dur, cues, consoleErrors: log.consoleErrors, pageErrors: log.pageErrors, failedRequests: log.failedRequests }, null, 2));
  await context.close();
  ff.stdin.write('q');
  await new Promise((r) => ff.on('close', r));
  console.log('recorded', dur.toFixed(1), 's; errors:', log.pageErrors.length + log.consoleErrors.length);
})();
