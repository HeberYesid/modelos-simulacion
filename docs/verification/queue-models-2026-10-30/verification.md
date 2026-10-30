# Queue models and stage performance — 2026-10-30

## Implementation and interpretation

The user authorized performance measures and M/M/1 versus M/M/s references. Tuesday has payment and preparation in tandem, each classified by its configured server count. Friday uses one integrated worker and an M/M/1 reference. Existing generic regular-mode capacities and saved-file compatibility remain supported; historical multi-worker integrated scenarios retain their actual capacity.

- `web/src/domain/queueing-theory.ts`: configured lambda and per-server mu, Erlang-C measures, stability and assumption checks, L, Lq, W, Wq, rho, P0 and probability of waiting. Capacity limits use the generated work-limits contract.
- `web/src/domain/queueing-performance.ts`: integrates immutable trace occupancy over the admission window; measures valid completed-new-order times through drain. Unknown values remain unavailable. Component reservation seconds protect reopened historical results from an older pool-total bug.
- `web/src/components/queue-models.ts`: closed-by-default Results disclosure, separate theoretical/simulated columns, stage applicability, accessible scrollable tables and Tuesday full-path metrics. A selected experiment replication is described individually, without claiming an experiment-wide average.
- `src/boquitas/metrics.py`: two pool-total lookups corrected from stale loop variable `pool` to `pool_name`. Previously cashier totals could contain preparer usage. Two regenerated V2 fixture files changed only inactive cashier/preparer totals from 17 worker-seconds to zero.
- `docs/user/guia-de-uso.md`: user instructions, units and limitations. Existing unrelated changes were preserved; integration diffs were compared with task-start snapshots.

Exact M/M references require independent exponential inter-arrival/service times, constant Poisson rate, equivalent parallel servers, FIFO and unbounded queues. Preparation uses the external long-run rate only when payment is applicable and stable. Arrival schedules, patience, incompatible services/confirmation waits and actual scripted interruptions prevent unsupported exact formulas. Empty V2 interruption schedules are not automatically excluded. Overload retains rho but suppresses finite stationary means.

