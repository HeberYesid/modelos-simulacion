# Independent acceptance of engine and metric blocks

Date: 2026-10-24. Implementers: GPT-6 Luna backend and metrics blocks; reviewer: main agent. Accepted tasks after the earlier contract block: 1.2, 1.4, 2.1–2.5, 3.1–3.4 and 4.1–4.3. Including the accepted baseline/contracts, this is 16 of 28 tasks; API/editor/replay/release acceptance remain pending.

## Direct code and verification review

- Reviewed the complete no-index engine and metrics diffs against exact pre-edit source copies. One coordinator/worker registry remains authoritative; the V2 path is explicit, script references are validated and paused work loses its deadline. Version-1 branches and models retain their behavior.
- Independently executed original engine/metrics tests plus new engine/contracts/reviewer/metrics tests: **109 passed**. Focused Ruff passed and mypy passed for engine/metrics. This is the combined domain suite, not a claim that all project/API/frontend checks are complete.
- Independently exercised real public `summarize(simulate(...))` workloads beyond the core integration: confirmation, repeated interruption, a second pause exactly at the prior payment/resume boundary, shared-person weighting, unknown initial preparation history and valid post-close scripted work.
- Core: A/B delivered at 14/17; A active 10 s, paused 2 s, one pause. Confirmation: 17/20 with A paused 5 s. Repeated and resume-boundary examples: 15/18/19 with A active 10 s and paused 3 s across two pauses.
- Shared group: mean active preparation 6.5 s per order and 23/3 s per person; worker active fraction remained 0.85 and mean paid queue 0.35. Person projection did not duplicate resource work.
- Initial A with unknown earlier history delivered at 11 and B at 12; full A active/elapsed preparation remained null. The H=4 example delivered A/B at 14/17 and reported 13 s overtime without changing the declared window.
- Four independently loaded pre-implementation V1 engine/metric cases produced byte-identical traces and metric JSON: empty regular, regular shared orders/confirmation, Tuesday shared orders/confirmation, and regular initial preparation. This uses actual pre-edit source copies as differential references, not expected values recomputed from the new implementation.
- The main agent's failing payment-completion regression was reproduced and fixed by Luna. The V2 interrupting `payment_completed(B)` event now exposes the paid queue and released worker before resuming A, while V1 metadata stays unchanged.
- Review found inaccurate metadata in manually authored new metric-test fixtures (t=9 remaining work, released worker state and completed-order worker IDs). Luna corrected only those new fixtures, reran the focused suites, and recorded that these were fixture corrections rather than a new RED/GREEN cycle or algorithm change.

Actual independent timeline/weighting/differential results are saved in [domain-main-checks.json](domain-main-checks.json). Implementer chronology and scope are in [block2-luna.md](block2-luna.md) and [block3-metrics-luna.md](block3-metrics-luna.md). The reports identify which cases were test-first and which were later acceptance coverage; no missing RED is reconstructed by breaking working behavior.

## Remaining integration and concurrent work

The H01 owner applied its separately authorized large-result fix and released its API/browser files. Its 10 MiB observation limit, 64 MiB saved/output limit and exact response-byte preservation were captured in `after-h01-baseline/` before V2 integration. Spec07's integration agent is adapting the versioned API/exports on that live baseline. No H01 tests or guards may be dropped to accept V2.

This domain acceptance does not establish implemented editing/replay, full saved-file workflows, visual acceptance, empirical calibration or a learned automatic cashier policy. It does not authorize commit/push, deployment or main-spec sync/archive.
