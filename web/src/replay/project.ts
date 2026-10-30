import type { ApiSchema } from "../api/types";

export type ReplayTrace = ApiSchema<"SimulationTrace"> | ApiSchema<"SimulationTraceV2">;
export type ReplayRunResult = ApiSchema<"RunResult"> | ApiSchema<"RunResultV2">;

export type ReplayOrderPhase =
  | "not_arrived"
  | "waiting_payment"
  | "payment_active"
  | "payment_pending"
  | "waiting_preparation"
  | "preparing"
  | "preparation_paused"
  | "completed"
  | "abandoned";

export type ReplayProductVisualKind = "fruit_salad" | "ice_cream" | "slush";

export interface ReplayOrderItem {
  readonly product_id: string;
  readonly display_name: string;
  readonly visual_kind: ReplayProductVisualKind;
  readonly quantity: number;
}

export interface ReplayOrderState {
  readonly order_id: string;
  readonly person_ids: readonly string[];
  readonly items: readonly ReplayOrderItem[];
  readonly state: ReplayOrderPhase;
  readonly source: "initial" | "new";
  readonly arrival_s: number | null;
  readonly payment_started_s: number | null;
  readonly payment_active_ended_s: number | null;
  readonly payment_completed_s: number | null;
  readonly preparation_started_s: number | null;
  readonly delivery_s: number | null;
  readonly abandonment_s: number | null;
  readonly worker_id: string | null;
  readonly queue_rank: number | null;
  readonly related_cashier_order_id?: string | null;
  readonly remaining_s?: number | null;
}

export interface ReplayPersonState {
  readonly person_id: string;
  readonly order_id: string;
  readonly state: ReplayOrderPhase;
  readonly arrival_s: number | null;
  readonly delivery_s: number | null;
  readonly abandonment_s: number | null;
}

export interface ReplayWorkerState {
  readonly worker_id: string;
  readonly pool: "cashier" | "preparer" | "integrated";
  readonly assigned_order_id: string | null;
  readonly reserved: boolean;
  readonly active: boolean;
  readonly stage: string | null;
}

export interface ReplayState {
  readonly time_s: number;
  readonly window_end_s: number;
  readonly drain_end_s: number;
  readonly admissions_closed: boolean;
  readonly finished: boolean;
  readonly payment_queue: readonly string[];
  readonly preparation_queue: readonly string[];
  readonly pending_payments: readonly string[];
  readonly orders: Readonly<Record<string, ReplayOrderState>>;
  readonly people: Readonly<Record<string, ReplayPersonState>>;
  readonly workers: Readonly<Record<string, ReplayWorkerState>>;
}

export interface ReplayProjector {
  readonly next_event_time_s: number | null;
  project(time_s: number): ReplayState;
}

const VERSION_1_EVENT_TYPES = new Set([
  "order_initialized",
  "order_arrived",
  "payment_started",
  "payment_active_ended",
  "payment_completed",
  "preparation_started",
  "order_delivered",
  "order_abandoned",
  "admissions_closed",
  "run_finished",
]);
const VERSION_2_EVENT_TYPES = new Set([
  ...VERSION_1_EVENT_TYPES,
  "preparation_paused",
  "preparation_resumed",
]);

const GLOBAL_EVENT_TYPES = new Set(["admissions_closed", "run_finished"]);
const WORKER_EVENT_TYPES = new Set([
  "payment_started",
  "payment_active_ended",
  "preparation_started",
  "preparation_paused",
  "preparation_resumed",
  "order_delivered",
]);
const INITIAL_STAGES = new Set<ReplayOrderPhase>([
  "waiting_payment",
  "payment_active",
  "payment_pending",
  "waiting_preparation",
  "preparing",
]);

export class ReplayTraceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayTraceValidationError";
  }
}

