/* CanopyGuard core UI: overview, weather lab, window planner, decision log, navigation.
 * All GO / CAUTION / STOP results come from window.CanopyGuardEngine (src/js/engine.js). */
(function () {
  'use strict';
  var Engine = window.CanopyGuardEngine;
  if (!Engine) throw Error('CanopyGuard engine failed to load');
  var assess = Engine.assess;

  var LOG_KEY = 'canopyguard-audit-v1';
  var LOG_LIMIT = 300;
  var IMPORT_MAX_BYTES = 1024 * 1024;
  var STATUSES = ['GO', 'CAUTION', 'STOP'];

  // Demonstration scenarios. Every value here is simulated, never a real orchard reading.
  var DEMOS = [
    { key: 'inversion', name: 'Hidden inversion', note: 'Ground reads safe', values: [73, 78.1, 5, 9.5, 85, 137, 1, 1, 'low'] },
    { key: 'shear', name: 'Upper wind shear', note: 'Direction reverses', values: [75, 73.8, 5.1, 8.6, 40, 148, 1, 1, 'low'] },
    { key: 'calm', name: 'Calm air', note: 'Too little mixing', values: [71, 70.1, 1.6, 2, 105, 125, 1, 1, 'low'] },
    { key: 'gusty', name: 'Strong upper wind', note: 'Canopy exceeds limit', values: [77, 75, 6.1, 12.3, 80, 95, 1, 1, 'low'] },
    { key: 'clear', name: 'Clear conditions', note: 'No demo triggers', values: [77.5, 75, 5.5, 6.4, 110, 124, 1, 1, 'low'] },
    { key: 'volatile', name: 'Volatile product', note: 'Extra product caution', values: [80, 78, 5.3, 6.1, 80, 95, 1, 1, 'high'] },
    { key: 'stale', name: 'Sensor offline', note: 'Fail-safe decision', values: [76, 75, 5.5, 6.7, 90, 97, 1, 19, 'low'] },
  ];

  var SOURCES = {
    simulated: { pill: 'SIMULATED READINGS', side: 'Simulated readings' },
    manual: { pill: 'MANUAL ENTRY', side: 'Manually entered readings' },
    imported: { pill: 'IMPORTED FILE', side: 'Readings from imported file' },
  };

  var state = {
    data: demoClone(DEMOS[0]),
    scenario: 'inversion',
    source: 'simulated',
    history: [],
    forecasts: null,
    forecastKind: 'sample',
    storageWarned: false,
  };
  var listeners = [];

  var inputNames = ['tempLow', 'tempHigh', 'speedLow', 'speedHigh', 'dirLow', 'dirHigh', 'ageLow', 'ageHigh', 'volatility', 'windMin', 'windMax', 'method'];
  var dataKeys = ['tLow', 'tHigh', 'wLow', 'wHigh', 'dLow', 'dHigh', 'ageLow', 'ageHigh', 'volatility', 'windMin', 'windMax', 'method'];

  var $ = function (id) {
    return document.getElementById(id);
  };

  function demoClone(x) {
    return {
      tLow: x.values[0], tHigh: x.values[1], wLow: x.values[2], wHigh: x.values[3],
      dLow: x.values[4], dHigh: x.values[5], ageLow: x.values[6], ageHigh: x.values[7],
      volatility: x.values[8], windMin: 3, windMax: 10, method: 'Airblast sprayer',
    };
  }
  function escapeHtml(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (s) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[s];
    });
  }
  // Number formatter that never prints NaN / Infinity.
  function rnd(v, n) {
    var x = typeof v === 'number' ? v : NaN;
    return Number.isFinite(x) ? x.toFixed(n === undefined ? 1 : n) : '—';
  }
  function deg(v) {
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) + '°' : '—°';
  }
  function tzLabel(date) {
    try {
      var part = new Intl.DateTimeFormat([], { timeZoneName: 'short' }).formatToParts(date).find(function (p) {
        return p.type === 'timeZoneName';
      });
      return part ? part.value : '';
    } catch (e) {
      return '';
    }
  }
  function clock() {
    var now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + tzLabel(now);
  }
  function localStamp(iso) {
    var d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return 'Unknown time';
    return d.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
  }
  function pClass(s) {
    return s === 'STOP' ? 'stop' : s === 'CAUTION' ? 'caution' : 'go';
  }

  function syncInputs() {
    var d = state.data;
    inputNames.forEach(function (k, i) {
      var v = d[dataKeys[i]];
      $(k).value = typeof v === 'number' ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '') : v == null ? '' : v;
      $(k).removeAttribute('aria-invalid');
    });
  }
  function readInputs() {
    var num = function (x) {
      return String(x).trim() === '' ? NaN : Number(x);
    };
    var d = {};
    inputNames.forEach(function (k, i) {
      var raw = $(k).value;
      d[dataKeys[i]] = k === 'volatility' || k === 'method' ? raw : num(raw);
    });
    state.data = d;
  }
  function markInvalidInputs() {
    var d = state.data,
      ranges = { tLow: 'tempF', tHigh: 'tempF', wLow: 'windMph', wHigh: 'windMph', dLow: 'dirDeg', dHigh: 'dirDeg', windMin: 'limitMph', windMax: 'limitMph' };
    inputNames.forEach(function (k, i) {
      var key = dataKeys[i],
        v = d[key],
        bad = false;
      if (k === 'volatility' || k === 'method') return;
      if (typeof v !== 'number' || !Number.isFinite(v)) bad = true;
      else if (ranges[key]) {
        var r = Engine.PLAUSIBLE[ranges[key]];
        bad = v < r[0] || v > r[1];
      } else bad = v < 0;
      if (key === 'windMax' && Number.isFinite(d.windMin) && v <= d.windMin) bad = true;
      if (bad) $(k).setAttribute('aria-invalid', 'true');
      else $(k).removeAttribute('aria-invalid');
    });
  }

  // ---------- browser-local decision log ----------
  function sanitizeEntry(x) {
    if (!x || typeof x !== 'object') return null;
    if (STATUSES.indexOf(x.status) < 0) return null;
    if (!Number.isFinite(new Date(x.at).getTime())) return null;
    return {
      at: String(x.at),
      kind: String(x.kind || 'assessment').slice(0, 80),
      source: String(x.source || 'unknown').slice(0, 40),
      status: x.status,
      codes: Array.isArray(x.codes) ? x.codes.map(String).slice(0, 12) : [],
      reasons: Array.isArray(x.reasons) ? x.reasons.map(String).slice(0, 12) : [],
      readings: x.readings && typeof x.readings === 'object' ? x.readings : {},
      engineVersion: x.engineVersion ? String(x.engineVersion).slice(0, 20) : undefined,
    };
  }
  function saveLog() {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(state.history.slice(0, LOG_LIMIT)));
      return true;
    } catch (e) {
      state.storageWarned = true;
      return false;
    }
  }
  function record(kind) {
    var r = assess(state.data);
    state.history.unshift({
      at: new Date().toISOString(),
      kind: kind || 'assessment',
      source: state.source,
      status: r.status,
      codes: r.alerts.map(function (a) { return a.code; }),
      reasons: r.alerts.map(function (a) { return a.title; }),
      readings: Object.assign({}, state.data),
      engineVersion: Engine.ENGINE_VERSION,
    });
    var trimmed = state.history.length > LOG_LIMIT;
    state.history = state.history.slice(0, LOG_LIMIT);
    var saved = saveLog();
    updateTables();
    toast('Decision recorded · ' + r.status + (trimmed ? ' · oldest entry rotated out (limit ' + LOG_LIMIT + ')' : '') +
      (saved ? '' : ' · browser storage is unavailable or full — export the log to keep it'));
  }

  // ---------- rendering ----------
  function render() {
    var d = state.data,
      r = assess(d),
      desc = r.alerts[0],
      ground = r.ground,
      valid = r.alerts.every(function (a) { return a.code !== 'INVALID'; }),
      inv = valid && r.delta > 0;
    $('statusMain').textContent = r.status;
    $('statusMain').className = 'status ' + pClass(r.status);
    $('statusSubtitle').textContent = desc ? desc.title : 'Weather screening: no configured triggers';
    $('statusExplain').textContent = desc
      ? desc.msg
      : 'Both measured heights are within configured limits. This is not spray clearance — verify the product label, site conditions and nearby sensitive areas.';
    $('tempMetric').textContent = Number.isFinite(r.delta) ? (r.delta > 0 ? '+' : '') + rnd(r.delta) + '°F' : '—';
    $('tempMetric').className = inv ? 'warning' : '';
    $('shearMetric').textContent = Number.isFinite(r.windGap) ? rnd(r.windGap) : '—';
    $('turnMetric').textContent = Number.isFinite(r.turn) ? Math.round(r.turn) + '°' : '—';
    $('triggersMetric').textContent = r.alerts.length;
    $('triggerDetail').textContent = r.status === 'GO' ? 'No configured alerts' : r.status === 'CAUTION' ? 'Review cautions' : 'Requires attention';
    $('lowerPair').textContent = rnd(d.tLow) + '°F';
    $('upperPair').textContent = rnd(d.tHigh) + '°F';
    $('lowerWind').textContent = rnd(d.wLow) + ' mph · from ' + deg(d.dLow);
    $('upperWind').textContent = rnd(d.wHigh) + ' mph · from ' + deg(d.dHigh);
    $('svgTopTemp').textContent = rnd(d.tHigh) + '°F';
    $('svgLowTemp').textContent = rnd(d.tLow) + '°F';
    $('svgTopTemp').setAttribute('fill', inv ? '#a55643' : '#44644f');
    $('svgTopWind').textContent = rnd(d.wHigh) + ' mph from ' + deg(d.dHigh);
    $('svgLowWind').textContent = rnd(d.wLow) + ' mph from ' + deg(d.dLow);
    $('heroLayer').setAttribute('opacity', inv ? '1' : '0.12');
    $('heroLayerLabel').textContent = !valid ? 'READINGS INVALID' : inv ? 'WARM AIR ALOFT' : 'NO WARM LAYER';
    $('heroLayerLabel').setAttribute('fill', inv ? '#f9b49b' : '#b9d7bd');
    $('profileSky').setAttribute('opacity', inv ? '.5' : '.12');
    $('groundVerdict').textContent = ground;
    $('groundVerdict').style.color = ground === 'LOOKS OK' ? '#3f7a52' : '#b64f43';
    $('groundText').textContent =
      ground === 'LOOKS OK'
        ? rnd(d.wLow) + ' mph is within your configured ground-level wind range. Temperature inversion and upper winds remain invisible.'
        : ground === 'UNKNOWN'
          ? 'Readings are missing or invalid, so even a ground-only screen cannot be evaluated.'
          : 'Lower wind at ' + rnd(d.wLow) + ' mph is outside the configured ' + rnd(d.windMin) + '–' + rnd(d.windMax) + ' mph range.';
    $('multiVerdict').textContent = r.status;
    $('multiVerdict').style.color = r.status === 'GO' ? '#3d835a' : r.status === 'CAUTION' ? '#9a6a1f' : '#b64f43';
    $('multiText').textContent = r.alerts.length
      ? r.alerts.map(function (a) { return a.title; }).slice(0, 2).join('; ') + (r.alerts.length > 2 ? ' (+' + (r.alerts.length - 2) + ' more).' : '.')
      : 'Both heights pass the configured weather checks. This is not spray clearance.';
    $('signalRow').innerHTML = r.alerts.length
      ? r.alerts.map(function (a) {
          return '<span class="signal ' + (a.level === 'CAUTION' ? 'caution' : '') + '">' + escapeHtml(a.level + ' · ' + a.code.replace(/_/g, ' ')) + '</span>';
        }).join('')
      : '<span class="signal good">NO CONFIGURED WEATHER TRIGGERS</span>';
    $('alerts').innerHTML = r.alerts.length
      ? r.alerts.map(function (a) {
          return '<div class="alert ' + (a.level === 'CAUTION' ? 'amber' : '') + '"><span class="alertIcon" aria-hidden="true">' + (a.level === 'STOP' ? '!' : '△') +
            '</span><div><h3>' + escapeHtml(a.title) + ' <small class="alertCode">' + escapeHtml(a.level + ' · ' + a.code) + '</small></h3><p>' + escapeHtml(a.msg) + '</p></div></div>';
        }).join('')
      : '<div class="alert green"><span class="alertIcon" aria-hidden="true">✓</span><div><h3>No triggers in measured conditions</h3><p>Configured limits currently pass. Still verify label requirements, calibration, neighboring areas and the orchard before application.</p></div></div>';
    $('labResult').textContent = r.status;
    $('labResult').className = 'tag ' + pClass(r.status);
    $('labReasons').textContent = r.alerts.length
      ? r.alerts.map(function (a) { return a.code; }).join(' · ')
      : 'No configured triggers';
    var src = SOURCES[state.source] || SOURCES.simulated;
    $('sourcePill').textContent = src.pill;
    $('sourceTitle').textContent = src.side;
    drawTrend();
    forecastRender();
    listeners.forEach(function (fn) {
      try { fn(r); } catch (e) { if (window.console) console.error(e); }
    });
  }

  function createScenarioButtons() {
    var box = $('scenarioGrid');
    box.innerHTML = DEMOS.map(function (s) {
      var sel = state.scenario === s.key;
      return '<button type="button" class="scenario ' + (sel ? 'selected' : '') + '" aria-pressed="' + sel + '" data-demo="' + s.key + '"><b>' +
        escapeHtml(s.name) + '</b><small>' + escapeHtml(s.note) + '</small></button>';
    }).join('');
    box.querySelectorAll('[data-demo]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var s = DEMOS.find(function (x) { return x.key === btn.dataset.demo; });
        loadScenario(s);
      });
    });
  }
  function loadScenario(s) {
    state.scenario = s.key;
    state.source = 'simulated';
    state.data = demoClone(s);
    syncInputs();
    render();
    createScenarioButtons();
    record('scenario:' + s.key);
  }

  // Illustrative 12-sample trend that ends exactly at the current readings.
  function drawTrend() {
    var canvas = $('trendCanvas');
    if (!canvas || !canvas.getContext) return;
    var w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    var ratio = Math.min(3, window.devicePixelRatio || 1),
      ctx = canvas.getContext('2d');
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var d = state.data;
    ctx.font = '600 12px DM Sans, sans-serif';
    if (!Number.isFinite(d.tLow) || !Number.isFinite(d.tHigh) || Math.abs(d.tLow) > 200 || Math.abs(d.tHigh) > 200) {
      ctx.fillStyle = '#8a3b2f';
      ctx.textAlign = 'center';
      ctx.fillText('No valid temperatures to chart — correct the readings in the Weather lab.', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }
    var low = [],
      high = [];
    for (var i = 0; i < 12; i++) {
      var k = (11 - i) / 11; // 1 at the oldest sample, 0 at "now"
      low.push(d.tLow + (Math.sin(i * 0.56 + 1) * 0.7 + 0.8) * k);
      high.push(d.tHigh + (Math.cos(i * 0.48) * 0.45 + 0.3) * k);
    }
    var values = low.concat(high),
      vmin = Math.floor(Math.min.apply(null, values) - 1),
      vmax = Math.ceil(Math.max.apply(null, values) + 1);
    if (vmax <= vmin) vmax = vmin + 1;
    var pL = 38, pR = 14, pT = 12, pB = 24;
    var xx = function (i) { return pL + ((w - pL - pR) * i) / 11; };
    var yy = function (v) { return pT + (h - pT - pB) * (1 - (v - vmin) / (vmax - vmin)); };
    ctx.font = '11px DM Sans, sans-serif';
    ctx.fillStyle = '#6f7f72';
    for (var j = 0; j <= 3; j++) {
      var y = pT + ((h - pT - pB) * j) / 3;
      ctx.strokeStyle = '#e8eee7';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pL, y);
      ctx.lineTo(w - pR, y);
      ctx.stroke();
      ctx.fillText(rnd(vmax - ((vmax - vmin) * j) / 3, 0) + '°F', 0, y + 4);
    }
    ctx.fillText('−55 min', pL, h - 5);
    ctx.textAlign = 'right';
    ctx.fillText('Now (current reading)', w - pR, h - 5);
    ctx.textAlign = 'left';
    [[low, '#4f8d6d'], [high, '#d9785a']].forEach(function (series) {
      ctx.beginPath();
      series[0].forEach(function (v, i) {
        if (i === 0) ctx.moveTo(xx(i), yy(v));
        else ctx.lineTo(xx(i), yy(v));
      });
      ctx.strokeStyle = series[1];
      ctx.lineWidth = 2.7;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(xx(11), yy(series[0][11]), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = series[1];
      ctx.fill();
    });
  }

  function tableMarkup(arr, compact) {
    if (!arr.length)
      return '<div class="emptyState"><b>No assessments recorded yet.</b><span>Load a scenario or press “Record decision” to add a timestamped entry.</span></div>';
    return '<table class="logtable"><thead><tr><th scope="col">TIME (' + escapeHtml(tzLabel(new Date()) || 'LOCAL') + ')</th><th scope="col">STATUS</th><th scope="col">5 FT</th><th scope="col">30 FT</th><th scope="col">ΔT</th><th scope="col" class="reason">REASONS</th><th scope="col">EVENT · SOURCE</th></tr></thead><tbody>' +
      arr.map(function (x) {
        var d = x.readings || {},
          dt = typeof d.tHigh === 'number' && typeof d.tLow === 'number' ? d.tHigh - d.tLow : NaN;
        return '<tr><td class="when">' + escapeHtml(localStamp(x.at)) + '</td><td><span class="tag ' + pClass(x.status) + '">' + escapeHtml(x.status) +
          '</span></td><td>' + rnd(d.tLow) + '°F · ' + rnd(d.wLow) + ' mph</td><td>' + rnd(d.tHigh) + '°F · ' + rnd(d.wHigh) + ' mph</td><td>' +
          (Number.isFinite(dt) ? (dt > 0 ? '+' : '') + rnd(dt) + '°F' : '—') + '</td><td class="reason">' +
          escapeHtml((x.reasons || []).join('; ') || 'No configured triggers') + '</td><td>' + escapeHtml(x.kind || 'assessment') +
          (compact ? '' : '<br><small>' + escapeHtml(x.source || 'unknown') + '</small>') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function updateTables() {
    $('recentTable').innerHTML = tableMarkup(state.history.slice(0, 4), true);
    $('fullLogTable').innerHTML = tableMarkup(state.history, false);
    $('logCount').textContent = state.history.length + ' / ' + LOG_LIMIT + ' entries';
    ['exportCsv', 'exportJson', 'printLog', 'clearLog'].forEach(function (id) {
      $(id).disabled = !state.history.length;
    });
  }

  // ---------- navigation ----------
  var TITLES = {
    overview: 'Spray decision overview',
    lab: 'Interactive weather lab',
    twin: '3D atmospheric digital twin',
    boundary: 'Boundary & receptor lens',
    replay: 'Weather evolution replay',
    validation: 'Evidence & validation laboratory',
    planner: 'Forecast window planner',
    log: 'Decision audit log',
    science: 'Methods & limitations',
  };
  var pageHooks = [];
  function displayPage(page, opts) {
    if (!TITLES[page] || !$(page)) page = 'overview';
    document.querySelectorAll('.contentPage').forEach(function (x) {
      x.classList.toggle('active', x.id === page);
    });
    document.querySelectorAll('[data-page]').forEach(function (x) {
      var on = x.dataset.page === page;
      x.classList.toggle('active', on);
      if (on) x.setAttribute('aria-current', 'page');
      else x.removeAttribute('aria-current');
    });
    $('pageTitle').textContent = TITLES[page];
    document.title = TITLES[page] + ' · CanopyGuard';
    closeMenu();
    if (!opts || !opts.fromHash) {
      if (location.hash.slice(1) !== page) {
        try { history.pushState(null, '', '#' + page); } catch (e) { /* file:// in some browsers */ }
      }
    }
    window.scrollTo(0, 0);
    if (opts && opts.focus) $('pageTitle').focus({ preventScroll: true });
    if (page === 'overview') setTimeout(drawTrend, 30);
    pageHooks.forEach(function (fn) { fn(page); });
  }
  function currentPage() {
    var a = document.querySelector('.contentPage.active');
    return a ? a.id : 'overview';
  }
  function openMenu() {
    $('sidebar').classList.add('open');
    document.body.classList.add('menuOpen');
    $('menuBtn').setAttribute('aria-expanded', 'true');
    var first = $('sidebar').querySelector('.navbtn');
    if (first) first.focus();
  }
  function closeMenu() {
    if (!$('sidebar').classList.contains('open')) return;
    $('sidebar').classList.remove('open');
    document.body.classList.remove('menuOpen');
    $('menuBtn').setAttribute('aria-expanded', 'false');
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, 3600);
  }
  function download(name, content, type) {
    var a = document.createElement('a'),
      url = URL.createObjectURL(new Blob([content], { type: type }));
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function fileStamp() {
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
  }

  // CSV with spreadsheet formula-injection protection (OWASP): text cells starting with = + - @ tab CR are prefixed with '.
  function csvCell(c) {
    if (c == null) return '""';
    if (typeof c === 'number') return Number.isFinite(c) ? String(c) : '""';
    var s = String(c);
    if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function csv() {
    var header = ['timestamp_utc', 'event', 'source', 'status', 'triggers', 'reasons', 't_5ft_F', 't_30ft_F', 'wind_5ft_mph', 'wind_30ft_mph',
      'wind_5ft_from_deg', 'wind_30ft_from_deg', 'sensor_5ft_age_min', 'sensor_30ft_age_min', 'volatility', 'wind_min_mph', 'wind_max_mph', 'method', 'engine_version'];
    var lines = [header.join(',')];
    state.history.forEach(function (x) {
      var d = x.readings || {};
      lines.push([x.at, x.kind, x.source, x.status, (x.codes || []).join('|'), (x.reasons || []).join('|'), d.tLow, d.tHigh, d.wLow, d.wHigh,
        d.dLow, d.dHigh, d.ageLow, d.ageHigh, d.volatility, d.windMin, d.windMax, d.method, x.engineVersion].map(csvCell).join(','));
    });
    return '﻿' + lines.join('\r\n');
  }
  function jsonExport() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      app: 'CanopyGuard',
      engineVersion: Engine.ENGINE_VERSION,
      note: 'Browser-local weather-screening log. Not a regulatory, tamper-evident or server-synchronized record. Default and scenario readings are simulated.',
      entries: state.history,
    }, null, 2);
  }

  // ---------- regional forecast (optional, Open-Meteo) ----------
  var FORECAST_TZ = 'America/Los_Angeles';
  function forecastTime(date) {
    try {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: FORECAST_TZ });
    } catch (e) {
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
  }
  function forecastRender() {
    var grid = $('forecastGrid');
    if (!grid) return;
    var now = new Date(),
      min = state.data.windMin,
      max = state.data.windMax,
      limitsOk = Number.isFinite(min) && Number.isFinite(max) && max > min;
    var arr = state.forecasts || Array.from({ length: 12 }, function (_, i) {
      var t = new Date(now.getTime() + (i + 1) * 3600000);
      t.setMinutes(0, 0, 0);
      return { date: t, wind: [5.1, 4.7, 3.8, 2.5, 3.4, 6.1, 8.3, 10.5, 9.1, 6.3, 5.3, 4.3][i], rain: [0, 0, 0, 0, 5, 7, 9, 15, 10, 6, 0, 0][i] };
    });
    $('forecastLimits').textContent = limitsOk
      ? 'Screening against your configured ' + rnd(min) + '–' + rnd(max) + ' mph wind limits and ≤20% rain probability · times in Pacific Time (Fresno)'
      : 'Wind limits in the Weather lab are invalid — no hour can be marked as a candidate.';
    grid.innerHTML = arr.slice(0, 12).map(function (f) {
      var windOk = Number.isFinite(f.wind),
        rainKnown = Number.isFinite(f.rain);
      var candidate = limitsOk && windOk && f.wind >= min && f.wind <= max && (!rainKnown || f.rain <= 20);
      var bad = limitsOk && windOk && (f.wind < min || f.wind > max || (rainKnown && f.rain > 20));
      var klass = candidate ? 'good' : bad ? 'bad' : 'unknown';
      return '<div class="forecastHour ' + klass + '"><b>' + escapeHtml(forecastTime(f.date)) + ' PT</b><strong>' + rnd(f.wind) +
        '<small> mph</small></strong><p>' + (rainKnown ? Math.round(f.rain) + '% rain chance' : 'Rain not available') + '</p><em>' +
        (candidate ? 'CANDIDATE TO RE-CHECK' : bad ? 'OUTSIDE LIMITS' : 'UNKNOWN') + '</em></div>';
    }).join('');
  }
  function timeoutSignal(ms) {
    if (window.AbortSignal && AbortSignal.timeout) return { signal: AbortSignal.timeout(ms), cancel: function () {} };
    var c = new AbortController(),
      t = setTimeout(function () { c.abort(); }, ms);
    return { signal: c.signal, cancel: function () { clearTimeout(t); } };
  }
  async function loadRegional() {
    var b = $('loadForecast');
    b.disabled = true;
    b.textContent = 'Fetching regional forecast…';
    $('forecastStatus').textContent = 'Contacting Open-Meteo…';
    var to = timeoutSignal(9000);
    try {
      var url = 'https://api.open-meteo.com/v1/forecast?latitude=36.74&longitude=-119.79&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation_probability&timeformat=unixtime&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles&forecast_days=2';
      var res = await fetch(url, { signal: to.signal });
      if (!res.ok) throw Error('Forecast HTTP ' + res.status);
      var json = await res.json();
      var hr = json && json.hourly;
      if (!hr || !Array.isArray(hr.time) || !Array.isArray(hr.wind_speed_10m)) throw Error('Missing hourly data');
      var arr = hr.time.map(function (t, i) {
        var rain = hr.precipitation_probability ? hr.precipitation_probability[i] : null;
        return { date: new Date(typeof t === 'number' ? t * 1000 : t), wind: Number(hr.wind_speed_10m[i]), rain: typeof rain === 'number' ? rain : NaN };
      });
      var now = Date.now();
      var future = arr.filter(function (x) {
        return Number.isFinite(x.wind) && Number.isFinite(x.date.getTime()) && x.date.getTime() >= now - 3600000;
      });
      if (!future.length) throw Error('No current hours in response');
      state.forecasts = future.slice(0, 12);
      state.forecastKind = 'regional';
      $('forecastSource').textContent = 'OPEN-METEO · REGIONAL MODEL (≈10 m WIND)';
      $('forecastSource').className = 'tag go';
      $('forecastStatus').textContent = 'Loaded ' + localStamp(new Date().toISOString()) + '. Modeled regional values — not orchard measurements.';
      forecastRender();
      toast('Regional forecast loaded · on-site readings still required');
    } catch (e) {
      state.forecasts = null;
      state.forecastKind = 'sample';
      $('forecastSource').textContent = 'ILLUSTRATIVE HOURS · LIVE FORECAST UNAVAILABLE';
      $('forecastSource').className = 'tag caution';
      $('forecastStatus').textContent = 'Could not load the live forecast (' + (e && e.name === 'TimeoutError' || e && e.name === 'AbortError' ? 'timed out' : 'network or service error') +
        '). The hours below are illustrative placeholders, not a forecast.';
      forecastRender();
      toast('Live regional forecast unavailable — showing labeled illustrative hours');
    } finally {
      to.cancel();
      b.disabled = false;
      b.textContent = '↻ Load regional forecast';
    }
  }

  // ---------- tower JSON import ----------
  var ALIASES = {
    tLow: ['tLow', 'temp_5ft', 'temperature_5ft', 't_5ft_F'],
    tHigh: ['tHigh', 'temp_30ft', 'temperature_30ft', 't_30ft_F'],
    wLow: ['wLow', 'wind_5ft', 'wind_speed_5ft', 'wind_5ft_mph'],
    wHigh: ['wHigh', 'wind_30ft', 'wind_speed_30ft', 'wind_30ft_mph'],
    dLow: ['dLow', 'direction_5ft', 'wind_direction_5ft', 'wind_5ft_from_deg'],
    dHigh: ['dHigh', 'direction_30ft', 'wind_direction_30ft', 'wind_30ft_from_deg'],
  };
  var AGE_ALIASES = { ageLow: ['ageLow', 'age_5ft_min', 'sensor_5ft_age_min'], ageHigh: ['ageHigh', 'age_30ft_min', 'sensor_30ft_age_min'] };
  var TIME_ALIASES = { ageLow: ['observedAt_5ft', 'timestamp_5ft'], ageHigh: ['observedAt_30ft', 'timestamp_30ft'], both: ['observedAt', 'timestamp', 'time'] };
  function pick(row, names) {
    for (var i = 0; i < names.length; i++) if (Object.prototype.hasOwnProperty.call(row, names[i])) return { key: names[i], value: row[names[i]] };
    return null;
  }
  // Timestamps must carry a UTC offset ("Z" or "+hh:mm"); otherwise the age is unknown.
  function ageFromTimestamp(v, nowMs) {
    if (typeof v !== 'string' || !/(Z|[+-]\d{2}:?\d{2})$/i.test(v.trim())) return NaN;
    var t = Date.parse(v);
    if (!Number.isFinite(t)) return NaN;
    var minutes = (nowMs - t) / 60000;
    // Small clock skew (≤2 min) is tolerated; further in the future is an impossible timestamp.
    if (minutes < 0 && minutes >= -2) return 0;
    return Math.round(minutes * 10) / 10;
  }
  // Exposed for tests: parse an imported object into readings + notes.
  function parseTowerJson(parsed, base, nowMs) {
    var row = Array.isArray(parsed) ? parsed[0] : parsed;
    if (row && row.readings && typeof row.readings === 'object') row = Object.assign({}, row, row.readings);
    if (!row || typeof row !== 'object') throw Error('No reading object found');
    var d = Object.assign({}, base),
      notes = [];
    Object.keys(ALIASES).forEach(function (key) {
      var hit = pick(row, ALIASES[key]);
      if (!hit) throw Error('Missing ' + key);
      var v = hit.value;
      d[key] = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (!Number.isFinite(d[key])) throw Error('Invalid ' + key);
    });
    ['ageLow', 'ageHigh'].forEach(function (key) {
      var hit = pick(row, AGE_ALIASES[key]);
      if (hit) {
        d[key] = typeof hit.value === 'number' ? hit.value : Number(hit.value);
        return;
      }
      var ts = pick(row, TIME_ALIASES[key]) || pick(row, TIME_ALIASES.both);
      if (ts) {
        d[key] = ageFromTimestamp(ts.value, nowMs);
        if (!Number.isFinite(d[key])) notes.push(key + ' timestamp missing a UTC offset or unparseable');
        return;
      }
      d[key] = NaN; // unknown freshness must never look fresh
      notes.push('no timestamp or sensor age for ' + (key === 'ageLow' ? '5 ft' : '30 ft'));
    });
    return { readings: d, notes: notes, rows: Array.isArray(parsed) ? parsed.length : 1 };
  }
  function onImport(file) {
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      toast('Import failed: file is larger than 1 MB');
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () { toast('Import failed: the file could not be read'); };
    reader.onload = function () {
      var out;
      try {
        out = parseTowerJson(JSON.parse(String(reader.result)), state.data, Date.now());
      } catch (e) {
        toast('Import failed: valid JSON with paired 5-ft and 30-ft temperature, wind speed and direction is required');
        $('importNote').textContent = 'Last import rejected: ' + (e && e.message ? e.message : 'invalid JSON') + '. No readings were changed.';
        return;
      }
      state.data = out.readings;
      state.scenario = '';
      state.source = 'imported';
      syncInputs();
      render();
      markInvalidInputs();
      createScenarioButtons();
      record('import:json');
      $('importNote').textContent = 'Imported ' + file.name + (out.rows > 1 ? ' (first of ' + out.rows + ' rows)' : '') +
        (out.notes.length ? ' · ' + out.notes.join('; ') + ' → treated as invalid (fail-safe STOP)' : ' · sensor ages derived from file');
      toast('Tower JSON imported and assessed · ' + assess(state.data).status);
    };
    reader.readAsText(file);
  }
  function sampleTower() {
    var now = Date.now();
    return {
      _note: 'Sample CanopyGuard tower file with simulated values. Timestamps must include a UTC offset.',
      site: 'Block A-07 (demo)',
      observedAt_5ft: new Date(now - 60000).toISOString(),
      observedAt_30ft: new Date(now - 60000).toISOString(),
      temp_5ft: 73,
      temp_30ft: 78.1,
      wind_speed_5ft: 5,
      wind_speed_30ft: 9.5,
      wind_direction_5ft: 85,
      wind_direction_30ft: 137,
      units: { temperature: 'degF', wind_speed: 'mph', wind_direction: 'degrees true, meteorological FROM' },
    };
  }

  function init() {
    try {
      var saved = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      state.history = Array.isArray(saved) ? saved.map(sanitizeEntry).filter(Boolean).slice(0, LOG_LIMIT) : [];
    } catch (e) {
      state.history = [];
    }
    document.querySelectorAll('[data-page]').forEach(function (x) {
      x.addEventListener('click', function () { displayPage(x.dataset.page, { focus: false }); });
    });
    document.querySelectorAll('[data-goto]').forEach(function (x) {
      x.addEventListener('click', function () { displayPage(x.dataset.goto); });
    });
    $('menuBtn').addEventListener('click', function () {
      if ($('sidebar').classList.contains('open')) closeMenu();
      else openMenu();
    });
    $('navScrim').addEventListener('click', closeMenu);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
    $('openLab').addEventListener('click', function () { displayPage('lab'); });
    $('simulateShift').addEventListener('click', function () {
      if (!Number.isFinite(state.data.tLow) || !Number.isFinite(state.data.wLow) || !Number.isFinite(state.data.dLow)) {
        toast('Cannot simulate a shift from invalid readings — load a scenario first');
        return;
      }
      state.data.tHigh = Math.round((state.data.tLow + 3.4) * 10) / 10;
      state.data.wHigh = Math.round((state.data.wLow + 5) * 10) / 10;
      state.data.dHigh = (state.data.dLow + 65) % 360;
      state.data.ageLow = 1;
      state.data.ageHigh = 1;
      state.scenario = '';
      state.source = 'simulated';
      syncInputs();
      render();
      createScenarioButtons();
      record('monitor:simulated_deterioration');
      toast('SIMULATION: upper-air inversion & shear introduced');
    });
    $('captureTop').addEventListener('click', function () { record('manual:capture'); });
    $('assessBtn').addEventListener('click', function () {
      readInputs();
      state.scenario = '';
      state.source = 'manual';
      render();
      markInvalidInputs();
      createScenarioButtons();
      record('manual:assessment');
    });
    $('resetLab').addEventListener('click', function () { loadScenario(DEMOS[0]); toast('Weather lab reset to the demo anchor (simulated)'); });
    $('uploadBtn').addEventListener('click', function () { $('jsonInput').click(); });
    $('jsonInput').addEventListener('change', function () {
      onImport(this.files[0]);
      this.value = '';
    });
    $('sampleTowerBtn').addEventListener('click', function () {
      download('canopyguard-sample-tower.json', JSON.stringify(sampleTower(), null, 2), 'application/json');
    });
    $('loadForecast').addEventListener('click', loadRegional);
    $('exportCsv').addEventListener('click', function () {
      download('canopyguard-decisions-' + fileStamp() + '.csv', csv(), 'text/csv;charset=utf-8');
      toast('CSV exported · ' + state.history.length + ' entries');
    });
    $('exportJson').addEventListener('click', function () {
      download('canopyguard-decisions-' + fileStamp() + '.json', jsonExport(), 'application/json');
      toast('JSON exported · ' + state.history.length + ' entries');
    });
    $('printLog').addEventListener('click', function () { window.print(); });
    $('clearLog').addEventListener('click', function () {
      if (confirm('Permanently clear this browser-local log? Export it first if you need a copy.')) {
        state.history = [];
        saveLog();
        updateTables();
        toast('Local history cleared');
      }
    });
    window.addEventListener('popstate', function () { displayPage(location.hash.slice(1) || 'overview', { fromHash: true }); });
    window.addEventListener('hashchange', function () {
      var p = location.hash.slice(1) || 'overview';
      if (p !== currentPage()) displayPage(p, { fromHash: true });
    });
    syncInputs();
    createScenarioButtons();
    render();
    if (!state.history.length) record('scenario:inversion');
    else updateTables();
    $('nowTime').textContent = clock();
    setInterval(function () { $('nowTime').textContent = clock(); }, 15000);
    var resizeT;
    window.addEventListener('resize', function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(function () {
        if ($('overview').classList.contains('active')) drawTrend();
      }, 60);
    });
  }

  window.CanopyGuardCore = {
    getState: function () { return state; },
    assess: assess,
    apply: function (input, kind, source) {
      state.data = Object.assign({}, state.data, input);
      state.scenario = '';
      state.source = source || 'simulated';
      syncInputs();
      render();
      createScenarioButtons();
      if (kind) record(kind);
    },
    nav: displayPage,
    currentPage: currentPage,
    onPage: function (fn) { pageHooks.push(fn); },
    subscribe: function (fn) { listeners.push(fn); },
    record: record,
    toast: toast,
    download: download,
    rnd: rnd,
    _test: { csv: csv, csvCell: csvCell, parseTowerJson: parseTowerJson, sanitizeEntry: sanitizeEntry, ageFromTimestamp: ageFromTimestamp },
  };
  init();
  // Deep links (#twin, #log, …) open the requested page once every module is ready.
  window.addEventListener('DOMContentLoaded', function () {
    var p = location.hash.slice(1);
    if (p && TITLES[p]) displayPage(p, { fromHash: true });
  });
})();
