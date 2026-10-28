# Payment simplification — 2026-10-28

User-approved scope: remove external transfer-confirmation waits from new application executions and show only the payment method, cash or transfer.

- Scenario editing and downloaded scenarios use zero confirmation. Opening-state confirmation finishes at time zero while preserving remaining preparation. Initial methods can be specified or left unknown.
- API demo, runs and experiments apply the same policy to an execution copy. Effective scenario snapshots record the policy. Saved results reopen without rewriting their historical timelines.
- Generated order inputs record the sampled method independently of delay. The order table and replay inspector display it. Older unknown methods are not labeled as cash.
- The deterministic historical engine and event shapes remain compatible. Existing legacy replay assertions now exercise saved legacy-contract fixtures; the added browser flow checks the new policy in Tuesday and regular modes.

Observed checks:

- Python suite: 266 passed. Ruff and mypy passed; API schema/domain fixture export matched all 7 files.
- Frontend: 39 tests passed; application/release TypeScript checks, generated-contract check and production build passed.
- Browser: both focused workflows passed, including new transfer method/no-delay behavior, saved-result reopening, legacy reservation states and WebGL-context fallback.
- Visual inspection: `payment-simplification-scenarios.png` confirms three timing controls: arrivals, payment and preparation.
- Focused UI tests were observed failing before implementation and passing afterward. Historical-contract failures found during full verification were corrected without removing their assertions.

Portable verification passed: 310 manifest files, actual executable startup/shutdown twice, both payment methods with no confirmation wait, historical result reopening, V2 pauses, CSV export and 60 experiment replications. See `payment-simplification-portable.json`. Package: `dist/pagos-simplificados-20261028/Boquitas-Windows-x64.zip`; the previous package was preserved. Destination hardware was not tested.

Non-blocking warnings: existing frontend bundle-size notice and Starlette/httpx deprecation.

No empirical calibration, business validation, commit, push or deployment was performed by this task.