/** Validate the versioned public trace before handing it to replay controls. */
export function validate_replay_trace(value: unknown): ReplayTrace {
  const trace = requireRecord(value, "trace");
  if (trace.contract_version !== 1 && trace.contract_version !== 2) {
    fail("trace.contract_version", "must be 1 or 2");
  }
  const contractVersion = trace.contract_version;

  const config = requireRecord(trace.config, "trace.config");
  if (config.contract_version !== contractVersion) {
    fail("trace.config.contract_version", `must match trace version ${contractVersion}`);
  }
  if (contractVersion === 1 && config.mode !== "tuesday" && config.mode !== "regular") {
    fail("trace.config.mode", "must be tuesday or regular");
  }
  if (contractVersion === 2) {
    if (config.mode !== "regular") {
      fail("trace.config.mode", "version 2 replay requires regular mode");
    }
    if (config.cashiers !== 0 || config.preparers !== 0 || config.integrated_workers !== 1) {
      fail("trace.config", "version 2 replay requires exactly one integrated worker");
    }
    if (config.preparation_interruption_policy !== "scripted_cashier") {
      fail("trace.config.preparation_interruption_policy", "must be scripted_cashier");
    }
    const interruptions = requireArray(config.cashier_interruptions, "trace.config.cashier_interruptions");
    let previousAtS = -1;
    for (const [index, rawEntry] of interruptions.entries()) {
      const path = `trace.config.cashier_interruptions[${index}]`;
      const entry = requireRecord(rawEntry, path);
      const atS = requireFiniteNumber(entry.at_s, `${path}.at_s`);
      if (atS < 0 || atS <= previousAtS) {
        fail(`${path}.at_s`, "must be nonnegative and strictly increasing");
      }
      previousAtS = atS;
      const suspendedOrderId = requireString(entry.suspended_order_id, `${path}.suspended_order_id`);
      const cashierOrderId = requireString(entry.cashier_order_id, `${path}.cashier_order_id`);
      if (suspendedOrderId === cashierOrderId) {
        fail(path, "suspended_order_id and cashier_order_id must differ");
      }
    }
  }
  requireString(config.opening_time, "trace.config.opening_time");
  const horizon_s = requireFiniteNumber(config.horizon_s, "trace.config.horizon_s");
  if (horizon_s <= 0) {
    fail("trace.config.horizon_s", "must be positive");
  }

  const window_end_s = requireFiniteNumber(trace.window_end_s, "trace.window_end_s");
  const drain_end_s = requireFiniteNumber(trace.drain_end_s, "trace.drain_end_s");
  if (window_end_s < 0 || window_end_s !== horizon_s) {
    fail("trace.window_end_s", "must equal the configured horizon");
  }
  if (drain_end_s < window_end_s) {
    fail("trace.drain_end_s", "must be at least the admission window end");
  }

  const initialIds = requireStringArray(trace.initialized_order_ids, "trace.initialized_order_ids");
  const newIds = requireStringArray(trace.new_order_ids, "trace.new_order_ids");
  const initialSet = uniqueSet(initialIds, "trace.initialized_order_ids");
  const newSet = uniqueSet(newIds, "trace.new_order_ids");
  for (const orderId of initialSet) {
    if (newSet.has(orderId)) {
      fail("trace.new_order_ids", `order ${orderId} is also initialized`);
    }
  }

  const finalOrders = requireArray(trace.final_orders, "trace.final_orders");
  const ordersById = new Map<string, readonly string[]>();
  const peopleById = new Map<string, string>();
  for (const [index, rawOrder] of finalOrders.entries()) {
    const path = `trace.final_orders[${index}]`;
    const order = requireRecord(rawOrder, path);
    const orderId = requireString(order.order_id, `${path}.order_id`);
    if (ordersById.has(orderId)) {
      fail(`${path}.order_id`, `duplicates order ${orderId}`);
    }
    if (!initialSet.has(orderId) && !newSet.has(orderId)) {
      fail(`${path}.order_id`, `order ${orderId} is missing from the trace registries`);
    }
    requireString(order.state, `${path}.state`);
    const personIds = requireStringArray(order.person_ids, `${path}.person_ids`);
    if (personIds.length === 0) {
      fail(`${path}.person_ids`, "must contain at least one person");
    }
    uniqueSet(personIds, `${path}.person_ids`);
    for (const personId of personIds) {
      const existingOrder = peopleById.get(personId);
      if (existingOrder !== undefined) {
        fail(`${path}.person_ids`, `person ${personId} is already linked to order ${existingOrder}`);
      }
      peopleById.set(personId, orderId);
    }
    if (order.arrival_s !== undefined && order.arrival_s !== null) {
      const arrival_s = requireFiniteNumber(order.arrival_s, `${path}.arrival_s`);
      if (initialSet.has(orderId) && arrival_s > 0) {
        fail(`${path}.arrival_s`, "an initialized order arrival must be at or before time zero");
      }
      if (newSet.has(orderId) && arrival_s < 0) {
        fail(`${path}.arrival_s`, "a new order arrival must be nonnegative");
      }
    }
    if (order.worker_id !== undefined && order.worker_id !== null) {
      requireString(order.worker_id, `${path}.worker_id`);
    }
    parseReplayOrderItems(order.items, `${path}.items`);
    ordersById.set(orderId, personIds);
  }
  for (const orderId of [...initialSet, ...newSet]) {
    if (!ordersById.has(orderId)) {
      fail("trace.final_orders", `registered order ${orderId} is missing`);
    }
  }

  const finalPeople = requireArray(trace.final_people, "trace.final_people");
  const recordedPeople = new Set<string>();
  for (const [index, rawPerson] of finalPeople.entries()) {
    const path = `trace.final_people[${index}]`;
    const person = requireRecord(rawPerson, path);
    const personId = requireString(person.person_id, `${path}.person_id`);
    const orderId = requireString(person.order_id, `${path}.order_id`);
    requireString(person.state, `${path}.state`);
    if (recordedPeople.has(personId)) {
      fail(`${path}.person_id`, `duplicates person ${personId}`);
    }
    recordedPeople.add(personId);
    if (peopleById.get(personId) !== orderId) {
      fail(`${path}.order_id`, `person ${personId} does not match the order registry`);
    }
  }
  if (recordedPeople.size !== peopleById.size) {
    fail("trace.final_people", "must include every registered person exactly once");
  }

  if (contractVersion === 2) {
    const interruptions = requireArray(config.cashier_interruptions, "trace.config.cashier_interruptions");
    for (const [index, rawEntry] of interruptions.entries()) {
      const path = `trace.config.cashier_interruptions[${index}]`;
      const entry = requireRecord(rawEntry, path);
      const suspendedOrderId = requireString(entry.suspended_order_id, `${path}.suspended_order_id`);
      const cashierOrderId = requireString(entry.cashier_order_id, `${path}.cashier_order_id`);
      if (!ordersById.has(suspendedOrderId)) {
        fail(`${path}.suspended_order_id`, `order ${suspendedOrderId} is not registered in the trace`);
      }
      if (!ordersById.has(cashierOrderId)) {
        fail(`${path}.cashier_order_id`, `order ${cashierOrderId} is not registered in the trace`);
      }
    }
  }

  const declaredResourceIds = requireStringArray(
    trace.declared_resource_ids,
    "trace.declared_resource_ids",
  );
  const declaredSet = uniqueSet(declaredResourceIds, "trace.declared_resource_ids");
  const finalWorkers = requireArray(trace.final_workers, "trace.final_workers");
  const workerIds = new Set<string>();
  const workerPoolsById = new Map<string, string>();
  for (const [index, rawWorker] of finalWorkers.entries()) {
    const path = `trace.final_workers[${index}]`;
    const worker = requireRecord(rawWorker, path);
    const workerId = requireString(worker.worker_id, `${path}.worker_id`);
    if (workerIds.has(workerId)) {
      fail(`${path}.worker_id`, `duplicates worker ${workerId}`);
    }
    workerIds.add(workerId);
    workerPoolsById.set(workerId, String(worker.pool));
    if (!declaredSet.has(workerId)) {
      fail(`${path}.worker_id`, `worker ${workerId} is not declared`);
    }
    if (worker.pool !== "cashier" && worker.pool !== "preparer" && worker.pool !== "integrated") {
      fail(`${path}.pool`, "must be cashier, preparer, or integrated");
    }
    requireBoolean(worker.reserved, `${path}.reserved`);
    requireBoolean(worker.active, `${path}.active`);
    if (worker.assigned_order_id !== undefined && worker.assigned_order_id !== null) {
      requireString(worker.assigned_order_id, `${path}.assigned_order_id`);
    }
    if (worker.stage !== undefined && worker.stage !== null) {
      requireString(worker.stage, `${path}.stage`);
    }
  }
  if (workerIds.size !== declaredSet.size) {
    fail("trace.final_workers", "must include every declared worker exactly once");
  }
  if (contractVersion === 2
    && (workerIds.size !== 1 || [...workerPoolsById.values()][0] !== "integrated")) {
    fail("trace.final_workers", "version 2 replay requires exactly one integrated worker");
  }

  const events = requireArray(trace.events, "trace.events");
  let previousTime = -1;
  let previousSeq = -1;
  let admissionCloseCount = 0;
  let runFinishedCount = 0;
  const registeredOrderEvents = new Map<string, string>();
  const activePauses = new Map<string, { cashierOrderId: string; workerId: string }>();
  const cashierPaymentsCompletedAfterPause = new Set<string>();
  for (const [index, rawEvent] of events.entries()) {
    const path = `trace.events[${index}]`;
    const event = requireRecord(rawEvent, path);
    const seq = requireFiniteNumber(event.seq, `${path}.seq`);
    if (!Number.isInteger(seq) || seq <= previousSeq) {
      fail(`${path}.seq`, "must be a strictly increasing integer");
    }
    const time_s = requireFiniteNumber(event.time_s, `${path}.time_s`);
    if (time_s < 0 || time_s > drain_end_s || time_s < previousTime) {
      fail(`${path}.time_s`, "must be nonnegative, within the drain, and monotone");
    }
    previousTime = time_s;
    previousSeq = seq;
    const supportedEventTypes = contractVersion === 1 ? VERSION_1_EVENT_TYPES : VERSION_2_EVENT_TYPES;
    if (typeof event.type !== "string" || !supportedEventTypes.has(event.type)) {
      fail(`${path}.type`, "is not a supported trace event");
    }
    const eventType = event.type;
    const personIds = requireStringArray(event.person_ids, `${path}.person_ids`);
    uniqueSet(personIds, `${path}.person_ids`);
    const eventOrderId = optionalNullableString(event.order_id, `${path}.order_id`);
    const workerId = optionalNullableString(event.worker_id, `${path}.worker_id`);
    const data = event.data === undefined ? {} : requireRecord(event.data, `${path}.data`);

    if (GLOBAL_EVENT_TYPES.has(eventType)) {
      if (eventOrderId !== null || personIds.length > 0 || workerId !== null) {
        fail(path, `${eventType} must not reference an order, person, or worker`);
      }
      if (eventType === "admissions_closed") {
        admissionCloseCount += 1;
        if (time_s !== window_end_s) {
          fail(`${path}.time_s`, "admissions_closed must occur at window_end_s");
        }
      } else {
        runFinishedCount += 1;
        if (time_s !== drain_end_s || index !== events.length - 1) {
          fail(`${path}.time_s`, "run_finished must be the final event at drain_end_s");
        }
      }
      continue;
    }

    if (eventOrderId === null) {
      fail(`${path}.order_id`, `${eventType} requires a registered order`);
    }
    const registeredPeople = ordersById.get(eventOrderId);
    if (registeredPeople === undefined) {
      fail(`${path}.order_id`, `order ${eventOrderId} is not registered`);
    }
    if (!sameStrings(personIds, registeredPeople)) {
      fail(`${path}.person_ids`, `does not match the people registered to order ${eventOrderId}`);
    }
    if (workerId !== null && !declaredSet.has(workerId)) {
      fail(`${path}.worker_id`, `worker ${workerId} is not declared`);
    }
    if (contractVersion === 2 && workerId !== null && workerPoolsById.get(workerId) !== "integrated") {
      fail(`${path}.worker_id`, "version 2 events must use the integrated worker");
    }
    if (WORKER_EVENT_TYPES.has(eventType) && workerId === null) {
      fail(`${path}.worker_id`, `${eventType} requires a worker`);
    }
    if (eventType === "payment_completed" && config.mode === "regular" && workerId === null) {
      fail(`${path}.worker_id`, "regular payment_completed must retain its assigned worker");
    }
    if (eventType === "payment_completed" && config.mode === "tuesday" && workerId !== null) {
      fail(`${path}.worker_id`, "Tuesday payment_completed must not occupy the released cashier");
    }

    const mode = config.mode as "tuesday" | "regular";
    if (contractVersion === 1) {
      validateDomainEventData(eventType, data, mode, path);
    } else {
      validateVersionTwoDomainEventData(eventType, data, eventOrderId, path);
    }
    if (eventType === "order_initialized") {
      if (!initialSet.has(eventOrderId) || registeredOrderEvents.has(eventOrderId)) {
        fail(`${path}.order_id`, "must initialize one registered initial order exactly once");
      }
      registeredOrderEvents.set(eventOrderId, eventType);
      const stage = data.initial_stage ?? data.stage;
      if (typeof stage !== "string" || !INITIAL_STAGES.has(stage as ReplayOrderPhase)) {
        fail(`${path}.data.initial_stage`, "must name a supported initial order stage");
      }
    } else if (eventType === "order_arrived") {
      if (!newSet.has(eventOrderId) || registeredOrderEvents.has(eventOrderId)) {
        fail(`${path}.order_id`, "must admit one registered new order exactly once");
      }
      registeredOrderEvents.set(eventOrderId, eventType);
    }

    validateEventData(data, path);
    if (eventType === "payment_active_ended") {
      const stage = data.stage;
      if (stage !== "payment_pending" && stage !== "waiting_preparation") {
        fail(`${path}.data.stage`, "must be payment_pending or waiting_preparation");
      }
    }

    if (contractVersion === 2) {
      const relatedCashierOrderId = optionalNullableString(
        data.related_cashier_order_id,
        `${path}.data.related_cashier_order_id`,
      );
      const assignedOrderId = optionalNullableString(
        data.assigned_order_id,
        `${path}.data.assigned_order_id`,
      );
      if (relatedCashierOrderId !== null && !ordersById.has(relatedCashierOrderId)) {
        fail(`${path}.data.related_cashier_order_id`, `order ${relatedCashierOrderId} is not registered`);
      }
      if (assignedOrderId !== null && !ordersById.has(assignedOrderId)) {
        fail(`${path}.data.assigned_order_id`, `order ${assignedOrderId} is not registered`);
      }
      if (eventType === "preparation_paused") {
        const cashierOrderId = requireString(data.related_cashier_order_id, `${path}.data.related_cashier_order_id`);
        if (cashierOrderId === eventOrderId) {
          fail(`${path}.data.related_cashier_order_id`, "must differ from the suspended order");
        }
        if (activePauses.size > 0 || activePauses.has(eventOrderId)) {
          fail(path, "cannot nest a preparation pause");
        }
        activePauses.set(eventOrderId, { cashierOrderId, workerId: workerId! });
        cashierPaymentsCompletedAfterPause.delete(cashierOrderId);
      } else if (eventType === "payment_completed") {
        if ([...activePauses.values()].some((pause) => pause.cashierOrderId === eventOrderId)) {
          cashierPaymentsCompletedAfterPause.add(eventOrderId);
        }
      } else if (eventType === "preparation_resumed") {
        const cashierOrderId = requireString(data.related_cashier_order_id, `${path}.data.related_cashier_order_id`);
        const pause = activePauses.get(eventOrderId);
        if (!pause || pause.cashierOrderId !== cashierOrderId) {
          fail(`${path}.data.related_cashier_order_id`, "must match the suspended order's preceding pause");
        }
        if (pause.workerId !== workerId) {
          fail(`${path}.worker_id`, "must match the worker recorded at pause");
        }
        if (!cashierPaymentsCompletedAfterPause.has(cashierOrderId)) {
          fail(path, "cannot resume before the related cashier payment completes");
        }
        activePauses.delete(eventOrderId);
        cashierPaymentsCompletedAfterPause.delete(cashierOrderId);
      }
    } else if (data.assigned_order_id !== undefined || data.related_cashier_order_id !== undefined) {
      fail(`${path}.data`, "version 1 events cannot contain version 2 assignment fields");
    }
  }
  if (admissionCloseCount !== 1) {
    fail("trace.events", "must contain exactly one admissions_closed event");
  }
  if (runFinishedCount !== 1) {
    fail("trace.events", "must contain exactly one final run_finished event");
  }
  for (const orderId of ordersById.keys()) {
    if (!registeredOrderEvents.has(orderId)) {
      fail("trace.events", `order ${orderId} has no initialization or arrival event`);
    }
  }
  if (activePauses.size > 0) {
    fail("trace.events", "every preparation_paused event must have a matching preparation_resumed event");
  }

  return value as ReplayTrace;
}

