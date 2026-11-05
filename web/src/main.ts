import "./styles.css";
import { installColorSchemeToggle } from "./theme";
import type { ExperimentResult, RunResult, Scenario, ScenarioDraft } from "./api/types";
import type { CompletedResult, ReplaySelection } from "./components/results";
import { renderResultsView, renderExperimentChartForSelection, runFilename, experimentFilename, updateReplayTimeline } from "./components/results";
import { renderObservationsView, type ObservationSourceMode } from "./components/observations";
import { renderObservedSection, mountObservedSection, type ObservedSectionHandle } from "./components/observed-replay";
import { preloadedVisitReport, renderVisitDataPicker, renderVisitScenarioPicker } from "./components/visit-data";
import { observedVisits } from "./replay/observed";
import { buildVisitScenario } from "./domain/visit-scenarios";
import { analyzeQueueScenario, queueLoadStatus } from "./domain/queueing-theory";
import { calculateQueuePerformance } from "./domain/queueing-performance";
import visitTemplate from "../contracts/fixtures/demo-scenario.json";
import { renderObjectiveAnalysisContent } from "./components/scenario-analysis";
import {
  addArrivalScheduleWindow,
  addInterruptionScheduleEntry,
  addMenuBasket,
  clearInterruptionSchedule,
  collectScenarioDraft,
  disableArrivalSchedule,
  disableInterruptionPolicy,
  disableMenu,
  enableArrivalSchedule,
  enableInterruptionPolicy,
  enableMenu,
  interruptionDraftIssues,
  newInitialOrder,
  removeArrivalScheduleWindow,
  removeInterruptionScheduleEntry,
  removeMenuBasket,
  renderScenarioView,
  resolveInterruptionCompatibility,
  scenarioConfigurationIssues,
  scenarioDraftToWire,
  scenarioToDraft,
  buildDistribution,
  setScenarioTimeValidity,
  refreshInitialWorkerOptions,
  validateInitialPersonLimits,
} from "./components/scenario-editor";
import { renderShell, setActiveView, setDirty, announce, type MainView } from "./components/shell";
import { serviceName, serviceReference, serviceStatusMessage } from "./deployment";
import type { ApiSchema, CsvExportRequest, ExperimentRequest, RunRequest } from "./api/types";
import { fieldLabel, systemAssumption } from "./domain/errors";
import { ANALYSIS_OBJECTIVES, type AnalysisObjective } from "./domain/scenario-analysis";
import workLimits from "../contracts/work-limits.json";
import { downloadBytes, downloadText, escapeHtml, formatNumber, readExactJsonFile, safeFileName } from "./domain/format";
import {
  checkHealth,
  executeExperiment,
  executeRun,
  cancelExecution,
  exactResponseJsonFor,
  exportCsv,
  importObservations,
  loadDemo,
  MAX_FILE_BYTES,
  ServiceError,
  validateSavedFile,
} from "./services/api";
import { mountReplayHost, type ReplayHostHandle } from "./replay/host";
import { create_replay_projector, ReplayTraceValidationError, type ReplayProjector } from "./replay/project";

type PendingAction = "import" | "run" | "experiment" | "file" | "selection" | "csv";

interface FieldIssue {
  path: string;
  message: string;
}

interface ActiveExecution {
  id: string;
  kind: "run" | "experiment";
  cancelRequestPending: boolean;
  cancelRequested: boolean;
  cancelError: string | null;
}

interface AppState {
  view: MainView;
  scenarios: ScenarioDraft[];
  activeScenarioIndex: number;
  replications: number;
  advancedOptionsOpen: boolean | null;
  comparisonOptionsOpen: boolean | null;
  modelHelpOpen: boolean | null;
  resetDisclosureCapture: boolean;
  cleanScenarioJson: string[];
  cleanReplications: number;
  observationMode: ObservationSourceMode;
  observations: ApiSchema<"ImportReport"> | null;
  preloadedVisitId: string | null;
  observationFailureReport: ApiSchema<"ImportReport"> | null;
  observationError: string | null;
  scenarioError: string | null;
  scenarioIssues: FieldIssue[];
  resultError: string | null;
  partialExperiment: ExperimentResult | null;
  jsonError: string | null;
  pending: PendingAction | null;
  pendingMessage: string | null;
  activeExecution: ActiveExecution | null;
  completed: CompletedResult | null;
  completedBytes: ArrayBuffer | null;
  selectedRun: RunResult | null;
  selection: ReplaySelection | null;
  analysisObjective: AnalysisObjective;
  csvFiles: Array<{ name: string; url: string }>;
  csvLabel: string | null;
  scenarioFileBytes: ArrayBuffer | null;
  scenarioFileJson: string | null;
}

const initialVisitScenarios = observedVisits.map(visit => scenarioToDraft(buildVisitScenario(visit, visitTemplate as Scenario)));

const state: AppState = {
  view: "observations",
  scenarios: initialVisitScenarios,
  activeScenarioIndex: 0,
  replications: 30,
  advancedOptionsOpen: null,
  comparisonOptionsOpen: null,
  modelHelpOpen: null,
  resetDisclosureCapture: false,
  cleanScenarioJson: initialVisitScenarios.map(scenario => scenarioWireJson(scenario)!),
  cleanReplications: 30,
  observationMode: "file",
  observations: preloadedVisitReport(observedVisits[0].visit_id),
  preloadedVisitId: observedVisits[0].visit_id,
  observationFailureReport: null,
  observationError: null,
  scenarioError: null,
  scenarioIssues: [],
  resultError: null,
  partialExperiment: null,
  jsonError: null,
  pending: null,
  pendingMessage: null,
  activeExecution: null,
  completed: null,
  completedBytes: null,
  selectedRun: null,
  selection: null,
  analysisObjective: "time",
  csvFiles: [],
  csvLabel: null,
  scenarioFileBytes: null,
  scenarioFileJson: null,
};

const interacted = new WeakSet<Element>();
let liveEnabled = false;
let liveTimer: number | undefined;
let liveRequestPending = false;
let liveScenarioKey: string | null = null;
let livePreview: { key: string; result: RunResult } | null = null;
let liveFailure: { key: string; message: string } | null = null;
let activeReplayHost: ReplayHostHandle | null = null;
let activeObservedSection: ObservedSectionHandle | null = null;
let replayMemoryRun: RunResult | null = null;
let replayMemoryTimeS = 0;
let replayMemorySelection = "";
const replayProjectors = new WeakMap<object, ReplayProjector>();

function replayProjectorFor(run: RunResult): ReplayProjector {
  const existing = replayProjectors.get(run);
  if (existing) return existing;
  const projector = create_replay_projector(run.trace);
  replayProjectors.set(run, projector);
  return projector;
}

function activeScenario(): ScenarioDraft | null {
  return state.scenarios[state.activeScenarioIndex] ?? null;
}

function updateActiveScenarioLabel(): void {
  const label = document.querySelector<HTMLElement>("[data-active-scenario-name]");
  const scenario = activeScenario();
  if (label && scenario) label.textContent = scenario.display_name;
}

function scenarioWireJson(scenario: ScenarioDraft): string | null {
  const wire = scenarioDraftToWire(scenario);
  return wire ? JSON.stringify(wire) : null;
}

function isDirty(): boolean {
  if (state.completed?.kind === "run") {
    const active = activeScenario();
    return !active || scenarioWireJson(active) !== JSON.stringify(state.completed.value.scenario);
  }
  if (state.completed?.kind === "experiment") {
    const submitted = state.completed.value.scenarios;
    return state.scenarios.length !== submitted.length
      || state.scenarios.some((scenario, index) => scenarioWireJson(scenario) !== JSON.stringify(submitted[index]))
      || state.replications !== state.completed.value.n_requested;
  }
  return state.scenarios.length !== state.cleanScenarioJson.length
    || state.scenarios.some((scenario, index) => scenarioWireJson(scenario) !== state.cleanScenarioJson[index])
    || state.replications !== state.cleanReplications;
}

function snapshot<T>(scenario: T): T {
  return structuredClone(scenario);
}

function formatSystemScenario(scenario: Scenario): ScenarioDraft {
  const result = scenarioToDraft(scenario);
  if (result.display_name === "Synthetic demonstration (not calibrated)") {
    result.display_name = "Demostración sintética · sin calibrar";
  }
  result.assumptions = result.assumptions.map(systemAssumption);
  return result;
}

function setServiceStatus(status: "checking" | "ok" | "error", message: string): void {
  const element = document.querySelector<HTMLElement>("#service-status");
  if (!element) return;
  element.dataset.state = status;
  const text = element.querySelector<HTMLElement>("span:last-child");
  if (text) text.textContent = message;
}

function renderScenarioUnavailable(): string {
  return `
    <div class="page-intro"><h1>Escenarios</h1></div>
    <div class="alert-box" role="alert"><h2>No se pudo cargar el escenario de demostración</h2>
      <p>Inicia ${serviceReference()} y vuelve a cargar. El navegador no crea valores de reemplazo.</p>
      ${state.scenarioError ? `<p>${escapeHtml(state.scenarioError)}</p>` : ""}
      <div class="inline-actions" style="margin-top:0.8rem"><button type="button" class="secondary-button" data-reload-demo>Volver a cargar</button></div>
    </div>`;
}

function clearCsvFiles(): void {
  for (const file of state.csvFiles) URL.revokeObjectURL(file.url);
  state.csvFiles = [];
  state.csvLabel = null;
}

function captureScenarioDisclosureState(): void {
  const advanced = document.querySelector<HTMLDetailsElement>("[data-advanced-options]");
  const comparison = document.querySelector<HTMLDetailsElement>("[data-comparison-options]");
  const help = document.querySelector<HTMLDetailsElement>("[data-model-help]");
  if (advanced) state.advancedOptionsOpen = advanced.open;
  if (comparison) state.comparisonOptionsOpen = comparison.open;
  if (help) state.modelHelpOpen = help.open;
}

