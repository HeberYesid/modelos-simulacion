import archive from "./observed-visits.json";
import type { ReplayOrderPhase, ReplayOrderState, ReplayPersonState, ReplayState } from "./project";

export type ObservedStation = "caja" | "entrega";
export type ObservedField = "hora_llegada" | "hora_inicio" | "hora_fin" | "hora_se_fue";
export type ObservedStage =
  | "waiting_payment"
  | "payment_active"
  | "waiting_preparation"
  | "preparing"
  | "completed"
  | "withdrawn";

export interface ObservedRawFields {
  readonly lugar: string;
  readonly fecha: string;
  readonly tipo_dia: string;
  readonly personal: string;
  readonly id: string;
  readonly hora_llegada: string;
  readonly hora_inicio: string;
  readonly hora_fin: string;
  readonly hora_se_fue: string;
}

export interface ObservedRecord {
  readonly record_id: string;
  readonly source_id: string;
  readonly source_line: number;
  readonly station: ObservedStation;
  readonly station_local_id: string;
  readonly raw_fields: ObservedRawFields;
  /** Explicit 2026-10-23 confirmation; absent for all 2026-10-20 rows. */
  readonly confirmed_link_id?: string;
}

export interface ObservedSource {
  readonly source_id: string;
  readonly sha256: string;
  readonly record_count: number;
}

export interface ObservedVisit {
  readonly visit_id: string;
  readonly label: string;
  readonly date: string;
  readonly start_time: string;
  readonly end_time: string;
  readonly duration_s: number;
  readonly sources: readonly ObservedSource[];
  readonly records: readonly ObservedRecord[];
  readonly warning_ids: readonly string[];
}

export interface ObservedEvent {
  readonly time_s: number;
  readonly record_id: string;
  readonly field: ObservedField;
  readonly label: string;
  readonly station: ObservedStation;
}

export interface ObservedRecordState {
  /** Stable visual glyph for one source record, not a measured person. */
  readonly person_id: string;
  readonly order_id: string;
  readonly station: ObservedStation;
  readonly station_local_id: string;
  readonly confirmed_link_id?: string;
  readonly stage: ObservedStage;
  readonly arrival_s: number;
  readonly service_start_s: number | null;
  readonly service_end_s: number | null;
  readonly departure_s: number | null;
}

export interface ObservedReplayState {
  readonly time_s: number;
  readonly records: readonly ObservedRecordState[];
  readonly workers: readonly [];
}

export interface ObservedSceneTrace {
  readonly events: readonly {
    readonly type: string;
    readonly time_s: number;
    readonly seq: number;
    readonly order_id?: string | null;
    readonly data?: Readonly<Record<string, unknown>>;
  }[];
  readonly final_orders: readonly {
    readonly order_id: string;
    readonly person_ids: readonly string[];
  }[];
  readonly final_workers: readonly [];
}

const FIELD_LABELS: Readonly<Record<ObservedField, string>> = {
  hora_llegada: "Llegada registrada a la estación",
  hora_inicio: "Inicio registrado en la estación",
  hora_fin: "Fin registrado en la estación",
  hora_se_fue: "Salida registrada sin inicio de servicio",
};

const WARNING_TEXT: Readonly<Record<string, string>> = {
  tuesday_station_ids_local: "El martes, los identificadores de caja y entrega son locales a cada estación; no hay vínculos confirmados entre sus registros.",
  tuesday_initial_wait_unknown: "Al inicio del martes ya había clientes esperando; no se registraron su cantidad ni su fila.",
  friday_link_scope: "El vínculo de los identificadores 1–8 entre caja y entrega está confirmado solo para esta visita del 23 de octubre.",
  friday_other_initial_work_unknown: "El viernes no había clientes esperando al inicio; no se confirmó si había preparación en curso.",
  timezone_unconfirmed: "La base horaria y la zona horaria no están confirmadas.",
  elapsed_windows_not_active_work: "Los intervalos entre marcas son tiempo transcurrido observado; no separan trabajo activo, espera externa ni pausas.",
  delivery_overlap_conflict: "Las marcas de preparación del martes incluyen intervalos superpuestos que exceden el personal reportado; se conservan sin asignar trabajadores.",
  confirmed_pause_boundaries_unknown: "El viernes se confirmó una pausa de preparación durante otra atención, pero sus límites exactos no se registraron.",
  group_counts_unknown: "No se registraron cantidades de personas por pedido.",
  payment_method_unknown: "Los medios de pago no se registraron.",
  products_menu_unknown: "Los productos y el menú de cada pedido no se registraron.",
  worker_assignments_unknown: "No se registraron asignaciones individuales de trabajadores.",
};

