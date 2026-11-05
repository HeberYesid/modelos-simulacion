import type { RunResult, Scenario, TimeDistribution } from "../api/types";
import { escapeHtml, formatNumber } from "../domain/format";
import { calculateQueuePerformance, type SimulatedQueueMeasures } from "../domain/queueing-performance";
import { analyzeQueueScenario, queueLoadStatus, queueStageLoadStatus, type QueueMeasures, type QueueStageTheory } from "../domain/queueing-theory";

type MeasureKey = "L" | "Lq" | "WSeconds" | "WqSeconds" | "rho";
const ROWS: { key: MeasureKey; label: string; unit: "orders" | "seconds" | "fraction" }[] = [
  { key: "L", label: "L · órdenes en la etapa", unit: "orders" },
  { key: "Lq", label: "Lq · órdenes esperando", unit: "orders" },
  { key: "WSeconds", label: "W · tiempo total en la etapa", unit: "seconds" },
  { key: "WqSeconds", label: "Wq · espera antes del servicio", unit: "seconds" },
  { key: "rho", label: "ρ · carga teórica / utilización simulada", unit: "fraction" },
];

function valueText(value: number | null | undefined, unit: "orders" | "seconds" | "fraction"): string {
  if (value == null || !Number.isFinite(value)) return "No disponible";
  return `${formatNumber(unit === "fraction" ? value * 100 : value, 3)} ${unit === "fraction" ? "%" : unit === "seconds" ? "s" : "órdenes"}`;
}

function table(theory: Partial<QueueMeasures> | null, simulated: SimulatedQueueMeasures, label: string): string {
  const occupancyTarget = simulated.id === "total" || simulated.id === "integrated" ? "sistema" : `etapa de ${label.toLowerCase()}`;
  const pEmpty = theory?.p0;
  const probability = (value: number | null | undefined): string =>
    theory == null ? "No aplica" : theory.status === "unstable" ? "Sin régimen estable" : valueText(value, "fraction");
  return `<div class="data-table-wrap queue-model-table" role="region" aria-label="${escapeHtml(label)}" tabindex="0">
    <table class="data-table"><caption class="visually-hidden">${escapeHtml(label)}: referencia teórica y una réplica simulada</caption>
      <thead><tr><th scope="col">Medida promedio</th><th scope="col">Referencia teórica</th><th scope="col">Esta réplica</th></tr></thead>
      <tbody>${ROWS.filter((row) => row.key !== "rho" || simulated.id !== "total").map((row) => `<tr>
        <th scope="row">${row.label}</th>
        <td>${theory == null ? "No aplica" : theory.status === "unstable" && row.key !== "rho" ? "Sin régimen estable" : valueText(theory[row.key], row.unit)}</td>
        <td>${valueText(simulated[row.key], row.unit)}</td></tr>`).join("")}
        <tr><th scope="row">P(${occupancyTarget} con órdenes)</th><td>${probability(pEmpty == null ? pEmpty : 1 - pEmpty)}</td><td>${valueText(simulated.pOccupied, "fraction")}</td></tr>
        <tr><th scope="row">P(${occupancyTarget} sin órdenes)</th><td>${probability(pEmpty)}</td><td>${valueText(simulated.pEmpty, "fraction")}</td></tr>
      </tbody>
    </table></div>`;
}

function status(stage: QueueStageTheory): string {
  if (stage.applicability === "unavailable") return "Las fórmulas M/M no aplican a esta configuración";
  if (stage.measures?.status === "unstable") return "Sin régimen estable: ρ ≥ 1";
  return stage.applicability === "approximation" ? "Aproximación: servicio total no exponencial" : "Referencia estacionaria aplicable";
}

function distributionLabel(distribution: TimeDistribution): string {
  return distribution.kind === "exponential" ? "exponencial" : distribution.kind === "triangular" ? "triangular" : "constante";
}

function configurationLabel(stage: QueueStageTheory, scenario: Scenario): string {
  const arrivals = stage.id === "preparation" ? "Llegadas: salidas de pago"
    : scenario.arrival_schedule?.length ? "Llegadas: por franjas horarias"
      : `Tiempo entre llegadas: ${distributionLabel(scenario.interarrival)}`;
  const preparation = scenario.menu ? "por productos y cantidades" : distributionLabel(scenario.preparation);
  const service = stage.id === "payment" ? distributionLabel(scenario.payment_active)
    : stage.id === "preparation" ? preparation
      : `suma de pago (${distributionLabel(scenario.payment_active)}) y preparación (${preparation})`;
  return `Servicio configurado: ${service}. ${arrivals}.`;
}

function rateText(value: number | null, perServer = false): string {
  if (value == null || !Number.isFinite(value)) return "No disponible";
  return `${formatNumber(value, 3)} órdenes/h${perServer ? " por servidor" : ""}`;
}

function loadText(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "No disponible" : `${formatNumber(value * 100, 1)}%`;
}

