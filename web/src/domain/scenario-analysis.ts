import type { ExperimentResult, RunResult } from "../api/types";
import { formatNumber } from "./format";

export type AnalysisObjective = "time" | "withdrawals" | "closing";

export const ANALYSIS_OBJECTIVES: readonly { value: AnalysisObjective; label: string }[] = [
  { value: "time", label: "Recibir el pedido más pronto" },
  { value: "withdrawals", label: "Menos retiros por espera" },
  { value: "closing", label: "Reducir el tiempo después del cierre" },
];

export const SIMULATION_ANALYSIS_NOTICE =
  "Estas sugerencias dependen de los supuestos de las simulaciones. No son mediciones de la tienda ni aseguran lo que ocurrirá en la realidad.";

export interface CongestionReport {
  title: string;
  summary: string;
  evidence: string[];
  suggestion: string;
  limitations: string[];
}

export interface CandidateAdvice {
  scenarioId: string;
  name: string;
  status: "promising" | "worse" | "unclear" | "unavailable" | "tradeoff";
  summary: string;
  evidence: string[];
  tradeoffs: string[];
  suggestion: string;
}

export interface ObjectiveReport {
  objective: AnalysisObjective;
  label: string;
  title: string;
  summary: string;
  candidates: CandidateAdvice[];
  limitations: string[];
}

