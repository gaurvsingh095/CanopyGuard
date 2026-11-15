'use strict';
// Reproducible 40-case synthetic rule benchmark.
// Runs the cases against BOTH the source engine (src/js/engine.js) and the copy inlined into the
// deployable index.html, and fails if the two differ by a single byte — so the deployed app and
// the tests cannot silently diverge.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const engineSrc = fs.readFileSync(path.join(__dirname, 'src/js/engine.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
if (!html.includes(engineSrc)) {
  console.error('FAIL: the engine inlined in index.html differs from src/js/engine.js. Run `npm run build`.');
  process.exit(1);
}
// Load the engine exactly as the browser does (global script, no module system).
const ctx = vm.createContext({});
vm.runInContext(engineSrc, ctx, { filename: 'src/js/engine.js' });
const engine = ctx.CanopyGuardEngine;

const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, 'validation-cases.json'), 'utf8'));
// The app inlines the same JSON at build time; confirm that copy matches too.
const inlined = html.match(/window\.CANOPY_BENCHMARK=(\[[\s\S]*?\]);\s*<\/script>/);
assert(inlined, 'benchmark not found in index.html');
assert.deepStrictEqual(JSON.parse(inlined[1]), dataset.cases, 'index.html benchmark differs from validation-cases.json');

const cases = dataset.cases;
let passed = 0, missed = 0, stopped = 0;
for (const c of cases) {
  const r = engine.assess(c.readings);
  const codes = r.alerts.map((a) => a.code);
  try {
    assert.strictEqual(r.status, c.expected, `${c.id}: expected ${c.expected} got ${r.status}`);
    if (c.expectedCode) assert(codes.includes(c.expectedCode), `${c.id}: expected ${c.expectedCode}; got ${codes}`);
    passed++;
    if (r.ground === 'LOOKS OK' && r.status !== 'GO') missed++;
    if (r.status === 'STOP') stopped++;
  } catch (e) {
    console.error('FAIL:', e.message);
    process.exitCode = 1;
  }
}
console.log(`Engine v${engine.ENGINE_VERSION} · index.html engine is byte-identical to src/js/engine.js`);
console.log(`${passed}/${cases.length} labeled synthetic cases passed`);
console.log(`${missed} cases surfaced a caution/stop invisible to a ground-only wind screen; ${stopped} labeled STOP.`);
console.log('Note: synthetic, rule-specification labels — not field accuracy, sensitivity or precision.');
if (passed !== cases.length) process.exitCode = 1;
