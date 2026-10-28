# Boquitas local release acceptance

Date: 2026-10-23. The user approved specs01–05 and authorized spec06. All ten spec06 engineering tasks are complete after independent review and observed checks. User approval of this delivery remains separate. No empirical calibration or validation is claimed.

## Scope and implementation review

The delivery adds `start-boquitas.ps1`, the minimal `python -m boquitas` entry point, public launcher tests, a separate production-browser acceptance suite, these guides and the future field-validation protocol. Existing simulation algorithms, numerical contracts, observations and lockfiles are preserved. The main agent read the delegated launcher, tests, suite and guides and independently operated the application.

Integrated acceptance exposed a real interaction defect: changing staffing then immediately clicking Run/Compare triggered `change` during pointer-down, rebuilt the form and removed the button before `click`. The original 30-replication acceptance test failed without any experiment request. Captured events were `pointerdown`, `mousedown`, `change`, with no `click`; the form was valid and there were no JavaScript errors. The fix updates initial worker options in place, keeping the action button attached and preserving explicit worker assignments, including incompatible assignments for subsequent validation. The original failing workflow remains a regression; the additional initialized-order acceptance case was added later and is not claimed as test-first.

Launcher test-first evidence is in [launcher-evidence.md](../openspec/changes/boquitas-06-validation-and-delivery/launcher-evidence.md). Browser results and initial failures are in [workflow-evidence.md](../openspec/changes/boquitas-06-validation-and-delivery/workflow-evidence.md). Main-agent checks take precedence over delegated summaries.

## Environment and reproducibility

Observed: Windows 10 build19045, Python3.13.7, Node24.17.0, pnpm11.18.0, Vite8.3.5, Three.js0.186.1, Playwright1.64.1/Chromium156.0.8078.4 and the separate named graphical-review browser's HeadlessChrome154. The installed Python/frontend package versions and dependency locks are recorded in [technical-guide.md](technical-guide.md) and [environment-before.json](../openspec/changes/boquitas-06-validation-and-delivery/environment-before.json). Browser checks use actual Chromium/WebGL rendering; they do not certify every browser, GPU or device.

The complete synthetic default demo at seed20261020/index0 admits139 new orders and drains at23538.28731165541s. Its [reference JSON](../openspec/changes/boquitas-06-validation-and-delivery/reference-demo-run.json) has SHA-256 `8bbe6b117f59dde367816d8ed63bb013b0ad624d916a57159c084fcff4051dd7`. The main agent generated it again in a separate Python process, then requested the same run from the live production HTTP API and serialized it with the public exporter: both complete scientific JSON byte sequences matched. `RunResult` has no wall-clock metadata; no fields were excluded. This checks reproducibility in the stated locked environment, not real-business accuracy.

Initial installation instructions were checked against the existing locks and installed environment. A clean installation on a second machine and use by another human were not performed. Browser-test installation is explicitly separate from normal runtime.

## Startup, shutdown and local-only runtime

The main agent started `.\start-boquitas.ps1 -NoBrowser` in a real PTY. Health returned200; literal Ctrl+C produced Uvicorn's completed shutdown messages, ended the process and released8000. Restarting `.\start-boquitas.ps1` succeeded; after health200 the default browser requested `/`, the bundled JS/CSS and demo endpoint, all200. PowerShell interrupt ended with exit1 while the server logged orderly shutdown; this was an interrupt exit, not a failed startup. Automated launcher checks separately use Windows `CTRL_BREAK_EVENT` and repeat two starts. Occupied-port tests retain their own unrelated listener. Port checks never terminate the port's owner; cleanup targets only the child process the launcher started. No execution-policy change, build or dependency resolver runs in the launcher. The main agent also observed the occupied-port diagnostic in Windows PowerShell. All test services and the isolated review browser were stopped at closure.

Offline acceptance uses the production origin `http://127.0.0.1:8000`, built assets and the installed Python environment. The dedicated browser suite blocks service workers and aborts external HTTP(S), failing on any attempted external request. It covers imports, simulation, comparison, JSON/CSV downloads, reopening and procedural3D. This is browser-level external-request denial plus launcher/source inspection; the machine network was not globally disabled and no OS-wide packet capture is claimed.

## Main-agent graphical review

The main agent loaded explicit synthetic [Tuesday](../openspec/changes/boquitas-06-validation-and-delivery/review/main-review-tuesday.json) and [regular](../openspec/changes/boquitas-06-validation-and-delivery/review/main-review-regular.json) fixtures through the saved-file UI. They use H22s, arrivals every2s, two-person groups, payment2s, confirmation4s, preparation8s, patience3s and an initial preparing order with12s remaining and unknown arrival. Tuesday drains at92s; regular drains at26s. None are measurements.

