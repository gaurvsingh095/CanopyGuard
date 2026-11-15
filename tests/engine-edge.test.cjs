'use strict';
// Edge-case and property tests for the decision engine.
// Expectations are written by hand from the rule specification (README "Model/rules disclaimer"),
// and the fuzz test uses an independent re-implementation as an oracle, so these tests do not
// simply echo the engine's own output.
const path = require('path');
const assert = require('assert');
const E = require(path.join(__dirname, '..', 'src', 'js', 'engine.js'));

const BASE = Object.freeze({ tLow: 76, tHigh: 74, wLow: 5.5, wHigh: 6, dLow: 80, dHigh: 90, ageLow: 1, ageHigh: 1, volatility: 'low', windMin: 3, windMax: 10, method: 'Airblast sprayer' });
const r = (patch) => E.assess(Object.assign({}, BASE, patch));
const codes = (x) => x.alerts.map((a) => a.code);

let n = 0, failed = 0;
function t(name, fn) {
  n++;
  try { fn(); } catch (e) { failed++; console.error('FAIL', name, '—', e.message); }
}

// --- wind-speed limits are inclusive: exactly 3 and exactly 10 mph pass ---
t('lower wind exactly 3 mph passes', () => assert.strictEqual(r({ wLow: 3, wHigh: 3 }).status, 'GO'));
t('both winds exactly 10 mph pass', () => assert.strictEqual(r({ wLow: 10, wHigh: 10 }).status, 'GO'));
t('2.99 mph is LOW_WIND STOP', () => { const x = r({ wLow: 2.99, wHigh: 3.5 }); assert.strictEqual(x.status, 'STOP'); assert(codes(x).includes('LOW_WIND')); });
t('10.01 mph upper is HIGH_WIND STOP', () => { const x = r({ wLow: 9, wHigh: 10.01 }); assert.strictEqual(x.status, 'STOP'); assert(codes(x).includes('HIGH_WIND')); });
t('upper-only high wind is invisible to ground screen', () => { const x = r({ wLow: 6, wHigh: 10.5 }); assert.strictEqual(x.ground, 'LOOKS OK'); assert.strictEqual(x.status, 'STOP'); });
t('custom limits respected (2–15 mph)', () => assert.strictEqual(r({ windMin: 2, windMax: 15, wLow: 2.5, wHigh: 3 }).status, 'GO'));

// --- temperature: equal is not an inversion; any positive ΔT is ---
t('equal temperatures → no inversion', () => assert(!codes(r({ tLow: 70, tHigh: 70 })).includes('INVERSION')));
t('+0.1 °F → INVERSION STOP', () => { const x = r({ tLow: 70, tHigh: 70.1 }); assert.strictEqual(x.status, 'STOP'); assert(codes(x).includes('INVERSION')); });
t('float noise does not create inversion (0.1+0.2 vs 0.3)', () => assert(!codes(r({ tLow: 0.1 + 0.2, tHigh: 0.3 })).includes('INVERSION')));
t('negative temperatures handled', () => assert(codes(r({ tLow: -10, tHigh: -8 })).includes('INVERSION')));
t('anchor demo 73 / 78.1 °F, 5 mph → STOP with inversion, ground LOOKS OK', () => {
  const x = E.assess({ tLow: 73, tHigh: 78.1, wLow: 5, wHigh: 9.5, dLow: 85, dHigh: 137, ageLow: 1, ageHigh: 1, volatility: 'low', windMin: 3, windMax: 10 });
  assert.strictEqual(x.status, 'STOP'); assert.strictEqual(x.ground, 'LOOKS OK'); assert(codes(x).includes('INVERSION'));
  assert.strictEqual(x.delta, 5.1);
});

