# Spec07 Block 7.1: User and Technical Guidance

Date: 2026-10-24  
Scope: INT-17 and INT-18; task 7.1.  
Edited files: `docs/MANUAL_USUARIO.md` and `docs/technical-guide.md` only, plus this evidence note.

## Changes

- Updated the Spanish manual's documented state to distinguish the accepted V1 flow and accepted V2 engine/metrics behavior from the V2 editor, saved-file/API workflow, browser projection, and final visible labels, which remain under integration acceptance.
- Added a V2 model guide without click instructions: explicit `cashier_interruptions` fields and time/ID rules, one regular integrated worker, same-worker resumption, inactive confirmation reservation, the separate paid first-preparation queue, after-H scripts for already-admitted work, and indexed/ineligible schedule failures. Clarified literal replication-indexed generated IDs and linked the stable-initial-ID scripted demo input and V1 counterpart.
- Documented the solved core timeline as synthetic arithmetic, not a real-shop result. Added the confirmed Oct. 23 join scope (IDs 1–8 for that visit only), unknown person counts and pause boundaries, and the distinction between 183 seconds elapsed and unmeasured active work; 173 seconds is not presented as an active measurement.
- Added V2 metric meanings and IDs for active preparation, paused time and pause count; clarified unknown initial history remains unavailable and V2 queue wait is separate from post-start pause.
- Updated file sizes using the implemented H01 policy: observation files up to 10 MiB; saved JSON and accepted run/experiment responses up to 64 MiB. Recorded `saved_file_too_large` (413), `result_too_large` (422), exact server JSON download bytes, and no re-execution when reopening an accepted saved run.
- Preserved the existing deterministic V1 scientific reference hash and verification command. No files in `docs/field-kit`, academic document folders, or audit-remediation were changed.

## Readback and limits

- Read both existing guides in full, then reread the edited sections. Cross-checked the V2 fields, mode/capacity, validation paths, metric IDs, generated-ID format, demo fixture, and H01 limits against the current sources, approved Spec07 design/requirements, and accepted task status.
- Native Markdown link check scanned **17 links** in the two guides; all local file targets exist. The linked manual section anchors for sections 4, 5, and 9 are present.
- No executable tests were run for these prose-only edits. No browser, API V2 round-trip, visual pause/resume, or frontend label verification is claimed. The guide marks those workflows pending.
- Calibration and independent empirical validation remain pending. No change was made to OpenSpec checkboxes or implementation status.