/** Create a forward cursor for playback; backward seeks rebuild from the trace. */
export function create_replay_projector(traceValue: ReplayTrace): ReplayProjector {
  const trace = validate_replay_trace(traceValue);
  let reducer = createReplayReducer(trace);
  let eventIndex = 0;
  let currentTime = -1;

  return {
    get next_event_time_s(): number | null {
      return trace.events[eventIndex]?.time_s ?? null;
    },
    project(time_s: number): ReplayState {
      validateSelectedTime(time_s, trace.drain_end_s);
      if (time_s < currentTime) {
        reducer = createReplayReducer(trace);
        eventIndex = 0;
      }
      while (eventIndex < trace.events.length && trace.events[eventIndex]!.time_s <= time_s) {
        reducer.apply(trace.events[eventIndex]!);
        eventIndex += 1;
      }
      currentTime = time_s;
      return reducer.snapshot(time_s);
    },
  };
}

/** Rebuild a fresh logical snapshot from the immutable trace at a selected time. */
export function project_replay(traceValue: ReplayTrace, time_s: number): ReplayState {
  return create_replay_projector(traceValue).project(time_s);
}

interface ReplayReducer {
  apply(event: ReplayTrace["events"][number]): void;
  snapshot(time_s: number): ReplayState;
}

function createReplayReducer(trace: ReplayTrace): ReplayReducer {
  const initialIds = new Set(trace.initialized_order_ids);
  const orders = new Map<string, ReplayOrderState>();
  for (const finalOrder of trace.final_orders) {
    orders.set(finalOrder.order_id, {
      order_id: finalOrder.order_id,
      person_ids: [...finalOrder.person_ids],
      items: parseReplayOrderItems(finalOrder.items, `trace.final_orders.${finalOrder.order_id}.items`),
      state: "not_arrived",
      source: initialIds.has(finalOrder.order_id) ? "initial" : "new",
      arrival_s: null,
      payment_started_s: null,
      payment_active_ended_s: null,
      payment_completed_s: null,
      preparation_started_s: null,
      delivery_s: null,
      abandonment_s: null,
      worker_id: null,
      queue_rank: null,
    });
  }

  const people = new Map<string, ReplayPersonState>();
  for (const finalPerson of trace.final_people) {
    people.set(finalPerson.person_id, {
      person_id: finalPerson.person_id,
      order_id: finalPerson.order_id,
      state: "not_arrived",
      arrival_s: null,
      delivery_s: null,
      abandonment_s: null,
    });
  }

  const workers = new Map<string, ReplayWorkerState>();
  for (const finalWorker of trace.final_workers) {
    workers.set(finalWorker.worker_id, {
      worker_id: finalWorker.worker_id,
      pool: finalWorker.pool,
      assigned_order_id: null,
      reserved: false,
      active: false,
      stage: null,
    });
  }

  const paymentQueuePosition = new Map<string, QueuePosition>();
  const preparationQueuePosition = new Map<string, QueuePosition>();
  const pendingPaymentPosition = new Map<string, QueuePosition>();
  let admissions_closed = false;
  let finished = false;

  return {
    apply(event): void {
      const type = event.type;
      if (type === "admissions_closed") {
        admissions_closed = true;
        return;
      }
      if (type === "run_finished") {
        finished = true;
        return;
      }

      const orderId = event.order_id;
      if (orderId == null) {
        fail("trace.events", `${type} has no order id`);
      }
      const currentOrder = orders.get(orderId);
      if (currentOrder === undefined) {
        fail("trace.events", `order ${orderId} is not registered`);
      }
      const data = event.data ?? {};

      const updateOrder = (changes: Partial<ReplayOrderState>): ReplayOrderState => {
        const updated = { ...currentOrder, ...changes };
        orders.set(orderId, updated);
        return updated;
      };
      const updatePeople = (phase: ReplayOrderPhase, changes: Partial<ReplayPersonState> = {}): void => {
        for (const personId of currentOrder.person_ids) {
          const person = people.get(personId);
          if (person !== undefined) {
            people.set(personId, { ...person, ...changes, state: phase });
          }
        }
      };
      const setWorker = (
        workerId: string | null | undefined,
        assigned_order_id: string | null,
        reserved: boolean,
        active: boolean,
        stage: string | null,
      ): void => {
        if (workerId == null) {
          return;
        }
        const worker = workers.get(workerId);
        if (worker === undefined) {
          fail("trace.events.worker_id", `worker ${workerId} is not registered`);
        }
        workers.set(workerId, { ...worker, assigned_order_id, reserved, active, stage });
      };

      switch (type) {
        case "order_initialized": {
          const stage = (data.initial_stage ?? data.stage) as ReplayOrderPhase;
          const arrival_s = data.arrival_s ?? null;
          const queue_rank = data.queue_rank ?? null;
          updateOrder({ state: stage, arrival_s, queue_rank, worker_id: event.worker_id ?? null });
          updatePeople(stage, { arrival_s });
          if (stage === "waiting_payment") {
            paymentQueuePosition.set(orderId, {
              source: "initial",
              rank: queue_rank,
              time_s: event.time_s,
              seq: event.seq,
            });
          }
          if (stage === "waiting_preparation") {
            preparationQueuePosition.set(orderId, {
              source: "initial",
              rank: queue_rank,
              time_s: event.time_s,
              seq: event.seq,
            });
          }
          if (stage === "payment_pending") {
            pendingPaymentPosition.set(orderId, {
              source: "initial",
              rank: null,
              time_s: event.time_s,
              seq: event.seq,
            });
          }
          if (event.worker_id != null) {
            const reserved = data.worker_reserved ?? true;
            const active = data.worker_active ?? (stage === "payment_active" || stage === "preparing");
            const workerStage = stage === "payment_active"
              ? "payment_active"
              : stage === "payment_pending"
                ? "external_confirmation"
                : stage === "preparing"
                  ? "preparation"
                  : null;
            setWorker(event.worker_id, reserved ? orderId : null, reserved, active, workerStage);
          }
          break;
        }
        case "order_arrived": {
          const arrival_s = event.time_s;
          updateOrder({ state: "waiting_payment", arrival_s, worker_id: null, queue_rank: null });
          updatePeople("waiting_payment", { arrival_s });
          paymentQueuePosition.set(orderId, {
            source: "new",
            rank: null,
            time_s: arrival_s,
            seq: event.seq,
          });
          break;
        }
        case "payment_started": {
          paymentQueuePosition.delete(orderId);
          pendingPaymentPosition.delete(orderId);
          updateOrder({
            state: "payment_active",
            payment_started_s: event.time_s,
            worker_id: event.worker_id ?? null,
            queue_rank: null,
          });
          updatePeople("payment_active");
          const reserved = data.worker_reserved ?? true;
          const active = data.worker_active ?? true;
          setWorker(event.worker_id, reserved ? orderId : null, reserved, active, "payment_active");
          break;
        }
        case "payment_active_ended": {
          const nextState = data.stage as ReplayOrderPhase;
          const workerReserved = data.worker_reserved ?? trace.config.mode === "regular";
          updateOrder({
            state: nextState,
            payment_active_ended_s: event.time_s,
            worker_id: workerReserved ? event.worker_id ?? currentOrder.worker_id : null,
          });
          updatePeople(nextState);
          if (nextState === "payment_pending") {
            pendingPaymentPosition.set(orderId, {
              source: currentOrder.source,
              rank: null,
              time_s: event.time_s,
              seq: event.seq,
            });
          }
          setWorker(
            event.worker_id,
            workerReserved ? orderId : null,
            workerReserved,
            data.worker_active ?? false,
            workerReserved && nextState === "payment_pending" ? "external_confirmation" : null,
          );
          break;
        }
        case "payment_completed": {
          pendingPaymentPosition.delete(orderId);
          const workerId = event.worker_id ?? currentOrder.worker_id;
          const data = event.data ?? {};
          const paidPreparationQueue = trace.contract_version === 2 && data.queue === "preparation";
          updateOrder({
            state: "waiting_preparation",
            payment_completed_s: event.time_s,
            worker_id: trace.config.mode === "regular" && !paidPreparationQueue ? workerId ?? null : null,
            queue_rank: null,
          });
          updatePeople("waiting_preparation");
          if (trace.config.mode === "tuesday" || paidPreparationQueue) {
            preparationQueuePosition.set(orderId, {
              source: "new",
              rank: null,
              time_s: event.time_s,
              seq: event.seq,
            });
          }
          if (trace.config.mode === "regular") {
            if (paidPreparationQueue) {
              setWorker(workerId, null, false, false, null);
            } else {
              setWorker(workerId, orderId, true, false, null);
            }
          }
          break;
        }
        case "preparation_started": {
          preparationQueuePosition.delete(orderId);
          updateOrder({
            state: "preparing",
            preparation_started_s: event.time_s,
            worker_id: event.worker_id ?? currentOrder.worker_id,
            queue_rank: null,
          });
          updatePeople("preparing");
          const reserved = data.worker_reserved ?? true;
          const active = data.worker_active ?? true;
          setWorker(event.worker_id, reserved ? orderId : null, reserved, active, "preparation");
          break;
        }
        case "preparation_paused": {
          const v2Data = event.data as ApiSchema<"EventDataV2"> | undefined;
          updateOrder({
            state: "preparation_paused",
            worker_id: null,
            related_cashier_order_id: v2Data?.related_cashier_order_id ?? null,
            remaining_s: v2Data?.remaining_s ?? null,
          });
          updatePeople("preparation_paused");
          setWorker(event.worker_id, null, false, false, null);
          break;
        }
        case "preparation_resumed": {
          const v2Data = event.data as ApiSchema<"EventDataV2"> | undefined;
          updateOrder({
            state: "preparing",
            worker_id: event.worker_id ?? currentOrder.worker_id,
            related_cashier_order_id: v2Data?.related_cashier_order_id ?? null,
            remaining_s: v2Data?.remaining_s ?? null,
          });
          updatePeople("preparing");
          setWorker(event.worker_id, orderId, true, true, "preparation");
          break;
        }
        case "order_delivered": {
          updateOrder({ state: "completed", delivery_s: event.time_s, worker_id: null });
          updatePeople("completed", { delivery_s: event.time_s });
          setWorker(event.worker_id, null, false, false, null);
          break;
        }
        case "order_abandoned": {
          paymentQueuePosition.delete(orderId);
          updateOrder({ state: "abandoned", abandonment_s: event.time_s, worker_id: null });
          updatePeople("abandoned", { abandonment_s: event.time_s });
          break;
        }
      }
    },
    snapshot(time_s): ReplayState {
      const orderSnapshot = Object.fromEntries(
        [...orders].map(([id, order]) => [
          id,
          Object.freeze({
            ...order,
            person_ids: Object.freeze([...order.person_ids]),
            items: order.items,
          }),
        ]),
      );
      const personSnapshot = Object.fromEntries(
        [...people].map(([id, person]) => [id, Object.freeze({ ...person })]),
      );
      const workerSnapshot = Object.fromEntries(
        [...workers].map(([id, worker]) => [id, Object.freeze({ ...worker })]),
      );
      return Object.freeze({
        time_s,
        window_end_s: trace.window_end_s,
        drain_end_s: trace.drain_end_s,
        admissions_closed,
        finished,
        payment_queue: Object.freeze(
          orderedQueueIds(orders, paymentQueuePosition, "waiting_payment", "payment"),
        ),
        preparation_queue: Object.freeze(trace.config.mode === "tuesday" || trace.contract_version === 2
          ? orderedQueueIds(orders, preparationQueuePosition, "waiting_preparation", "preparation")
          : []),
        pending_payments: Object.freeze(
          orderedQueueIds(orders, pendingPaymentPosition, "payment_pending", "pending"),
        ),
        orders: Object.freeze(orderSnapshot),
        people: Object.freeze(personSnapshot),
        workers: Object.freeze(workerSnapshot),
      });
    },
  };
}

