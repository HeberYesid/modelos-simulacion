# Prospective empirical validation protocol

## Status and purpose

This is a prospective measurement and analysis protocol. No new field observations, fitted distributions, sample-size target, tolerance, precision target, or empirical validation result is supplied here. Software tests and synthetic experiments assess software behavior; they do not establish that the model predicts Boquitas operations.

Before collection begins, the study owner and an operator should approve the event definitions, observation coverage, privacy handling, calibration/validation split, statistical summaries, and acceptance criteria. Keep unobserved information unknown. Do not use automatic fitting or select a threshold after seeing validation results.

## Measurement workbook

Use anonymous identifiers and keep any re-identification key outside the analysis files. Give each observation visit a stable `visit_id`; assign separate anonymous identifiers for people, groups, orders, and workers. Preserve the link between a person and their group/order only when it was actually observed. A cashier record ID and a delivery record ID are not a cross-station join key.

Record timestamps with their date, local time-zone/clock basis, and the precision actually captured. State the operational definition for each event before collection. A blank or unknown field is not a zero. Store source records read-only and retain source-file identity and line/event references for audit.

The following tabs make repeated segments and partial receipts recordable without splitting or averaging a duration across people.

### `visits`

One row per observation visit or session:

| Field | Record |
| --- | --- |
| `visit_id` | Anonymous identifier for the visit/session. |
| `observation_start_at`, `observation_end_at` | Start and end of the observation window, including date and clock basis. |
| `day_type` | The observed day classification and its definition. |
| `initial_shop_state` | What was present at the start: known queue/work state, empty, or unknown; record the observation basis. |
| `reported_staff_by_pool` | Workers reported/present in each relevant pool over the observed interval, with changes recorded separately. |
| `clock_precision`, `clock_source` | Actual timestamp precision and source/clock used. |
| `source_id`, `observer_id` | Non-personal source and observer references needed to audit the record. |

### `people_and_orders`

One row per observed person/order relationship, with separate anonymous IDs. Repeat IDs across rows only to express a verified relationship. Preserve the event definition used for arrival.

| Field | Record |
| --- | --- |
| `visit_id`, `person_id`, `group_id`, `order_id` | Anonymous IDs. Use an explicit unknown reason when a relationship is not established. |
| `arrival_at`, `arrival_definition` | The observed arrival timestamp and the approved operational definition (for example, which observable event marks joining the service process). |
| `outcome` | Delivered, withdrawn, still present at observation end, or unknown as actually observed. |
| `withdrawal_at` | Timestamp only when a withdrawal was observed. |
| `final_delivery_at` | Final order delivery timestamp when observed; it does not imply that every person received the same partial item. |
| `censoring_status`, `unknown_reason` | Whether required history starts before observation, ends after it, is incomplete, or is unknown; retain the reason. |

If individual or partial receipts are studied, add a `partial_receipts` tab with one row per observed receipt: `visit_id`, `order_id`, `person_id` (recipient), `product_id` (if identifiable), and `receipt_at`. Do not divide a single order duration among group members or infer that all group members received a product at the same instant.

### `worker_segments`

One row per worker assignment or timed segment; create another row for every distinct segment. Do not merge active work with an external wait.

| Field | Record |
| --- | --- |
| `visit_id`, `worker_id`, `pool`, `order_id` | Anonymous worker, observed pool/role, and linked order where verified. Record the effective interval if staffing changes. |
| `payment_medium` | Medium as observed/reported, including an unknown state where not recorded. Define allowed labels before collection. |
| `segment_type`, `segment_start_at`, `segment_end_at` | Separate active cashier/payment work, external confirmation wait, preparation work, or other pre-defined segment. Preserve actual boundaries and do not convert an unobserved wait into active work. |
| `preparation_start_at` | Start of preparation for the order, if not already represented by a preparation segment. |
| `final_delivery_at` | Time the last product/order was delivered; retain partial-receipt timestamps separately when relevant. |
| `censoring_status`, `source_reference` | Whether a segment is incomplete at either observation boundary and how its source can be audited. |

Use one explicit, versioned event definition for arrival, payment start, active payment end, external confirmation start/end, preparation start, partial receipt, final delivery, and withdrawal. If payment has several active intervals, record each separately. The exact list of `segment_type` labels and any domain-specific payment categories must be agreed before collection; this protocol does not infer them from the current preliminary files.

