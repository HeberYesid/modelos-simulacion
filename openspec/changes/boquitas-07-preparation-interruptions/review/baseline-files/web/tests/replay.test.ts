import { describe, expect, it } from "vitest";
import regularFixture from "./fixtures/replay/regular.json";
import tuesdayFixture from "./fixtures/replay/tuesday.json";
import longFixture from "./fixtures/replay/long-timeline.json";
import queueFixture from "./fixtures/replay/queues.json";
import { create_replay_projector, project_replay, validate_replay_trace } from "../src/replay/project";
import type { ReplayTrace } from "../src/replay/project";

const tuesday = tuesdayFixture as ReplayTrace;
const regular = regularFixture as ReplayTrace;
const longTimeline = longFixture as ReplayTrace;
const queueTrace = queueFixture as ReplayTrace;

describe("validated trace projection", () => {
  it("rejects unsupported versions, missing fields, and non-monotone event order", () => {
    const gappedSequence = structuredClone(tuesday);
    gappedSequence.events.forEach((event, index) => {
      event.seq = index * 2;
    });
    expect(validate_replay_trace(gappedSequence).events[1]?.seq).toBe(2);

    const unsupportedVersion = structuredClone(tuesday) as unknown as Record<string, unknown>;
    unsupportedVersion.contract_version = 2;
    expect(() => validate_replay_trace(unsupportedVersion)).toThrow(/contract_version/);

    const missingEvents = structuredClone(tuesday) as unknown as Record<string, unknown>;
    delete missingEvents.events;
    expect(() => validate_replay_trace(missingEvents)).toThrow(/events/);

    const outOfOrderTime = structuredClone(tuesday);
    outOfOrderTime.events[2]!.time_s = 0.5;
    expect(() => validate_replay_trace(outOfOrderTime)).toThrow(/events/);

    const duplicateSequence = structuredClone(tuesday);
    duplicateSequence.events[2]!.seq = duplicateSequence.events[1]!.seq;
    expect(() => validate_replay_trace(duplicateSequence)).toThrow(/events/);

    const reversedSameTime = structuredClone(tuesday);
    reversedSameTime.events[0]!.seq = 2;
    reversedSameTime.events[1]!.seq = 1;
    expect(() => validate_replay_trace(reversedSameTime)).toThrow(/seq/);
  });

  it("settles every event at the selected timestamp and preserves unknown initial arrival", () => {
    const atOpening = project_replay(tuesday, 0);
    expect(atOpening.orders["order-group"]?.state).toBe("payment_active");
    expect(atOpening.orders["initial-unknown-arrival"]?.state).toBe("preparing");
    expect(atOpening.people["person-initial-a"]?.arrival_s).toBeNull();
    expect(atOpening.workers["preparer-1"]).toMatchObject({
      assigned_order_id: "initial-unknown-arrival",
      active: true,
      stage: "preparation",
    });
    expect(Object.isFrozen(atOpening)).toBe(true);
    expect(Object.isFrozen(atOpening.orders)).toBe(true);
    expect(Object.isFrozen(atOpening.orders["order-group"])).toBe(true);
  });

  it("keeps Tuesday transfer time off the released cashier and preserves queue stages", () => {
    const pending = project_replay(tuesday, 1);
    expect(pending.pending_payments).toEqual(["order-group"]);
    expect(pending.workers["cashier-1"]).toMatchObject({ reserved: false, active: false });
    expect(pending.orders["order-group"]?.state).toBe("payment_pending");

    const paidWaiting = project_replay(tuesday, 2);
    expect(paidWaiting.orders["order-group"]?.state).toBe("waiting_preparation");
    expect(paidWaiting.preparation_queue).toEqual(["order-group"]);

    const prepared = project_replay(tuesday, 3);
    expect(prepared.orders["initial-unknown-arrival"]?.state).toBe("completed");
    expect(prepared.orders["order-group"]?.state).toBe("preparing");
    expect(prepared.preparation_queue).toEqual([]);
  });

  it("keeps a regular worker reserved but inactive during transfer confirmation", () => {
    const pending = project_replay(regular, 4);
    expect(pending.admissions_closed).toBe(true);
    expect(pending.pending_payments).toEqual(["order-group"]);
    expect(pending.workers["integrated-1"]).toMatchObject({
      assigned_order_id: "order-group",
      reserved: true,
      active: false,
      stage: "external_confirmation",
    });

    const preparing = project_replay(regular, 5);
    expect(preparing.orders["order-group"]?.state).toBe("preparing");
    expect(preparing.pending_payments).toEqual([]);
    expect(preparing.workers["integrated-1"]).toMatchObject({ active: true, stage: "preparation" });
  });

  it("orders initial queues by rank before later arrivals", () => {
    const state = project_replay(queueTrace, 0.5);
    expect(state.payment_queue).toEqual(["initial-payment-rank-1", "new-arrival"]);
    expect(state.preparation_queue).toEqual(["initial-preparation-rank-1"]);
    expect(state.orders["initial-preparation-rank-0"]?.arrival_s).toBe(-5);
    expect(state.people["initial-preparation-person-1"]?.arrival_s).toBeNull();
  });

  it("projects withdrawal and delivery after closing", () => {
    const withdrawn = project_replay(tuesday, 0.75);
    expect(withdrawn.orders["order-withdraws"]?.state).toBe("abandoned");
    expect(withdrawn.people["person-c"]?.state).toBe("abandoned");
    expect(withdrawn.payment_queue).toEqual([]);

    const afterClose = project_replay(tuesday, 4);
    expect(afterClose.admissions_closed).toBe(true);
    expect(afterClose.orders["order-group"]?.state).toBe("preparing");
    expect(afterClose.time_s).toBe(4);

    const drained = project_replay(tuesday, 8);
    expect(drained.orders["order-group"]?.state).toBe("completed");
    expect(drained.finished).toBe(true);
  });

  it("rebuilds the same logical state after meaningful backward seeks", () => {
    const atThree = project_replay(tuesday, 3);
    project_replay(tuesday, 1);
    expect(project_replay(tuesday, 3)).toEqual(atThree);

    const atOneHundred = project_replay(longTimeline, 100);
    expect(atOneHundred.orders["long-order"]?.state).toBe("preparing");
    project_replay(longTimeline, 20);
    expect(project_replay(longTimeline, 100)).toEqual(atOneHundred);

    const cursor = create_replay_projector(tuesday);
    expect(cursor.next_event_time_s).toBe(0);
    const cursorAtThree = cursor.project(3);
    expect(cursorAtThree).toEqual(atThree);
    expect(cursor.next_event_time_s).toBe(4);
    cursor.project(1);
    expect(cursor.next_event_time_s).toBe(2);
    expect(cursor.project(3)).toEqual(cursorAtThree);
  });

  it("rejects selected times outside the finite replay interval", () => {
    expect(() => project_replay(tuesday, -1)).toThrow(/time_s/);
    expect(() => project_replay(tuesday, Number.POSITIVE_INFINITY)).toThrow(/time_s/);
    expect(() => project_replay(tuesday, 8.1)).toThrow(/time_s/);
  });
});
