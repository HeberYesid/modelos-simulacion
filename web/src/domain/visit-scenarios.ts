import type { Scenario, ScenarioV1 } from "../api/types";
import { observedTimeSeconds, observedWarnings, type ObservedVisit } from "../replay/observed";

export interface VisitScenarioSummary {
  readonly meanInterarrivalS: number;
  readonly meanPaymentWindowS: number;
  readonly meanPreparationWindowS: number;
  readonly sampleCounts: {
    readonly interarrivalGaps: number;
    readonly paymentWindows: number;
    readonly preparationWindows: number;
  };
  readonly assumptions: readonly string[];
}

interface VisitScenarioRules {
  readonly displayName: string;
  readonly mode: "tuesday" | "regular";
}

const VISIT_RULES: Readonly<Record<string, VisitScenarioRules>> = {
  "2026-10-20": { displayName: "Martes 20/10 · exploratorio", mode: "tuesday" },
  "2026-10-23": { displayName: "Viernes 23/10 · exploratorio", mode: "regular" },
};

function rulesFor(visit: ObservedVisit): VisitScenarioRules {
  const rules = Object.hasOwn(VISIT_RULES, visit.date) ? VISIT_RULES[visit.date] : undefined;
  if (!rules) {
    throw new RangeError(`No hay un escenario exploratorio definido para la visita ${visit.date}`);
  }
  if (!visit.visit_id.trim()) {
    throw new RangeError("La visita debe tener un identificador estable");
  }
  if (!Number.isSafeInteger(visit.duration_s) || visit.duration_s <= 0) {
    throw new RangeError("La duración observada debe ser un número entero positivo de segundos");
  }
  return rules;
}

function timestampSeconds(visit: ObservedVisit, timestamp: string, sample: string): number {
  const seconds = observedTimeSeconds(visit, timestamp);
  if (!Number.isSafeInteger(seconds) || seconds > visit.duration_s) {
    throw new RangeError(`${sample}: la marca está fuera de la ventana observada`);
  }
  return seconds;
}

function mean(values: readonly number[], sample: string): number {
  if (values.length === 0) {
    throw new RangeError(`No hay muestras completas para calcular ${sample}`);
  }
  const value = values.reduce((total, item) => total + item, 0) / values.length;
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`La media de ${sample} debe ser positiva y finita`);
  }
  return value;
}

function elapsedWindows(
  visit: ObservedVisit,
  station: "caja" | "entrega",
  sample: string,
): number[] {
  const windows: number[] = [];
  for (const record of visit.records) {
    if (record.station !== station) continue;
    const { hora_inicio: start, hora_fin: end } = record.raw_fields;
    if (!start || !end) continue;
    const elapsed = timestampSeconds(visit, end, sample) - timestampSeconds(visit, start, sample);
    if (elapsed <= 0) {
      throw new RangeError(`${sample}: una ventana completa debe tener duración positiva`);
    }
    windows.push(elapsed);
  }
  return windows;
}

function interarrivalGaps(visit: ObservedVisit): number[] {
  const arrivals = visit.records
    .filter((record) => record.station === "caja" && record.raw_fields.hora_llegada !== "")
    .map((record) => timestampSeconds(visit, record.raw_fields.hora_llegada, "llegadas de caja"))
    .sort((left, right) => left - right);
  const gaps: number[] = [];
  for (let index = 1; index < arrivals.length; index += 1) {
    gaps.push(arrivals[index] - arrivals[index - 1]);
  }
  return gaps;
}