function validateSelectedTime(time_s: number, drainEndS: number): void {
  if (!Number.isFinite(time_s) || time_s < 0 || time_s > drainEndS) {
    fail("time_s", `must be finite and between 0 and ${drainEndS}`);
  }
}

interface QueuePosition {
  source: "initial" | "new";
  rank: number | null;
  time_s: number;
  seq: number;
}

function orderedQueueIds(
  orders: ReadonlyMap<string, ReplayOrderState>,
  positions: ReadonlyMap<string, QueuePosition>,
  phase: ReplayOrderPhase,
  kind: "payment" | "preparation" | "pending",
): string[] {
  return [...orders.values()]
    .filter((order) => order.state === phase && positions.has(order.order_id))
    .sort((left, right) => {
      const leftPosition = positions.get(left.order_id)!;
      const rightPosition = positions.get(right.order_id)!;
      if (kind === "payment") {
        if (leftPosition.source !== rightPosition.source) {
          return leftPosition.source === "initial" ? -1 : 1;
        }
        if (leftPosition.source === "initial" && leftPosition.rank !== rightPosition.rank) {
          return (leftPosition.rank ?? 0) - (rightPosition.rank ?? 0);
        }
        return leftPosition.time_s - rightPosition.time_s || leftPosition.seq - rightPosition.seq;
      }
      if (kind === "preparation") {
        const leftRankedInitial = leftPosition.source === "initial" && leftPosition.rank !== null;
        const rightRankedInitial = rightPosition.source === "initial" && rightPosition.rank !== null;
        if (leftRankedInitial !== rightRankedInitial) {
          return leftRankedInitial ? -1 : 1;
        }
        if (leftRankedInitial && rightRankedInitial && leftPosition.rank !== rightPosition.rank) {
          return (leftPosition.rank ?? 0) - (rightPosition.rank ?? 0);
        }
      }
      return leftPosition.time_s - rightPosition.time_s || leftPosition.seq - rightPosition.seq;
    })
    .map((order) => order.order_id);
}