- [Payment](../openspec/changes/boquitas-06-validation-and-delivery/review/main-active-payment.png), [paid waiting](../openspec/changes/boquitas-06-validation-and-delivery/review/main-paid-wait.png) and [shared preparation](../openspec/changes/boquitas-06-validation-and-delivery/review/main-shared-preparation.png) visibly occupy distinct zones; the shared group keeps one preparing worker.
- Actual1x playback advanced from0.2s to approximately0.44s, with a moving worker gesture in [frameA](../openspec/changes/boquitas-06-validation-and-delivery/review/main-motion-a.png) and [frameB](../openspec/changes/boquitas-06-validation-and-delivery/review/main-motion-b.png), then paused. These frames supplement, rather than replace, observed time advancement and automated control checks. Reduced motion was observed initially, then disabled in the isolated test browser for this motion review.
- At regular t6s, the inspector showed the first group's withdrawal at5s with no payment/preparation/delivery; [the scene](../openspec/changes/boquitas-06-validation-and-delivery/review/main-abandonment.png) excluded both members. At15s [external confirmation](../openspec/changes/boquitas-06-validation-and-delivery/review/main-reserved-transfer.png) showed zero active and one reserved worker. At20s [preparation](../openspec/changes/boquitas-06-validation-and-delivery/review/main-regular-preparation.png) showed one active worker. At26s [drain completion](../openspec/changes/boquitas-06-validation-and-delivery/review/main-final-drain.png) showed zero people and closed admissions.
- The initial person's arrival remained explicitly unknown in the inspector. The scene remained available; the named browser's error list was empty during this review. The standard browser suite separately tests camera orbit/zoom/reset, context loss, absent WebGL, repeated replacement, reduced motion, empty/invalid inputs and immutable results.

## Check record

The main agent directly observed the following final results after the relevant changes:

| Command | Actual result |
| --- | --- |
| `uv --cache-dir .uv-cache run --frozen --offline pytest -q` |131 passed in 13.39s, no skips; includes the prior128 tests and3 launcher tests |
| `uv --cache-dir .uv-cache run --frozen --offline ruff check .` | Passed |
| `uv --cache-dir .uv-cache run --frozen --offline mypy src/boquitas` | Passed,14 source files |
| `uv --cache-dir .uv-cache run --frozen --offline python scripts/export_web_contracts.py --check` | Passed,4 generated schema/fixture files match |
| `pnpm --dir web contracts:check` | Passed, generated OpenAPI types match |
| `pnpm --dir web test --run` |21 passed in 9 files after the staffing fix |
| `pnpm --dir web typecheck` | Passed after the staffing fix |
| `pnpm --dir web exec tsc --noEmit -p tsconfig.release.json` | Passed for the final production acceptance suite |
| `pnpm --dir web build` | Passed; final JS725.65kB/gzip187.86kB, CSS23.77kB |
| `pnpm --dir web test:e2e` |12 passed in 43.4s after the staffing fix |
| `pnpm --dir web exec playwright test --config playwright.release.config.ts` |6 passed in 29.6s with the final automatic network guard |
| `openspec validate --changes --strict --no-interactive --json` | All 6 change packages valid; structural validation only |

The six durable `review/release-network-audit-*.json` files were independently read back: guard active for every test,49 local requests in total, zero external-origin attempts, all tests passed. The initial delegated six-test functional run had a lazy, unused network fixture, so its offline claim was withdrawn during independent review. The corrected guard is automatic and explicitly requested by hooks; per-test assertions require activation, actual local requests and no external attempts. Only the final29.6s run supports REL-02. Initial restricted runs encountered temporary-directory access denial and Vite/Playwright `spawn EPERM`; the authorized runners executed successfully. These environmental failures are not labeled domain regressions or TDD evidence. The first3D acceptance assertion also selected a timestamp after another order started payment; it was corrected to inspect the selected order's actual pending interval and public summary, without altering replay behavior.

## Evidence preservation and limitations

The pre-work SHA inventory covers55 existing source/test/frontend files in [protected-hashes-before.json](../openspec/changes/boquitas-06-validation-and-delivery/protected-hashes-before.json). Final comparison in [protected-hashes-after.json](../openspec/changes/boquitas-06-validation-and-delivery/protected-hashes-after.json) confirms53 unchanged and only the two reviewed frontend files changed for the observed first-click regression. All preexisting tests and numerical engine files remain byte-identical. Historical screenshot files overwritten by the existing browser suite were restored from their pre-run copies.

