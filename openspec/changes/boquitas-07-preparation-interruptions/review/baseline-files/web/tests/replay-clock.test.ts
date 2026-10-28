import { describe, expect, it } from "vitest";
import {
  advance_playback_clock,
  create_playback_clock,
  pause,
  play,
  restart,
  seek,
  set_speed,
} from "../src/replay/clock";
import type { PlaybackSpeed } from "../src/replay/clock";
import { project_replay } from "../src/replay/project";
import type { ReplayTrace } from "../src/replay/project";
import tuesdayFixture from "./fixtures/replay/tuesday.json";

const tuesday = tuesdayFixture as ReplayTrace;

describe("deterministic playback clock", () => {
  it("starts paused at 20x and advances only by selected speed", () => {
    const initial = create_playback_clock(8);
    expect(initial).toEqual({ time_s: 0, drain_end_s: 8, playing: false, speed: 20 });
    expect(Object.isFrozen(initial)).toBe(true);

    const slow = advance_playback_clock(set_speed(play(initial), 1), 3);
    const fast = advance_playback_clock(set_speed(play(initial), 60), 0.05);
    expect(slow.time_s).toBe(3);
    expect(fast.time_s).toBe(3);
    expect(project_replay(tuesday, slow.time_s)).toEqual(project_replay(tuesday, fast.time_s));
    expect(initial.time_s).toBe(0);
  });

  it("pauses, seeks, clamps at drain, and restarts without mutating prior clocks", () => {
    const running = play(create_playback_clock(8));
    const advanced = advance_playback_clock(running, 0.1);
    expect(advanced.time_s).toBe(2);
    expect(pause(advanced).playing).toBe(false);
    expect(advance_playback_clock(pause(advanced), 1)).toEqual(pause(advanced));

    const resumed = seek(advanced, 1);
    expect(resumed).toMatchObject({ time_s: 1, playing: true });
    const atEnd = seek(resumed, 100);
    expect(atEnd).toMatchObject({ time_s: 8, playing: false });
    expect(restart(atEnd)).toMatchObject({ time_s: 0, playing: false, speed: 20 });
    expect(advanced.time_s).toBe(2);
  });

  it("pauses automatically at drain and rejects invalid speed or elapsed time", () => {
    const nearEnd = seek(play(create_playback_clock(8)), 7.5);
    expect(advance_playback_clock(nearEnd, 1)).toMatchObject({ time_s: 8, playing: false });
    expect(() => set_speed(create_playback_clock(8), 10 as PlaybackSpeed)).toThrow(/speed/);
    expect(() => advance_playback_clock(nearEnd, Number.NaN)).toThrow(/real_delta_s/);
  });
});
