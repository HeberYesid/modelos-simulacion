## Why

The raw and corrected observation files must be usable without losing provenance or converting ambiguous measurements into invented people, worker assignments or station links. Import is a data-quality boundary, not automatic calibration.

## What Changes

- Parse the agreed CSV fields in CSV or TXT, including message prefixes and repeated headers from the pasted source.
- Preserve original values, line provenance, the cashier 35 correction, delivery 26 exclusion and the three recorded withdrawals.
- Report chronology, identity and overlap problems, and keep cashier and delivery observations separate.
- Dependencies: 01 vocabulary and shared time/identity policy.
- Non-goals: spreadsheets, OCR, statistical fitting, cross-station matching, worker reconstruction, individual waiting-time inference and source-file editing.

## Capabilities

### New Capabilities

- `observation-import`: provenance-preserving normalized observations and explicit quality diagnostics.

### Modified Capabilities

None.

## Impact

Future Python observation adapter and public `import_observations` result contract, later exposed by 04. Existing academic documents and raw files remain source evidence. Observations never become engine inputs implicitly.