The original observation SHA-256 is `845f8c6e56a7af120754ab0a5a789f318b65214e11f91737fd25032b7e51573d`; corrected is `480ade881fd14bc88d8c94f037cea9ef4c2869b7ba400cbffda772f6f470caea`. Both external supplied files, repository fixtures and both dependency locks match their pre-work hashes; [environment-after.json](../openspec/changes/boquitas-06-validation-and-delivery/environment-after.json) records the unchanged values.

Current empirical calibration and validation remain pending. There are no observed station links/person counts, resolved six-versus-four delivery conflict, fitted input parameters or independent validation observations. The [prospective protocol](empirical-validation-protocol.md) defines measurements, censoring and calibration/validation separation; it intentionally sets no invented sample size, fit or real-business tolerance. Synthetic comparison intervals and simulated differences are not operational recommendations.

Known non-blocking diagnostics: the existing Starlette/httpx deprecation warning, a production JS bundle above500kB, native test `NO_COLOR`/`FORCE_COLOR` notices, and console graphics errors deliberately induced by the no-WebGL/context-loss tests. Default browser favicon404 does not prevent the tested workflow. No performance guarantee, clean-machine installation, empirical validation, public hosting, commit, push, PR, synchronization or archive is claimed.

## Requirement and scenario traceability

The table below is generated from the six approved capability specs. Scenario names are retained verbatim because those scenarios have names rather than separate numeric IDs. Test names/files and review artifacts identify the evidence; completion depends on the actual final check record above.

Evidence file keys (paths from the repository root):

- **ENG**: `tests/test_simulation_engine.py`.
- **OBS**: `tests/test_observation_import.py`.
- **EXP**: `tests/test_scenarios.py, test_demand.py, test_metrics.py, test_statistics.py, test_experiments.py, test_exports.py`.
- **WEB**: `tests/test_api.py; web/e2e/local-workflows.spec.ts; web/e2e-release/release-acceptance.spec.ts`.
- **VIS**: `web/tests/replay*.test.ts; web/e2e/local-workflows.spec.ts; web/e2e-release/release-acceptance.spec.ts; main graphical review above`.
- **REL**: `tests/test_launcher.py; web/e2e-release/release-acceptance.spec.ts; guides and this report`.

