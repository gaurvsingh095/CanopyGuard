#!/usr/bin/env node
'use strict';
// Builds the deployable single-file index.html from src/ and validation-cases.json.
//   node tools/build.cjs          -> writes index.html
//   node tools/build.cjs --check  -> exits 1 if index.html is not exactly what src/ produces
// Output is deterministic (no timestamps), so the check detects any hand-edit or stale build.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function safeScript(s) {
  return s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

function build() {
  let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const sources = {};
  html = html.replace(/\/\*\s*@inline ([\w./-]+)\s*\*\//g, (_, rel) => {
    const text = fs.readFileSync(path.join(SRC, rel), 'utf8');
    sources[rel] = text;
    return rel.endsWith('.js') ? safeScript(text) : text;
  });
  const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'validation-cases.json'), 'utf8')).cases;
  const benchmark = 'window.CANOPY_BENCHMARK=' + JSON.stringify(cases) + ';';
  html = html.replace(/\/\*\s*@inline-benchmark\s*\*\//, () => safeScript(benchmark));
  if (/@inline/.test(html)) throw new Error('Unresolved @inline placeholder in src/index.html');
  const digest = crypto.createHash('sha256').update(JSON.stringify([sources, benchmark])).digest('hex').slice(0, 12);
  html = html.replace(/__CG_VERSION__/g, pkg.version).replace(/__CG_BUILD__/g, digest);
  return { html, digest };
}

if (require.main === module) {
  const { html, digest } = build();
  const out = path.join(ROOT, 'index.html');
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (current !== html) {
      console.error('FAIL: index.html is out of date with src/. Run `npm run build`.');
      process.exit(1);
    }
    console.log(`PASS: index.html matches src/ (v${pkg.version}, build ${digest})`);
  } else {
    fs.writeFileSync(out, html);
    console.log(`Built index.html v${pkg.version} build ${digest} (${(html.length / 1024).toFixed(1)} KB)`);
  }
}

module.exports = { build };