// --- circular wind direction ---
t('359° vs 1° is a 2° difference (no shear)', () => { const x = r({ dLow: 359, dHigh: 1 }); assert.strictEqual(x.turn, 2); assert.strictEqual(x.status, 'GO'); });
t('0° and 360° are the same bearing', () => assert.strictEqual(r({ dLow: 0, dHigh: 360 }).turn, 0));
t('350° vs 35° = 45° → CAUTION SHEAR', () => { const x = r({ dLow: 350, dHigh: 35 }); assert.strictEqual(x.turn, 45); assert.strictEqual(x.status, 'CAUTION'); });
t('10° vs 280° = 90° → SEVERE_SHEAR STOP', () => { const x = r({ dLow: 10, dHigh: 280 }); assert.strictEqual(x.turn, 90); assert(codes(x).includes('SEVERE_SHEAR')); });
t('44° turn stays GO', () => assert.strictEqual(r({ dLow: 0, dHigh: 44 }).status, 'GO'));
t('direction 361° is invalid', () => assert(codes(r({ dHigh: 361 })).includes('INVALID')));
t('direction -1° is invalid', () => assert(codes(r({ dLow: -1 })).includes('INVALID')));

// --- speed shear thresholds with float noise ---
t('gap 10.1−4.1 counts as 6 mph (SEVERE)', () => assert(codes(r({ wLow: 4.1, wHigh: 10.1 })).includes('SEVERE_SHEAR')));
t('gap exactly 4 mph → CAUTION', () => assert.strictEqual(r({ wLow: 4, wHigh: 8 }).status, 'CAUTION'));
t('gap 3.9 mph → GO', () => assert.strictEqual(r({ wLow: 4, wHigh: 7.9 }).status, 'GO'));

// --- missing / invalid critical values never produce GO ---
const critical = ['tLow', 'tHigh', 'wLow', 'wHigh', 'dLow', 'dHigh', 'ageLow', 'ageHigh', 'windMin', 'windMax'];
for (const k of critical) {
  for (const [label, bad] of [['undefined', undefined], ['null', null], ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['numeric string', '5'], ['empty string', ''], ['object', {}]]) {
    t(`${k}=${label} → INVALID STOP, ground UNKNOWN`, () => {
      const x = r({ [k]: bad });
      assert.strictEqual(x.status, 'STOP'); assert.deepStrictEqual(codes(x), ['INVALID']); assert.strictEqual(x.ground, 'UNKNOWN');
    });
  }
}
t('absent sensor fields (key deleted) → INVALID', () => { const d = Object.assign({}, BASE); delete d.tHigh; delete d.wHigh; assert.strictEqual(E.assess(d).status, 'STOP'); });
t('null / non-object input → INVALID', () => { assert.strictEqual(E.assess(null).status, 'STOP'); assert.strictEqual(E.assess('x').status, 'STOP'); });
t('implausible temperature 500 °F → INVALID', () => assert(codes(r({ tHigh: 500 })).includes('INVALID')));
t('implausible temperature −100 °F → INVALID', () => assert(codes(r({ tLow: -100 })).includes('INVALID')));
t('negative wind speed → INVALID', () => assert(codes(r({ wLow: -1 })).includes('INVALID')));
t('wind 200 mph → INVALID', () => assert(codes(r({ wHigh: 200 })).includes('INVALID')));
t('windMax ≤ windMin → INVALID', () => assert(codes(r({ windMin: 5, windMax: 5 })).includes('INVALID')));
t('unknown volatility value → INVALID', () => assert(codes(r({ volatility: 'extreme' })).includes('INVALID')));
t('INVALID message names the bad field', () => assert(/30-ft temperature/.test(r({ tHigh: NaN }).alerts[0].msg)));

// --- freshness / timestamps ---
t('age exactly 10 min is fresh', () => assert.strictEqual(r({ ageLow: 10, ageHigh: 10 }).status, 'GO'));
t('age 10.1 min → STALE STOP', () => { const x = r({ ageHigh: 10.1 }); assert.strictEqual(x.status, 'STOP'); assert(codes(x).includes('STALE')); });
t('very old reading (1 week) → STALE', () => assert(codes(r({ ageLow: 10080 })).includes('STALE')));
t('negative age (future timestamp) → INVALID', () => assert(codes(r({ ageLow: -5 })).includes('INVALID')));
t('stale + ground-looks-ok is still STOP', () => { const x = r({ ageLow: 30 }); assert.strictEqual(x.ground, 'LOOKS OK'); assert.strictEqual(x.status, 'STOP'); });

