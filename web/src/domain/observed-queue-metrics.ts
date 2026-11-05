import { observedTimeSeconds, type ObservedStation, type ObservedVisit } from "../replay/observed";

export interface ObservedQueueMeasures {
  station: ObservedStation;
  L: number | null;
  Lq: number | null;
  WSeconds: number | null;
  WqSeconds: number | null;
  pOccupied: number | null;
  pEmpty: number | null;
  completedOrders: number;
}

interface Interval {
  start: number;
  end: number;
}

function clippedInterval(start: number | null, end: number | null, horizon: number): Interval | null {
  if (start === null || end === null || end <= start) return null;
  const clippedStart = Math.max(0, start);
  const clippedEnd = Math.min(horizon, end);
  return clippedEnd > clippedStart ? { start: clippedStart, end: clippedEnd } : null;
}

function intervalArea(intervals: Interval[]): number {
  return intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);
}

function unionArea(intervals: Interval[]): number {
  const sorted = [...intervals].sort((left, right) => left.start - right.start);
  let area = 0;
  let start: number | null = null;
  let end = 0;
  for (const interval of sorted) {
    if (start === null) {
      start = interval.start;
      end = interval.end;
    } else if (interval.start <= end) {
      end = Math.max(end, interval.end);
    } else {
      area += end - start;
      start = interval.start;
      end = interval.end;
    }
  }
  return start === null ? 0 : area + end - start;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** Descriptive station measures use only timestamps recorded within the observation clip. */
export function calculateObservedQueueMeasures(visit: ObservedVisit): ObservedQueueMeasures[] {
  const horizon = visit.duration_s;
  return (["caja", "entrega"] as const).map((station) => {
    const records = visit.records.filter((record) => record.station === station);
    const systemIntervals: Interval[] = [];
    const queueIntervals: Interval[] = [];
    const waits: number[] = [];
    const sojourns: number[] = [];
    for (const record of records) {
      const fields = record.raw_fields;
      const arrival = fields.hora_llegada ? observedTimeSeconds(visit, fields.hora_llegada) : null;
      const start = fields.hora_inicio ? observedTimeSeconds(visit, fields.hora_inicio) : null;
      const end = fields.hora_fin ? observedTimeSeconds(visit, fields.hora_fin) : null;
      const departure = fields.hora_se_fue ? observedTimeSeconds(visit, fields.hora_se_fue) : null;
      const exit = end ?? departure;
      const system = clippedInterval(arrival, exit, horizon);
      const waiting = clippedInterval(arrival, start ?? departure, horizon);
      if (system) systemIntervals.push(system);
      if (waiting) queueIntervals.push(waiting);
      if (arrival !== null && start !== null && end !== null && start >= arrival && end >= start) {
        waits.push(start - arrival);
        sojourns.push(end - arrival);
      }
    }
    const denominator = Number.isFinite(horizon) && horizon > 0 ? horizon : null;
    const occupiedSeconds = unionArea(systemIntervals);
    return {
      station,
      L: denominator === null ? null : intervalArea(systemIntervals) / denominator,
      Lq: denominator === null ? null : intervalArea(queueIntervals) / denominator,
      WSeconds: average(sojourns),
      WqSeconds: average(waits),
      pOccupied: denominator === null ? null : occupiedSeconds / denominator,
      pEmpty: denominator === null ? null : (denominator - occupiedSeconds) / denominator,
      completedOrders: sojourns.length,
    };
  });
}