function bindScenarioDisclosureState(root: HTMLElement): void {
  const advanced = root.querySelector<HTMLDetailsElement>("[data-advanced-options]");
  const comparison = root.querySelector<HTMLDetailsElement>("[data-comparison-options]");
  const help = root.querySelector<HTMLDetailsElement>("[data-model-help]");
  advanced?.addEventListener("toggle", () => { state.advancedOptionsOpen = advanced.open; });
  comparison?.addEventListener("toggle", () => { state.comparisonOptionsOpen = comparison.open; });
  help?.addEventListener("toggle", () => { state.modelHelpOpen = help.open; });
}

function hasAdvancedFieldIssue(issues: FieldIssue[]): boolean {
  return issues.some(({ path: originalPath }) => {
    const path = originalPath.replace(/^scenarios(?:\[\d+\]|\.\d+)\./, "");
    return path === "scenario_id"
    || path === "display_name"
    || path === "default_root_seed"
    || path === "root_seed"
    || path === "group_sizes"
    || path.startsWith("group_sizes.")
    || path.startsWith("group_sizes[")
    || path === "initial_state"
    || path.startsWith("initial_state.")
    || path.startsWith("initial_state[")
    || path.includes("cashier_interruptions")
    || path === "engine_config.preparation_interruption_policy";
  });
}

function renderCurrentView(focusRoot = false): void {
  if (state.resetDisclosureCapture) state.resetDisclosureCapture = false;
  else captureScenarioDisclosureState();
  const replayRun = state.view === "results"
    ? state.completed?.kind === "run" ? state.completed.value : state.selectedRun
    : null;
  activeReplayHost?.dispose();
  activeReplayHost = null;
  activeObservedSection?.dispose();
  activeObservedSection = null;
  if (replayRun && replayRun !== replayMemoryRun) {
    replayMemoryRun = replayRun;
    replayMemoryTimeS = 0;
    replayMemorySelection = "";
  }
  setActiveView(state.view);
  setDirty(isDirty());
  const root = document.querySelector<HTMLElement>("#view-root");
  if (!root) return;
  if (state.view === "observations") {
    root.innerHTML = renderObservationsView({
      report: state.observations,
      failureReport: state.observationFailureReport,
      mode: state.observationMode,
      pending: state.pending === "import",
      error: state.observationError,
      measuredReplayMarkup: renderObservedSection(),
      preloadedVisitsMarkup: renderVisitDataPicker(state.preloadedVisitId, state.pending !== null),
    });
    activeObservedSection = mountObservedSection(root, state.preloadedVisitId);
  } else if (state.view === "scenario") {
    const scenario = activeScenario();
    const comparisonIssue = state.scenarioIssues.some((issue) => issue.path.startsWith("scenarios."));
    const interruptionIssue = scenario?.contract_version === "2" && interruptionDraftIssues(scenario).length > 0;
    root.innerHTML = scenario ? renderScenarioView({
      scenario,
      scenarios: state.scenarios,
      activeScenarioIndex: state.activeScenarioIndex,
      replications: state.replications,
      advancedOpen: hasAdvancedFieldIssue(state.scenarioIssues)
        || interruptionIssue
        || (state.advancedOptionsOpen ?? (scenario.contract_version === "2" || scenario.initial_state.length > 0)),
      comparisonOpen: comparisonIssue || (state.comparisonOptionsOpen ?? state.scenarios.length > 1),
      helpOpen: state.modelHelpOpen ?? false,
      pending: state.pending === "run" || state.pending === "experiment" || state.pending === "selection" || state.pending === "file",
      error: state.scenarioError ?? state.jsonError,
      failedFields: state.scenarioIssues,
    }) : renderScenarioUnavailable();
    if (scenario) {
      root.querySelector(".page-intro")?.insertAdjacentHTML("afterend", renderVisitScenarioPicker(state.pending !== null));
      bindScenarioDisclosureState(root);
    }
  } else {
    root.innerHTML = renderResultsView({
      completed: state.completed,
      selectedRun: state.selectedRun,
      selection: state.selection,
      observations: state.observations,
      pending: state.pending,
      pendingMessage: state.pendingMessage,
      error: state.resultError ?? state.jsonError,
      partialExperiment: state.partialExperiment,
      editsNotRun: isDirty(),
      analysisObjective: state.analysisObjective,
      csvFiles: state.csvFiles,
      csvLabel: state.csvLabel,
    });
  }
  if (state.activeExecution) root.insertAdjacentHTML("afterbegin", executionCancellationMarkup(state.activeExecution));
  if (replayRun && root.querySelector("#replay-stage")) {
    try {
      activeReplayHost = mountReplayHost(replayRun, {
        initialTimeS: replayMemoryTimeS,
        initialSelection: replayMemorySelection,
        onTimeChange(timeS) { replayMemoryTimeS = timeS; },
        onSelectionChange(selection) { replayMemorySelection = selection; },
      }, replayProjectorFor(replayRun));
    } catch (error) {
      const stage = root.querySelector<HTMLElement>("#replay-stage");
      if (stage) {
        stage.dataset.state = "unavailable";
        const status = stage.querySelector<HTMLElement>("#replay-render-status");
        if (status) status.textContent = apiErrorMessage(error);
        const retry = stage.querySelector<HTMLButtonElement>("[data-replay-retry]");
        if (retry) retry.hidden = true;
        root.querySelectorAll<HTMLButtonElement>("[data-replay-zoom], [data-replay-camera-reset], [data-replay-view-toggle]")
          .forEach((button) => { button.disabled = true; });
      }
    }
  }
  refreshLiveScenario();
  if (focusRoot) root.focus({ preventScroll: true });
}

function executionCancellationMarkup(execution: ActiveExecution): string {
  const subject = execution.kind === "run" ? "La réplica" : "La comparación";
  const message = execution.cancelError
    ? `${subject} sigue en curso. No se pudo solicitar la cancelación: ${execution.cancelError} Puedes intentarlo de nuevo.`
    : execution.cancelRequested
      ? "Cancelación solicitada. El resultado anterior se conservará mientras el servidor detiene la ejecución."
      : `${subject} está en curso. Puedes pedir que el servidor la cancele.`;
  const label = execution.cancelRequestPending
    ? "Solicitando cancelación…"
    : execution.cancelRequested
      ? "Cancelación solicitada"
      : execution.cancelError
        ? "Reintentar cancelación"
        : "Cancelar ejecución";
  const disabled = execution.cancelRequestPending || execution.cancelRequested;
  return `
    <section class="alert-box execution-cancellation" aria-labelledby="execution-cancel-status">
      <p id="execution-cancel-status" role="${execution.cancelError ? "alert" : "status"}" aria-live="${execution.cancelError ? "assertive" : "polite"}" tabindex="-1">${escapeHtml(message)}</p>
      <div class="inline-actions"><button class="secondary-button" type="button" data-cancel-execution ${disabled ? "disabled" : ""}>${label}</button></div>
    </section>`;
}

function goToView(view: MainView, focus = true): void {
  state.view = view;
  renderCurrentView(focus);
}

function markActiveScenario(next: ScenarioDraft): void {
  if (state.activeScenarioIndex < 0) return;
  state.scenarios[state.activeScenarioIndex] = next;
  setDirty(isDirty());
}

function handleHealth(): void {
  void checkHealth().then(
    () => setServiceStatus("ok", serviceStatusMessage("ok")),
    () => setServiceStatus("error", serviceStatusMessage("error")),
  );
}

async function loadDemoScenario(append = false): Promise<void> {
  state.scenarioError = null;
  setServiceStatus("checking", serviceStatusMessage("checking"));
  renderCurrentView();
  try {
    const response = await loadDemo();
    const demo = formatSystemScenario(response.scenario);
    if (append) {
      const index = state.scenarios.findIndex(scenario => scenario.scenario_id === demo.scenario_id);
      if (index < 0) state.scenarios.push(demo);
      state.activeScenarioIndex = index < 0 ? state.scenarios.length - 1 : index;
    } else {
      state.scenarios = [demo];
      state.activeScenarioIndex = 0;
      state.replications = response.replications;
      state.cleanScenarioJson = [scenarioWireJson(demo) ?? JSON.stringify(response.scenario)];
      state.cleanReplications = response.replications;
    }
    state.advancedOptionsOpen = null;
    state.comparisonOptionsOpen = null;
    state.modelHelpOpen = null;
    state.resetDisclosureCapture = true;
    state.scenarioFileBytes = null;
    state.scenarioFileJson = null;
    state.scenarioError = null;
    setServiceStatus("ok", serviceStatusMessage("ok"));
  } catch (error) {
    state.scenarioError = error instanceof Error ? error.message : "No se pudo cargar la demostración local.";
    setServiceStatus("error", serviceStatusMessage("error"));
  }
  renderCurrentView();
}

function apiErrorMessage(error: unknown): string {
  if (error instanceof ServiceError && (error.code === "unsupported_version"
    || error.code === "invalid_saved_file" || error.code === "invalid_artifact")) {
    return "Esta versión de archivo no es compatible o el JSON no contiene un escenario, réplica o experimento completo de su versión. El resultado anterior se conserva.";
  }
  if (error instanceof ServiceError && error.diagnosticReference) {
    return `${error.message} Referencia local: ${error.diagnosticReference}.`;
  }
  if (error instanceof ReplayTraceValidationError) {
    return `El historial de eventos no cumple el contrato de reproducción. El resultado anterior se conserva. Detalle: ${error.message}`;
  }
  return error instanceof Error ? error.message : "La solicitud no se pudo completar.";
}

function apiFieldIssues(error: unknown): FieldIssue[] {
  if (!(error instanceof ServiceError)) return [];
  return error.issues.map((issue) => ({ path: issue.path, message: `${fieldLabel(issue.path)}: ${issue.message}` }));
}

function revealDisclosureFor(element: HTMLElement): void {
  let details = element.closest<HTMLDetailsElement>("details");
  while (details) {
    details.open = true;
    if (details.matches("[data-advanced-options]")) state.advancedOptionsOpen = true;
    if (details.matches("[data-comparison-options]")) state.comparisonOptionsOpen = true;
    if (details.matches("[data-model-help]")) state.modelHelpOpen = true;
    details = details.parentElement?.closest<HTMLDetailsElement>("details") ?? null;
  }
}

