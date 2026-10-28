import { describe, expect, it } from "vitest";
import regularFixture from "./fixtures/replay/regular.json";
import interruptionFixture from "./fixtures/replay/interruption-core-v2.json";
import { ApiSchema } from "../src/api/types";
import {
  create_replay_projector,
  project_replay,
  validate_replay_trace,
  type ReplayTrace,
} from "../src/replay/project";

const regular = regularFixture as ReplayTrace;
const interruption = interruptionFixture as ApiSchema<"SimulationTraceV2">;

describe("version 2 interruption replay projection", () => {
  it("projects the saved pause, cashier service, paid wait, and resume at t=6 and t=8 across seeks", () => {
    const cursor = create_replay_projector(interruption as unknown as ReplayTrace);

    const atSix = cursor.project(6);
    expect(atSix.orders.A).toMatchObject({
      state: "preparation_paused",
      worker_id: null,
      related_cashier_order_id: "B",
      remaining_s: 7,
    });
    expect(atSix.orders.B).toMatchObject({ state: "payment_active", worker_id: "integrated-1" });
    expect(atSix.workers["integrated-1"]).toMatchObject({
      assigned_order_id: "B",
      reserved: true,
      active: true,
      stage: "payment_active",
    });
    expect(atSix.preparation_queue).toEqual([]);

    const atEight = cursor.project(8);
    expect(atEight.orders.A).toMatchObject({
      state: "preparing",
      worker_id: "integrated-1",
      related_cashier_order_id: "B",
      remaining_s: 7,
    });
    expect(atEight.orders.B).toMatchObject({ state: "waiting_preparation", worker_id: null });
    expect(atEight.preparation_queue).toEqual(["B"]);
    expect(atEight.workers["integrated-1"]).toMatchObject({
      assigned_order_id: "A",
      reserved: true,
      active: true,
      stage: "preparation",
    });

    expect(cursor.project(6)).toEqual(atSix);
    expect(cursor.project(8)).toEqual(atEight);
    expect(project_replay(regular, 5).orders["order-group"]?.state).toBe("preparing");
  });

  it("requires matching versioned trace and config and keeps interruption events out of version 1", () => {
    expect(validate_replay_trace(interruption)).toEqual(interruption);
    expect(validate_replay_trace(regular)).toEqual(regular);

    const mismatchedConfig = structuredClone(interruption);
    (mismatchedConfig as unknown as { config: { contract_version: number } }).config.contract_version = 1;
    expect(() => validate_replay_trace(mismatchedConfig)).toThrow(/contract_version/);

    const unsupportedMode = structuredClone(interruption) as unknown as {
      config: { mode: string };
    };
    unsupportedMode.config.mode = "tuesday";
    expect(() => validate_replay_trace(unsupportedMode)).toThrow(/mode/);

    const unsupportedCapacity = structuredClone(interruption) as unknown as {
      config: { integrated_workers: number };
    };
    unsupportedCapacity.config.integrated_workers = 2;
    expect(() => validate_replay_trace(unsupportedCapacity)).toThrow(/integrated worker/);

    const mislabeledV1 = structuredClone(regular) as unknown as {
      events: Array<{ type: string }>;
    };
    mislabeledV1.events[0]!.type = "preparation_paused";
    expect(() => validate_replay_trace(mislabeledV1)).toThrow(/type/);
  });

  it("rejects a pause related to an unknown cashier order, zero remaining work, or a different worker on resume", () => {
    const unknownCashier = structuredClone(interruption);
    const pause = unknownCashier.events.find((event) => event.type === "preparation_paused");
    if (!pause) throw new Error("The generated interruption fixture has no pause event.");
    pause.data!.related_cashier_order_id = "missing-order";
    expect(() => validate_replay_trace(unknownCashier)).toThrow(/related_cashier_order_id/);

    const zeroRemaining = structuredClone(interruption);
    const zeroPause = zeroRemaining.events.find((event) => event.type === "preparation_paused");
    if (!zeroPause) throw new Error("The generated interruption fixture has no pause event.");
    zeroPause.data!.remaining_s = 0;
    expect(() => validate_replay_trace(zeroRemaining)).toThrow(/remaining_s/);

    const wrongWorker = structuredClone(interruption);
    const resume = wrongWorker.events.find((event) => event.type === "preparation_resumed");
    if (!resume) throw new Error("The generated interruption fixture has no resume event.");
    resume.worker_id = "undeclared-worker";
    expect(() => validate_replay_trace(wrongWorker)).toThrow(/worker_id/);

    const wrongCashierOnResume = structuredClone(interruption);
    const wrongRelatedResume = wrongCashierOnResume.events.find((event) => event.type === "preparation_resumed");
    if (!wrongRelatedResume) throw new Error("The generated interruption fixture has no resume event.");
    wrongRelatedResume.data!.related_cashier_order_id = "A";
    expect(() => validate_replay_trace(wrongCashierOnResume)).toThrow(/related_cashier_order_id/);
  });
});
