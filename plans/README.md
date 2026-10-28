# Boquitas analysis and proposed changes

Prepared on 2026-10-24 with the improve planning workflow. The user first authorized a descriptive comparison and a proposal, then approved that proposal and requested a new Spec without implementation. That planning-stage statement described the original proposal only. Current status is recorded below and in the Spec07 verification report.

## Review material

- [Observed Tuesday versus regular-day comparison](comparacion-martes-vs-normal-2026-10.md): Spanish report for the study owner, with stage summaries, eight confirmed linked regular-day orders and measurement limits.
- [Preparation interruption proposal](001-scripted-preparation-interruptions.md): English technical handoff plan, synthetic acceptance examples and explicit scope.
- [Spec07 planning package](../openspec/changes/boquitas-07-preparation-interruptions/proposal.md): the approved proposal expressed as requirements, design and implementation tasks; see the final verification report for subsequent acceptance.
- [Calculation evidence](evidence/comparison-calculations.json): exact results, denominators, source identities and user-confirmed semantics.
- [Review baseline](evidence/preparation-proposal-baseline.json): fingerprints of the existing working-tree files and corrected Tuesday source. The application is largely untracked at the recorded commit; a commit hash alone does not capture this baseline.

## Proposed execution order and status

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| 001 | Explicit preparation pause, cashier service and resume for one integrated worker | P2 | L | Spec07 implementation approved 2026-10-24; Luna blocks with main-agent review | ENGINEERING ACCEPTED — 28/28 tasks recorded; preserve version 1 |
| [002](002-incremental-repository-commits.md) | Record the current application in seven incremental atomic commits | P2 | M | User approved local execution on 2026-10-28; isolated candidate checks | EXECUTED LOCALLY — see the [execution record](../docs/verification/incremental-commits-2026-10-28.md); no remote publication |

The user approved the proposed behavior on 2026-10-24 for specification preparation. The later implementation authorization and engineering acceptance are recorded in Spec07; preserve existing uncommitted work and the project approval rules. No commit, push, PR, deployment or empirical-validation claim is authorized by this package.

The user subsequently approved Spec07 implementation on 2026-10-24 and requested bounded Luna work with independent main-agent review and preservation of version 1/tests. The [final Spec07 verification report](../openspec/changes/boquitas-07-preparation-interruptions/verification-report.md) records engineering acceptance of all 28 tasks. This is a documentary status correction on 2026-10-28, not a fresh execution of the software checks. Main-spec synchronization/archiving and remote operations remain outside scope.

## Scope of investigation

The investigation covered the two observation sessions and the engine, trace, metrics, serialization and replay paths affected by preparation interruption. It was not a general security, performance or dependency audit. No new software tests or browser checks were run for this documentation-only delivery.

## Alternatives deferred

- An immediate automatic cashier-priority policy: the observed interruption does not establish this behavior; the interrupted payment began 20 seconds after arrival.
- Multiple integrated workers, nested interruptions and preparation migration between workers: outside the minimum supported case and not established by this observation.
- Fitting active preparation time by subtracting the 10-second payment window: exact pause boundaries were not observed.
