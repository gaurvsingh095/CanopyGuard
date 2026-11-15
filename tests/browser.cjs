'use strict';
// Shared Playwright launcher for CanopyGuard browser tests and the demo recorder.
// - Uses an installed Chrome when available (CHROME_PATH or /usr/bin/google-chrome), else Playwright's Chromium.
// - Serves the Google Fonts request from the local @fontsource packages so offline test runs render the
//   same typefaces as production. The app itself is unchanged: it still links Google Fonts with fallbacks.
// - Records console errors, page errors and failed requests for the QA report.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'node_modules', '@fontsource');

function fontCss() {
  const faces = [];
  for (const [family, pkg] of [['DM Sans', 'dm-sans'], ['Manrope', 'manrope']]) {
    for (const w of [400, 500, 600, 700, 800]) {
      const f = path.join(FONT_DIR, pkg, 'files', `${pkg}-latin-${w}-normal.woff2`);
      if (!fs.existsSync(f)) continue;
      faces.push(`@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync(f).toString('base64')}) format('woff2')}`);
    }
  }
  return faces.join('\n');
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium']) if (fs.existsSync(p)) return p;
  return undefined; // fall back to Playwright-managed Chromium (npx playwright install chromium)
}

async function launch(opts = {}) {
  return chromium.launch({ executablePath: chromePath(), headless: opts.headless !== false, args: opts.args || [] });
}

// Attach diagnostics + font routing to a page/context.
async function instrument(context, log) {
  const css = fontCss();
  await context.route(/fonts\.googleapis\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: css }));
  await context.route(/fonts\.gstatic\.com/, r => r.fulfill({ status: 204, body: '' }));
  context.on('page', p => watch(p, log));
  for (const p of context.pages()) watch(p, log);
}

function watch(page, log) {
  page.on('console', m => { if (m.type() === 'error') log.consoleErrors.push(m.text()); });
  page.on('pageerror', e => log.pageErrors.push(String(e && e.stack || e)));
  page.on('requestfailed', r => {
    const u = r.url();
    // Open-Meteo is optional and may be blocked in sandboxed CI; recorded separately.
    log.failedRequests.push(`${r.failure() && r.failure().errorText} ${u}`);
  });
  page.on('response', r => { if (r.status() >= 400) log.failedRequests.push(`HTTP ${r.status()} ${r.url()}`); });
}

function newLog() { return { consoleErrors: [], pageErrors: [], failedRequests: [] }; }

module.exports = { launch, instrument, newLog, ROOT };