function modelAssumptions(visit: ObservedVisit, rules: VisitScenarioRules): string[] {
  const assumptions = [
    "La ventana de simulación coincide con el período observado; no representa la apertura y cierre del negocio.",
    "Se usa una distribución exponencial para las llegadas, con la media descriptiva de las brechas observadas; esa forma es una hipótesis exploratoria, no un ajuste ni una calibración.",
    "Los promedios de pago y preparación usan ventanas completas entre hora_inicio y hora_fin; son tiempos transcurridos observados, no representan trabajo activo ni calibran el modelo.",
    "No se registró el tamaño de los grupos; se supone un grupo de 1 persona por pedido.",
    "No se registraron los medios de pago; se supone pago en efectivo para todas las órdenes (transfer_probability = 0).",
    "El estado inicial se supone vacío; esa simplificación no reconstruye trabajo ni filas previas a la observación.",
    "No se modelan abandonos (patience = null).",
  ];

  if (rules.mode === "tuesday") {
    assumptions.push(
      "El martes, los identificadores de caja y entrega son locales a cada estación y no se enlazan entre sí; las ventanas superpuestas se conservan sin asignar trabajadores ni cambiar marcas.",
      "Al inicio del martes ya había espera, pero no se registraron su cantidad ni su fila; el estado vacío es solo un supuesto del escenario.",
      "Los retiros observados del martes se incluyen como llegadas; no estiman paciencia ni tamaño de grupo.",
    );
  } else {
    assumptions.push(
      "El viernes se confirmó una pausa de preparación durante otra atención; los límites exactos de esa pausa no se reconstruyen por falta de marcas y el escenario de versión 1 no la representa.",
      "El viernes no había clientes esperando al inicio, pero no se confirmó si había preparación en curso; el estado inicial vacío no resuelve esa incógnita.",
    );
  }

  return [...observedWarnings(visit), ...assumptions];
}

/** Summarize descriptive timing samples without treating elapsed windows as active work. */
export function summarizeVisitScenario(visit: ObservedVisit): VisitScenarioSummary {
  const rules = rulesFor(visit);
  const gaps = interarrivalGaps(visit);
  const payments = elapsedWindows(visit, "caja", "ventanas de caja");
  const preparations = elapsedWindows(visit, "entrega", "ventanas de entrega");

  return {
    meanInterarrivalS: mean(gaps, "brechas entre llegadas de caja"),
    meanPaymentWindowS: mean(payments, "ventanas de caja"),
    meanPreparationWindowS: mean(preparations, "ventanas de entrega"),
    sampleCounts: {
      interarrivalGaps: gaps.length,
      paymentWindows: payments.length,
      preparationWindows: preparations.length,
    },
    assumptions: modelAssumptions(visit, rules),
  };
}

/** Build a version-1 exploratory scenario while leaving the observed visit and template untouched. */
export function buildVisitScenario(visit: ObservedVisit, template: Scenario): Scenario {
  const rules = rulesFor(visit);
  const summary = summarizeVisitScenario(visit);
  const engineConfig: ScenarioV1["engine_config"] = rules.mode === "tuesday"
    ? {
      contract_version: 1,
      mode: "tuesday",
      opening_time: visit.start_time,
      horizon_s: visit.duration_s,
      cashiers: 1,
      preparers: 4,
    }
    : {
      contract_version: 1,
      mode: "regular",
      opening_time: visit.start_time,
      horizon_s: visit.duration_s,
      integrated_workers: 1,
    };

  const scenario: ScenarioV1 = {
    contract_version: 1,
    scenario_id: `observed-${visit.visit_id}-exploratory`,
    display_name: rules.displayName,
    engine_config: engineConfig,
    initial_state: [],
    interarrival: { kind: "exponential", mean_s: summary.meanInterarrivalS },
    group_sizes: [{ size: 1, probability: 1 }],
    payment_active: { kind: "constant", value_s: summary.meanPaymentWindowS },
    preparation: { kind: "constant", value_s: summary.meanPreparationWindowS },
    transfer_probability: 0,
    transfer_confirmation: { kind: "constant", value_s: 0 },
    patience: null,
    provenance: "user_assumptions",
    assumptions: [...summary.assumptions],
    default_root_seed: template.default_root_seed,
  };

  return scenario;
}