## Collection coverage and source quality

Collect representative observations for Tuesday promotion conditions and other relevant day types, across the periods needed to evaluate the stated study question. Record the actual observation start/end and initial shop state; do not assume that a partially observed visit began empty. Record worker presence and assignments with enough detail to distinguish concurrent workers and active versus reserved time.

Before estimating inputs or comparing model outputs:

1. Check timestamp units, date/time-zone basis, clock precision, chronology, duplicate identifiers, and source-line/event traceability.
2. Separate missing, unobserved, invalid, censored, withdrawn, and incomplete outcomes. Do not silently drop them or convert them to zero-duration service.
3. Confirm how each order, group, and person link was observed. Keep station-local IDs separate unless independent evidence proves a link.
4. Investigate the known conflict of six overlapping delivery intervals versus four reported preparers with corroborating field evidence. Do not resolve it by changing timestamps or tuning staffing to the desired result.
5. Preserve immutable raw observations and document any separately approved cleaning or correction with a before/after value, source reference, and reason.

## Calibration and independent validation

Select a calibration subset and freeze its record IDs before parameter estimation. Reserve validation observations by whole visit/day so that the same people, orders, intervals, or repeated conditions do not appear in both subsets. Keep a manifest of the split and its rationale. If the amount of data is insufficient to make a defensible split, report that limit rather than treating reused calibration records as independent validation.

Only after source quality and event meanings are reviewed should a separate analysis specify eligible distributions, parameter-estimation methods, censoring treatment, and any derived assumptions. Store each fitted value with its source subset, units, method, uncertainty, and approval. The current application does not perform this fitting automatically.

For validation, compare like with like: matching units, populations, observation windows, day types, and cohort/outcome definitions. Keep order-based and person-based measures separate. Compare only measures supported by observed data; unknown histories remain unavailable. Review results with an operator, inspect extreme and boundary scenarios, and record departures between the model and operation with likely causes. Operational recommendations require a successful independent validation gate and separate operator review.

The Tuesday observations have no confirmed cashier-to-delivery order links. The user confirmed matching IDs 1–8 as the same orders only for the 2026-10-23 normal visit, so arrival-at-cashier to final-delivery elapsed time can be described for those eight orders. On 2026-10-25 the user explicitly confirmed that the first datum for each date marks observation start: 2026-10-20 at 16:45:35 and 2026-10-23 at 17:20:23, using the first chronological station record. The user then confirmed departure at the last record of each date: 18:41:30 on 2026-10-20 and 18:21:09 on 2026-10-23. The elapsed observation windows are 6955 and 3646 seconds respectively. The observer also explicitly confirmed recording all orders continuously within both windows, without observation breaks or omissions. Order-record coverage is therefore complete by observer report; this does not establish the initial queue/work state, measure active-work segments or imply absence of operational preparation pauses. A further user clarification established that customers were already waiting at Tuesday observation start and none were waiting at Friday start. The observer subsequently stated that Tuesday waiting-customer count and queue station cannot be recalled and explicitly requested not-recorded treatment; both values remain null with `not_recorded` status, without further reconstruction from memory. Initial order identities and work already in preparation for either visit remain unconfirmed; absence of Friday waiting customers does not establish an empty system. Clock basis remains unconfirmed; neither visit supplies observed group sizes or person-level links. End-to-end person waiting/permanence and an independently validated model cannot be claimed from these files alone. See the [existing-visit evidence](field-kit/existing-visits/README.md) and the [specific missing evidence](field-kit/pendientes-de-medicion.md). Do not generalize the Friday joins to Tuesday or future visits.

## Decisions that remain open

The following values are intentionally not prescribed here and must be decided before the relevant analysis, using the study question, observation process, and available evidence:

- adequate sample size and coverage by day type/operating period;
- acceptable empirical-validation tolerances and the rationale for each metric;
- desired confidence/precision for estimates and simulation replication counts beyond the software's demonstration default;
- the calibration model family, fitting method, handling of censoring, and which records qualify;
- the predefined criteria for accepting model validity and making operational recommendations.

Do not choose these thresholds after inspecting the held-out validation results. Until they are approved and the reserved data are evaluated, label calibration and empirical validation **pending**. Synthetic demonstrations, paired intervals, and improved simulated metrics are not evidence that the real business will improve.
