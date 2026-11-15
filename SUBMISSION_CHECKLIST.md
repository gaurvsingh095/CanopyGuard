# CanopyGuard — submission checklist (v2.1.0)

## Engineering — done and verified
- [x] Single decision engine shared by browser and tests; deployed copy verified byte-identical (`npm test`)
- [x] Edge cases: exactly 3 / 10 mph, equal temps, 359°/1°, NaN/Infinity/null/strings, out-of-range, future/negative ages, stale, absent sensors — never GO
- [x] 40/40 synthetic cases (21 ground-blind, 23 STOP), 121/121 edge tests + 20,000-input oracle fuzz, 39/39 browser journeys
- [x] Desktop 1440×900 and mobile 390×844 (touch) tested; 0 JS exceptions, 0 console errors, 0 failed requests; axe-core clean
- [x] Simulated / manual / imported provenance shown everywhere; illustrative visuals labelled; no measured-drift claims
- [x] Demo video recorded from the real app: `demo/CanopyGuard-Demo-3min.mp4` (2:50) + `.srt` + `demo/NARRATION.md`
- [x] QA report `docs/QA_REPORT.md`, deployment/rollback steps `docs/DEPLOYMENT.md`, screenshots `docs/screenshots/`

## Owner actions before submitting
- [ ] Deploy v2.1.0 to Vercel per `docs/DEPLOYMENT.md` (preview → check → promote). Production is still v2.0 until you do.
- [ ] Open the public URL in a private window; confirm the sidebar shows `v2.1.0 · build 4649a9628caa`
- [ ] Check the organizer's form for required fields, video requirement and deadline (not verified from here)
- [ ] Confirm team members / eligibility; add a repository URL if the form asks (no public repository exists yet)
- [ ] Upload the video (or paste a link to it) and submit; keep the confirmation receipt

## Submission description (≈120 words)
CanopyGuard reveals spray-drift weather risk that a single five-foot orchard station can miss. It compares paired
5-ft and 30-ft temperature and wind readings to flag inversions, out-of-range wind and vertical shear, and explains every
GO / CAUTION / STOP in plain language. Invalid, missing or stale data always fails safe to STOP. An interactive 3D orchard
atmosphere, a sensitive-area wind-direction screen and a 17-frame synthetic morning replay make the hidden layer easy to
see, and every decision is timestamped and exportable. Forty synthetic labeled cases run in the browser and in a
reproducible Node suite against the same engine. Readings in the demo are simulated. CanopyGuard is weather decision
support — not spray authorization, a label substitute or a validated dispersion model.

## Technology
HTML, CSS and vanilla JavaScript in one offline-capable file; Canvas 2D perspective projection; SVG; browser localStorage;
CSV/JSON export; optional Open-Meteo forecast API; Node.js build and rule tests; Playwright + axe-core browser tests;
ffmpeg screen recording; Vercel static hosting.