function renderStage(stage: QueueStageTheory, simulated: SimulatedQueueMeasures, scenario: Scenario): string {
  const measures = stage.measures;
  return `<article class="queue-model-stage" data-queue-stage="${stage.id}">
    <h3>${escapeHtml(stage.label)} · ${formatNumber(stage.servers, 0)} servidor${stage.servers === 1 ? "" : "es"}</h3>
    <p class="help-text" data-model-reference>Modelo de referencia: ${stage.model}.</p>
    <p class="help-text" data-load-status>Estabilidad: ${queueStageLoadStatus(stage)} · ρ nominal: ${loadText(stage.nominalRho)}${stage.peakRho === null ? "" : ` · ρ máxima por franja: ${loadText(stage.peakRho)}`}</p>
    <p class="help-text">${escapeHtml(configurationLabel(stage, scenario))}</p>
    <p class="help-text">${escapeHtml(status(stage))}</p>
    ${stage.reasons.length ? `<ul class="queue-model-reasons">${stage.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : ""}
    <dl class="event-detail" data-queue-rates>
      <div><dt>λ · llegadas de referencia</dt><dd data-rate-lambda>${rateText(stage.lambdaPerHour)}</dd></div>
      <div><dt>μ · servicio por servidor</dt><dd data-rate-mu>${rateText(stage.muPerHour, true)}</dd></div>
    </dl>
    <p class="help-text">Tasas calculadas a partir de los tiempos configurados; no son mediciones de esta réplica.</p>
    ${stage.rateNotes.length ? `<ul class="queue-model-reasons">${stage.rateNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
    ${table(measures, simulated, stage.label)}
    <p class="help-text">W: ${formatNumber(simulated.timeSamples, 0)} órdenes nuevas completadas con tiempos válidos · Wq: ${formatNumber(simulated.waitSamples, 0)}. Las órdenes iniciales y los retiros no se incluyen en estos tiempos.</p>
    ${measures?.status === "stable" ? `<p class="help-text">Referencia: P(esperar) = ${valueText(measures.pWait, "fraction")}.</p>` : ""}
  </article>`;
}

export function renderQueueModels(run: RunResult): string {
  const theory = analyzeQueueScenario(run.scenario);
  const simulation = calculateQueuePerformance(run);
  const tuesday = run.scenario.engine_config.mode === "tuesday";
  const topology = theory.map((stage) => `${stage.label} (${stage.servers} servidor${stage.servers === 1 ? "" : "es"})`).join(" → ");
  const canSum = theory.every((stage) => stage.applicability === "applicable" && stage.measures?.status === "stable");
  const totalTheory: Partial<QueueMeasures> | null = canSum ? {
    L: theory.reduce((sum, stage) => sum + stage.measures!.L!, 0),
    Lq: theory.reduce((sum, stage) => sum + stage.measures!.Lq!, 0),
    WSeconds: theory.reduce((sum, stage) => sum + stage.measures!.WSeconds!, 0),
    WqSeconds: theory.reduce((sum, stage) => sum + stage.measures!.WqSeconds!, 0),
  } : null;
  return `<section class="work-surface results-surface" aria-labelledby="queue-models-title">
    <div class="surface-heading"><div><h2 id="queue-models-title">Modelos de colas y desempeño</h2>
      <p>${tuesday ? "Martes · dos etapas en serie" : "Atención integrada · una etapa"}</p>
      <p data-system-load-status>Estado de carga del sistema: ${queueLoadStatus(theory)}</p></div></div>
    <p class="queue-topology">${escapeHtml(topology)}</p>
    <p class="help-text">El personal define la cantidad de servidores. Las distribuciones y las reglas determinan si aplica la referencia M/M.</p>
    <details class="details-block" data-queue-models><summary>Ver métricas por etapa</summary>
      <div class="queue-model-list">${theory.map((stage, index) => renderStage(stage, simulation.stages[index]!, run.scenario)).join("")}
        ${tuesday ? `<article class="queue-model-stage" data-queue-stage="total"><h3>Recorrido completo · pago y preparación</h3>
          <p class="help-text">Suma de las dos etapas. Los tiempos simulados usan únicamente órdenes con el recorrido completo conocido.</p>
          ${table(totalTheory, simulation.total, "Recorrido completo")}</article>` : ""}
      </div>
      <p class="provenance-line">L y Lq: promedios por tiempo durante la ventana de admisión, incluidas las órdenes iniciales y las que luego se retiran. W y Wq: órdenes nuevas completadas, incluido el vaciado después del cierre. P(con/sin órdenes) es la fracción de esa ventana en que había una o más órdenes en la etapa o el sistema. ρ mide utilización del personal. En atención integrada, Lq y Wq miden la espera antes de iniciar el pago; las pausas posteriores se consultan en los indicadores del motor.</p>
      <p class="provenance-line">Las fórmulas describen largo plazo con FIFO, colas sin límite, servidores equivalentes e independencia. Una jornada finita puede diferir de esa referencia. Un resultado sintético no valida el negocio real.</p>
      <details class="details-block"><summary>Cómo se calculan los valores teóricos</summary><p>ρ = λ / (sμ). Erlang C calcula P(esperar); Lq = P(esperar)ρ / (1 − ρ); Wq = Lq / λ; W = Wq + 1/μ; L = λW. Las tasas usan órdenes por hora y los tiempos se convierten a segundos. Solo hay régimen estable si ρ &lt; 1.</p>
        <p><a href="https://web.mit.edu/1.041/spring2023/lectures/L8-queuing-models-2023sp.pdf" target="_blank" rel="noopener noreferrer">Referencia académica: modelos de colas, MIT</a></p></details>
    </details>
  </section>`;
}