Friday service sums payment and preparation; even exponential components generally do not produce an exponential sum. Its M/M/1 reference is explicitly marked as an approximation unless the actual aggregate qualifies as exponential. Engine service sampling and distributions were not changed to force a label. Formula reference: [MIT queueing lecture](https://web.mit.edu/1.041/spring2023/lectures/L8-queuing-models-2023sp.pdf).

L/Lq use finite-window occupancy, including initialized orders and eventual withdrawals. W/Wq use valid completed-new-order histories through drain. Integrated Lq/Wq describe waiting before the first payment, excluding later interruption waits. Rho distinguishes theoretical offered load from simulated resource reservation. Different populations/windows are explicit; no finite-run Little's-law identity is forced. These comparisons do not constitute empirical calibration or business validation.

## Observed test-first evidence

- The performance-module import failed before implementation. A manually solved H=10 timeline then passed: payment L/Lq=0.8/0.2 and preparation=1.1/0.2, with an initialized order and post-close completions; W=4s and 7.5s for completed new orders.
- M/M/1 oracle lambda=6/h, mu=10/h: rho=0.6, L=1.5, Lq=0.9, W=900s, Wq=540s. M/M/2 oracle lambda=6/h, mu=4/h/server: rho=0.75, P0=1/7, P(wait)=9/14, Lq=27/14, L=24/7. Theory tests also cover four Tuesday combinations, overload, zero arrivals and assumption exclusions. Main-agent review requested and verified corrections for V2 empty schedules, menu/transfer mixtures and capacity bounds.
- Pool accounting RED reproduced cashier usage as 6s instead of 2s; GREEN passed after the two lookups were corrected. The same order requires 6 preparer-seconds. Inactive integrated usage stays zero with unavailable fractions.
- Legacy-result RED used erroneous total occupation 0.9 instead of correct component-based 0.2; GREEN passed after the component-based reading.

## Final verification

| Check | Observed result |
| --- | --- |
| `pnpm --dir web test --run` | 117 passed, 25 files |
| `pnpm --dir web typecheck` | Passed |
| `pnpm --dir web build` | Passed; existing JS chunk-size warning |
| `uv --cache-dir .uv-cache run --frozen pytest -q --ignore=tests/test_launcher.py` | 296 passed; existing FastAPI TestClient deprecation warning |
| Ruff | Full check passed with inaccessible pre-existing temporary-directory warning; focused metrics/test check passed |
| `uv --cache-dir .uv-cache run --frozen mypy src/boquitas` | Passed, 17 source files |
| `uv --cache-dir .uv-cache run --frozen python scripts/export_web_contracts.py --check` | Passed, 8 files match after regeneration |
| `pnpm --dir web contracts:check` | Passed |
| `openspec validate --changes --strict --no-interactive` | 7 existing packages passed |
| Browser workflows | 13 passed sequentially on isolated local servers |
| Review | Task diff and fixture-value changes reviewed; desktop/mobile screenshots inspected |

Browser command: `pnpm --dir web test:e2e --config .tmp/queue-models-playwright.config.ts --workers=1 queue-models.spec.ts scenario-analysis.spec.ts first-run-usability.spec.ts`. The temporary config starts a fresh API on 8008 and Vite on 5183, proxies `/api` to 8008 and retains standard test settings. It avoids the existing listener on 8000. Three-worker execution initially encountered one concurrent-run 409; the final sequential run passed all 13. Coverage includes the four Tuesday capacities, Friday, existing execution/comparison workflows, page errors, mobile overflow and keyboard-focusable table scrolling. Browser checks used the development server; the production bundle was compiled separately.

Initial sandbox attempts could not spawn Vite processes or access pytest's temporary directory. Final successful commands used approved local process permissions. The full Python attempt recorded 297 passed, one launcher failure and one skipped launcher check because port 8000 was occupied. The listener was preserved. Launcher checks still require a free port and are not claimed as passed.

## Evidence and limits

- [Tuesday desktop](tuesday-desktop.png), [Tuesday mobile](tuesday-mobile.png), [Friday desktop](friday-desktop.png).
- Local web bundle rebuilt. A running API needs restart for the backend correction. Portable ZIP/executables were not rebuilt.
- Panel metrics are reproduced when reopening saved runs. No new JSON fields or CSV columns; existing files are not rewritten.
- No commit, remote operation, deployment, observation calibration, empirical validation or specification synchronization.

## Follow-up: reference labels and always-visible rates

The user authorized correction of the misleading model labels and upstream-stability message, and requested lambda/mu even when M/M formulas do not apply.

- Stage titles now name the team and server count. M/M/1 or M/M/s appears separately as an explicit reference model, alongside the configured service distribution and arrival source. The topology names servers without asserting M/M applicability. W is labeled total time in the stage.
- Non-exponential payment now produces the preparation warning `No se puede asumir que las salidas de pago sean Poisson con esta configuración.` It no longer claims instability merely because a reference is unavailable. An actual M/M reference with rho >= 1 has a separate capacity warning covering equality.
- Stage lambda/mu are independent from nullable M/M measures. They remain visible and are labeled configured nominal/reference rates, not sample estimates. Scheduled lambda uses a duration-weighted mean and is not labeled a constant Poisson rate; preparation notes that effective inflow depends on payment output and possible abandonment. Menu and integrated service means, interrupted V2 cases and unavailable finite rates are handled explicitly.
- RED was observed for the screenshot-like triangular-service case: the heading still claimed `Pago · M/M/1 · 1 servidor`, rather than separating the reference. Domain regressions also failed before independent rate fields and corrected upstream reasons were added; the rho=1 message regression failed before its wording correction.
- Final checks: **122 frontend unit tests**, application TypeScript and Vite production build passed. **6 browser workflows** passed sequentially with the isolated API/Vite configuration above, including all four exponential Tuesday capacity combinations, Friday and the non-exponential 1-cashier/4-preparer case. Screenshots were inspected on desktop/mobile; no page-width overflow was observed. The existing bundle-size warning remains. No backend/API/schema, engine, analytical Erlang-C formulas or simulated-measure calculations were changed in this follow-up, so Python and contract suites were not repeated.
- Screenshots: [configured rates on desktop](configured-rates-desktop.png), [configured rates on mobile](configured-rates-mobile.png). User guide updated. Local web bundle rebuilt; portable packages remain unchanged. No commit or remote operation.
