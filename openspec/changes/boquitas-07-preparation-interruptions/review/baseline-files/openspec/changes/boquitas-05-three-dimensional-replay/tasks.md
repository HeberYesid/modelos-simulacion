Implementation authorized by the user on 2026-10-23 after approval of specs01–04. Owner: GPT-6 Luna; reviewer: main agent. All ten engineering tasks are complete; see [independent verification](verification-report.md). User approval is required before spec06. Use the approved replay/UI boundary and [selective TDD policy](../../README.md#selective-tdd-policy): critical trace/time projection and bug regressions are test-first; build scene, controls and cosmetic motion in coherent blocks with integration checks and actual visual QA. No RED is required for every visual edit; never claim visual verification from structural checks.

## 1. Trace projection and clock

- [x] 1.1 Implement VIS-02 validated pure projection using public trace fixtures; verify initialization and events at a selected time without random generation.
- [x] 1.2 Implement VIS-02 backward/repeated seeking; verify 100 -> 20 -> 100 gives identical logical states.
- [x] 1.3 Implement VIS-03 one playback clock, play/pause/restart, 1/5/20/60x speeds and drain timeline; verify speed-independent state and closing/day-offset labels.

## 2. Shop and operational states

- [x] 2.1 Refresh Three.js APIs via Context7 and frontend guidance, then implement VIS-01 procedural shop/workstations; verify both configured worker layouts in a real browser.
- [x] 2.2 Implement VIS-01 individual identities and shared-order arrangement; verify two people do not create two preparation actions.
- [x] 2.3 Implement VIS-04 active/idle/reserved worker and pending/paid/preparing distinctions; verify Tuesday release versus regular inactive reservation.
- [x] 2.4 Implement VIS-05 bounded walking/preparation gestures; verify zero/short stage transitions obey the trace immediately and never delay scientific events.
- [x] 2.5 Implement VIS-06 camera orbit/zoom/reset and person/order inspector; verify unknown historical timestamps remain unavailable.

## 3. Lifecycle and graphical acceptance

- [x] 3.1 Implement VIS-07 reduced motion, context-unavailable/lost state and disposal on replacement; verify three successive run loads leave one active loop and current handlers.
- [x] 3.2 Run replay unit/browser checks and type/build checks; inspect actual animation at key payment/preparation/withdrawal/delivery times, capture observed visual findings and responsiveness, and review the full diff against VIS-01 through VIS-07.