function validateEventData(data: Record<string, unknown>, path: string): void {
  for (const field of ["worker_reserved", "worker_active"] as const) {
    if (data[field] !== undefined && data[field] !== null) {
      requireBoolean(data[field], `${path}.data.${field}`);
    }
  }
  if (data.arrival_s !== undefined && data.arrival_s !== null) {
    requireFiniteNumber(data.arrival_s, `${path}.data.arrival_s`);
  }
  if (data.remaining_s !== undefined && data.remaining_s !== null) {
    const remaining = requireFiniteNumber(data.remaining_s, `${path}.data.remaining_s`);
    if (remaining < 0) {
      fail(`${path}.data.remaining_s`, "must be nonnegative");
    }
  }
  if (data.queue_rank !== undefined && data.queue_rank !== null) {
    const rank = requireFiniteNumber(data.queue_rank, `${path}.data.queue_rank`);
    if (!Number.isInteger(rank) || rank < 0) {
      fail(`${path}.data.queue_rank`, "must be a nonnegative integer");
    }
  }
  for (const field of ["stage", "queue", "initial_stage"] as const) {
    if (data[field] !== undefined && data[field] !== null) {
      requireString(data[field], `${path}.data.${field}`);
    }
  }
}

function validateDomainEventData(
  eventType: string,
  data: Record<string, unknown>,
  mode: "tuesday" | "regular",
  path: string,
): void {
  const stage = (field: "stage" | "initial_stage", expected: string): void => {
    if (data[field] !== expected) {
      fail(`${path}.data.${field}`, `must be ${expected}`);
    }
  };
  const workerState = (reserved: boolean, active: boolean): void => {
    if (data.worker_reserved !== reserved || data.worker_active !== active) {
      fail(`${path}.data`, `must report worker_reserved=${reserved} and worker_active=${active}`);
    }
  };

  switch (eventType) {
    case "order_initialized": {
      const initialStage = data.initial_stage;
      if (typeof initialStage !== "string" || !INITIAL_STAGES.has(initialStage as ReplayOrderPhase)) {
        fail(`${path}.data.initial_stage`, "must name a supported initial order stage");
      }
      const reserved = initialStage === "payment_active"
        || initialStage === "preparing"
        || (initialStage === "payment_pending" && mode === "regular");
      const active = initialStage === "payment_active" || initialStage === "preparing";
      workerState(reserved, active);
      if (data.stage !== undefined && data.stage !== initialStage) {
        fail(`${path}.data.stage`, "must match initial_stage");
      }
      if (initialStage === "waiting_payment" || initialStage === "waiting_preparation") {
        const rank = requireFiniteNumber(data.queue_rank, `${path}.data.queue_rank`);
        if (!Number.isInteger(rank) || rank < 0) {
          fail(`${path}.data.queue_rank`, "must be a nonnegative integer");
        }
      }
      if (data.arrival_s !== undefined && data.arrival_s !== null) {
        const arrival_s = requireFiniteNumber(data.arrival_s, `${path}.data.arrival_s`);
        if (arrival_s > 0) {
          fail(`${path}.data.arrival_s`, "an initialized order arrival must be at or before time zero");
        }
      }
      break;
    }
    case "order_arrived":
      stage("stage", "waiting_payment");
      workerState(false, false);
      break;
    case "payment_started":
      stage("stage", "payment_active");
      workerState(true, true);
      break;
    case "payment_active_ended": {
      const nextStage = data.stage;
      if (nextStage !== "payment_pending" && nextStage !== "waiting_preparation") {
        fail(`${path}.data.stage`, "must be payment_pending or waiting_preparation");
      }
      workerState(mode === "regular", false);
      break;
    }
    case "payment_completed":
      stage("stage", "waiting_preparation");
      workerState(mode === "regular", false);
      break;
    case "preparation_started":
      stage("stage", "preparation");
      workerState(true, true);
      break;
    case "order_delivered":
      stage("stage", "completed");
      workerState(false, false);
      break;
    case "order_abandoned":
      stage("stage", "abandoned");
      workerState(false, false);
      break;
  }
}

