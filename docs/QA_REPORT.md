# CanopyGuard v2.1.0 — QA report

**Candidate:** `index.html` v2.1.0, build `4649a9628caa`, sha256 `5144addf56d1aceed33ef96ba3828bd6c052cdb79603982568d5a3bff134df58`
**Baseline (rollback):** handoff `index.html` v2.0, sha256 `0445b8998d82e472ac06d1e24b394240f899337949542798b0f5eeba2bb8f66c` (git commit `d8c85f8`)
**Browser:** Google Chrome 153.0.8010.12 via Playwright 1.65 · time zone America/Phoenix · Node 22.23
**Date:** 2026-11-15

## Overall: PASS — 0 known P0/P1 defects

| Suite | Command | Result |
|---|---|---|
| Build parity | `npm run check:build` | PASS — `index.html` equals the build of `src/` |
| Synthetic benchmark | `node validate-engine.cjs` | **40/40** · 21 ground-blind · 23 STOP (baseline: 40/40 · 21 · 23) · deployed engine byte-identical to source |
| Engine edge cases + fuzz | `node tests/engine-edge.test.cjs` | **121/121** (incl. 20,000-input fuzz vs independent oracle) |
| Browser E2E | `node tests/e2e.cjs` | **39/39** (desktop 1440×900: 19, mobile 390×844 touch: 20) |
| Accessibility (axe-core 4.14, all 9 pages, both sizes) | in E2E | 0 violations of any impact |
| JS exceptions / console errors / failed requests | in E2E and during video recording | 0 / 0 / 0 (Open-Meteo deliberately stubbed: outage + labelled fixture) |
| Twin animation | in E2E | ~61 fps desktop and mobile emulation |
| Load to interactive (file://) | in E2E | 241 ms desktop · 166 ms mobile |

## Browser journeys (PASS/FAIL per viewport)

| Journey | Desktop 1440×900 | Mobile 390×844 |
|---|---|---|
| app loads with anchor STOP + version tag | PASS | PASS |
| every navigation item opens its page, sets title, aria-current and #hash | PASS | PASS |
| each scenario: same verdict on overview, lab, twin, boundary; reasons present | PASS | PASS |
| weather lab: exact 3/10 mph boundaries, 359°/1°, invalid input, reset | PASS | PASS |
| invalid readings: twin and boundary show explicit invalid state, no NaN | PASS | PASS |
| atmospheric twin: pause/resume, orbit, zoom, layer toggles, keyboard; canvas renders | PASS | PASS |
| twin animation frame budget (≥ 30 fps while visible) | PASS | PASS |
| boundary lens: drag + keyboard move change alignment; reset restores; FROM/TOWARD | PASS | PASS |
| replay: 17 frames, play advances & stops at end, scrub/timeline pause, leaving page stops, apply logs | PASS | PASS |
| evidence lab: 40/40, 21 ground-blind, filters incl. empty state, load case, export | PASS | PASS |
| overview: weather shift, record decision, customize link, judge buttons, view-log link | PASS | PASS |
| import: valid file w/ timestamps, file w/o timestamps (fail-safe), malformed, wrong shape | PASS | PASS |
| planner: illustrative default, offline failure is labelled, fixture load labelled regional, PT times | PASS | PASS |
| decision log: timezone column, CSV (formula-injection safe) + JSON exports, print, clear w/ empty state | PASS | PASS |
| storage failure and log rotation are handled | PASS | PASS |
| deep link #boundary opens the Boundary Lens directly | PASS | PASS |
| accessibility scan (axe-core): no critical/serious violations on key pages | PASS | PASS |
| no JS exceptions, console errors or unexpected failed requests | PASS | PASS |
| mobile menu opens, scrim and Escape close it | n/a | PASS |
| no horizontal page overflow on any page | n/a | PASS |
| touch targets on primary controls ≥ 40px | n/a | PASS |

Screenshots: `qa/screens/` (33 files, e.g. `desktop-overview-anchor.png`, `desktop-twin-anchor.png`, `desktop-boundary-dragged.png`,
`desktop-validation-groundblind.png`, `desktop-log.png`, `mobile-menu-open.png`, `mobile-boundary-dragged.png`, `desktop-lab-invalid.png`,
`desktop-boundary-invalid.png`, `desktop-planner-regional-fixture.png`). Full machine report: `qa/e2e-report.json`.

## Defects found in the v2.0 baseline and fixed

| Sev | Defect | Fix / evidence |
|---|---|---|
| P0 | Imported tower JSON without sensor ages silently reused the previous "1 min old" ages, so stale or undated data could screen as fresh (possible GO on unknown freshness). | Import derives age only from offset-bearing timestamps or explicit ages; otherwise INVALID → STOP. E2E: no-timestamp, future-timestamp and no-time-zone imports all STOP. |
| P0 | Hero illustration always showed "WARM AIR LAYER" even when the verdict was GO (contradictory visual). | Layer opacity and label follow ΔT ("WARM AIR ALOFT" / "NO WARM LAYER" / "READINGS INVALID"). E2E scenario test. |
| P1 | Browser and test engine could diverge: `validate-engine.cjs` regex-scraped `index.html`, and the shipped `app-test.js` source already differed from the deployed inline code. | One engine file (`src/js/engine.js`) inlined by a deterministic build; validator loads it and fails unless the deployed copy is byte-identical; `--check` fails on stale builds. Stale duplicate sources removed. |
| P1 | Invalid readings rendered `NaN°F` in the overview, profile and log; twin and boundary drew NaN geometry. | Safe formatters (—), explicit invalid states on canvas and map, invalid fields highlighted. E2E asserts no NaN/undefined text. |
| P1 | Implausible values (e.g. 500 °F, 200 mph) and unknown volatility were accepted as valid. | Plausibility ranges + volatility whitelist → INVALID; message names the field. |
| P1 | Floating-point noise could flip thresholds (10.1 − 4.1 ≠ 6). | Derived values rounded to 0.001 before comparison; edge tests. |
| P1 | Boundary Lens: drawn sector was ±29° but "aligned" used 25°, so markers inside the sector could read "near". Count was labelled "aligned sectors". | One constant for drawing and testing; per-sector labels (IN 5-FT / IN 30-FT / BOTH); "n of 4 receptors". |
| P1 | Boundary Lens unusable on mobile: legend covered the map, markers ~7 px, touch drag triggered browser back-swipe. | Legend moves below the map, markers scale up, touch gestures blocked during drag, keyboard arrow-key moving. Real CDP touch drag in E2E. |
| P1 | Replay: play button label stuck on "Pause" after scrubbing; playback looped forever and kept running on other pages; scrubbing while playing jumped back a frame. | Explicit start/stop, stops at the last frame and on page change/tab hide, label synced. E2E. |
| P1 | Twin tracers interpolated directions linearly (359°→1° swept the long way). | Shortest signed rotation. |
| P1 | Forecast hours shown in the viewer's time zone without a label while describing Fresno; illustrative hours labelled only "ILLUSTRATIVE FORECAST". | Times rendered in America/Los_Angeles with "PT"; placeholders labelled "ILLUSTRATIVE HOURS · NOT A FORECAST"; outage message explains; Safari-safe timeout. |
| P1 | Imported and manually entered readings were logged and labelled as "simulated". | Source tracked (simulated / manual / imported) in header pill, twin, log and exports. |
| P1 | Log times shown without a zone; CSV vulnerable to spreadsheet formula injection; tampered localStorage entries rendered as green "GO". | Local time + zone column, UTC ISO in exports, OWASP-style cell neutralising (negative numbers kept numeric), stored entries validated on load. E2E with a hostile entry. |
| P1 | Benchmark filter lacked 3 of the 10 categories (clear, direction, product). | Filter built from the data with counts, plus computed ground-blind set and failures-only empty state. |
| P1 | "Sensor history" chart presented generated wiggle as recent readings, and its last point did not equal the current reading. | Retitled "Illustrative temperature trend · SYNTHETIC"; lead-in ends exactly at current readings; empty state for invalid temps. |
| P2 | Twin legend called downwind arrows "measured direction"; no north reference. | Legend explains arrow = downwind, reading = FROM; N marker shared with the Boundary Lens. |
| P2 | No zoom without a mouse wheel; no keyboard orbit. | +/− buttons, arrow/± keys, focusable canvas. |
| P2 | 400+ colour-contrast failures, nested-interactive SVG, unfocusable scroll regions, NEW badge overlapping nav text, no skip link, menu lacked scrim/Escape/aria-expanded. | All fixed; axe-core clean on every page at both sizes. |
| P2 | Storage full/unavailable only warned on the first failure and was then hidden by the next toast; 300-entry rotation was silent. | Warning attached to every failed record; rotation announced. |
| P2 | Missing favicon (404), no deep links/back button, page title never changed, print printed the whole app. | Inline favicon, `#page` routing with history, per-page titles, print stylesheet for the log. |

## Known limitations (not defects)

- Readings are simulated; there is no sensor hardware, account, server storage or alerting in this release.
- The live Open-Meteo request could not be exercised from this sandbox (egress blocked); its failure path and a labelled
  fixture response were tested. Verify one real load on the deployed site.
- The candidate artifact preview at claude.ai runs in a sandboxed frame that blocks downloads, print, confirm dialogs and
  external fetches, so export/print/clear/forecast must be checked on the real deployment (they pass in Chrome via E2E).
