# REL-02/REL-03 Browser workflow evidence

This record covers the isolated production-origin Playwright suite in
`web/playwright.release.config.ts` and `web/e2e-release/release-acceptance.spec.ts`.
The suite has no `webServer`, Vite, or dependency-resolution step. It expects the
installed application to be running at `http://127.0.0.1:8000`, blocks service
workers, routes all browser HTTP(S) requests, aborts non-local origins, and fails
if it observed any external-origin attempt.

## Implemented acceptance cases

- Original observations with no policy and the approved policy, plus the
  corrected reference with the approved policy. The assertions retain the 120
  raw original rows, the 119-row corrected view, the 119-row idempotent import,
  and the six delivery intervals at 17:00:10 against reported capacity four.
- The built-in demonstration in Tuesday and regular modes.
- A 30-replication staffing comparison with the same root seed, paired indices,
  identical demand tapes, selected indexed replay, and an actual CSV download.
- Downloaded run JSON reopened through the application, followed by a repeat
  run whose canonical scientific output is compared with a durable SHA-256
  reference. The public `RunResult` contract has no wall-clock metadata, so the
  reference excludes none and retains all event and simulation times.
- Actual 3D rendering, active payment, pending transfer, preparation and
  abandonment states; seek, play, pause, restart, speed and camera controls;
  repeated replay mounts and a full page reload.

## Observed execution

After the production bundle was rebuilt and the launcher was running at
`http://127.0.0.1:8000`, a browser run passed all six functional tests in
28.3 seconds:

```powershell
pnpm --dir web exec playwright test --config playwright.release.config.ts
```

The separate release-suite typecheck passed with
`pnpm exec tsc --noEmit -p tsconfig.release.json` from `web/`. The browser run
used Windows `10.0.19045.0`, Python `3.13.7`, Node `v24.17.0`, pnpm `11.18.0`,
Playwright `1.64.1`, and Chromium `156.0.8078.4`. The `uv.lock` SHA-256 is
`D4010691BDEBCB5511A67A58141187F6F7BFA342147E30BFD59EA35C53D9BB12`; the
`web/pnpm-lock.yaml` SHA-256 is
`4FEE7FCF5BD35D802FDDD7D932DCCC283753C2555D909892334B7DE55EEC8FB3`.

That six-test run did **not** validate offline networking: the external-request
fixture was lazy and none of the tests requested it, so its route and monitor
never started. The earlier “no external-origin attempt” claim is withdrawn.
Offline runtime was held pending the main agent's independent rerun; the final run is recorded below.

The fixture is now automatic and is also requested by `beforeEach`, which
asserts that the guard is active before every test and that no browser request
has occurred yet. `afterEach` writes one `release-network-audit-*.json` file per
test and asserts a positive local request count, an active guard, and an empty
external HTTP(S) attempt list. Service workers remain blocked in the release
config. The app and API are served on the same loopback origin; this config
starts no Vite or backend process. Those audit files and offline claims are
pending execution with the corrected fixture.

The first pre-fix attempt exposed a real first-click defect: pointerdown and
mousedown reached “Comparar escenarios”, blur emitted `change` for `#preparers`,
the full-form rerender removed the button, and no click or `/api/v1/experiments`
request followed. A focused capture reproduced that event sequence with a valid
form and no browser error. After the production refresh fix, the first-click
comparison and staffing-capacity regressions passed. The initial replay check
also selected a time after another order had started payment; it now verifies
the pending-payment state from the replay summary during the selected order's
actual pending interval.

The durable run reference SHA-256 is
`62a4384e6e889698a5a62e6b63869a75efcf43bf125bc943c22cd3082a746c47`; no
wall-clock metadata was present or excluded, and all simulation times remain in
the hash. The original and corrected observation fixture SHA-256 values remain
`845f8c6e56a7af120754ab0a5a789f318b65214e11f91737fd25032b7e51573d` and
`480ade881fd14bc88d8c94f037cea9ef4c2869b7ba400cbffda772f6f470caea`.

Visual and file evidence is stored in this directory with the `release-` prefix:
observation audit/overlap, both demo modes, the 30-replication comparison,
indexed replay, initial-worker capacity update, JSON reopen, CSV download, and
payment/pending-transfer/preparation/abandonment/motion/repeated-mount/reload
screenshots. The complete exported result is `release-run-export.json` and the
canonical hash payload is `release-reproducibility-reference.json`.

The six functional workflows verify synthetic software behavior, not empirical
calibration or predictive validity for Boquitas. REL-02's final independent acceptance is recorded below.

## Final independent acceptance

The main agent read the final fixture and independently ran the same production command after the automatic guard correction: **6 passed in 29.6s**. The six `review/release-network-audit-*.json` files were read back independently. Every record has `guardActive:true`, a positive local request count, status `passed` and an empty external-attempt list. Counts are6,8,8,8,12,7, totaling 49 local HTTP(S) requests and zero external attempts. The final release TypeScript check also passed. Only this guarded run supports REL-02. See the [acceptance report](../../../docs/acceptance-report.md) for the full 48-requirement matrix, independent checks, environment and limitations.
