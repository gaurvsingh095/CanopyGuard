# CanopyGuard — 3-minute live demo runbook

Open the app fresh (or press **Reset to demo** in Weather lab). Everything shown is simulated; say so once at the start.
Timings match the recorded video (`demo/CanopyGuard-Demo-3min.mp4`, 2:50).

**0:00–0:20 · The blind spot (Overview).** Scroll to *The blind spot*.
"A single 5-ft station sees 5 mph — inside 3–10 mph — and says LOOKS OK. Our two-height tower sees 78.1 °F at 30 ft vs
73.0 °F at 5 ft. Warmer air above is an inversion, so the verdict is STOP."

**0:20–0:55 · Data and reasons first, then the twin.** Point at ΔT +5.1 °F, 4.5 mph shear, 52° shift and the ranked reasons
(STOP · INVERSION, CAUTION · SHEAR). Open **Atmosphere twin**: drag to orbit, zoom, pause.
"Same readings, drawn in 3D. Arrows point downwind; the readings are FROM bearings. Tracers only explain the layering —
they are not spray or concentration."

**0:55–1:25 · Boundary lens.** Neighboring homes sit in the 30-ft TOWARD sector. Drag the marker to the east (upwind) —
it changes to OUTSIDE SECTORS and the count drops to 1 of 4. Press **Reset layout**.
"This is a schematic screening view: not a map, a plume, a distance or an exposure estimate."

**1:25–1:55 · Weather replay.** Press **Play**: 17 synthetic frames, 05:30–09:30; STOP turns to GO when 30 ft stops being
warmer. Click a late frame and **Apply this frame to live dashboard** — it is logged.
"A scripted synthetic morning, run through the same engine — not a forecast."

**1:55–2:27 · Evidence lab.** 40/40 synthetic checks, 21 ground-blind, 23 STOP. Filter **Ground-blind conditions**, then
**Load** a case; the dashboard updates.
"These are constructed rule tests run on the same engine file as our Node suite — they prove the rules behave as specified,
not field accuracy."

**2:27–2:50 · Decision log.** Press **Record decision**, open **Decision log**, **Export CSV**.
"Every decision is timestamped with readings, reasons and data source, exportable as CSV or JSON in UTC. It is a
browser-local record, not a regulatory one. CanopyGuard is weather screening: labels and on-site checks still govern."

**If asked about safety:** GO only means the configured weather checks passed. Labels, on-site checks and regulations control.
**If asked how the twin works:** a canvas perspective projection of real 3D coordinates; arrows follow the two input
directions; tracer motion and sector geometry are illustrative, not calibrated dispersion.
**If asked about the 40/40:** synthetic, deterministic, written from the rule specification; a fuzz test against an
independent oracle and 121 edge cases also pass (`npm test`).
