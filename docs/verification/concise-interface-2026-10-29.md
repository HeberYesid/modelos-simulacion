# Concise interface — 2026-10-29

Authorized scope: reduce overwhelming Spanish interface text in Boquitas.

- Shortened repeated instructions and empty states across observations, scenarios and results.
- Model help and saved scenario assumptions use closed native disclosures with visible markers and keyboard focus. Editable controls and import/incompatibility warnings remain exposed.
- Results show five indicators in a two-column overview. “Ver todos los indicadores” retains the original statistical breakdown, units, populations, cohorts, availability reasons and identifiers. Values come directly from the saved result.
- Simulation, API contracts, observations, file formats and replay behavior were not changed. Historical test screenshots were backed up and restored byte-for-byte after the existing browser suite wrote to their paths.

Observed final verification:

- `pnpm --dir web test --run`: 39 passed.
- `pnpm --dir web typecheck` and release TypeScript check: passed.
- `pnpm --dir web build`: passed. Existing bundle-size warning remains.
- `pnpm --dir web test:e2e --workers=1`: 20 passed, including four new checks for keyboard help on desktop/mobile, complete metric access without rerunning, and visible V2 assumptions/incompatibility with preserved script entries.
- The four new checks also passed against the compiled application at `http://127.0.0.1:8000`, using `.tmp/concise-interface-20261029/production.config.ts`.
- Generated-contract check and strict validation of all seven existing OpenSpec changes: passed. Final diff reviewed; `git diff --check` passed.
- Actual desktop/mobile screenshots inspected; the mobile document width stayed within its 390px viewport.

At the same 1264 × 569 viewport, the default demonstration's results page decreased from 16,178px to 3,600px in document height with optional detail closed. Whole-body `innerText` word counts decreased from 205 to 130 for the initial observations view and from 558 to 424 for the initial scenario view. These are interface measurements, not a user study or empirical model validation.

Screenshots are retained in `C:/Users/HeberYesid/.codex/visualizations/2026/10/28/01a183c3-2e7c-7610-abd6-5e272700ad65/`, including `boquitas-metrics-after.png`, `boquitas-metrics-mobile-after.png` and `boquitas-results-after-full.png`.

Python tests and the full historical production acceptance suite were not rerun for this presentation-only change. The local production bundle was rebuilt; portable executables/ZIP packages were not regenerated. No commit, push or deployment was performed.
