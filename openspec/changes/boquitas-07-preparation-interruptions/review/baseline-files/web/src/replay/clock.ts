export const PLAYBACK_SPEEDS = [1, 5, 20, 60] as const;

export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export interface PlaybackClock {
  readonly time_s: number;
  readonly drain_end_s: number;
  readonly playing: boolean;
  readonly speed: PlaybackSpeed;
}

export class PlaybackClockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaybackClockError";
  }
}

/** Create the paused clock used when a saved replay is loaded. */
export function create_playback_clock(drain_end_s: number, initial_time_s = 0): PlaybackClock {
  requireFiniteNonnegative(drain_end_s, "drain_end_s");
  requireFinite(initial_time_s, "initial_time_s");
  const time_s = clamp(initial_time_s, 0, drain_end_s);
  return makeClock(time_s, drain_end_s, false, 20);
}

export function play(clock: PlaybackClock): PlaybackClock {
  validateClock(clock);
  return makeClock(clock.time_s, clock.drain_end_s, clock.time_s < clock.drain_end_s, clock.speed);
}

export function pause(clock: PlaybackClock): PlaybackClock {
  validateClock(clock);
  return makeClock(clock.time_s, clock.drain_end_s, false, clock.speed);
}

/** Seek within the saved drain range; seeking to its end always pauses. */
export function seek(clock: PlaybackClock, time_s: number): PlaybackClock {
  validateClock(clock);
  requireFinite(time_s, "time_s");
  const selected = clamp(time_s, 0, clock.drain_end_s);
  return makeClock(selected, clock.drain_end_s, clock.playing && selected < clock.drain_end_s, clock.speed);
}

/** Restart at simulation time zero in a paused state. */
export function restart(clock: PlaybackClock): PlaybackClock {
  validateClock(clock);
  return makeClock(0, clock.drain_end_s, false, clock.speed);
}

export function set_speed(clock: PlaybackClock, speed: PlaybackSpeed): PlaybackClock {
  validateClock(clock);
  if (!PLAYBACK_SPEEDS.includes(speed)) {
    throw new PlaybackClockError("speed must be one of 1, 5, 20, or 60.");
  }
  return makeClock(clock.time_s, clock.drain_end_s, clock.playing, speed);
}

/** Advance by browser-frame seconds, scaled only into virtual simulation time. */
export function advance_playback_clock(clock: PlaybackClock, real_delta_s: number): PlaybackClock {
  validateClock(clock);
  requireFiniteNonnegative(real_delta_s, "real_delta_s");
  if (!clock.playing || real_delta_s === 0) {
    return clock;
  }
  const selected = Math.min(clock.drain_end_s, clock.time_s + real_delta_s * clock.speed);
  return makeClock(selected, clock.drain_end_s, selected < clock.drain_end_s, clock.speed);
}

function validateClock(clock: PlaybackClock): void {
  if (typeof clock !== "object" || clock === null) {
    throw new PlaybackClockError("clock must be a playback clock.");
  }
  requireFiniteNonnegative(clock.drain_end_s, "drain_end_s");
  requireFinite(clock.time_s, "time_s");
  if (clock.time_s < 0 || clock.time_s > clock.drain_end_s) {
    throw new PlaybackClockError("clock.time_s must be within the drain range.");
  }
  if (typeof clock.playing !== "boolean") {
    throw new PlaybackClockError("clock.playing must be a boolean.");
  }
  if (!PLAYBACK_SPEEDS.includes(clock.speed)) {
    throw new PlaybackClockError("clock.speed must be one of 1, 5, 20, or 60.");
  }
}

function makeClock(
  time_s: number,
  drain_end_s: number,
  playing: boolean,
  speed: PlaybackSpeed,
): PlaybackClock {
  return Object.freeze({ time_s, drain_end_s, playing, speed });
}

function requireFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new PlaybackClockError(`${field} must be finite.`);
  }
}

function requireFiniteNonnegative(value: number, field: string): void {
  requireFinite(value, field);
  if (value < 0) {
    throw new PlaybackClockError(`${field} must be nonnegative.`);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