function focusControl(selector: string): void {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  revealDisclosureFor(target);
  target.focus();
}

function focusField(path: string): void {
  const scenarioPath = /^scenarios(?:\[(\d+)\]|\.(\d+))\.(.+)$/.exec(path);
  if (scenarioPath) {
    const index = Number(scenarioPath[1] ?? scenarioPath[2] ?? "0");
    const fieldPath = scenarioPath[3] ?? "";
    if (state.scenarios[index]) {
      const changedScenario = state.activeScenarioIndex !== index;
      if (changedScenario) {
        captureScenarioDisclosureState();
        state.activeScenarioIndex = index;
        state.resetDisclosureCapture = true;
      }
      state.comparisonOptionsOpen = true;
      if (hasAdvancedFieldIssue([{ path: fieldPath, message: "" }])) state.advancedOptionsOpen = true;
      if (changedScenario) renderCurrentView();
      const comparison = document.querySelector<HTMLDetailsElement>("[data-comparison-options]");
      if (comparison) revealDisclosureFor(comparison);
      focusField(fieldPath);
    }
    return;
  }
  const direct: Record<string, string> = {
    scenario_id: "#scenario-id",
    display_name: "#scenario-name",
    "engine_config.cashiers": "#cashiers",
    "engine_config.preparers": "#preparers",
    "engine_config.integrated_workers": "#integrated-workers",
    "engine_config.opening_time": "#opening-time",
    "engine_config.horizon_s": "#closing-time",
    transfer_probability: "#transfer-probability",
    default_root_seed: "#root-seed",
    "interarrival.mean_s": "#dist-interarrival-mean",
    "interarrival.low_s": "#dist-interarrival-low",
    "interarrival.value_s": "#dist-interarrival-value",
    group_sizes: "[data-group-field='probability']",
  };
  const group = /^group_sizes(?:\[(\d+)\]|\.(\d+))?(?:\.(size|probability))?$/.exec(path);
  if (group) {
    const index = group[1] ?? group[2] ?? "0";
    const field = group[3] === "size" ? "size" : "probability";
    focusControl(`#group-${field === "size" ? "size" : "prob"}-${index}`);
    return;
  }
  const targetPath = path.replace(/\[\d+\]/g, "");
  if (direct[targetPath]) {
    focusControl(direct[targetPath]);
    return;
  }
  const initial = /initial_state(?:\[(\d+)\]|\.(\d+))\.(\w+)/.exec(path);
  if (initial) {
    const index = initial[1] ?? initial[2] ?? "0";
    const fields: Record<string, string> = {
      order_id: "id",
      person_ids: "people",
      stage: "stage",
      queue_rank: "rank",
      worker_id: "worker",
      remaining_s: "remaining",
      arrival_s: "arrival",
      payment_active_s: "payment",
      transfer_wait_s: "transfer",
      preparation_s: "preparation",
      patience_remaining_s: "patience",
    };
    const id = fields[initial[3] ?? ""];
    if (id) focusControl(`#initial-${index}-${id}`);
    return;
  }
  const interruption = /(?:engine_config\.)?cashier_interruptions(?:\[(\d+)\]|\.(\d+))\.(at_s|suspended_order_id|cashier_order_id)/.exec(path);
  if (interruption) {
    const index = interruption[1] ?? interruption[2] ?? "0";
    const field = interruption[3];
    const selector = field === "at_s" ? `[data-interruption-at="${index}"]`
      : field === "suspended_order_id" ? `[data-suspended-order-id="${index}"]`
        : `[data-cashier-order-id="${index}"]`;
    focusControl(selector);
    return;
  }
  if (path === "arrival_schedule_enabled" || path === "arrival_schedule") {
    focusControl("#arrival-schedule-enabled");
    return;
  }
  const arrival = /^arrival_schedule(?:\[(\d+)\]|\.(\d+))\.(start_s|end_s|orders_per_hour)$/.exec(path);
  if (arrival) {
    const index = arrival[1] ?? arrival[2] ?? "0";
    const field = arrival[3] === "orders_per_hour" ? "rate" : arrival[3] === "start_s" ? "start" : "end";
    const boundaryIndex = field === "start" ? String(Math.max(0, Number(index) - 1)) : index;
    focusControl(field === "start" ? `[data-arrival-window-end="${boundaryIndex}"]`
      : field === "rate" ? `[data-arrival-orders-per-hour="${index}"]` : `[data-arrival-window-end="${index}"]`);
    return;
  }
  if (path.startsWith("menu.products") || path === "menu") {
    const product = /^menu\.products(?:\[(\d+)\]|\.(\d+))\.(preparation_s|product_id|display_name)$/.exec(path);
    if (product) {
      const index = product[1] ?? product[2] ?? "0";
      focusControl(`[data-menu-product-time="${index}"]`);
    } else {
      focusControl("#menu-enabled");
    }
    return;
  }
  const menuBasket = /^menu\.baskets(?:\[(\d+)\]|\.(\d+))(?:\.(probability|items))?/.exec(path);
  if (menuBasket) {
    const index = menuBasket[1] ?? menuBasket[2] ?? "0";
    focusControl(menuBasket[3] === "probability" ? `[data-menu-basket-probability="${index}"]`
      : `[data-menu-basket-quantity="${index}"]`);
    return;
  }
  const distribution = /^(interarrival|payment_active|preparation|transfer_confirmation|patience)\.(value_s|mean_s|low_s|mode_s|high_s)$/.exec(path);
  if (distribution) {
    const suffix = distribution[2]?.replace("_s", "").replace("mean", "mean");
    focusControl(`#dist-${distribution[1]}-${suffix}`);
    return;
  }
  if (path === "interarrival.kind") focusControl("#dist-interarrival-kind");
}

function checkIntegerControls(form: HTMLFormElement): HTMLInputElement | null {
  let invalid: HTMLInputElement | null = null;
  for (const control of form.querySelectorAll<HTMLInputElement>("[data-integer-field]")) {
    const value = control.value.trim() === "" ? NaN : Number(control.value);
    const message = control.value.trim() !== "" && !Number.isSafeInteger(value)
      ? "Usa un entero exacto de hasta 9.007.199.254.740.991."
      : "";
    control.setCustomValidity(message);
    if (message && !invalid) invalid = control;
  }
  return invalid;
}

function validateInterarrival(form: HTMLFormElement): HTMLInputElement | null {
  const kind = form.querySelector<HTMLSelectElement>('[data-distribution-kind="interarrival"]')?.value;
  const field = kind === "constant" ? "value_s" : kind === "exponential" ? "mean_s" : "low_s";
  const input = form.querySelector<HTMLInputElement>(`[data-distribution-field="interarrival.${field}"]`);
  if (!input) return null;
  const value = Number(input.value);
  const message = Number.isFinite(value) && value <= 0
    ? "El tiempo entre llegadas debe ser estrictamente mayor que cero."
    : "";
  input.setCustomValidity(message);
  return message ? input : null;
}

function collectCurrentScenario(): { scenario: Scenario; replications: number } | null {
  const form = document.querySelector<HTMLFormElement>("#scenario-form");
  const current = activeScenario();
  if (!form || !current) return null;
  const firstInvalid = checkIntegerControls(form) ?? validateInitialPersonLimits(form) ?? validateInterarrival(form);
  if (firstInvalid) {
    revealDisclosureFor(firstInvalid);
    firstInvalid.reportValidity();
    return null;
  }
  if (!setScenarioTimeValidity(form)) {
    const closingTime = form.querySelector<HTMLInputElement>("[data-closing-time]");
    if (closingTime) {
      revealDisclosureFor(closingTime);
      closingTime.reportValidity();
    }
    return null;
  }
  const firstInvalidControl = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input:invalid, select:invalid, textarea:invalid");
  if (firstInvalidControl) {
    revealDisclosureFor(firstInvalidControl);
    firstInvalidControl.reportValidity();
    return null;
  }
  if (!form.reportValidity()) return null;
  const draft = collectScenarioDraft(form, current);
  state.replications = draft.replications;
  markActiveScenario(draft.scenario);
  const configurationIssues = scenarioConfigurationIssues(draft.scenario);
  if (configurationIssues.length > 0) {
    state.scenarioError = "Corrige el horario de llegadas o los tipos de pedido del menú; el borrador se conservó.";
    state.scenarioIssues = configurationIssues;
    renderCurrentView();
    focusField(configurationIssues[0]?.path ?? "");
    return null;
  }
  const interruptionIssues = interruptionDraftIssues(draft.scenario);
  if (interruptionIssues.length > 0) {
    state.scenarioError = "La programación de pausas tiene campos o capacidad incompatibles. Corrige los elementos señalados; se conservaron las filas.";
    state.scenarioIssues = interruptionIssues;
    renderCurrentView();
    focusField(interruptionIssues[0]?.path ?? "");
    return null;
  }
  const scenario = scenarioDraftToWire(draft.scenario);
  if (!scenario) {
    state.scenarioError = "Completa los campos obligatorios del borrador antes de ejecutar o descargar el escenario.";
    state.scenarioIssues = [{ path: "scenario_id", message: state.scenarioError }];
    renderCurrentView();
    document.querySelector<HTMLElement>("#scenario-error")?.focus();
    return null;
  }
  return { scenario, replications: draft.replications };
}

function refreshScenarioAfterChange(focusId: string | null): void {
  state.scenarioError = null;
  state.scenarioIssues = [];
  renderCurrentView();
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  setDirty(isDirty());
}

function addScenarioAssumption(scenario: ScenarioDraft, text: string): ScenarioDraft {
  const next = snapshot(scenario);
  next.provenance = "user_assumptions";
  next.assumptions = next.assumptions.includes(text) ? next.assumptions : [...next.assumptions, text];
  return next;
}

