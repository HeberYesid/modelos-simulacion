import type { RunResult } from "../api/types";

type StageId = "payment" | "preparation" | "integrated";
export interface SimulatedQueueMeasures {
  id: StageId | "total";
  L: number | null;
  Lq: number | null;
  WSeconds: number | null;
  WqSeconds: number | null;
  rho: number | null;
  pOccupied: number | null;
  pEmpty: number | null;
  timeSamples: number;
  waitSamples: number;
}

interface Presence { stage: StageId; waiting: boolean }

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function elapsed(end: number | null | undefined, start: number | null | undefined): number | null {
  if (end == null || start == null || !Number.isFinite(end) || !Number.isFinite(start) || end < start) return null;
  return end - start;
}

/** Window occupancy and completed-new-order durations are deliberately separate estimands. */
export function calculateQueuePerformance(run: RunResult): {
  stages: SimulatedQueueMeasures[]; total: SimulatedQueueMeasures;
} {
  const tuesday = run.scenario.engine_config.mode === "tuesday";
  const ids: StageId[] = tuesday ? ["payment", "preparation"] : ["integrated"];
  const horizon = run.metrics.horizon_s;
  const validWindow = Number.isFinite(horizon) && horizon > 0;
  const counts = { payment: 0, preparation: 0, integrated: 0 };
  const waiting = { ...counts };
  const area = { ...counts };
  const queueArea = { ...counts };
  const emptyArea = { ...counts };
  let systemEmptyArea = 0;
  const present = new Map<string, Presence>();
  const update = (orderId: string, next: Presence | null): void => {
    const previous = present.get(orderId);
    if (previous) {
      counts[previous.stage] -= 1;
      if (previous.waiting) waiting[previous.stage] -= 1;
    }
    if (next) {
      present.set(orderId, next);
      counts[next.stage] += 1;
      if (next.waiting) waiting[next.stage] += 1;
    } else present.delete(orderId);
  };
  let cursor = 0;
  const integrate = (end: number): void => {
    for (const id of ids) {
      area[id] += counts[id] * (end - cursor);
      queueArea[id] += waiting[id] * (end - cursor);
      if (counts[id] === 0) emptyArea[id] += end - cursor;
    }
    if (ids.every((id) => counts[id] === 0)) systemEmptyArea += end - cursor;
    cursor = end;
  };
  if (validWindow) {
    for (const event of run.trace.events) {
      if (event.time_s > horizon) break;
      integrate(Math.max(cursor, event.time_s));
      if (!event.order_id) continue;
      if (event.type === "order_initialized") {
        const initial = event.data?.initial_stage;
        const stage = tuesday
          ? initial === "preparing" || initial === "waiting_preparation" ? "preparation" : "payment"
          : "integrated";
        update(event.order_id, { stage, waiting: initial === "waiting_payment" || (tuesday && initial === "waiting_preparation") });
      } else if (event.type === "order_arrived") {
        update(event.order_id, { stage: tuesday ? "payment" : "integrated", waiting: true });
      } else if (event.type === "payment_started") {
        update(event.order_id, { stage: tuesday ? "payment" : "integrated", waiting: false });
      } else if (event.type === "payment_completed" && tuesday) {
        update(event.order_id, { stage: "preparation", waiting: true });
      } else if (event.type === "preparation_started" && tuesday) {
        update(event.order_id, { stage: "preparation", waiting: false });
      } else if (event.type === "order_delivered" || event.type === "order_abandoned") {
        update(event.order_id, null);
      }
    }
    integrate(horizon);
  }
  const completed = run.metrics.orders.filter((order) => order.cohort === "new" && order.state === "completed");
  const samples = (id: StageId | "total", queue: boolean): number[] => completed.flatMap((order) => {
    let value: number | null;
    if (id === "payment") {
      value = elapsed(queue ? order.payment_started_s : order.payment_completed_s, order.arrival_s);
    } else if (id === "preparation") {
      value = elapsed(queue ? order.preparation_started_s : order.delivery_s, order.payment_completed_s);
    } else if (queue && tuesday) {
      const payment = elapsed(order.payment_started_s, order.arrival_s);
      const preparation = elapsed(order.preparation_started_s, order.payment_completed_s);
      value = payment == null || preparation == null ? null : payment + preparation;
    } else value = elapsed(queue ? order.payment_started_s : order.delivery_s, order.arrival_s);
    return value == null ? [] : [value];
  });
  const stages = ids.map((id): SimulatedQueueMeasures => {
    const times = samples(id, false);
    const waits = samples(id, true);
    const pool = id === "payment" ? "cashier" : id === "preparation" ? "preparer" : "integrated";
    const usage = run.metrics.resource_usage.find((item) => item.pool === pool && item.component === "total");
    // Older saved results can contain an incorrect total for a pool; their
    // disjoint component seconds retain the correct resource accounting.
    const components = ["payment", "preparation", "external_confirmation"].map((component) =>
      run.metrics.resource_usage.find((item) => item.pool === pool && item.component === component));
    const denominator = components[0]?.available_worker_s;
    const componentsKnown = denominator != null && denominator > 0 && components.every((item) =>
      item != null && item.available_worker_s === denominator
      && Number.isFinite(item.reserved_worker_s) && item.reserved_worker_s >= 0);
    const fraction = componentsKnown
      ? components.reduce((sum, item) => sum + item!.reserved_worker_s, 0) / denominator!
      : usage?.reserved_fraction;
    return {
      id, L: validWindow ? area[id] / horizon : null, Lq: validWindow ? queueArea[id] / horizon : null,
      WSeconds: mean(times), WqSeconds: mean(waits),
      rho: fraction != null && Number.isFinite(fraction) && fraction >= 0 && fraction <= 1 ? fraction : null,
      pOccupied: validWindow ? 1 - emptyArea[id] / horizon : null,
      pEmpty: validWindow ? emptyArea[id] / horizon : null,
      timeSamples: times.length, waitSamples: waits.length,
    };
  });
  const totalTimes = samples("total", false);
  const totalWaits = samples("total", true);
  return {
    stages,
    total: {
      id: "total", L: validWindow ? ids.reduce((sum, id) => sum + area[id], 0) / horizon : null,
      Lq: validWindow ? ids.reduce((sum, id) => sum + queueArea[id], 0) / horizon : null,
      WSeconds: mean(totalTimes), WqSeconds: mean(totalWaits), rho: null,
      pOccupied: validWindow ? 1 - systemEmptyArea / horizon : null,
      pEmpty: validWindow ? systemEmptyArea / horizon : null,
      timeSamples: totalTimes.length, waitSamples: totalWaits.length,
    },
  };
}