const FIELD_ORDER: readonly ObservedField[] = ["hora_llegada", "hora_inicio", "hora_fin", "hora_se_fue"];
const COMMON_WARNINGS = ["group_counts_unknown", "payment_method_unknown", "products_menu_unknown", "worker_assignments_unknown"] as const;

export const observedVisits: readonly ObservedVisit[] = deepFreeze(archive.visits as readonly ObservedVisit[]);

export function observedWarnings(visit: ObservedVisit): readonly string[] {
  return [...visit.warning_ids, ...COMMON_WARNINGS].map((warningId) =>
    WARNING_TEXT[warningId] ?? "Dato histórico no disponible.");
}

/** Convert a time-of-day to seconds from the visit's confirmed observation start. */
export function observedTimeSeconds(visit: ObservedVisit, time: string): number {
  const seconds = parseClock(time) - parseClock(visit.start_time);
  if (seconds < 0) {
    throw new RangeError(`Observed timestamp ${time} precedes the visit start`);
  }
  return seconds;
}

/** Return only nonblank timestamp fields actually recorded in the source rows. */
export function observedEvents(visit: ObservedVisit): readonly ObservedEvent[] {
  const events: ObservedEvent[] = [];
  for (const record of visit.records) {
    for (const field of FIELD_ORDER) {
      const value = record.raw_fields[field];
      if (value === "") continue;
      events.push({
        time_s: observedTimeSeconds(visit, value),
        record_id: record.record_id,
        field,
        label: FIELD_LABELS[field],
        station: record.station,
      });
    }
  }
  return events.sort((left, right) =>
    left.time_s - right.time_s
    || left.record_id.localeCompare(right.record_id)
    || FIELD_ORDER.indexOf(left.field) - FIELD_ORDER.indexOf(right.field));
}

/** Project measured station records. One glyph is one source row; no people, station transitions, work segments, or staff are inferred. */
export function projectObservedVisit(visit: ObservedVisit, time_s: number): ObservedReplayState {
  if (!Number.isFinite(time_s) || time_s < 0 || time_s > visit.duration_s) {
    throw new RangeError("Observed replay time must be finite and within the observation clip");
  }
  const records: ObservedRecordState[] = [];
  for (const record of visit.records) {
    const arrival = record.raw_fields.hora_llegada;
    if (!arrival) continue;
    const arrival_s = observedTimeSeconds(visit, arrival);
    if (time_s < arrival_s) continue;
    const start = record.raw_fields.hora_inicio;
    const end = record.raw_fields.hora_fin;
    const departure = record.raw_fields.hora_se_fue;
    const service_start_s = start ? observedTimeSeconds(visit, start) : null;
    const service_end_s = end ? observedTimeSeconds(visit, end) : null;
    const departure_s = departure ? observedTimeSeconds(visit, departure) : null;
    let stage: ObservedStage;
    if (departure && time_s >= observedTimeSeconds(visit, departure)) {
      stage = "withdrawn";
    } else if (end && time_s >= observedTimeSeconds(visit, end)) {
      stage = "completed";
    } else if (service_start_s !== null && time_s >= service_start_s) {
      stage = record.station === "caja" ? "payment_active" : "preparing";
    } else {
      stage = record.station === "caja" ? "waiting_payment" : "waiting_preparation";
    }
    records.push({
      person_id: `record:${record.record_id}`,
      order_id: record.record_id,
      station: record.station,
      station_local_id: record.station_local_id,
      ...(record.confirmed_link_id === undefined ? {} : { confirmed_link_id: record.confirmed_link_id }),
      stage,
      arrival_s,
      service_start_s,
      service_end_s,
      departure_s,
    });
  }
  return { time_s, records, workers: [] };
}

