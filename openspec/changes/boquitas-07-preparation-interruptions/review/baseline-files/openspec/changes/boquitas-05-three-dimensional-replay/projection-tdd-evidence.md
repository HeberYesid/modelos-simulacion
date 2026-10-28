# Replay projection and clock evidence

## Trace and time integrity

- Selected public seam: `validate_replay_trace`, `project_replay`, and the playback projector/clock APIs in `web/src/replay/`.
- Test-first RED: `pnpm --dir web test --run tests/replay.test.ts` reached Vitest after the permitted runner invocation and failed 7/7 projection cases against the unimplemented API scaffold. The cases covered version/required fields, timestamp and sequence ordering, same-time state settlement, Tuesday versus regular transfer reservation, abandonment, closing/draining, backward seeking through a real trace, and selected-time bounds. The first default-sandbox attempt stopped earlier with Vite `spawn EPERM` while loading its config; it did not execute tests.
- Engine fixture generation: `uv --cache-dir .uv-cache run --frozen --offline --project . python -` called `boquitas.engine.simulate` and serialized the resulting public traces. `tuesday.json` has a two-person order, a two-person initialized order with unknown arrival, withdrawal at 0.75 s, admissions close at 4 s, and drain at 8 s. `regular.json` covers the same group/withdrawal/unknown-arrival cases, with its worker reserved but inactive during transfer at 4 s and drain at 10 s. `long-timeline.json` has drain at 122 s for the 100 -> 20 -> 100 backward-seek case. `queues.json` uses reversed initialization order and queue ranks to check stable initial payment/preparation priority before a new arrival; it also preserves a known initialized arrival of -5 s and unknown initial arrival values.
- GREEN: `pnpm --dir web test --run tests/replay.test.ts tests/replay-clock.test.ts` passed 11/11 tests. This includes valid increasing sequence gaps, invalid same-time sequence reversal, rank-ordered queues, cursor forward/backward equivalence, immutable clock controls, and speed-independent logical state. The cursor validates once, advances only across newly reached events, exposes `next_event_time_s`, rebuilds on backward seeks, and returns frozen snapshots.
- Full frontend unit suite: `pnpm --dir web test --run` passed 21/21 tests across 9 files.

## Type check

- `pnpm --dir web typecheck` passed with exit 0 after the scene integration's TypeScript fixes. The prior in-progress scene errors were resolved before this final check.