function changeMode(mode: "tuesday" | "regular"): void {
  const current = activeScenario();
  if (!current || current.engine_config.mode === mode) return;
  const next = snapshot(current);
  next.engine_config.mode = mode;
  if (mode === "regular") {
    next.engine_config.cashiers = 0;
    next.engine_config.preparers = 0;
    next.engine_config.integrated_workers = 1;
  } else {
    next.engine_config.cashiers = 1;
    next.engine_config.preparers = 4;
    next.engine_config.integrated_workers = 0;
  }
  markActiveScenario(addScenarioAssumption(
    next,
    "El modo y la capacidad elegidos son supuestos del usuario; los parámetros de demanda se mantienen sin cambios.",
  ));
  const focusId = mode === "regular" ? "integrated-workers" : "cashiers";
  refreshScenarioAfterChange(focusId);
}

function addCandidate(): void {
  const reference = state.scenarios[0];
  if (!reference || state.pending) return;
  let index = 1;
  const ids = new Set(state.scenarios.map((scenario) => scenario.scenario_id));
  while (ids.has(`candidate-${index}`)) index += 1;
  let candidate = snapshot(reference);
  candidate.scenario_id = `candidate-${index}`;
  candidate.display_name = `Escenario candidato ${index}`;
  candidate = addScenarioAssumption(
    candidate,
    "Este candidato se creó como copia explícita de la referencia; sus parámetros deben editarse antes de interpretar la comparación.",
  );
  state.scenarios.push(candidate);
  state.activeScenarioIndex = state.scenarios.length - 1;
  state.comparisonOptionsOpen = true;
  state.scenarioError = null;
  renderCurrentView();
  document.querySelector<HTMLButtonElement>(`[data-scenario-select="${state.activeScenarioIndex}"]`)?.focus();
  setDirty(isDirty());
}

function removeCandidate(index: number): void {
  if (index <= 0 || index >= state.scenarios.length || state.pending) return;
  state.scenarios.splice(index, 1);
  state.activeScenarioIndex = Math.min(index - 1, state.scenarios.length - 1);
  state.scenarioError = null;
  renderCurrentView();
  document.querySelector<HTMLButtonElement>(`[data-scenario-select="${state.activeScenarioIndex}"]`)?.focus();
}

function currentExperimentSeed(scenarios: Scenario[]): number {
  return scenarios[state.activeScenarioIndex]?.default_root_seed ?? scenarios[0]?.default_root_seed ?? 20261020;
}

function cleanResultText(value: unknown): string {
  if (value && typeof value === "object") {
    const exactJson = exactResponseJsonFor(value);
    if (exactJson !== undefined) return exactJson;
  }
  return JSON.stringify(value, null, 2);
}

function setPending(action: PendingAction, message: string): void {
  state.pending = action;
  state.pendingMessage = message;
  state.scenarioError = null;
  state.scenarioIssues = [];
  state.resultError = null;
  state.partialExperiment = null;
  renderCurrentView();
}

function clearPending(): void {
  state.pending = null;
  state.pendingMessage = null;
}

function percent(value: number | null): string {
  return value === null ? "No disponible" : `${formatNumber(value * 100, 2)} %`;
}

function refreshLiveScenario(): void {
  window.clearTimeout(liveTimer);
  liveScenarioKey = null;
  // The local engine accepts one execution at a time, including manual runs.
  document.querySelectorAll<HTMLButtonElement>("[data-run-scenario], [data-run-experiment], [data-select-replication]")
    .forEach((button) => {
      if (liveRequestPending && !button.disabled) {
        button.disabled = true;
        button.dataset.liveBlocked = "";
      } else if (!liveRequestPending && button.dataset.liveBlocked !== undefined) {
        button.disabled = false;
        delete button.dataset.liveBlocked;
      }
    });
  const panel = document.querySelector<HTMLElement>(".live-simulation");
  const form = document.querySelector<HTMLFormElement>("#scenario-form");
  const current = activeScenario();
  if (state.view !== "scenario" || !panel || !form || !current) return;

  const toggle = panel.querySelector<HTMLInputElement>("[data-live-toggle]")!;
  const load = panel.querySelector<HTMLElement>("[data-live-load]")!;
  const status = panel.querySelector<HTMLElement>("[data-live-status]")!;
  const metrics = panel.querySelector<HTMLElement>("[data-live-metrics]")!;
  const open = panel.querySelector<HTMLButtonElement>("[data-open-live-result]")!;
  toggle.checked = liveEnabled;
  toggle.disabled = state.pending !== null;
  open.disabled = true;
  metrics.hidden = true;
  if (state.pending) {
    status.textContent = "Hay otra operación en curso.";
    return;
  }

  const draft = collectScenarioDraft(form, current).scenario;
  const scenario = setScenarioTimeValidity(form) && !form.querySelector(":invalid")
    ? scenarioDraftToWire(draft)
    : null;
  if (!scenario) {
    load.textContent = "";
    status.textContent = "Revisa los campos del escenario para calcular la estabilidad y la réplica.";
    return;
  }
  const stages = analyzeQueueScenario(scenario);
  const diagnosis = queueLoadStatus(stages);
  load.innerHTML = `<p><strong>${diagnosis}</strong> según la carga configurada.</p>
    <p class="help-text">${stages.map((stage) => `${stage.label} · ρ ${percent(stage.nominalRho)}${stage.peakRho === null ? "" : ` (máx. ${percent(stage.peakRho)})`}`).join(" / ")}</p>
    <p class="help-text">ρ compara la demanda de trabajo con la capacidad del equipo. Si llega al 100 % o lo supera, el equipo no tiene margen para absorber la cola.</p>`;
  if (!liveEnabled) {
    status.textContent = liveRequestPending ? "Terminando la réplica iniciada…" : "La actualización automática está desactivada.";
    return;
  }

  const key = JSON.stringify(scenario);
  liveScenarioKey = key;
  if (livePreview?.key === key) {
    status.textContent = "Réplica actualizada.";
    const result = calculateQueuePerformance(livePreview.result).total;
    const amount = (value: number | null, unit: string): string =>
      value === null ? "No disponible" : `${formatNumber(value, 2)} ${unit}`;
    metrics.innerHTML = `<dl class="live-metrics-grid">
      <div><dt>L · órdenes presentes</dt><dd>${amount(result.L, "órdenes")}</dd></div>
      <div><dt>Lq · órdenes en fila</dt><dd>${amount(result.Lq, "órdenes")}</dd></div>
      <div><dt>W · tiempo total</dt><dd>${amount(result.WSeconds, "s")}</dd></div>
      <div><dt>Wq · tiempo en fila</dt><dd>${amount(result.WqSeconds, "s")}</dd></div>
      <div><dt>P(ocupado) · alguna orden</dt><dd>${percent(result.pOccupied)}</dd></div>
      <div><dt>P(vacío) · ninguna orden</dt><dd>${percent(result.pEmpty)}</dd></div>
    </dl><p class="help-text">L, Lq y las probabilidades usan el horario de admisión. W y Wq son promedios de las órdenes nuevas completadas.</p>`;
    metrics.hidden = false;
    open.disabled = false;
  } else if (liveFailure?.key === key) {
    status.textContent = `${liveFailure.message} Para reintentar, desactiva y vuelve a activar la actualización.`;
  } else {
    status.textContent = "Calculando la réplica…";
    if (!liveRequestPending) liveTimer = window.setTimeout(() => { void runLiveScenario(scenario, key); }, 500);
  }
}

async function runLiveScenario(scenario: Scenario, key: string): Promise<void> {
  if (liveScenarioKey !== key || liveRequestPending || state.pending) return;
  liveRequestPending = true;
  refreshLiveScenario();
  try {
    const result = await executeRun({ scenario, root_seed: scenario.default_root_seed, replication_index: 0 });
    replayProjectorFor(result);
    if (liveScenarioKey === key) livePreview = { key, result };
  } catch (error) {
    if (liveScenarioKey === key) liveFailure = { key, message: apiErrorMessage(error) };
  } finally {
    liveRequestPending = false;
    refreshLiveScenario();
  }
}

function showRunResult(result: RunResult): void {
  state.completed = {
    kind: "run",
    value: result,
    jsonText: cleanResultText(result),
    label: result.scenario.display_name,
  };
  state.completedBytes = null;
  state.selectedRun = result;
  state.selection = { scenarioId: result.scenario.scenario_id, replicationIndex: result.replication_index };
  clearCsvFiles();
  state.resultError = null;
}

async function runSingle(): Promise<void> {
  if (state.pending || liveRequestPending) return;
  const draft = collectCurrentScenario();
  if (!draft) return;
  const submitted = snapshot(draft.scenario);
  const submittedIndex = state.activeScenarioIndex;
  const request: RunRequest = {
    scenario: submitted,
    root_seed: submitted.default_root_seed,
    replication_index: 0,
  };
  const execution: ActiveExecution = {
    id: crypto.randomUUID(),
    kind: "run",
    cancelRequestPending: false,
    cancelRequested: false,
    cancelError: null,
  };
  state.activeExecution = execution;
  setPending("run", "El motor está ejecutando una réplica completa. No se muestra progreso estimado.");
  try {
    const result = await executeRun(request, execution.id);
    replayProjectorFor(result);
    showRunResult(result);
    if (state.scenarios[submittedIndex]
      && scenarioWireJson(state.scenarios[submittedIndex]) === JSON.stringify(submitted)) {
      state.scenarios[submittedIndex] = scenarioToDraft(result.scenario);
    }
    state.cleanScenarioJson[submittedIndex] = JSON.stringify(result.scenario);
    state.scenarioError = null;
    state.scenarioIssues = [];
    state.view = "results";
  } catch (error) {
    state.scenarioError = apiErrorMessage(error);
    state.scenarioIssues = apiFieldIssues(error);
    state.resultError = apiErrorMessage(error);
    state.partialExperiment = error instanceof ServiceError && error.partialResult
      ? error.partialResult as ExperimentResult
      : null;
  } finally {
    if (state.activeExecution === execution) state.activeExecution = null;
    clearPending();
    renderCurrentView();
    if (state.scenarioError) document.querySelector<HTMLElement>("#scenario-error")?.focus();
  }
}

