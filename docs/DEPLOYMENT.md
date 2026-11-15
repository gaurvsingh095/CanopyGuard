# Deploying CanopyGuard v2.1.0 (keeping v2.0 as rollback)

Production today: https://canopyguard-agx-2026.vercel.app/ — v2.0 (handoff `index.html`, sha256 `0445b899…f66c`).
It has **not** been changed by this release work: the build environment had no Vercel credentials and could not reach
`*.vercel.app`, so the release is prepared, tested and staged, but promotion is a step for the project owner.

Candidate to ship: `index.html` v2.1.0 build `4649a9628caa`, sha256 `5144addf…df58` (static, no build step on Vercel).
`.vercelignore` keeps tests, tooling, docs and `node_modules` out of the deployment.

## 1. Preview first (production untouched)

```bash
npm test                         # must end with 39/39 browser checks passed
npx vercel deploy                # creates a *preview* URL; production is not changed
```

Open the preview URL in a private window (no sign-in) and check, in about two minutes:
- sidebar footer reads `v2.1.0 · build 4649a9628caa`; overview shows STOP with "Temperature inversion detected";
- Window planner → **Load regional forecast** shows "OPEN-METEO · REGIONAL MODEL" (or the labelled outage message);
- Decision log → **Export CSV** downloads a file; Boundary lens drag works on a phone.

## 2. Promote

```bash
npx vercel promote <preview-url>        # or: npx vercel deploy --prod
curl -s https://canopyguard-agx-2026.vercel.app/ | grep -o 'canopyguard-version" content="[^"]*"'
# expect: canopyguard-version" content="2.1.0+4649a9628caa"
```

Record the deployment id shown by `npx vercel ls` / `npx vercel inspect <url>` in the submission notes.

## 3. Roll back (if anything looks wrong)

```bash
npx vercel rollback                     # returns production to the previous (v2.0) deployment
```

or promote the previous deployment from the Vercel dashboard. The exact v2.0 file is also preserved in git
(`git show d8c85f8:index.html`).