// --- volatility & ordering ---
t('medium volatility alone → CAUTION', () => assert.strictEqual(r({ volatility: 'medium' }).status, 'CAUTION'));
t('volatility undefined treated as low', () => { const d = Object.assign({}, BASE); delete d.volatility; assert.strictEqual(E.assess(d).status, 'GO'); });
t('STOP alerts are listed before CAUTION alerts', () => {
  const x = r({ tHigh: 80, wLow: 4, wHigh: 8, volatility: 'high' });
  const levels = x.alerts.map((a) => a.level);
  assert.deepStrictEqual(levels, levels.slice().sort((a, b) => (a === 'STOP' ? 0 : 1) - (b === 'STOP' ? 0 : 1)));
});
t('every non-GO result carries at least one reason', () => assert(r({ tHigh: 99 }).alerts.length > 0));
t('GO result has zero alerts', () => assert.strictEqual(r({}).alerts.length, 0));

// --- independent oracle fuzz (20,000 random inputs incl. invalid ones) ---
function oracle(d) {
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const ok =
    ['tLow', 'tHigh'].every((k) => num(d[k]) && d[k] >= -60 && d[k] <= 140) &&
    ['wLow', 'wHigh'].every((k) => num(d[k]) && d[k] >= 0 && d[k] <= 150) &&
    ['dLow', 'dHigh'].every((k) => num(d[k]) && d[k] >= 0 && d[k] <= 360) &&
    ['ageLow', 'ageHigh'].every((k) => num(d[k]) && d[k] >= 0) &&
    num(d.windMin) && num(d.windMax) && d.windMin >= 0 && d.windMax <= 150 && d.windMax > d.windMin &&
    (d.volatility === undefined || ['low', 'medium', 'high'].includes(d.volatility));
  if (!ok) return 'STOP';
  const r3 = (v) => Math.round(v * 1000) / 1000;
  let diff = Math.abs(d.dLow - d.dHigh) % 360; if (diff > 180) diff = 360 - diff;
  const gap = r3(Math.abs(d.wHigh - d.wLow)), turn = r3(diff), dT = r3(d.tHigh - d.tLow);
  const stop = d.ageLow > 10 || d.ageHigh > 10 || dT > 0 || Math.min(d.wLow, d.wHigh) < d.windMin || Math.max(d.wLow, d.wHigh) > d.windMax || gap >= 6 || turn >= 90;
  if (stop) return 'STOP';
  if (gap >= 4 || turn >= 45 || d.volatility === 'medium' || d.volatility === 'high') return 'CAUTION';
  return 'GO';
}
let seed = 20261115;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pickOne = (a) => a[Math.floor(rnd() * a.length)];
t('20,000-input fuzz agrees with independent oracle; GO never from invalid input', () => {
  for (let i = 0; i < 20000; i++) {
    const d = {
      tLow: 40 + rnd() * 60, tHigh: 40 + rnd() * 60, wLow: rnd() * 14, wHigh: rnd() * 14,
      dLow: Math.round(rnd() * 360), dHigh: Math.round(rnd() * 360), ageLow: rnd() * 14, ageHigh: rnd() * 14,
      volatility: pickOne(['low', 'low', 'medium', 'high']), windMin: 3, windMax: 10,
    };
    if (rnd() < 0.5) d.tHigh = d.tLow - rnd() * 3; // more non-inverted samples
    if (rnd() < 0.1) d[pickOne(critical)] = pickOne([NaN, null, undefined, Infinity, -3, 999, '7']);
    const got = E.assess(d).status, want = oracle(d);
    if (got !== want) throw Error(`#${i} engine ${got} vs oracle ${want}: ${JSON.stringify(d)}`);
  }
});

console.log(`${n - failed}/${n} engine edge-case & property tests passed`);
if (failed) process.exitCode = 1;