async function cancelActiveExecution(): Promise<void> {
  const execution = state.activeExecution;
  if (!execution || execution.cancelRequestPending || execution.cancelRequested) return;
  execution.cancelRequestPending = true;
  execution.cancelError = null;
  renderCurrentView();
  document.querySelector<HTMLElement>("#execution-cancel-status")?.focus({ preventScroll: true });
  try {
    await cancelExecution(execution.id);
    if (state.activeExecution !== execution) return;
    execution.cancelRequestPending = false;
    execution.cancelRequested = true;
    renderCurrentView();
    document.querySelector<HTMLElement>("#execution-cancel-status")?.focus({ preventScroll: true });
  } catch (error) {
    if (state.activeExecution !== execution) return;
    execution.cancelRequestPending = false;
    execution.cancelError = apiErrorMessage(error);
    renderCurrentView();
    document.querySelector<HTMLElement>("[data-cancel-execution]")?.focus({ preventScroll: true });
  }
}

function duplicateScenarioIds(scenarios: ScenarioDraft[]): boolean {
  return new Set(scenarios.map((scenario) => scenario.scenario_id)).size !== scenarios.length;
}

async function runBatch(): Promise<void> {
  if (state.pending || liveRequestPending) return;
  const draft = collectCurrentScenario();
  if (!draft) return;
  if (state.scenarios.length < 2) {
    state.scenarioError = "Añade una copia de referencia y edítala para crear al menos un escenario candidato.";
    renderCurrentView();
    document.querySelector<HTMLElement>("#scenario-error")?.focus();
    return;
  }
  if (duplicateScenarioIds(state.scenarios)) {
    state.scenarioError = "Cada escenario necesita un identificador distinto. Edita el identificador repetido antes de comparar.";
    state.scenarioIssues = state.scenarios.map((scenario, index) => ({ path: `scenarios.${index}.scenario_id`, message: `Identificador repetido: ${scenario.scenario_id}` }));
    renderCurrentView();
    document.querySelector<HTMLElement>("#scenario-error")?.focus();
    return;
  }
  if (draft.replications < 1 || draft.replications > 200 || !Number.isSafeInteger(draft.replications)) {
    state.scenarioError = "La cantidad de réplicas debe ser un entero exacto entre 1 y 200.";
    renderCurrentView();
    return;
  }
  const submittedScenarios: Scenario[] = [];
  for (let index = 0; index < state.scenarios.length; index += 1) {
    const scenario = state.scenarios[index];
    const wire = scenario ? scenarioDraftToWire(scenario) : null;
    if (!wire) {
      state.scenarioError = `Completa el candidato ${formatNumber(index + 1, 0)} antes de comparar; el borrador y su programación se conservaron.`;
      state.scenarioIssues = [{ path: `scenarios.${index}`, message: state.scenarioError }];
      renderCurrentView();
      document.querySelector<HTMLButtonElement>(`[data-scenario-select="${index}"]`)?.focus();
      return;
    }
    submittedScenarios.push(wire);
  }
  const request: ExperimentRequest = {
    scenarios: submittedScenarios,
    root_seed: currentExperimentSeed(submittedScenarios),
    replications: draft.replications,
  };
  const execution: ActiveExecution = {
    id: crypto.randomUUID(),
    kind: "experiment",
    cancelRequestPending: false,
    cancelRequested: false,
    cancelError: null,
  };
  state.activeExecution = execution;
  setPending("experiment", "El motor está ejecutando las réplicas solicitadas. No se muestra progreso estimado.");
  try {
    const result = await executeExperiment(request, execution.id);
    state.completed = {
      kind: "experiment",
      value: result,
      jsonText: cleanResultText(result),
      label: `${formatNumber(result.scenarios.length, 0)} escenarios comparados`,
    };
    state.completedBytes = null;
    state.selectedRun = null;
    state.selection = null;
    for (let index = 0; index < result.scenarios.length; index += 1) {
      const current = state.scenarios[index];
      if (current && scenarioWireJson(current) === JSON.stringify(submittedScenarios[index])) {
        state.scenarios[index] = scenarioToDraft(result.scenarios[index] as Scenario);
      }
    }
    state.cleanScenarioJson = result.scenarios.map((scenario) => JSON.stringify(scenario));
    state.cleanReplications = draft.replications;
    state.resultError = null;
    state.scenarioError = null;
    state.scenarioIssues = [];
    clearCsvFiles();
    state.view = "results";
  } catch (error) {
    state.scenarioError = apiErrorMessage(error);
    state.scenarioIssues = apiFieldIssues(error);
    state.resultError = apiErrorMessage(error);
    state.partialExperiment = error instanceof ServiceError && error.partialResult
      ? error.partialResult as ExperimentResult
      : null;
  } finally {
    if (state.activeExecution === execution) state.activeExecution = null;
    clearPending();
    renderCurrentView();
    if (state.scenarioError) document.querySelector<HTMLElement>("#scenario-error")?.focus();
  }
}

function reportFromError(error: unknown): ApiSchema<"ImportReport"> | null {
  if (!(error instanceof ServiceError) || !error.diagnosticReport || typeof error.diagnosticReport !== "object") return null;
  const report = error.diagnosticReport as Record<string, unknown>;
  return report.contract_version === 1 && Array.isArray(report.issues)
    ? error.diagnosticReport as ApiSchema<"ImportReport">
    : null;
}

function sourceName(file: File): string {
  return file.name.trim() || "observaciones-pegadas.txt";
}

async function importSource(event: SubmitEvent): Promise<void> {
  if (state.pending) return;
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  if (!form.reportValidity()) return;
  const mode = state.observationMode;
  const fileInput = form.querySelector<HTMLInputElement>("#observation-file");
  const paste = form.querySelector<HTMLTextAreaElement>("#observation-text")?.value ?? "";
  let file: File | null = mode === "file" ? fileInput?.files?.[0] ?? null : null;
  if (mode === "paste") {
    if (new Blob([paste]).size > MAX_FILE_BYTES) {
      state.observationError = "El texto supera el máximo local de 10 MiB. Divide la fuente o elige un archivo más pequeño.";
      renderCurrentView();
      document.querySelector<HTMLElement>("[role='alert']")?.focus();
      return;
    }
    file = new File([paste], "observaciones-pegadas.txt", { type: "text/plain;charset=utf-8" });
  }
  if (!file) return;
  const policy = form.querySelector<HTMLSelectElement>("#correction-policy")?.value ?? "none";
  setPending("import", "Las filas están siendo revisadas. La importación no cambia ningún escenario.");
  try {
    const report = await importObservations(file, policy);
    if (report.fatal_error) {
      state.observationFailureReport = report;
      state.observationError = "La fuente produjo diagnósticos, pero no se aceptó una vista normalizada para interpretación.";
    } else {
      state.observations = report;
      state.preloadedVisitId = null;
      state.observationFailureReport = null;
      state.observationError = null;
    }
    announce(`Se revisó ${sourceName(file)}.`);
  } catch (error) {
    state.observationFailureReport = reportFromError(error);
    state.observationError = apiErrorMessage(error);
  } finally {
    clearPending();
    renderCurrentView();
    if (state.observationError) document.querySelector<HTMLElement>("[role='alert']")?.focus();
  }
}

function installScenarioFile(scenario: Scenario, bytes: ArrayBuffer, text: string): void {
  state.scenarios = [scenarioToDraft(scenario)];
  state.activeScenarioIndex = 0;
  state.cleanScenarioJson = [JSON.stringify(scenario)];
  state.scenarioFileBytes = bytes.slice(0);
  state.scenarioFileJson = JSON.stringify(scenario);
  state.jsonError = null;
  state.scenarioError = null;
  state.scenarioIssues = [];
  state.view = "scenario";
  state.advancedOptionsOpen = null;
  state.comparisonOptionsOpen = null;
  state.modelHelpOpen = null;
  state.resetDisclosureCapture = true;
  void text;
}

function isSupportedVersion(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const version = (value as Record<string, unknown>).contract_version;
  return version === 1 || version === 2;
}

async function openSavedFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (!file || state.pending) return;
  state.jsonError = null;
  setPending("file", "Validando el archivo con el contrato local. No se ejecutará de nuevo.");
  try {
    const { bytes, text } = await readExactJsonFile(file);
    const validated = await validateSavedFile(file);
    if (!isSupportedVersion(validated.value)) {
      throw new Error("Esta versión de archivo no es compatible o el JSON no contiene un artefacto V1/V2 completo. Los resultados actuales se mantienen.");
    }
    if (validated.kind === "scenario") {
      installScenarioFile(validated.value as Scenario, bytes, text);
      state.cleanReplications = state.replications;
      announce("Se abrió un escenario JSON validado.");
    } else if (validated.kind === "run") {
      const result = validated.value as RunResult;
      replayProjectorFor(result);
      state.completed = { kind: "run", value: result, jsonText: text, label: result.scenario.display_name };
      state.completedBytes = bytes.slice(0);
      state.selectedRun = result;
      state.selection = { scenarioId: result.scenario.scenario_id, replicationIndex: result.replication_index };
      state.scenarios = [scenarioToDraft(result.scenario)];
      state.activeScenarioIndex = 0;
      state.cleanScenarioJson = [JSON.stringify(result.scenario)];
      state.cleanReplications = state.replications;
      state.advancedOptionsOpen = null;
      state.comparisonOptionsOpen = null;
      state.modelHelpOpen = null;
      state.resetDisclosureCapture = true;
      state.jsonError = null;
      state.view = "results";
      clearCsvFiles();
      announce("Se abrió una réplica guardada sin volver a ejecutarla.");
    } else {
      const result = validated.value as ExperimentResult;
      state.completed = {
        kind: "experiment",
        value: result,
        jsonText: text,
        label: `${formatNumber(result.scenarios.length, 0)} escenarios guardados`,
      };
      state.completedBytes = bytes.slice(0);
      state.selectedRun = null;
      state.selection = null;
      state.scenarios = result.scenarios.map(scenarioToDraft);
      state.activeScenarioIndex = 0;
      state.replications = result.n_requested;
      state.cleanScenarioJson = result.scenarios.map((scenario) => JSON.stringify(scenario));
      state.cleanReplications = result.n_requested;
      state.advancedOptionsOpen = null;
      state.comparisonOptionsOpen = null;
      state.modelHelpOpen = null;
      state.resetDisclosureCapture = true;
      state.jsonError = null;
      state.view = "results";
      clearCsvFiles();
      announce("Se abrió un experimento guardado sin volver a ejecutarlo.");
    }
  } catch (error) {
    state.jsonError = apiErrorMessage(error);
  } finally {
    clearPending();
    input.value = "";
    renderCurrentView();
    if (state.jsonError) document.querySelector<HTMLElement>("[role='alert']")?.focus();
  }
}