function validateVersionTwoDomainEventData(
  eventType: string,
  data: Record<string, unknown>,
  orderId: string,
  path: string,
): void {
  const stage = (expected: string): void => {
    if (data.stage !== expected) {
      fail(`${path}.data.stage`, `must be ${expected}`);
    }
  };
  const workerState = (reserved: boolean, active: boolean): void => {
    if (data.worker_reserved !== reserved || data.worker_active !== active) {
      fail(`${path}.data`, `must report worker_reserved=${reserved} and worker_active=${active}`);
    }
  };
  const assignedOrder = (expected: string | null): void => {
    const assigned = optionalNullableString(data.assigned_order_id, `${path}.data.assigned_order_id`);
    if (assigned !== expected) {
      fail(`${path}.data.assigned_order_id`, `must be ${expected ?? "null"}`);
    }
  };

  if (eventType === "preparation_paused") {
    stage("preparation_paused");
    workerState(false, false);
    assignedOrder(null);
    const remaining = requireFiniteNumber(data.remaining_s, `${path}.data.remaining_s`);
    if (remaining <= 0) {
      fail(`${path}.data.remaining_s`, "must be positive for a paused preparation");
    }
    requireString(data.related_cashier_order_id, `${path}.data.related_cashier_order_id`);
    return;
  }

  if (eventType === "preparation_resumed") {
    stage("preparing");
    workerState(true, true);
    assignedOrder(orderId);
    const remaining = requireFiniteNumber(data.remaining_s, `${path}.data.remaining_s`);
    if (remaining <= 0) {
      fail(`${path}.data.remaining_s`, "must be positive for a resumed preparation");
    }
    requireString(data.related_cashier_order_id, `${path}.data.related_cashier_order_id`);
    return;
  }

  if (eventType === "payment_completed" && data.queue === "preparation") {
    stage("waiting_preparation");
    workerState(false, false);
    assignedOrder(null);
    return;
  }

  validateDomainEventData(eventType, data, "regular", path);
  switch (eventType) {
    case "order_initialized": {
      const initialStage = data.initial_stage ?? data.stage;
      if (typeof initialStage !== "string" || !INITIAL_STAGES.has(initialStage as ReplayOrderPhase)) {
        fail(`${path}.data.initial_stage`, "must name a supported initial order stage");
      }
      const reserved = initialStage === "payment_active"
        || initialStage === "preparing"
        || initialStage === "payment_pending";
      assignedOrder(reserved ? orderId : null);
      break;
    }
    case "order_arrived":
    case "order_abandoned":
    case "order_delivered":
      assignedOrder(null);
      break;
    case "payment_started":
    case "preparation_started":
      assignedOrder(orderId);
      break;
    case "payment_active_ended":
      assignedOrder(data.worker_reserved === true ? orderId : null);
      break;
    case "payment_completed":
      assignedOrder(orderId);
      break;
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(path, "must be an array");
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(path, "must be a nonempty string");
  }
  return value;
}

