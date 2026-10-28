# Independent experiments/files/contracts review

Date: 2026-10-24. Tasks 5.1 and 5.2 accepted; task 5.3 requires the remaining diagnostic follow-up. Task 5.4 was reopened during UI integration: generated discriminated unions type some numeric wire version tags as strings. Generated-file drift checks passed, but the transport aliases must represent actual numeric JSON tags and pass complete TypeScript checking before acceptance.

Reviewed demand generation, version-dispatched selected runs/experiments, member version validation, retained failed replication indices/denominators, paired-comparison generation keys, JSON loaders and CSV exports. Scheduling fields do not enter demand generation. V1 and V2 inputs remain distinct, and missing root tags default only to legacy V1 where previously permitted.

Independently observed 36 passing tests across new/legacy interruption experiments, exports, API, experiments, exports and demand suites. OpenAPI exporter drift check matched seven files; generated TypeScript contract check passed; mypy passed 15 source files. Reproduced both V1 scientific run files byte for byte; current hashes are recorded in final-preservation-check.json. New V2 fixtures are additive. Global frontend type/build acceptance remains with tasks 6/7.

Main review first found and reproduced missing-tag legacy CSV incompatibility, which Luna corrected. A subsequent four-case static V2 diagnostic regression exposed collapsed paths; the first correction handles run times/capacity. Independent probing then found remaining path loss for script IDs/mode, experiment requests and saved scenarios. Task 5.3 stays unchecked until these public boundaries identify the invalid field/index. This is required by INT-02/INT-13, not an extra operational policy.

The coordinated H01 10/64 MiB input limits, compact checked result responses and exact browser response-byte preservation remain required. Browser workflows and H01 integrated regression will be accepted separately.
