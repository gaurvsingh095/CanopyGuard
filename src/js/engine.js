/* CanopyGuard decision engine — the single source of truth for GO / CAUTION / STOP.
 * This exact file is inlined into index.html by tools/build.cjs and loaded directly by the
 * Node regression suites (tests/*.cjs), so the browser and the tests always run the same rules.
 * Weather screening only: GO never authorizes an application. */
(function (root) {
  'use strict';

  var ENGINE_VERSION = '2.1.0';

  // Prototype heuristics, not regulatory or label thresholds (see Science & limits).
  var RULES = Object.freeze({
    staleMinutes: 10, // a sensor reading older than this (minutes) is STALE
    shearCautionMph: 4,
    shearStopMph: 6,
    turnCautionDeg: 45,
    turnStopDeg: 90,
  });

  // Physically plausible input ranges. Values outside are treated as sensor/entry faults.
  var PLAUSIBLE = Object.freeze({
    tempF: [-60, 140],
    windMph: [0, 150],
    dirDeg: [0, 360],
    limitMph: [0, 150],
  });

  var VOLATILITY = ['low', 'medium', 'high'];

  var FIELDS = [
    ['tLow', '5-ft temperature', 'tempF'],
    ['tHigh', '30-ft temperature', 'tempF'],
    ['wLow', '5-ft wind speed', 'windMph'],
    ['wHigh', '30-ft wind speed', 'windMph'],
    ['dLow', '5-ft wind direction', 'dirDeg'],
    ['dHigh', '30-ft wind direction', 'dirDeg'],
    ['ageLow', '5-ft sensor age', 'age'],
    ['ageHigh', '30-ft sensor age', 'age'],
    ['windMin', 'minimum wind limit', 'limitMph'],
    ['windMax', 'maximum wind limit', 'limitMph'],
  ];

  // Round away binary floating-point noise (e.g. 10.1 - 4.1) before threshold comparisons.
  function clean(v) {
    return Math.round(v * 1000) / 1000;
  }

  function fixed(v, n) {
    return Number(v).toFixed(n === undefined ? 1 : n);
  }

  // Shortest angle between two bearings, 0–180°. 359° vs 1° → 2°.
  function circularDiff(a, b) {
    var d = Math.abs((((a - b) % 360) + 360) % 360);
    return Math.min(d, 360 - d);
  }

  // Returns a list of human-readable input problems (empty when every critical value is usable).
  function validate(d) {
    var problems = [];
    if (!d || typeof d !== 'object') return ['no readings supplied'];
    FIELDS.forEach(function (f) {
      var v = d[f[0]];
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        problems.push(f[1] + ' is missing or non-numeric');
        return;
      }
      if (f[2] === 'age') {
        if (v < 0) problems.push(f[1] + ' is negative (timestamp in the future)');
        return;
      }
      var range = PLAUSIBLE[f[2]];
      if (v < range[0] || v > range[1]) problems.push(f[1] + ' is outside ' + range[0] + '–' + range[1]);
    });
    if (
      typeof d.windMin === 'number' &&
      typeof d.windMax === 'number' &&
      Number.isFinite(d.windMin) &&
      Number.isFinite(d.windMax) &&
      d.windMax <= d.windMin
    )
      problems.push('maximum wind limit must be greater than the minimum');
    if (d.volatility !== undefined && VOLATILITY.indexOf(d.volatility) < 0)
      problems.push('product volatility "' + String(d.volatility).slice(0, 20) + '" is not recognised');
    return problems;
  }

  function assess(d) {
    var alerts = [];
    var problems = validate(d);
    if (problems.length) {
      alerts.push({
        level: 'STOP',
        code: 'INVALID',
        title: 'Invalid or missing tower readings',
        msg:
          'Cannot screen: ' +
          problems.slice(0, 3).join('; ') +
          (problems.length > 3 ? ' (+' + (problems.length - 3) + ' more)' : '') +
          '. Do not rely on this assessment until the readings are corrected.',
      });
      return {
        status: 'STOP',
        alerts: alerts,
        delta: NaN,
        windGap: NaN,
        turn: NaN,
        ground: 'UNKNOWN',
        problems: problems,
        engineVersion: ENGINE_VERSION,
      };
    }

    var delta = clean(d.tHigh - d.tLow);
    var gap = clean(Math.abs(d.wHigh - d.wLow));
    var turn = clean(circularDiff(d.dLow, d.dHigh));
    var ground = d.wLow < d.windMin || d.wLow > d.windMax ? 'STOP' : 'LOOKS OK';

    if (d.ageLow > RULES.staleMinutes || d.ageHigh > RULES.staleMinutes)
      alerts.push({
        level: 'STOP',
        code: 'STALE',
        title: 'Sensor readings are stale',
        msg:
          'At least one sensor is older than ' +
          RULES.staleMinutes +
          ' minutes (5 ft: ' +
          fixed(d.ageLow, 0) +
          ' min, 30 ft: ' +
          fixed(d.ageHigh, 0) +
          ' min). Refresh or inspect the sensor tower before any application.',
      });
    if (delta > 0)
      alerts.push({
        level: 'STOP',
        code: 'INVERSION',
        title: 'Temperature inversion detected',
        msg:
          'Upper air (30 ft) is ' +
          fixed(delta) +
          '°F warmer than air near the ground (5 ft). Stable layers may trap fine droplets and allow lateral drift.',
      });
    if (d.wLow < d.windMin || d.wHigh < d.windMin)
      alerts.push({
        level: 'STOP',
        code: 'LOW_WIND',
        title: 'Wind below the configured minimum',
        msg:
          'At least one height measures below ' +
          fixed(d.windMin) +
          ' mph (5 ft: ' +
          fixed(d.wLow) +
          ', 30 ft: ' +
          fixed(d.wHigh) +
          ' mph). Calm air may indicate weak mixing or variable drift.',
      });
    if (d.wLow > d.windMax || d.wHigh > d.windMax)
      alerts.push({
        level: 'STOP',
        code: 'HIGH_WIND',
        title: 'Wind above the configured maximum',
        msg:
          'At least one height exceeds ' +
          fixed(d.windMax) +
          ' mph (5 ft: ' +
          fixed(d.wLow) +
          ', 30 ft: ' +
          fixed(d.wHigh) +
          ' mph). Follow the product label; this screen does not pass.',
      });
    if (gap >= RULES.shearStopMph || turn >= RULES.turnStopDeg)
      alerts.push({
        level: 'STOP',
        code: 'SEVERE_SHEAR',
        title: 'Severe vertical wind shear',
        msg:
          'The two heights differ by ' +
          fixed(gap) +
          ' mph and ' +
          Math.round(turn) +
          '°. This prototype conservatively flags severe vertical separation as STOP.',
      });
    else if (gap >= RULES.shearCautionMph || turn >= RULES.turnCautionDeg)
      alerts.push({
        level: 'CAUTION',
        code: 'SHEAR',
        title: 'Wind changes substantially with height',
        msg:
          'The wind differs by ' +
          fixed(gap) +
          ' mph and ' +
          Math.round(turn) +
          '° between heights, which a ground-only station cannot see.',
      });
    if (d.volatility === 'medium' || d.volatility === 'high')
      alerts.push({
        level: 'CAUTION',
        code: 'VOLATILITY',
        title: 'Check product volatility and label',
        msg:
          'Selected volatility is ' +
          d.volatility +
          '. Vapor drift can continue after spraying; review the actual product requirements and conditions.',
      });

    var status = alerts.some(function (a) {
      return a.level === 'STOP';
    })
      ? 'STOP'
      : alerts.length
        ? 'CAUTION'
        : 'GO';
    return {
      status: status,
      alerts: alerts,
      delta: delta,
      windGap: gap,
      turn: turn,
      ground: ground,
      problems: [],
      engineVersion: ENGINE_VERSION,
    };
  }

  var api = {
    ENGINE_VERSION: ENGINE_VERSION,
    RULES: RULES,
    PLAUSIBLE: PLAUSIBLE,
    VOLATILITY: VOLATILITY,
    assess: assess,
    validate: validate,
    circularDiff: circularDiff,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CanopyGuardEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