| Requirement | Acceptance scenarios | Check/evidence locator |
| --- | --- | --- |
| [ENG-01](../openspec/changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | Repeating explicit inputs; Invalid resource or duration | test_empty_input_returns_repeatable_trace_with_closed_window_and_idle_resources; invalid capacity/duration/identity tests |
| [ENG-02](../openspec/changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | Two-person shared order | test_two_people_share_one_payment_and_one_preparation |
| [ENG-03](../openspec/changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | Independently solved Tuesday sequence; Four preparers already occupied | test_tuesday_orders_a_and_b_follow_the_solved_payment_and_prep_timeline; test_fifth_paid_order_waits_until_a_preparer_is_released |
| [ENG-04](../openspec/changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | Independently solved regular sequence | test_regular_mode_keeps_the_integrated_worker_until_each_delivery |
| [ENG-05](../openspec/changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | Later arrival completes payment first | test_initial_payment_service_uses_arrival_then_input_sequence; test_tuesday_preparation_queue_uses_payment_completion_after_transfer; stable tie tests |
| [ENG-06](../openspec/changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | Transfer overlaps another transaction | test_regular_transfer_reserves_integrated_worker_while_inactive; Tuesday overlap test; browser transfer case |
| [ENG-07](../openspec/changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | Group leaves a busy regular queue; Release exactly at patience deadline | test_waiting_group_abandons_together_before_first_payment_service; test_service_start_wins_when_worker_release_matches_patience_deadline |
| [ENG-08](../openspec/changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | Last accepted and excluded arrivals | test_closing_stops_admissions_but_drains_last_accepted_order |
| [ENG-09](../openspec/changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | Initial preparation occupies a worker; Impossible initial occupancy | test_initial_preparation_releases_worker_to_initial_paid_queue; duplicate/incompatible assignment tests |
| [ENG-10](../openspec/changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | Simultaneous transitions | test_public_events_reconstruct_final_orders_people_queues_and_workers; immutable round-trip and zero-time tests |
| [ENG-11](../openspec/changes/boquitas-01-simulation-engine/specs/simulation-engine/spec.md) | Same demand under different staffing modes | test_same_explicit_workload_preserves_people_and_order_work_across_modes |
| [OBS-01](../openspec/changes/boquitas-02-observation-import/specs/observation-import/spec.md) | Original pasted message source | test_original_source_import_keeps_physical_lines_and_station_local_rows; production original120 workflow |
| [OBS-02](../openspec/changes/boquitas-02-observation-import/specs/observation-import/spec.md) | Apply the approved profile to the original; Already corrected source; Unapproved changed values | test_approved_profile_corrects_view_without_overwriting_original_rows; idempotence and mismatch tests; production119 workflow |
| [OBS-03](../openspec/changes/boquitas-02-observation-import/specs/observation-import/spec.md) | Equal local identifiers | test_local_ids_and_unknown_group_size_are_station_qualified |
| [OBS-04](../openspec/changes/boquitas-02-observation-import/specs/observation-import/spec.md) | The three recorded cashier departures | test_recorded_cashier_departures_remain_withdrawals_without_service_or_inferred_causes; incomplete/missing-time tests |
| [OBS-05](../openspec/changes/boquitas-02-observation-import/specs/observation-import/spec.md) | Chronology error | test_end_before_start_remains_raw_but_is_invalid_for_descriptive_use; duplicate, malformed and contradiction tests |
| [OBS-06](../openspec/changes/boquitas-02-observation-import/specs/observation-import/spec.md) | Corrected delivery overlap | test_half_open_delivery_sweep_reports_the_six_rows_at_170010; production6/4 audit screenshot |
| [OBS-07](../openspec/changes/boquitas-02-observation-import/specs/observation-import/spec.md) | Shared payment with unknown group size | test_corrected_station_summaries_match_independent_observation_totals_and_serialize; UI unavailable-person counts |
| [EXP-01](../openspec/changes/boquitas-03-scenario-experiments/specs/scenario-experiments/spec.md) | Load demonstration | test_demo_scenario_has_labeled_synthetic_defaults; independent full-demo/API reference |
| [EXP-02](../openspec/changes/boquitas-03-scenario-experiments/specs/scenario-experiments/spec.md) | Staffing change preserves the demand tape; Replication order does not change results | test_indexed_replication_tape_does_not_depend_on_call_order; staffing tape/pair tests; production30-rep workflow |
| [EXP-03](../openspec/changes/boquitas-03-scenario-experiments/specs/scenario-experiments/spec.md) | Person weighting in shared orders | test_shared_order_waiting_time_is_summarized_by_order_and_person; withdrawal/unknown-history tests |
| [EXP-04](../openspec/changes/boquitas-03-scenario-experiments/specs/scenario-experiments/spec.md) | Hand-calculated queue area | test_payment_queue_area_and_maximum_use_settled_half_open_intervals; zero-time queue spike test |
| [EXP-05](../openspec/changes/boquitas-03-scenario-experiments/specs/scenario-experiments/spec.md) | Reserved inactive interval | test_regular_external_confirmation_is_reserved_but_not_active; main-reserved-transfer.png |
| [EXP-06](../openspec/changes/boquitas-03-scenario-experiments/specs/scenario-experiments/spec.md) | Completion after closing | test_new_cohort_permanence_includes_drain_after_horizon; exact closing exclusion test |
| [EXP-07](../openspec/changes/boquitas-03-scenario-experiments/specs/scenario-experiments/spec.md) | Known interval oracle; Missing or constant estimates | test_student_t_interval_uses_sample_standard_deviation_without_clamping; insufficient/constant interval tests; paired comparison tests |
| [EXP-08](../openspec/changes/boquitas-03-scenario-experiments/specs/scenario-experiments/spec.md) | Reopen a saved run | test_scenario_run_and_experiment_json_round_trip_without_regeneration; CSV tests; production JSON/CSV/reopen/hash |
| [EXP-09](../openspec/changes/boquitas-03-scenario-experiments/specs/scenario-experiments/spec.md) | Zero interarrival or incomplete experiment | test_zero_constant_interarrival_is_rejected_before_generation; work bounds and failed replication retention tests |
| [WEB-01](../openspec/changes/boquitas-04-local-web-app/specs/local-web-app/spec.md) | Invalid staffing input | test_zero_tuesday_preparers_returns_field_issue_without_result; request/error contract tests; existing invalid UI workflow |
| [WEB-02](../openspec/changes/boquitas-04-local-web-app/specs/local-web-app/spec.md) | Import approved corrected observations | production original/corrected policies workflow:120/119/119, three withdrawals and overlap6/4 |
| [WEB-03](../openspec/changes/boquitas-04-local-web-app/specs/local-web-app/spec.md) | Switch to regular mode | existing regular-mode/initial-state workflow; release first-click staffing/initial-worker regression |
| [WEB-04](../openspec/changes/boquitas-04-local-web-app/specs/local-web-app/spec.md) | Edit after running | existing submitted-result-after-edit workflow; frontend results-readback tests |
| [WEB-05](../openspec/changes/boquitas-04-local-web-app/specs/local-web-app/spec.md) | Select a batch member | production30-pair comparison and selected metrics equality; existing browser workflow selects replication4 |
| [WEB-06](../openspec/changes/boquitas-04-local-web-app/specs/local-web-app/spec.md) | Reopen an incompatible file | saved-file API contract tests; existing incompatible-file preservation; production download/reopen/full scientific hash |
| [WEB-07](../openspec/changes/boquitas-04-local-web-app/specs/local-web-app/spec.md) | Browser has no usable WebGL | existing empty-run and no-WebGL workflows retain metrics, CSV, reopening and timeline |
| [WEB-08](../openspec/changes/boquitas-04-local-web-app/specs/local-web-app/spec.md) | Offline runtime | production external-request-denial workflow; existing keyboard/narrow controls and reduced motion checks; loopback launcher |
| [VIS-01](../openspec/changes/boquitas-05-three-dimensional-replay/specs/three-dimensional-replay/spec.md) | Shared order at a preparer | existing shared-group browser test; production3D stage workflow; main shared-preparation graphical review |
| [VIS-02](../openspec/changes/boquitas-05-three-dimensional-replay/specs/three-dimensional-replay/spec.md) | Repeated seek | replay.test.ts: event order, deterministic backward seeks and initial queues; malformed-trace browser case |
| [VIS-03](../openspec/changes/boquitas-05-three-dimensional-replay/specs/three-dimensional-replay/spec.md) | Accelerated playback | replay-clock.test.ts; existing1x/60x playback, pause, restart, drain and replacement case |
| [VIS-04](../openspec/changes/boquitas-05-three-dimensional-replay/specs/three-dimensional-replay/spec.md) | Transfer pending in both modes | replay.test.ts and transfer/context-loss browser test; main-reserved-transfer.png and Tuesday review |
| [VIS-05](../openspec/changes/boquitas-05-three-dimensional-replay/specs/three-dimensional-replay/spec.md) | Short consecutive stages | existing immutable-trace/shared-group motion browser case; main1x0.2-to0.44s observed frames; authoritative boundary tests |
| [VIS-06](../openspec/changes/boquitas-05-three-dimensional-replay/specs/three-dimensional-replay/spec.md) | Select initialized person | existing camera orbit/zoom/reset and initialized-person browser tests; main unknown-arrival inspector |
| [VIS-07](../openspec/changes/boquitas-05-three-dimensional-replay/specs/three-dimensional-replay/spec.md) | Replace a run repeatedly | existing reduced-motion/repeated-replacement/no-WebGL/context-loss tests; production repeated loads; renderer source review |
| [REL-01](../openspec/changes/boquitas-06-validation-and-delivery/specs/validation-and-delivery/spec.md) | Start twice after installation | test_launcher.py; main actual PTY start/literal Ctrl+C/restart/default-browser requests and freed port |
| [REL-02](../openspec/changes/boquitas-06-validation-and-delivery/specs/validation-and-delivery/spec.md) | Offline complete workflow | dedicated production Playwright suite: service workers blocked, external HTTP(S) denied/monitored; installed launcher review |
| [REL-03](../openspec/changes/boquitas-06-validation-and-delivery/specs/validation-and-delivery/spec.md) | Missing visual inspection | actual production flows, independent full checks, direct graphical/source review; incomplete checks initially held pending |
| [REL-04](../openspec/changes/boquitas-06-validation-and-delivery/specs/validation-and-delivery/spec.md) | Another team member follows the guide | guides readback/links; documented reference regenerated in independent process and production API; second human/machine not tested |
| [REL-05](../openspec/changes/boquitas-06-validation-and-delivery/specs/validation-and-delivery/spec.md) | Validation status is reported | empirical-validation-protocol.md and guides review: calibration/validation pending, no fitted data or real-business improvements claimed |
| [REL-06](../openspec/changes/boquitas-06-validation-and-delivery/specs/validation-and-delivery/spec.md) | A required runner is unavailable | this actual check record/scenario map; environment/hashes; runner errors/retries and remaining limits; final task review |

Mapped: 48 requirements and 56 named scenarios. The final passing suite record applies to these mapped checks; documentation/reporting requirements also use direct readback.