async function saveScenario(): Promise<void> {
  if (state.pending) return;
  const draft = collectCurrentScenario();
  if (!draft) return;
  const json = cleanResultText(draft.scenario);
  const currentJson = JSON.stringify(draft.scenario);
  if (state.scenarioFileBytes && state.scenarioFileJson === currentJson) {
    downloadBytes(`${safeFileName(draft.scenario.scenario_id)}.json`, state.scenarioFileBytes.slice(0), "application/json");
    return;
  }
  const file = new File([json], `${safeFileName(draft.scenario.scenario_id)}.json`, { type: "application/json" });
  setPending("file", "Validando el escenario antes de descargarlo.");
  try {
    const response = await validateSavedFile(file);
    if (response.kind !== "scenario" || !isSupportedVersion(response.value)) {
      throw new Error(`El ${serviceName()} no confirmó un escenario V1 o V2 completo. No se descargó el archivo.`);
    }
    downloadText(file.name, json, "application/json");
    state.scenarioFileBytes = new TextEncoder().encode(json).buffer as ArrayBuffer;
    state.scenarioFileJson = currentJson;
  } catch (error) {
    state.scenarioError = apiErrorMessage(error);
    state.scenarioIssues = apiFieldIssues(error);
  } finally {
    clearPending();
    renderCurrentView();
  }
}

function downloadCompletedJson(): void {
  if (!state.completed) return;
  const filename = state.completed.kind === "run"
    ? runFilename(state.completed.value)
    : experimentFilename(state.completed.value);
  if (state.completedBytes) downloadBytes(filename, state.completedBytes.slice(0), "application/json");
  else downloadText(filename, state.completed.jsonText, "application/json");
}

function downloadSelectedRun(): void {
  if (!state.selectedRun) return;
  downloadText(runFilename(state.selectedRun), cleanResultText(state.selectedRun), "application/json");
}

async function exportCurrentCsv(selectedRunOnly = false): Promise<void> {
  if (!state.completed || state.pending) return;
  const result = selectedRunOnly ? state.selectedRun : state.completed.value;
  if (!result) return;
  const request: CsvExportRequest = {
    result,
    ...(state.observations && !state.observations.fatal_error ? { observations: state.observations } : {}),
  };
  const label = selectedRunOnly
    ? "Tablas de la réplica seleccionada"
    : state.completed.kind === "run" ? "Tablas de esta réplica" : "Tablas del experimento";
  setPending("csv", `El ${serviceName()} está preparando ${label.toLowerCase()}.`);
  try {
    const response = await exportCsv(request);
    clearCsvFiles();
    state.csvFiles = Object.entries(response.tables).map(([table, content]) => {
      const name = `${safeFileName(table.replace(/\.csv$/i, ""))}.csv`;
      const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
      return { name, url };
    });
    state.csvLabel = label;
    state.resultError = null;
  } catch (error) {
    state.resultError = apiErrorMessage(error);
  } finally {
    clearPending();
    renderCurrentView();
  }
}

async function selectExperimentReplication(): Promise<void> {
  if (state.pending || liveRequestPending || state.completed?.kind !== "experiment") return;
  const scenarioId = document.querySelector<HTMLSelectElement>("[data-selected-scenario]")?.value;
  const indexValue = document.querySelector<HTMLSelectElement>("[data-selected-replication]")?.value;
  const replicationIndex = indexValue == null ? NaN : Number(indexValue);
  if (!scenarioId || !Number.isSafeInteger(replicationIndex) || replicationIndex < 0) return;
  const experiment = state.completed.value;
  const scenario = experiment.scenarios.find((item) => item.scenario_id === scenarioId);
  const record = experiment.replication_results.find((item) => item.scenario_id === scenarioId && item.replication_index === replicationIndex);
  if (!scenario || !record || record.status !== "complete") {
    state.resultError = "Esta réplica no terminó correctamente; elige un escenario e índice que tengan un registro completo.";
    renderCurrentView();
    return;
  }
  const identity = { scenarioId, replicationIndex };
  const request: RunRequest = { scenario, root_seed: experiment.root_seed, replication_index: replicationIndex };
  const execution: ActiveExecution = {
    id: crypto.randomUUID(),
    kind: "run",
    cancelRequestPending: false,
    cancelRequested: false,
    cancelError: null,
  };
  state.activeExecution = execution;
  setPending("selection", "El motor está reconstruyendo la réplica exacta elegida desde la semilla y el índice guardados.");
  try {
    const result = await executeRun(request, execution.id);
    replayProjectorFor(result);
    if (result.scenario.scenario_id !== identity.scenarioId
      || result.root_seed !== experiment.root_seed
      || result.replication_index !== identity.replicationIndex) {
      throw new Error(`El ${serviceName()} respondió con otra identidad de réplica. El resultado anterior se mantiene.`);
    }
    state.selectedRun = result;
    state.selection = identity;
    state.resultError = null;
    clearCsvFiles();
  } catch (error) {
    state.resultError = apiErrorMessage(error);
  } finally {
    if (state.activeExecution === execution) state.activeExecution = null;
    clearPending();
    renderCurrentView();
  }
}

function chooseScenarioTab(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= state.scenarios.length) return;
  captureScenarioDisclosureState();
  state.activeScenarioIndex = index;
  const selected = state.scenarios[index];
  if (selected && (selected.contract_version === "2" || selected.initial_state.length > 0)) {
    state.advancedOptionsOpen = null;
    state.resetDisclosureCapture = true;
  }
  state.scenarioError = null;
  state.scenarioIssues = [];
  renderCurrentView();
  const button = [...document.querySelectorAll<HTMLButtonElement>("[data-scenario-select]")]
    .find((item) => Number(item.dataset.scenarioSelect) === index);
  button?.focus();
}

function handleInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (target.matches("[data-source-mode], [data-live-toggle]")) return;
  if (target.matches("[data-mode]")) return;
  if (!target.closest("#scenario-form")) return;
  if (target instanceof HTMLInputElement && target.matches("[data-integer-field]")) {
    target.setCustomValidity(target.value !== "" && !Number.isSafeInteger(Number(target.value))
      ? "Usa un entero exacto de hasta 9.007.199.254.740.991."
      : "");
  }
  if (target.matches("[data-opening-time], [data-closing-time]")) {
    const form = target.closest("form");
    if (form) setScenarioTimeValidity(form);
    return;
  }
  if (target instanceof HTMLInputElement && target.matches("[data-arrival-window-end]")) {
    const index = Number(target.dataset.arrivalWindowEnd);
    const nextRow = target.closest<HTMLFormElement>("#scenario-form")
      ?.querySelector<HTMLElement>(`[data-arrival-window="${index + 1}"]`);
    const minutes = Number(target.value);
    if (nextRow && target.value.trim() !== "" && Number.isFinite(minutes)) {
      const start = nextRow.querySelector<HTMLOutputElement>("[data-arrival-start-label]");
      const hidden = nextRow.querySelector<HTMLInputElement>(`[data-arrival-window-start="${index + 1}"]`);
      if (start) start.textContent = formatNumber(minutes);
      if (hidden) hidden.value = String(minutes * 60);
    }
  }
  if (target instanceof HTMLTextAreaElement && target.matches('[data-initial-field$=".person_ids"]')) {
    const form = target.closest<HTMLFormElement>("#scenario-form");
    if (form) validateInitialPersonLimits(form);
  }
  const current = activeScenario();
  const form = target.closest<HTMLFormElement>("#scenario-form");
  if (!current || !form) return;
  const draft = collectScenarioDraft(form, current);
  state.replications = draft.replications;
  markActiveScenario(draft.scenario);
  updateActiveScenarioLabel();
  state.scenarioError = null;
  state.scenarioIssues = [];
  setDirty(isDirty());
}

