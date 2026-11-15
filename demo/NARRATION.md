# CanopyGuard demo video — narration & caption transcript

**File:** `CanopyGuard-Demo-3min.mp4` · 1920×1080 · 30 fps · H.264 · **2:50** (170.3 s) · no audio track
**Subtitles:** `CanopyGuard-Demo-3min.srt` (same text as the burned-in captions)

**How it was made:** a real headed Chrome session on a virtual display, captured with ffmpeg (x11grab) while
`demo/record-demo.cjs` performed genuine clicks, drags and selections on the built `index.html`
(v2.1.0, build shown in the sidebar). The caption bar and the yellow cursor ring are a recording-only overlay injected
by the script; they are not part of the app. Every value on screen comes from the app's own **simulated**
scenarios, synthetic replay frames and synthetic benchmark cases — nothing is presented as a live reading.
The recording session had 0 console errors, 0 page errors and 0 failed requests.

The captions double as a voice-over script: read each line at a natural pace inside its time window if you add narration.

| Time | Section | Caption / voice-over |
|---|---|---|
| 0:00–0:05 | Canopyguard · Spray Or Wait? | A single 5-ft weather station can say “looks OK” while the air above the orchard says stop. |
| 0:05–0:14 | The Blind Spot · Simulated Scenario | Hidden-inversion scenario: 5-ft wind 5.0 mph sits inside the 3–10 mph range → the ground-only check reads LOOKS OK. |
| 0:14–0:21 | The Blind Spot · Simulated Scenario | The paired 5 ft + 30 ft tower sees 78.1 °F aloft vs 73.0 °F near the ground — an inversion → STOP. |
| 0:21–0:32 | Data & Reasons First | ΔT +5.1 °F (30 ft − 5 ft), 4.5 mph speed shear, 52° direction shift. Every STOP lists its reasons. |
| 0:32–0:41 | Atmospheric Twin · Illustrative | Live-linked to the same readings: warm layer aloft, 5-ft and 30-ft wind arrows pointing downwind (readings are FROM). |
| 0:41–0:57 | Atmospheric Twin · Illustrative | Drag to orbit, zoom, pause. Tracers explain stratification only — they are not spray, drift or concentration. |
| 0:57–1:05 | Boundary Lens · Screening Only | Sectors show where each height’s wind blows TOWARD (±29°). Neighboring homes sit in the 30-ft sector. |
| 1:05–1:16 | Boundary Lens · Screening Only | Drag a receptor upwind and its alignment updates instantly — the list and count use the same rule as the map. |
| 1:16–1:27 | Boundary Lens · Screening Only | Schematic only: not a map, plume, distance, exposure or regulatory buffer prediction. |
| 1:27–1:36 | Morning Replay · 17 Synthetic Frames | A scripted 05:30–09:30 morning. Each frame runs through the same engine as the live dashboard. |
| 1:36–1:46 | Morning Replay · 17 Synthetic Frames | Watch the verdict change as the inversion erodes — STOP turns to GO when 30 ft is no longer warmer. |
| 1:46–1:57 | Morning Replay · 17 Synthetic Frames | Pick a frame and apply it to the live dashboard; it is logged with a timestamp. Synthetic — not a forecast. |
| 1:57–2:04 | Evidence Lab · 40 Synthetic Cases | 40/40 labeled synthetic rule checks pass in the browser — the same engine file the Node regression suite runs. |
| 2:04–2:20 | Evidence Lab · 40 Synthetic Cases | 21 constructed cases hide a caution or stop from a ground-only wind screen. Constructed examples — not field accuracy. |
| 2:20–2:32 | Evidence Lab · 40 Synthetic Cases | Load any case: the live dashboard, twin and log update together. |
| 2:32–2:37 | Decision Log · Browser-Local | Every decision is timestamped with its readings, reasons and data source — scenarios, replay and benchmark loads included. |
| 2:37–2:43 | Decision Log · Browser-Local | CSV / JSON export in UTC. Local records — not a regulatory or tamper-evident record. |
| 2:43–2:50 | Canopyguard 2.1 | See the inversion a ground station misses — explained, logged, exportable. Weather screening only; labels and on-site checks still govern. |

To re-record: `Xvfb :99 -screen 0 1920x1080x24 &` then `DISPLAY=:99 node demo/record-demo.cjs demo/out` and trim with the
offset in `demo/out/cues.json` (see README).