/** Project to the existing scene state without treating a row marker as a person. */
export function observedSceneState(visit: ObservedVisit, time_s: number): ReplayState {
  const projected = projectObservedVisit(visit, time_s);
  const orders: Record<string, ReplayOrderState> = {};
  const people: Record<string, ReplayPersonState> = {};
  for (const record of visit.records) {
    const person_id = `record:${record.record_id}`;
    const end = record.raw_fields.hora_fin;
    const departure = record.raw_fields.hora_se_fue;
    const state = projected.records.find((item) => item.order_id === record.record_id)?.stage
      ?? "not_arrived";
    const orderPhase: ReplayOrderPhase = state === "withdrawn" ? "abandoned" : state;
    const delivery_s = record.station === "entrega" && end ? observedTimeSeconds(visit, end) : null;
    const abandonment_s = departure ? observedTimeSeconds(visit, departure) : null;
    orders[record.record_id] = {
      order_id: record.record_id,
      person_ids: [person_id],
      items: [],
      state: orderPhase,
      source: "new",
      // Station arrivals are not asserted to be whole-system arrivals.
      arrival_s: null,
      payment_started_s: record.station === "caja" && record.raw_fields.hora_inicio
        ? observedTimeSeconds(visit, record.raw_fields.hora_inicio)
        : null,
      // Recorded elapsed windows are not decomposed into active work.
      payment_active_ended_s: null,
      payment_completed_s: null,
      preparation_started_s: record.station === "entrega" && record.raw_fields.hora_inicio
        ? observedTimeSeconds(visit, record.raw_fields.hora_inicio)
        : null,
      delivery_s,
      abandonment_s,
      worker_id: null,
      queue_rank: null,
    };
    people[person_id] = {
      person_id,
      order_id: record.record_id,
      state: orderPhase,
      arrival_s: null,
      delivery_s,
      abandonment_s,
    };
  }
  const payment_queue = Object.values(orders)
    .filter((order) => order.state === "waiting_payment")
    .map((order) => order.order_id);
  const preparation_queue = Object.values(orders)
    .filter((order) => order.state === "waiting_preparation")
    .map((order) => order.order_id);
  return {
    time_s,
    // This is the observation clip boundary, not a shop closing time.
    window_end_s: visit.duration_s,
    drain_end_s: visit.duration_s,
    admissions_closed: false,
    finished: false,
    payment_queue,
    preparation_queue,
    pending_payments: [],
    orders,
    people,
    workers: {},
  };
}

/** Adapt measured station events to the shop scene's narrow trace input. */
export function observedSceneTrace(visit: ObservedVisit): ObservedSceneTrace {
  const observed = observedEvents(visit);
  const eventType = (event: ObservedEvent): string => {
    if (event.field === "hora_llegada") return "order_arrived";
    if (event.field === "hora_inicio") return event.station === "caja" ? "payment_started" : "preparation_started";
    if (event.field === "hora_se_fue") return "order_abandoned";
    return event.station === "entrega" ? "order_delivered" : "observed_payment_window_ended";
  };
  const recordById = new Map(visit.records.map((record) => [record.record_id, record]));
  const events = observed.map((event, seq) => ({
    type: eventType(event),
    time_s: event.time_s,
    seq,
    order_id: event.record_id,
    data: {
      station: event.station,
      observed_field: event.field,
      source_record_id: event.record_id,
      station_local_id: recordById.get(event.record_id)?.station_local_id ?? "",
    },
  }));
  const final_orders = visit.records.map((record) => ({
    order_id: record.record_id,
    person_ids: [`record:${record.record_id}`],
  }));
  return { events, final_orders, final_workers: [] };
}

function parseClock(value: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new RangeError(`Invalid recorded time ${value}`);
  const [, hours, minutes, seconds] = match;
  const h = Number(hours);
  const m = Number(minutes);
  const s = Number(seconds);
  if (h > 23 || m > 59 || s > 59) throw new RangeError(`Invalid recorded time ${value}`);
  return h * 3600 + m * 60 + s;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