function handleChange(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
  if (target instanceof HTMLSelectElement && target.matches("[data-analysis-objective]")) {
    const selectedObjective = ANALYSIS_OBJECTIVES.find(({ value }) => value === target.value)?.value;
    const experiment = state.completed?.kind === "experiment" ? state.completed.value : null;
    if (!selectedObjective || !experiment) return;
    state.analysisObjective = selectedObjective;
    const content = document.querySelector<HTMLElement>("#analysis-objective-content");
    if (content) content.innerHTML = renderObjectiveAnalysisContent(experiment, selectedObjective, isDirty());
    return;
  }
  if (target instanceof HTMLSelectElement && target.matches("[data-replay-entity]")) {
    activeReplayHost?.selectEntity(target.value);
    return;
  }
  if (target instanceof HTMLSelectElement && target.matches("[data-replay-speed]")) {
    activeReplayHost?.setSpeed(Number(target.value));
    return;
  }
  if (target instanceof HTMLTextAreaElement && target.matches('[data-initial-field$=".person_ids"]')) {
    const form = target.closest<HTMLFormElement>("#scenario-form");
    if (form) validateInitialPersonLimits(form);
    return;
  }
  if (target.matches("[data-opening-time], [data-closing-time]")) {
    const current = activeScenario();
    const form = target.closest<HTMLFormElement>("#scenario-form");
    if (!current || !form || !setScenarioTimeValidity(form)) return;
    const draft = collectScenarioDraft(form, current);
    state.replications = draft.replications;
    markActiveScenario(draft.scenario);
    state.scenarioError = null;
    state.scenarioIssues = [];
    setDirty(isDirty());
    return;
  }
  if (target instanceof HTMLInputElement && target.matches("[data-arrival-schedule-enabled], [data-menu-enabled]")) {
    const current = activeScenario();
    const form = target.closest<HTMLFormElement>("#scenario-form");
    if (!current) return;
    const base = form ? collectScenarioDraft(form, current).scenario : current;
    if (target.matches("[data-arrival-schedule-enabled]")) {
      const next = target.checked ? enableArrivalSchedule(base) : disableArrivalSchedule(base);
      markActiveScenario(addScenarioAssumption(next,
        "El horario de llegadas por franjas y sus tasas por hora son supuestos del usuario, no valores calibrados."));
    } else {
      const next = target.checked ? enableMenu(base) : disableMenu(base);
      markActiveScenario(addScenarioAssumption(next,
        "Los tipos de pedido y tiempos por unidad del menú son ejemplos editables, no mediciones del negocio."));
    }
    refreshScenarioAfterChange(target.id);
    return;
  }
  if (target.matches("[data-mode]")) {
    changeMode(target.value as "tuesday" | "regular");
    return;
  }
  if (target instanceof HTMLSelectElement && target.matches("[data-distribution-kind]")) {
    const current = activeScenario();
    if (!current) return;
    const key = target.dataset.distributionKind;
    if (!key) return;
    const next = snapshot(current) as unknown as Record<string, unknown>;
    next[key] = buildDistribution(target.value);
    const scenario = addScenarioAssumption(next as unknown as ScenarioDraft,
      "Las distribuciones editadas son supuestos del usuario; no se ajustan automáticamente a observaciones.");
    markActiveScenario(scenario);
    refreshScenarioAfterChange(target.id);
    return;
  }
  if (target instanceof HTMLSelectElement && target.matches("[data-initial-stage]")) {
    const current = activeScenario();
    if (!current) return;
    const index = Number(target.dataset.initialStage);
    const next = snapshot(current);
    const order = next.initial_state[index];
    if (!order) return;
    next.initial_state[index] = {
      ...order,
      stage: target.value as ApiSchema<"InitialOrder">["stage"],
      queue_rank: null,
      worker_id: null,
      remaining_s: null,
      patience_remaining_s: null,
      payment_active_s: null,
      transfer_wait_s: null,
      preparation_s: null,
    } as ApiSchema<"InitialOrder">;
    markActiveScenario(addScenarioAssumption(next,
      "La etapa y los tiempos pendientes de cada orden inicial son supuestos declarados por el usuario."));
    refreshScenarioAfterChange(`initial-${index}-stage`);
    return;
  }
  if (target instanceof HTMLInputElement && target.matches("[data-patience-enabled]")) {
    const current = activeScenario();
    if (!current) return;
    const next = snapshot(current);
    next.patience = target.checked ? buildDistribution("constant") : null;
    markActiveScenario(addScenarioAssumption(next,
      "La paciencia se eligió explícitamente y solo afecta la espera anterior al primer pago."));
    const focus = target.id;
    renderCurrentView();
    document.getElementById(focus)?.focus({ preventScroll: true });
    return;
  }
  if (target.matches("[data-integer-field]")) {
    target.setCustomValidity(target.value !== "" && !Number.isSafeInteger(Number(target.value))
      ? "Usa un entero exacto de hasta 9.007.199.254.740.991."
      : "");
  }
  const form = target.closest<HTMLFormElement>("#scenario-form");
  if (form && (target.matches("[data-scenario-field^='engine_config.']"))) {
    const draft = collectScenarioDraft(form, activeScenario() as ScenarioDraft);
    state.replications = draft.replications;
    markActiveScenario(draft.scenario);
    // A full render during blur removes the pressed button before its click event.
    refreshInitialWorkerOptions(form, draft.scenario);
    state.scenarioError = null;
    state.scenarioIssues = [];
    setDirty(isDirty());
  }
}

function syncInvalidState(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (event.type === "blur") interacted.add(target);
  if (event.type === "input" || event.type === "change") {
    if (target.getAttribute("aria-invalid") === "true") interacted.add(target);
  }
  const supported = typeof CSS !== "undefined" && CSS.supports("selector(:user-invalid)");
  const shouldShow = supported
    ? target.matches(":user-invalid") || (interacted.has(target) && !target.checkValidity())
    : interacted.has(target) && !target.checkValidity();
  if (shouldShow) {
    target.setAttribute("aria-invalid", "true");
  } else {
    target.removeAttribute("aria-invalid");
  }
}

function handleClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLElement>("button, [data-source-mode]");
  if (!button) return;

  if (button.matches("[data-view]")) {
    goToView(button.dataset.view as MainView);
  } else if (button.matches("[data-go-view]")) {
    goToView(button.dataset.goView as MainView);
  } else if (button.matches("[data-source-mode]")) {
    const mode = button.dataset.sourceMode;
    if (mode === "file" || mode === "paste") {
      state.observationMode = mode;
      renderCurrentView();
      document.querySelector<HTMLButtonElement>(`[data-source-mode="${mode}"]`)?.focus();
    }
  } else if (button.matches("[data-visit-report], [data-observed-visit]")) {
    if (state.pending) return;
    const visitId = button.dataset.visitReport ?? button.dataset.observedVisit ?? "";
    const report = preloadedVisitReport(visitId);
    if (!report) return;
    state.observations = report;
    state.preloadedVisitId = visitId;
    state.observationError = null;
    state.observationFailureReport = null;
    renderCurrentView();
  } else if (button.matches("[data-visit-scenario]")) {
    if (state.pending) return;
    const visit = observedVisits.find(item => item.visit_id === button.dataset.visitScenario);
    if (!visit) return;
    const preset = scenarioToDraft(buildVisitScenario(visit, visitTemplate as Scenario));
    let index = state.scenarios.findIndex(scenario => scenario.scenario_id === preset.scenario_id);
    if (index < 0) {
      state.scenarios.push(preset);
      index = state.scenarios.length - 1;
    }
    chooseScenarioTab(index);
  } else if (button.matches("[data-load-synthetic]")) {
    if (!state.pending) void loadDemoScenario(true);
  } else if (button.matches("[data-cancel-execution]")) {
    void cancelActiveExecution();
  } else if (button.matches("[data-open-live-result]")) {
    if (!state.pending && livePreview && livePreview.key === liveScenarioKey) {
      const result = livePreview.result;
      const scenarioIndex = state.activeScenarioIndex;
      state.scenarios[scenarioIndex] = scenarioToDraft(result.scenario);
      state.cleanScenarioJson[scenarioIndex] = JSON.stringify(result.scenario);
      state.partialExperiment = null;
      showRunResult(result);
      goToView("results");
    }
  } else if (button.matches("[data-run-scenario]")) {
    void runSingle();
  } else if (button.matches("[data-run-experiment]")) {
    void runBatch();
  } else if (button.matches("[data-add-candidate]")) {
    addCandidate();
  } else if (button.matches("[data-scenario-select]")) {
    chooseScenarioTab(Number(button.dataset.scenarioSelect));
  } else if (button.matches("[data-remove-candidate]")) {
    removeCandidate(Number(button.dataset.removeCandidate));
  } else if (button.matches("[data-add-group]")) {
    const current = activeScenario();
    if (!current) return;
    if (current.group_sizes.length >= workLimits.max_group_size) {
      state.scenarioError = `El escenario admite como máximo ${workLimits.max_group_size} tamaños de grupo.`;
      renderCurrentView();
      document.querySelector<HTMLElement>("#scenario-error")?.focus();
      return;
    }
    const next = snapshot(current) as unknown as Record<string, unknown>;
    const groups = [...current.group_sizes, { size: null, probability: null }];
    next.group_sizes = groups;
    markActiveScenario(addScenarioAssumption(next as unknown as ScenarioDraft,
      "Los tamaños y pesos de los grupos son supuestos del usuario."));
    refreshScenarioAfterChange(`group-size-${groups.length - 1}`);
  } else if (button.matches("[data-remove-group]")) {
    const current = activeScenario();
    if (!current || current.group_sizes.length <= 1) return;
    const index = Number(button.dataset.removeGroup);
    const next = snapshot(current) as unknown as Record<string, unknown>;
    next.group_sizes = current.group_sizes.filter((_, itemIndex) => itemIndex !== index);
    markActiveScenario(addScenarioAssumption(next as unknown as ScenarioDraft,
      "Los tamaños y pesos de los grupos son supuestos del usuario."));
    refreshScenarioAfterChange("scenario-id");
  } else if (button.matches("[data-add-arrival-window]")) {
    const current = activeScenario();
    if (!current) return;
    if ((current.arrival_schedule?.length ?? 0) >= 48) {
      state.scenarioError = "El horario admite como máximo 48 franjas; se conservó la programación.";
      state.scenarioIssues = [{ path: "arrival_schedule[47].end_s", message: state.scenarioError }];
      renderCurrentView();
      focusField("arrival_schedule[47].end_s");
      return;
    }
    const next = addArrivalScheduleWindow(current);
    const currentWindowCount = current.arrival_schedule?.length ?? 0;
    const nextWindowCount = next.arrival_schedule?.length ?? 0;
    const newIndex = nextWindowCount - 1;
    if (nextWindowCount === currentWindowCount) {
      state.scenarioError = "Divide una franja con duración positiva para añadir otra. Se conservaron los límites guardados.";
      state.scenarioIssues = [{ path: "arrival_schedule[0].end_s", message: state.scenarioError }];
      renderCurrentView();
      focusField("arrival_schedule[0].end_s");
      return;
    }
    markActiveScenario(addScenarioAssumption(next,
      "El horario de llegadas por franjas y sus tasas por hora son supuestos del usuario, no valores calibrados."));
    refreshScenarioAfterChange(`arrival-rate-${newIndex}`);
  } else if (button.matches("[data-remove-arrival-window]")) {
    const current = activeScenario();
    if (!current || (current.arrival_schedule?.length ?? 0) <= 1) return;
    const index = Number(button.dataset.removeArrivalWindow);
    const next = removeArrivalScheduleWindow(current, index);
    markActiveScenario(addScenarioAssumption(next,
      "El horario de llegadas por franjas y sus tasas por hora son supuestos del usuario, no valores calibrados."));
    refreshScenarioAfterChange(`arrival-rate-${Math.max(0, Math.min(index, (next.arrival_schedule?.length ?? 1) - 1))}`);
  } else if (button.matches("[data-add-menu-basket]")) {
    const current = activeScenario();
    if (!current) return;
    if ((current.menu?.baskets.length ?? 0) >= 32) {
      state.scenarioError = "El menú admite como máximo 32 tipos de pedido; se conservó el borrador.";
      state.scenarioIssues = [{ path: "menu.baskets[31].probability", message: state.scenarioError }];
      renderCurrentView();
      focusField("menu.baskets[31].probability");
      return;
    }
    const next = addMenuBasket(current);
    const newIndex = (next.menu?.baskets.length ?? 1) - 1;
    markActiveScenario(addScenarioAssumption(next,
      "Los tipos de pedido y tiempos por unidad del menú son ejemplos editables, no mediciones del negocio."));
    refreshScenarioAfterChange(`menu-basket-probability-${newIndex}`);
  } else if (button.matches("[data-remove-menu-basket]")) {
    const current = activeScenario();
    if (!current || (current.menu?.baskets.length ?? 0) <= 1) return;
    const index = Number(button.dataset.removeMenuBasket);
    const next = removeMenuBasket(current, index);
    markActiveScenario(addScenarioAssumption(next,
      "Los tipos de pedido y tiempos por unidad del menú son ejemplos editables, no mediciones del negocio."));
    refreshScenarioAfterChange(`menu-basket-probability-${Math.max(0, Math.min(index, (next.menu?.baskets.length ?? 1) - 1))}`);
  } else if (button.matches("[data-add-initial]")) {
    const current = activeScenario();
    if (!current) return;
    if (current.initial_state.length >= workLimits.max_initial_orders) {
      state.scenarioError = `El estado inicial admite como máximo ${workLimits.max_initial_orders} órdenes por ejecución.`;
      renderCurrentView();
      document.querySelector<HTMLElement>("#scenario-error")?.focus();
      return;
    }
    const next = snapshot(current) as unknown as Record<string, unknown>;
    const initial = [...current.initial_state, newInitialOrder()];
    next.initial_state = initial;
    markActiveScenario(addScenarioAssumption(next as unknown as ScenarioDraft,
      "El trabajo inicial se declara explícitamente; no se infiere de las observaciones."));
    refreshScenarioAfterChange(`initial-${initial.length - 1}-id`);
  } else if (button.matches("[data-remove-initial]")) {
    const current = activeScenario();
    if (!current) return;
    const index = Number(button.dataset.removeInitial);
    const next = snapshot(current) as unknown as Record<string, unknown>;
    next.initial_state = current.initial_state.filter((_, itemIndex) => itemIndex !== index);
    markActiveScenario(addScenarioAssumption(next as unknown as ScenarioDraft,
      "El trabajo inicial se declara explícitamente; no se infiere de las observaciones."));
    refreshScenarioAfterChange("scenario-id");
  } else if (button.matches("[data-enable-interruptions]")) {
    const current = activeScenario();
    if (!current) return;
    const next = enableInterruptionPolicy(current);
    markActiveScenario(addScenarioAssumption(next,
      "El usuario activó explícitamente las pausas para cobrar; cada tiempo e identificador se declara manualmente."));
    refreshScenarioAfterChange("integrated-workers");
  } else if (button.matches("[data-resolve-interruption-compatibility]")) {
    const current = activeScenario();
    if (!current) return;
    const next = resolveInterruptionCompatibility(current);
    markActiveScenario(addScenarioAssumption(next,
      "El usuario resolvió explícitamente la compatibilidad usando el modo normal con una persona integrada."));
    refreshScenarioAfterChange("integrated-workers");
  } else if (button.matches("[data-add-interruption]")) {
    const current = activeScenario();
    if (!current) return;
    const next = addInterruptionScheduleEntry(current);
    const index = Math.max(0, (next.engine_config.cashier_interruptions?.length ?? 1) - 1);
    markActiveScenario(addScenarioAssumption(next,
      "El usuario declara explícitamente los tiempos y órdenes de cada pausa programada."));
    refreshScenarioAfterChange(`interruption-${index}-at`);
  } else if (button.matches("[data-remove-interruption]")) {
    const current = activeScenario();
    if (!current) return;
    const index = Number(button.dataset.removeInterruption);
    const next = removeInterruptionScheduleEntry(current, index);
    markActiveScenario(addScenarioAssumption(next,
      "El usuario editó explícitamente la programación de pausas."));
    refreshScenarioAfterChange("scenario-id");
  } else if (button.matches("[data-clear-interruptions]")) {
    const current = activeScenario();
    if (!current) return;
    const next = clearInterruptionSchedule(current);
    markActiveScenario(addScenarioAssumption(next,
      "El usuario limpió explícitamente todas las pausas programadas."));
    refreshScenarioAfterChange("scenario-id");
  } else if (button.matches("[data-disable-interruptions]")) {
    const current = activeScenario();
    if (!current) return;
    const next = disableInterruptionPolicy(current);
    markActiveScenario(addScenarioAssumption(next,
      "El usuario desactivó explícitamente las pausas programadas y quitó su guion."));
    refreshScenarioAfterChange("scenario-id");
  } else if (button.matches("[data-focus-path]")) {
    focusField(button.dataset.focusPath ?? "");
  } else if (button.matches("[data-save-scenario]")) {
    void saveScenario();
  } else if (button.matches("[data-download-result-json]")) {
    downloadCompletedJson();
  } else if (button.matches("[data-download-selected-json]")) {
    downloadSelectedRun();
  } else if (button.matches("[data-export-csv]")) {
    void exportCurrentCsv(button.dataset.exportCsv === "selected-run");
  } else if (button.matches("[data-select-replication]")) {
    void selectExperimentReplication();
  } else if (button.matches("[data-replay-play]")) {
    activeReplayHost?.togglePlayback();
  } else if (button.matches("[data-replay-restart]")) {
    activeReplayHost?.restartPlayback();
  } else if (button.matches("[data-replay-camera-reset]")) {
    activeReplayHost?.resetCamera();
  } else if (button.matches("[data-replay-view-toggle]")) {
    activeReplayHost?.toggleShopView();
  } else if (button.matches("[data-replay-zoom]")) {
    const direction = button.dataset.replayZoom;
    if (direction === "in" || direction === "out") activeReplayHost?.zoom(direction);
  } else if (button.matches("[data-reload-demo]")) {
    void loadDemoScenario();
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.isComposing) return;
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.matches("[data-view]")) {
    const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-view]")];
    const index = tabs.indexOf(target);
    const vertical = target.closest("[role='tablist']")?.getAttribute("aria-orientation") === "vertical";
    const nextIndex = event.key === "ArrowRight" || (vertical && event.key === "ArrowDown") ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" || (vertical && event.key === "ArrowUp") ? (index - 1 + tabs.length) % tabs.length
        : event.key === "Home" ? 0
          : event.key === "End" ? tabs.length - 1 : -1;
    if (nextIndex >= 0) {
      event.preventDefault();
      tabs[nextIndex]?.focus();
      goToView(tabs[nextIndex]?.dataset.view as MainView, false);
    }
  } else if (target.matches("[data-scenario-select]")) {
    const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-scenario-select]")];
    const index = tabs.indexOf(target);
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : -1;
    if (nextIndex >= 0) {
      event.preventDefault();
      chooseScenarioTab(Number(tabs[nextIndex]?.dataset.scenarioSelect));
    }
  }
}

function handleComparisonMetricChange(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || !target.matches("[data-comparison-metric]")) return;
  if (state.completed?.kind !== "experiment") return;
  const chart = document.querySelector<HTMLElement>("#comparison-chart");
  if (chart) chart.innerHTML = renderExperimentChartForSelection(state.completed.value, target.value);
}

function handleReplayInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== "replay-slider") return;
  if (activeReplayHost) activeReplayHost.seekTo(Number(target.value));
  else if (state.selectedRun) updateReplayTimeline(state.selectedRun, Number(target.value));
}

function handleSubmit(event: SubmitEvent): void {
  if (event.target instanceof HTMLFormElement && event.target.id === "observations-form") {
    void importSource(event);
  }
}

function handleFileChange(event: Event): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.matches("[data-open-json]")) {
    void openSavedFile(target);
  } else if (target.id === "observation-file") {
    const filename = target.files?.[0]?.name ?? "Ningún archivo seleccionado";
    const label = document.querySelector<HTMLElement>("#observation-file-name");
    if (label) label.textContent = filename;
  }
}

function handleLiveScenarioInput(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest("#scenario-form")) return;
  if (target instanceof HTMLInputElement && target.matches("[data-live-toggle]")) {
    if (event.type !== "change") return;
    liveEnabled = target.checked;
    liveFailure = null;
  }
  refreshLiveScenario();
}

function startApp(): void {
  renderShell();
  installColorSchemeToggle();
  const compactNavigation = window.matchMedia("(max-width: 900px)");
  const syncNavigationOrientation = (): void => {
    document.querySelector(".view-nav")?.setAttribute("aria-orientation", compactNavigation.matches ? "horizontal" : "vertical");
  };
  syncNavigationOrientation();
  compactNavigation.addEventListener("change", syncNavigationOrientation);
  renderCurrentView();
  document.addEventListener("click", handleClick);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("input", handleLiveScenarioInput);
  document.addEventListener("change", handleLiveScenarioInput);
  document.addEventListener("blur", syncInvalidState, true);
  document.addEventListener("input", syncInvalidState);
  document.addEventListener("change", syncInvalidState);
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("change", handleComparisonMetricChange);
  document.addEventListener("input", handleReplayInput);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("change", handleFileChange);
  handleHealth();
}

startApp();