function parseReplayOrderItems(value: unknown, path: string): readonly ReplayOrderItem[] {
  if (value === undefined) return Object.freeze([]);
  const rows = requireArray(value, path);
  if (rows.length > 24) {
    fail(path, "must contain at most 24 product lines");
  }

  const productIds = new Set<string>();
  let totalQuantity = 0;
  const items = rows.map((rawItem, index): ReplayOrderItem => {
    const itemPath = `${path}[${index}]`;
    const item = requireRecord(rawItem, itemPath);
    const productId = requireString(item.product_id, `${itemPath}.product_id`);
    if (productIds.has(productId)) {
      fail(`${itemPath}.product_id`, `duplicates product ${productId}`);
    }
    productIds.add(productId);

    const displayName = requireString(item.display_name, `${itemPath}.display_name`);
    if (item.visual_kind !== "fruit_salad" && item.visual_kind !== "ice_cream" && item.visual_kind !== "slush") {
      fail(`${itemPath}.visual_kind`, "must be fruit_salad, ice_cream, or slush");
    }
    const quantity = requireFiniteNumber(item.quantity, `${itemPath}.quantity`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      fail(`${itemPath}.quantity`, "must be a positive integer no greater than 50");
    }
    totalQuantity += quantity;
    if (totalQuantity > 50) {
      fail(path, "must contain at most 50 total units");
    }

    return Object.freeze({
      product_id: productId,
      display_name: displayName,
      visual_kind: item.visual_kind,
      quantity,
    });
  });
  return Object.freeze(items);
}

function optionalNullableString(value: unknown, path: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return requireString(value, path);
}

function requireStringArray(value: unknown, path: string): string[] {
  return requireArray(value, path).map((item, index) => requireString(item, `${path}[${index}]`));
}

function uniqueSet(values: readonly string[], path: string): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (result.has(value)) {
      fail(path, `contains duplicate value ${value}`);
    }
    result.add(value);
  }
  return result;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "must be a finite number");
  }
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    fail(path, "must be a boolean");
  }
  return value;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function fail(path: string, message: string): never {
  throw new ReplayTraceValidationError(`${path} ${message}.`);
}
