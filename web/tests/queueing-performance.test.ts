import { describe, expect, it } from "vitest";
import fixture from "../contracts/fixtures/sample-run.json";
import type { RunResult } from "../src/api/types";
import { calculateQueuePerformance } from "../src/domain/queueing-performance";

function timelineRun(): RunResult {
  const run = structuredClone(fixture) as unknown as RunResult;
  run.scenario.engine_config.mode = "tuesday";
  run.metrics.horizon_s = 10;
  const event = (time_s: number, type: string, order_id: string, initial_stage?: string) =>
    ({ time_s, type, order_id, data: { initial_stage }, person_ids: [order_id], sequence: 0 });
  // A is already preparing. B and C finish after the admission window.
  run.trace.events = [
    event(0, "order_initialized", "A", "preparing"),
    event(2, "order_arrived", "B"), event(2, "payment_started", "B"),
    event(3, "order_arrived", "C"), event(4, "order_delivered", "A"),
    event(5, "payment_completed", "B"), event(5, "preparation_started", "B"),
    event(5, "payment_started", "C"), event(8, "payment_completed", "C"),
    event(13, "order_delivered", "B"), event(13, "preparation_started", "C"),
    event(15, "order_delivered", "C"),
  ] as unknown as RunResult["trace"]["events"];
  run.metrics.orders = [
    { cohort: "initialized", state: "completed", arrival_s: null, delivery_s: 4 },
    { cohort: "new", state: "completed", arrival_s: 2, payment_started_s: 2,
      payment_completed_s: 5, preparation_started_s: 5, delivery_s: 13 },
    { cohort: "new", state: "completed", arrival_s: 3, payment_started_s: 5,
      payment_completed_s: 8, preparation_started_s: 13, delivery_s: 15 },
  ] as unknown as RunResult["metrics"]["orders"];
  run.metrics.resource_usage = [
    { pool: "cashier", component: "total", reserved_fraction: 0.6 },
    { pool: "preparer", component: "total", reserved_fraction: 0.9 },
  ] as RunResult["metrics"]["resource_usage"];
  return run;
}

describe("finite-run stage performance", () => {
  it("integrates each stage over the window and keeps complete new-order times through drain", () => {
    const report = calculateQueuePerformance(timelineRun());
    expect(report.stages).toHaveLength(2);
    expect(report.stages[0]).toMatchObject({ id: "payment", L: 0.8, Lq: 0.2,
      WSeconds: 4, WqSeconds: 1, rho: 0.6, timeSamples: 2, waitSamples: 2 });
    expect(report.stages[1]).toMatchObject({ id: "preparation", L: 1.1, Lq: 0.2,
      WSeconds: 7.5, WqSeconds: 2.5, rho: 0.9, timeSamples: 2, waitSamples: 2 });
    expect(report.total).toMatchObject({ L: 1.9, Lq: 0.4, WSeconds: 11.5, WqSeconds: 3.5 });
  });

  it("keeps Friday as one integrated stage including payment and preparation", () => {
    const run = timelineRun();
    run.scenario.engine_config.mode = "regular";
    run.metrics.resource_usage = [{ pool: "integrated", component: "total", reserved_fraction: 0.8 }] as RunResult["metrics"]["resource_usage"];
    const report = calculateQueuePerformance(run);
    expect(report.stages).toHaveLength(1);
    expect(report.stages[0]).toMatchObject({ id: "integrated", L: 1.9, Lq: 0.2,
      WSeconds: 11.5, WqSeconds: 1, rho: 0.8, timeSamples: 2 });
  });

  it("shows absent completion times as unavailable while retaining occupancy and withdrawals", () => {
    const run = timelineRun();
    run.metrics.orders = [];
    run.trace.events = [
      { time_s: 2, type: "order_arrived", order_id: "D" },
      { time_s: 5, type: "order_abandoned", order_id: "D" },
    ] as unknown as RunResult["trace"]["events"];
    const report = calculateQueuePerformance(run);
    expect(report.stages[0]).toMatchObject({ L: 0.3, Lq: 0.3, WSeconds: null, WqSeconds: null, timeSamples: 0 });
    expect(report.total.WSeconds).toBeNull();
  });

  it("uses component reservation times when reopening legacy results with an incorrect pool total", () => {
    const run = timelineRun();
    run.metrics.resource_usage = [
      { pool: "cashier", component: "total", reserved_fraction: 0.9 },
      { pool: "cashier", component: "payment", reserved_worker_s: 2, available_worker_s: 10 },
      { pool: "cashier", component: "preparation", reserved_worker_s: 0, available_worker_s: 10 },
      { pool: "cashier", component: "external_confirmation", reserved_worker_s: 0, available_worker_s: 10 },
    ] as RunResult["metrics"]["resource_usage"];
    expect(calculateQueuePerformance(run).stages[0].rho).toBe(0.2);
  });
});