function savedQueueValue(run: RunResult, metricId: string): number | null {
  const matches = run.metrics.metric_summaries.filter((item) => item.metric_id === metricId);
  if (matches.length !== 1) return null;
  const summary = matches[0];
  if (summary?.unit !== "orders" || summary.population !== "waiting_orders" || summary.cohort !== "all") {
    return null;
  }
  const value = summary.value;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function queueEvidence(label: string, mean: number | null, maximum: number | null): string {
  const averageText = mean == null ? "promedio no disponible" : `promedio ${formatNumber(mean)} pedidos`;
  const maximumText = maximum == null ? "máximo no disponible" : `máximo ${formatNumber(maximum)} pedidos`;
  return `${label}: ${averageText}; ${maximumText}.`;
}

function congestionSuggestion(
  run: RunResult,
  paymentMean: number | null,
  paymentMaximum: number | null,
  preparationMean: number | null,
  preparationMaximum: number | null,
): string {
  if (paymentMean == null || preparationMean == null) {
    return "Guarda una simulación con las dos medidas de cola antes de proponer cambios.";
  }
  if (paymentMean === 0 && preparationMean === 0 && paymentMaximum === 0 && preparationMaximum === 0) {
    return "Prueba qué ocurre si llegan más pedidos, antes de proponer más personal.";
  }
  if (run.scenario.engine_config.mode === "regular" && (paymentMean > 0 || preparationMean > 0)) {
    return "Compara otra prueba con más apoyo para cobrar y preparar, manteniendo las mismas llegadas y tiempos.";
  }
  if (paymentMean > preparationMean) {
    return "Compara otra prueba con apoyo en caja, manteniendo las mismas llegadas y tiempos.";
  }
  if (preparationMean > paymentMean) {
    return "Compara otra prueba con apoyo en preparación, manteniendo las mismas llegadas y tiempos.";
  }
  return "Compara otra prueba manteniendo las mismas llegadas y tiempos antes de decidir dónde dar apoyo.";
}

export function analyzeRunCongestion(run: RunResult): CongestionReport {
  const paymentMean = savedQueueValue(run, "queue.payment.mean.orders");
  const paymentMaximum = savedQueueValue(run, "queue.payment.max.orders");
  const preparationMean = savedQueueValue(run, "queue.preparation.mean.orders");
  const preparationMaximum = savedQueueValue(run, "queue.preparation.max.orders");
  const evidence = [
    queueEvidence("Antes del pago", paymentMean, paymentMaximum),
    queueEvidence("Espera de preparación", preparationMean, preparationMaximum),
  ];

  let summary: string;
  if (paymentMean == null || preparationMean == null) {
    const missing = [
      paymentMean == null ? "la cola antes del pago" : null,
      preparationMean == null ? "la espera de preparación" : null,
    ].filter((value): value is string => value != null);
    summary = `Falta el promedio de ${missing.join(" y ")}; no se toma como cero y no se puede comparar dónde se acumula la espera.`;
  } else if (paymentMean === preparationMean && paymentMean === 0) {
    if (paymentMaximum === 0 && preparationMaximum === 0) {
      summary = "En esta simulación no se acumuló cola antes del pago ni durante la espera de preparación.";
    } else if (paymentMaximum == null || preparationMaximum == null) {
      summary = "El promedio guardado de ambas colas es cero, pero falta el máximo para confirmar que no hubo espera.";
    } else {
      summary = "El promedio de ambas colas es cero, aunque los máximos guardados muestran espera en algún momento.";
    }
  } else if (paymentMean === preparationMean) {
    if (paymentMaximum != null && preparationMaximum != null && paymentMaximum !== preparationMaximum) {
      const peakLocation = paymentMaximum > preparationMaximum ? "antes del pago" : "en la espera de preparación";
      summary = `Las dos colas tienen el mismo promedio de ${formatNumber(paymentMean)} pedidos; el máximo guardado fue mayor ${peakLocation}.`;
    } else {
      summary = `Las dos colas tienen el mismo promedio de ${formatNumber(paymentMean)} pedidos; no se distingue cuál acumuló más espera.`;
    }
  } else if (paymentMean > preparationMean) {
    summary = `La espera se acumula más antes del pago: el promedio guardado fue ${formatNumber(paymentMean)} pedidos, frente a ${formatNumber(preparationMean)} durante la espera de preparación.`;
  } else {
    summary = `La espera se acumula más después del pago, mientras los pedidos esperan preparación: el promedio guardado fue ${formatNumber(preparationMean)} pedidos, frente a ${formatNumber(paymentMean)} antes del pago.`;
  }

  const limitations = [
    "Una sola simulación muestra dónde se acumuló la espera, pero no prueba su causa ni indica que se necesite contratar personal.",
  ];
  if (run.scenario.engine_config.mode === "regular") {
    limitations.push("En el modo regular, el mismo personal cobra y prepara; esta cola no permite atribuir la espera solo al cobro.");
  }

  return {
    title: "Dónde se acumula la espera",
    summary,
    evidence,
    suggestion: congestionSuggestion(run, paymentMean, paymentMaximum, preparationMean, preparationMaximum),
    limitations,
  };
}

interface ObjectiveMetric {
  id: string;
  label: string;
  unit: "s" | "orders";
  population: string;
  cohort: string;
}

const OBJECTIVE_METRICS: Record<AnalysisObjective, ObjectiveMetric> = {
  time: {
    id: "duration.permanence.completed.order.new",
    label: "tiempo hasta recibir el pedido",
    unit: "s",
    population: "orders",
    cohort: "new",
  },
  withdrawals: {
    id: "count.withdrawn.orders.new",
    label: "retiros por espera",
    unit: "orders",
    population: "orders",
    cohort: "new",
  },
  closing: {
    id: "drain.overtime_s",
    label: "tiempo después del cierre",
    unit: "s",
    population: "run",
    cohort: "all",
  },
};

const GUARD_METRICS: ObjectiveMetric[] = [
  OBJECTIVE_METRICS.time,
  OBJECTIVE_METRICS.withdrawals,
  {
    id: "count.delivered.orders.new",
    label: "entregas de pedidos nuevos",
    unit: "orders",
    population: "orders",
    cohort: "new",
  },
  OBJECTIVE_METRICS.closing,
];

type ExperimentScenario = ExperimentResult["scenarios"][number];
type ExperimentRecord = ExperimentResult["replication_results"][number];
type ExperimentComparison = ExperimentResult["comparisons"][number];
type ReplicationMetric = NonNullable<ExperimentRecord["metrics"]>["metric_summaries"][number];
type IntervalDirection = "promising" | "worse" | "unclear";

interface ValidatedComparison {
  comparison: ExperimentComparison;
  mean: number;
  lower: number;
  upper: number;
  direction: IntervalDirection;
  exactTie: boolean;
}

type ComparisonValidation =
  | { valid: true; result: ValidatedComparison }
  | { valid: false; reason: string };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function metricSummariesAreCoherent(record: ExperimentRecord): boolean {
  const summaries = record.metrics?.metric_summaries;
  if (!Array.isArray(summaries) || summaries.length === 0) return false;
  const metricIds = new Set<string>();
  for (const summary of summaries) {
    if (!summary || typeof summary.metric_id !== "string" || summary.metric_id.length === 0) return false;
    if (metricIds.has(summary.metric_id) || !("value" in summary)) return false;
    if (!Number.isSafeInteger(summary.count) || summary.count < 0) return false;
    if (!Number.isSafeInteger(summary.n_valid) || summary.n_valid < 0) return false;
    if (summary.value != null && !isFiniteNumber(summary.value)) return false;
    metricIds.add(summary.metric_id);
  }
  return true;
}

function experimentHasCompleteRecordGrid(experiment: ExperimentResult): boolean {
  if (experiment.status !== "complete") return false;
  if (!Number.isSafeInteger(experiment.n_requested) || experiment.n_requested < 2) return false;
  if (experiment.n_valid !== experiment.n_requested) return false;
  if (!isFiniteNumber(experiment.confidence_level)
    || experiment.confidence_level <= 0
    || experiment.confidence_level >= 1) return false;
  if (!Array.isArray(experiment.scenarios) || experiment.scenarios.length < 2) return false;
  if (!Array.isArray(experiment.replication_results) || !Array.isArray(experiment.comparisons)) return false;
  if (!Array.isArray(experiment.issues) || experiment.issues.length > 0) return false;

  const scenarioIds = new Set<string>();
  for (const scenario of experiment.scenarios) {
    if (!scenario || typeof scenario.scenario_id !== "string" || scenario.scenario_id.length === 0) return false;
    if (scenarioIds.has(scenario.scenario_id)) return false;
    scenarioIds.add(scenario.scenario_id);
  }

  const expectedRecordCount = scenarioIds.size * experiment.n_requested;
  if (experiment.replication_results.length !== expectedRecordCount) return false;
  const seenRecords = new Set<string>();
  for (const record of experiment.replication_results) {
    if (!record || !scenarioIds.has(record.scenario_id)) return false;
    if (!Number.isInteger(record.replication_index)
      || record.replication_index < 0
      || record.replication_index >= experiment.n_requested) return false;
    if (record.status !== "complete" || !metricSummariesAreCoherent(record)) return false;
    const key = `${record.scenario_id}\u0000${record.replication_index}`;
    if (seenRecords.has(key)) return false;
    seenRecords.add(key);
  }
  return seenRecords.size === expectedRecordCount;
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return "undefined";
}

function scenariosShareOpeningConditions(reference: ExperimentScenario, candidate: ExperimentScenario): boolean {
  const referenceConfig = reference.engine_config;
  const candidateConfig = candidate.engine_config;
  if (!referenceConfig || !candidateConfig) return false;
  if (typeof referenceConfig.opening_time !== "string" || referenceConfig.opening_time.length === 0) return false;
  if (typeof candidateConfig.opening_time !== "string" || candidateConfig.opening_time.length === 0) return false;
  if (referenceConfig.opening_time !== candidateConfig.opening_time) return false;
  if (!isFiniteNumber(referenceConfig.horizon_s) || !isFiniteNumber(candidateConfig.horizon_s)) return false;
  if (referenceConfig.horizon_s !== candidateConfig.horizon_s) return false;
  if (!Array.isArray(reference.initial_state) || !Array.isArray(candidate.initial_state)) return false;
  return stableSerialize(reference.initial_state) === stableSerialize(candidate.initial_state);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function scenariosShareDemandAssumptions(reference: ExperimentScenario, candidate: ExperimentScenario): boolean {
  const referenceValues = reference as unknown as Record<string, unknown>;
  const candidateValues = candidate as unknown as Record<string, unknown>;
  const distributionKeys = ["interarrival", "payment_active", "preparation", "transfer_confirmation"];
  if (!distributionKeys.every((key) => isRecord(referenceValues[key]) && isRecord(candidateValues[key]))) return false;
  if (!Array.isArray(referenceValues.group_sizes) || !Array.isArray(candidateValues.group_sizes)) return false;
  if (!isFiniteNumber(referenceValues.transfer_probability)
    || !isFiniteNumber(candidateValues.transfer_probability)) return false;

  const signature = (scenario: ExperimentScenario, values: Record<string, unknown>) => stableSerialize({
    horizon_s: scenario.engine_config.horizon_s,
    interarrival: values.interarrival,
    group_sizes: values.group_sizes,
    payment_active: values.payment_active,
    preparation: values.preparation,
    transfer_probability: values.transfer_probability,
    transfer_confirmation: values.transfer_confirmation,
    patience: values.patience ?? null,
  });
  return signature(reference, referenceValues) === signature(candidate, candidateValues);
}

function metricValuesByReplication(
  experiment: ExperimentResult,
  scenarioId: string,
  metric: ObjectiveMetric,
): number[] | null {
  const records = experiment.replication_results.filter((record) => record.scenario_id === scenarioId);
  if (records.length !== experiment.n_requested) return null;
  const values = new Array<number | undefined>(experiment.n_requested);
  for (const record of records) {
    const matches = record.metrics?.metric_summaries.filter((item) => item.metric_id === metric.id) ?? [];
    if (matches.length !== 1) return null;
    const summary: ReplicationMetric | undefined = matches[0];
    if (summary?.unit !== metric.unit
      || summary.population !== metric.population
      || summary.cohort !== metric.cohort
      || !isFiniteNumber(summary.value)
      || summary.value < 0
      || summary.unavailable_reason != null) return null;
    if (metric.id.startsWith("count.")) {
      if (summary.n_valid === 0 && !(summary.value === 0 && summary.count === 0)) return null;
    } else if (summary.n_valid === 0) {
      return null;
    }
    values[record.replication_index] = summary.value;
  }
  return values.every(isFiniteNumber) ? values as number[] : null;
}

function intervalDirection(lower: number, upper: number): IntervalDirection {
  if (upper < 0) return "promising";
  if (lower > 0) return "worse";
  return "unclear";
}

function closeEnough(left: number, right: number): boolean {
  const tolerance = 32 * Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= tolerance;
}

function meanOfDifferences(values: number[]): number | null {
  const scale = Math.max(0, ...values.map((value) => Math.abs(value)));
  if (scale === 0) return 0;
  const scaledMean = values.reduce((total, value) => total + value / scale, 0) / values.length;
  const mean = scaledMean * scale;
  return isFiniteNumber(mean) ? mean : null;
}

function validateStoredComparison(
  experiment: ExperimentResult,
  reference: ExperimentScenario,
  candidate: ExperimentScenario,
  metric: ObjectiveMetric,
): ComparisonValidation {
  if (!scenariosShareOpeningConditions(reference, candidate)) {
    return {
      valid: false,
      reason: "La hora de apertura, el tiempo de simulación y los pedidos iniciales deben ser iguales para recomendar una variante.",
    };
  }
  if (!scenariosShareDemandAssumptions(reference, candidate)) {
    return {
      valid: false,
      reason: "Las llegadas, los grupos o los tiempos configurados no coinciden; no se puede atribuir el cambio a la variante.",
    };
  }
  const matches = experiment.comparisons.filter((comparison) =>
    comparison.candidate_scenario_id === candidate.scenario_id && comparison.metric_id === metric.id,
  );
  if (matches.length !== 1 || matches[0]?.reference_scenario_id !== reference.scenario_id) {
    return { valid: false, reason: "No hay una comparación guardada y única con la referencia para esta medida." };
  }
  const comparison = matches[0];
  if (comparison.demand_matched !== true
    || comparison.demand_tapes_identical !== true
    || comparison.generation_assumptions_differ !== false) {
    return {
      valid: false,
      reason: "Las llegadas o sus supuestos no coinciden; esta comparación no permite atribuir el cambio a la variante.",
    };
  }
  if (comparison.unit !== metric.unit
    || comparison.population !== metric.population
    || comparison.cohort !== metric.cohort) {
    return { valid: false, reason: "La medida guardada no corresponde a los mismos pedidos y unidades." };
  }
  const referenceValues = metricValuesByReplication(experiment, reference.scenario_id, metric);
  const candidateValues = metricValuesByReplication(experiment, candidate.scenario_id, metric);
  if (!referenceValues || !candidateValues) {
    return { valid: false, reason: `Faltan valores válidos de ${metric.label} en alguna prueba.` };
  }

  const estimate = comparison.estimate;
  const differences = comparison.replication_differences;
  if (estimate.method !== "student_t"
    || !isFiniteNumber(estimate.confidence_level)
    || estimate.confidence_level !== experiment.confidence_level
    || !Array.isArray(differences)
    || differences.length !== experiment.n_requested
    || !differences.every(isFiniteNumber)
    || estimate.n_requested !== experiment.n_requested
    || estimate.n_valid !== experiment.n_requested
    || !isFiniteNumber(estimate.mean)
    || !isFiniteNumber(estimate.lower)
    || !isFiniteNumber(estimate.upper)
    || estimate.lower > estimate.upper
    || estimate.lower > estimate.mean
    || estimate.mean > estimate.upper) {
    return { valid: false, reason: "La comparación guardada no tiene todas las diferencias y límites válidos." };
  }
  // Check stored pairs and their mean for stale or contradictory saved data.
  // Classification below still uses the saved interval; no interval is rebuilt here.
  for (let index = 0; index < experiment.n_requested; index += 1) {
    const referenceValue = referenceValues[index];
    const candidateValue = candidateValues[index];
    const storedDifference = differences[index];
    if (!isFiniteNumber(referenceValue)
      || !isFiniteNumber(candidateValue)
      || !isFiniteNumber(storedDifference)
      || !closeEnough(candidateValue - referenceValue, storedDifference)) {
      return { valid: false, reason: "Las diferencias guardadas no coinciden con los valores de las pruebas." };
    }
  }
  const checkedMean = meanOfDifferences(differences);
  if (checkedMean == null || !closeEnough(checkedMean, estimate.mean)) {
    return { valid: false, reason: "El promedio guardado no coincide con las diferencias de las pruebas." };
  }
  const mean = estimate.mean;
  const lower = estimate.lower;
  const upper = estimate.upper;
  return {
    valid: true,
    result: {
      comparison,
      mean,
      lower,
      upper,
      direction: intervalDirection(lower, upper),
      exactTie: lower === 0 && mean === 0 && upper === 0,
    },
  };
}

function displayScenarioName(scenario: ExperimentScenario): string {
  return scenario.display_name || scenario.scenario_id;
}

function differencePhrase(value: number, unit: "s" | "orders"): string {
  if (value === 0) return "sin cambio";
  const amount = formatNumber(Math.abs(value));
  const direction = value < 0 ? "menos" : "más";
  if (unit === "s") return `${amount} segundos ${direction}`;
  const noun = Math.abs(value) === 1 ? "pedido" : "pedidos";
  return `${amount} ${noun} ${direction}`;
}

function capitalized(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function comparisonChangeStatement(
  metric: ObjectiveMetric,
  comparison: ValidatedComparison,
  referenceName: string,
  candidateName: string,
): string {
  const average = metric.unit === "orders" ? " (promedio por prueba)" : " (promedio)";
  return `${capitalized(metric.label)}: ${differencePhrase(comparison.mean, metric.unit)} para «${candidateName}» frente a «${referenceName}»${average}.`;
}

function comparisonEvidence(
  metric: ObjectiveMetric,
  comparison: ValidatedComparison,
  referenceName: string,
  candidateName: string,
): string {
  const change = comparisonChangeStatement(metric, comparison, referenceName, candidateName);
  const limits = comparison.lower === 0 && comparison.upper === 0
    ? "La estimación guardada no muestra cambio."
    : `La estimación guardada va de ${differencePhrase(comparison.lower, metric.unit)} a ${differencePhrase(comparison.upper, metric.unit)}.`;
  return `${change} ${limits}`;
}

function unavailableAdvice(
  candidate: ExperimentScenario,
  reason: string,
): CandidateAdvice {
  const name = displayScenarioName(candidate);
  return {
    scenarioId: candidate.scenario_id,
    name,
    status: "unavailable",
    summary: `No se puede recomendar «${name}»: ${reason}`,
    evidence: [],
    tradeoffs: [],
    suggestion: "Completa los datos faltantes y compara con las mismas condiciones de llegada y apertura.",
  };
}

function targetDescription(
  metric: ObjectiveMetric,
  comparison: ValidatedComparison,
  referenceName: string,
  candidateName: string,
): string {
  if (comparison.exactTie) return `En estas pruebas no cambió ${metric.label}.`;
  const statement = comparisonChangeStatement(metric, comparison, referenceName, candidateName);
  if (comparison.direction === "unclear") {
    return `${statement} Todavía no se ve una ventaja clara.`;
  }
  return statement;
}

function crossMetricIsAdverse(metric: ObjectiveMetric, direction: IntervalDirection): boolean {
  if (direction === "unclear") return false;
  const adverseDirection = metric.id === "count.delivered.orders.new" ? "promising" : "worse";
  return direction === adverseDirection;
}

function meanChangeIsAdverse(metric: ObjectiveMetric, mean: number): boolean {
  return metric.id === "count.delivered.orders.new" ? mean < 0 : mean > 0;
}

function crossMetricMessage(
  metric: ObjectiveMetric,
  comparison: ValidatedComparison,
  referenceName: string,
  candidateName: string,
): string {
  if (comparison.exactTie) return `En estas pruebas no cambió ${metric.label}.`;
  const average = metric.unit === "orders" ? "En promedio por prueba" : "En promedio";
  const statement = `${average}, «${candidateName}» tuvo ${differencePhrase(comparison.mean, metric.unit)} en ${metric.label} frente a «${referenceName}».`;
  if (comparison.direction !== "unclear") return statement;
  if (comparison.mean === 0) return `No se pudo aclarar si cambia ${metric.label}.`;
  const qualifier = meanChangeIsAdverse(metric, comparison.mean) ? "el empeoramiento" : "la mejora";
  return `${statement} Todavía no está claro si ${qualifier} se mantiene.`;
}

function candidateAdviceForObjective(
  experiment: ExperimentResult,
  objective: AnalysisObjective,
  reference: ExperimentScenario,
  candidate: ExperimentScenario,
): CandidateAdvice {
  const metric = OBJECTIVE_METRICS[objective];
  const name = displayScenarioName(candidate);
  const referenceName = displayScenarioName(reference);
  if (objective === "withdrawals" && (reference.patience == null || candidate.patience == null)) {
    return unavailableAdvice(candidate, "los retiros por espera no están representados porque falta configurar la paciencia.");
  }

  const target = validateStoredComparison(experiment, reference, candidate, metric);
  if (!target.valid) return unavailableAdvice(candidate, target.reason);

  const evidence = [comparisonEvidence(metric, target.result, referenceName, name)];
  const tradeoffs: string[] = [];
  const adverseMessages: string[] = [];
  const unresolvedMessages: string[] = [];
  const guardMetrics = GUARD_METRICS.filter((guardMetric) => guardMetric.id !== metric.id);
  for (const guardMetric of guardMetrics) {
    const guard = validateStoredComparison(experiment, reference, candidate, guardMetric);
    if (!guard.valid) {
      const message = `No se pudo revisar ${guardMetric.label}; no se puede afirmar que no haya cambios en esa medida.`;
      tradeoffs.push(message);
      unresolvedMessages.push(message);
      continue;
    }
    evidence.push(comparisonEvidence(guardMetric, guard.result, referenceName, name));
    const message = crossMetricMessage(guardMetric, guard.result, referenceName, name);
    if (crossMetricIsAdverse(guardMetric, guard.result.direction)) {
      tradeoffs.push(message);
      adverseMessages.push(message);
    } else if (guard.result.direction === "unclear" && !guard.result.exactTie) {
      const uncertainty = message;
      tradeoffs.push(uncertainty);
      unresolvedMessages.push(uncertainty);
    }
  }

  const primaryDescription = targetDescription(metric, target.result, referenceName, name);
  let status: CandidateAdvice["status"] = target.result.direction;
  if (target.result.direction === "promising" && adverseMessages.length > 0) status = "tradeoff";
  const summaryParts = [primaryDescription];
  if (status === "tradeoff") {
    summaryParts.push(`Sin embargo, ${adverseMessages.map((message) => message[0]!.toLowerCase() + message.slice(1)).join(" ")}`);
  }
  summaryParts.push(...unresolvedMessages);
  const summary = summaryParts.join(" ");

  let suggestion: string;
  if (status === "tradeoff") {
    suggestion = "Compara otra variante que reduzca ese efecto y vuelve a revisar las medidas guardadas.";
  } else if (status === "promising") {
    suggestion = "Prueba esta variante con otros supuestos posibles antes de decidir.";
  } else if (status === "worse") {
    suggestion = `Prueba otra configuración si el objetivo sigue siendo reducir ${metric.label}.`;
  } else {
    suggestion = "Conserva las mismas condiciones y reúne más pruebas para aclarar la diferencia.";
  }

  return { scenarioId: candidate.scenario_id, name, status, summary, evidence, tradeoffs, suggestion };
}

export function analyzeExperimentObjective(
  experiment: ExperimentResult,
  objective: AnalysisObjective,
): ObjectiveReport {
  const objectiveOption = ANALYSIS_OBJECTIVES.find((item) => item.value === objective);
  const label = objectiveOption?.label ?? "Objetivo de comparación";
  const scenarios = Array.isArray(experiment.scenarios) ? experiment.scenarios : [];
  const reference = scenarios[0];
  const candidates = reference ? scenarios.slice(1) : [];
  const complete = experimentHasCompleteRecordGrid(experiment);
  const referenceName = reference ? displayScenarioName(reference) : "referencia";
  const limitations = [
    "Cada variante se compara con la primera; estos resultados no eligen una ganadora general entre variantes.",
  ];
  if (objective === "time") {
    limitations.push("El tiempo hasta recibir el pedido solo incluye pedidos nuevos que llegaron a recibir su pedido.");
  }
  if (objective === "withdrawals") {
    limitations.push("Los retiros se cuentan como pedidos, no como personas.");
  }

  let advice: CandidateAdvice[];
  let summary: string;
  if (!complete) {
    const reason = experiment.status !== "complete"
      ? "el experimento no terminó completo."
      : "faltan pruebas completas, repetidas o con datos válidos.";
    advice = candidates.map((candidate) => unavailableAdvice(candidate, reason));
    summary = "No se hacen recomendaciones porque el experimento no tiene todas las pruebas completas y válidas.";
  } else if (!reference) {
    advice = [];
    summary = "No hay una referencia guardada para comparar variantes.";
  } else {
    advice = candidates.map((candidate) => candidateAdviceForObjective(experiment, objective, reference, candidate));
    summary = `Cada variante se compara con «${referenceName}». La lista no ordena ni elige una ganadora entre variantes.`;
  }

  return {
    objective,
    label,
    title: `Comparar variantes: ${label}`,
    summary,
    candidates: advice,
    limitations,
  };
}
