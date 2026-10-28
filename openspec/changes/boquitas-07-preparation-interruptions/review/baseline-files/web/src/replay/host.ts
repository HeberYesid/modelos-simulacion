import type { RunResult } from "../api/types";
import { formatClockFromOpening, formatNumber } from "../domain/format";
import { updateReplayLatestEvent, updateReplayPlaybackReadout, updateReplayTimeline } from "../components/results";
import {
  PLAYBACK_SPEEDS,
  advance_playback_clock,
  create_playback_clock,
  pause,
  play,
  restart,
  seek,
  set_speed,
  type PlaybackClock,
  type PlaybackSpeed,
} from "./clock";
import { create_replay_projector, type ReplayPersonState, type ReplayProjector, type ReplayState, type ReplayTrace } from "./project";
import { createShopScene, type ShopScene } from "./scene";

export interface ReplayHostOptions {
  initialTimeS?: number;
  initialSelection?: string;
  onTimeChange?: (timeS: number) => void;
  onSelectionChange?: (selection: string) => void;
}

export interface ReplayHostHandle {
  togglePlayback(): void;
  restartPlayback(): void;
  seekTo(timeS: number): void;
  setSpeed(speed: number): void;
  selectEntity(selection: string): void;
  resetCamera(): void;
  zoom(direction: "in" | "out"): void;
  retryScene(): void;
  dispose(): void;
}

const PERSON_STATES_IN_STORE = new Set<ReplayPersonState["state"]>([
  "waiting_payment",
  "payment_active",
  "payment_pending",
  "waiting_preparation",
  "preparing",
]);

const STATE_LABELS: Record<ReplayPersonState["state"], string> = {
  not_arrived: "Aún no llega",
  waiting_payment: "En fila para pagar",
  payment_active: "Pago activo",
  payment_pending: "Confirmación externa pendiente",
  waiting_preparation: "Espera pagada",
  preparing: "Orden en preparación",
  completed: "Orden entregada",
  abandoned: "Se retiró de la fila",
};

function eventCountAt(trace: ReplayTrace, timeS: number): number {
  let low = 0;
  let high = trace.events.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (trace.events[middle].time_s <= timeS) low = middle + 1;
    else high = middle;
  }
  return low;
}

function isAtShop(state: ReplayPersonState["state"]): boolean {
  return PERSON_STATES_IN_STORE.has(state);
}

function workerCategory(worker: ReplayState["workers"][string]): "active" | "reserved" | "available" {
  if (worker.active) return "active";
  if (worker.reserved) return "reserved";
  return "available";
}

function countInitialSummary(state: ReplayState): {
  activePeople: number;
  preparingOrders: number;
  activeWorkers: number;
  reservedWorkers: number;
  availableWorkers: number;
} {
  let activePeople = 0;
  let preparingOrders = 0;
  let activeWorkers = 0;
  let reservedWorkers = 0;
  let availableWorkers = 0;
  for (const person of Object.values(state.people)) {
    if (isAtShop(person.state)) activePeople += 1;
  }
  for (const order of Object.values(state.orders)) {
    if (order.state === "preparing") preparingOrders += 1;
  }
  for (const worker of Object.values(state.workers)) {
    const category = workerCategory(worker);
    if (category === "active") activeWorkers += 1;
    else if (category === "reserved") reservedWorkers += 1;
    else availableWorkers += 1;
  }
  return { activePeople, preparingOrders, activeWorkers, reservedWorkers, availableWorkers };
}

function renderTimestamp(run: RunResult, value: number | null, initialized: boolean, field: string): string {
  if (value != null) return formatClockFromOpening(run.trace.config.opening_time, value);
  if (initialized && field === "arrival_s") return "Desconocida · orden presente al abrir";
  return "No disponible";
}

function stateName(state: ReplayPersonState["state"] | undefined): string {
  return state ? STATE_LABELS[state] : "No disponible";
}

function renderPersonInspector(
  run: RunResult,
  state: ReplayState,
  personId: string,
  personMetrics: ReadonlyMap<string, RunResult["metrics"]["people"][number]>,
  orderMetrics: ReadonlyMap<string, RunResult["metrics"]["orders"][number]>,
): string {
  const currentPerson = state.people[personId];
  const metric = personMetrics.get(personId);
  if (!currentPerson || !metric) return `<p class="help-text">La persona no está incluida en este resultado.</p>`;
  const order = state.orders[currentPerson.order_id];
  const orderMetric = orderMetrics.get(currentPerson.order_id);
  const initialized = order?.source === "initial" && metric.arrival_s == null;
  const worker = order?.worker_id ?? "Sin trabajador asignado en este instante";
  const groupMembers = order?.person_ids ?? [];
  const times = [
    ["Llegada", renderTimestamp(run, metric.arrival_s, initialized, "arrival_s")],
    ["Inicio del pago", renderTimestamp(run, metric.payment_started_s, false, "payment_started_s")],
    ["Pago completado", renderTimestamp(run, metric.payment_completed_s, false, "payment_completed_s")],
    ["Inicio de preparación", renderTimestamp(run, metric.preparation_started_s, false, "preparation_started_s")],
    ["Entrega", renderTimestamp(run, metric.delivery_s, false, "delivery_s")],
    ["Retiro", renderTimestamp(run, metric.abandonment_s, false, "abandonment_s")],
  ];
  return `
    <div class="replay-inspector-grid">
      <div><dt>Persona</dt><dd>${escapeHtmlText(metric.person_id)}</dd></div>
      <div><dt>Orden compartida</dt><dd>${escapeHtmlText(metric.order_id)}</dd></div>
      <div><dt>Estado al instante</dt><dd>${escapeHtmlText(stateName(currentPerson.state))}</dd></div>
      <div><dt>Personas de la orden</dt><dd>${formatNumber(groupMembers.length || orderMetric?.person_ids.length || 0, 0)} · ${escapeHtmlText(groupMembers.join(", ") || orderMetric?.person_ids.join(", ") || "No disponibles")}</dd></div>
      <div><dt>Trabajador en este instante</dt><dd>${escapeHtmlText(worker)}</dd></div>
      ${times.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtmlText(value)}</dd></div>`).join("")}
    </div>`;
}

function renderOrderInspector(
  run: RunResult,
  state: ReplayState,
  orderId: string,
  orderMetrics: ReadonlyMap<string, RunResult["metrics"]["orders"][number]>,
): string {
  const currentOrder = state.orders[orderId];
  const metric = orderMetrics.get(orderId);
  if (!currentOrder || !metric) return `<p class="help-text">La orden no está incluida en este resultado.</p>`;
  const initialized = currentOrder.source === "initial" && metric.arrival_s == null;
  const times = [
    ["Llegada", renderTimestamp(run, metric.arrival_s, initialized, "arrival_s")],
    ["Inicio del pago", renderTimestamp(run, metric.payment_started_s, false, "payment_started_s")],
    ["Fin del trabajo activo de pago", renderTimestamp(run, metric.payment_active_ended_s, false, "payment_active_ended_s")],
    ["Pago completado", renderTimestamp(run, metric.payment_completed_s, false, "payment_completed_s")],
    ["Inicio de preparación", renderTimestamp(run, metric.preparation_started_s, false, "preparation_started_s")],
    ["Entrega", renderTimestamp(run, metric.delivery_s, false, "delivery_s")],
    ["Retiro", renderTimestamp(run, metric.abandonment_s, false, "abandonment_s")],
  ];
  return `
    <div class="replay-inspector-grid">
      <div><dt>Orden</dt><dd>${escapeHtmlText(orderId)}</dd></div>
      <div><dt>Estado al instante</dt><dd>${escapeHtmlText(stateName(currentOrder.state))}</dd></div>
      <div><dt>Personas vinculadas</dt><dd>${formatNumber(currentOrder.person_ids.length, 0)} · ${escapeHtmlText(currentOrder.person_ids.join(", "))}</dd></div>
      <div><dt>Trabajador en este instante</dt><dd>${escapeHtmlText(currentOrder.worker_id ?? "Sin trabajador asignado en este instante")}</dd></div>
      ${times.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtmlText(value)}</dd></div>`).join("")}
    </div>`;
}

function escapeHtmlText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function mountReplayHost(
  run: RunResult,
  options: ReplayHostOptions = {},
  validatedProjector?: ReplayProjector,
): ReplayHostHandle {
  const stage = document.querySelector<HTMLElement>("#replay-stage");
  const readout = document.querySelector<HTMLElement>("#replay-readout");
  const slider = document.querySelector<HTMLInputElement>("#replay-slider");
  const playButton = document.querySelector<HTMLButtonElement>("[data-replay-play]");
  const restartButton = document.querySelector<HTMLButtonElement>("[data-replay-restart]");
  const speedSelect = document.querySelector<HTMLSelectElement>("[data-replay-speed]");
  const entitySelect = document.querySelector<HTMLSelectElement>("[data-replay-entity]");
  const inspector = document.querySelector<HTMLElement>("#replay-inspector-detail");
  const summary = document.querySelector<HTMLElement>("#replay-scene-summary");
  const renderStatus = document.querySelector<HTMLElement>("#replay-render-status");
  const retryButton = document.querySelector<HTMLButtonElement>("[data-replay-retry]");
  const cameraButtons = document.querySelectorAll<HTMLButtonElement>("[data-replay-zoom], [data-replay-camera-reset]");
  if (!stage || !slider || !playButton || !restartButton || !speedSelect || !entitySelect || !inspector || !summary || !renderStatus || !retryButton) {
    throw new Error("Falta el contenedor de reproducción o alguno de sus controles.");
  }

  const trace = run.trace;
  const orderMetrics = new Map(run.metrics.orders.map((metric) => [metric.order_id, metric]));
  const personMetrics = new Map(run.metrics.people.map((metric) => [metric.person_id, metric]));
  const projector = validatedProjector ?? create_replay_projector(trace);
  let clock: PlaybackClock = create_playback_clock(trace.drain_end_s, options.initialTimeS ?? 0);
  let projected = projector.project(clock.time_s);
  let eventIndex = eventCountAt(trace, clock.time_s);
  let selectedEntity = options.initialSelection ?? "";
  let scene: ShopScene | null = null;
  let canvas = stage.querySelector<HTMLCanvasElement>("#replay-canvas");
  let fallbackAnimationFrame: number | null = null;
  let loopTarget: "renderer" | "fallback" | null = null;
  let lastFrameMs: number | null = null;
  let intersecting = true;
  let disposed = false;
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null;
  const reducedMotion = (): boolean => motionQuery?.matches ?? false;
  const summaryCounts = countInitialSummary(projected);
  let activePeopleCount = summaryCounts.activePeople;
  let preparingOrderCount = summaryCounts.preparingOrders;
  let activeWorkerCount = summaryCounts.activeWorkers;
  let reservedWorkerCount = summaryCounts.reservedWorkers;
  let availableWorkerCount = summaryCounts.availableWorkers;

  let lastReadoutAtMs = Number.NEGATIVE_INFINITY;
  let lastReadoutEventCount = -1;
  const syncReadout = (force = false, frameTimeMs = performance.now()): void => {
    if (!force && eventIndex === lastReadoutEventCount && frameTimeMs - lastReadoutAtMs < 200) return;
    lastReadoutAtMs = frameTimeMs;
    lastReadoutEventCount = eventIndex;
    updateReplayPlaybackReadout(run, clock.time_s, eventIndex);
    if (readout) readout.dataset.time = String(clock.time_s);
    if (slider && Number(slider.value) !== clock.time_s) slider.value = String(clock.time_s);
  };

  const syncPlaybackControls = (): void => {
    playButton.textContent = clock.playing ? "Pausar" : "Reproducir";
    playButton.setAttribute("aria-pressed", String(clock.playing));
    playButton.disabled = clock.drain_end_s <= 0 || clock.time_s >= clock.drain_end_s;
    restartButton.disabled = clock.drain_end_s <= 0;
    if (speedSelect.value !== String(clock.speed)) speedSelect.value = String(clock.speed);
  };

  const syncSummary = (next: ReplayState, changedOrderIds: readonly string[] | null, previous: ReplayState | null): void => {
    if (!previous || changedOrderIds === null) {
      const counts = countInitialSummary(next);
      activePeopleCount = counts.activePeople;
      preparingOrderCount = counts.preparingOrders;
      activeWorkerCount = counts.activeWorkers;
      reservedWorkerCount = counts.reservedWorkers;
      availableWorkerCount = counts.availableWorkers;
    } else {
      const changedWorkerIds = new Set<string>();
      for (const orderId of changedOrderIds) {
        const before = previous.orders[orderId];
        const after = next.orders[orderId];
        const peopleCount = after?.person_ids.length ?? before?.person_ids.length ?? 0;
        if (before && isAtShop(before.state)) activePeopleCount -= peopleCount;
        if (after && isAtShop(after.state)) activePeopleCount += peopleCount;
        if (before?.state === "preparing") preparingOrderCount -= 1;
        if (after?.state === "preparing") preparingOrderCount += 1;
        if (before?.worker_id) changedWorkerIds.add(before.worker_id);
        if (after?.worker_id) changedWorkerIds.add(after.worker_id);
      }
      for (const workerId of changedWorkerIds) {
        const before = previous.workers[workerId];
        const after = next.workers[workerId];
        if (before) {
          const category = workerCategory(before);
          if (category === "active") activeWorkerCount -= 1;
          else if (category === "reserved") reservedWorkerCount -= 1;
          else availableWorkerCount -= 1;
        }
        if (after) {
          const category = workerCategory(after);
          if (category === "active") activeWorkerCount += 1;
          else if (category === "reserved") reservedWorkerCount += 1;
          else availableWorkerCount += 1;
        }
      }
    }
    const closeState = next.admissions_closed ? "Admisiones cerradas" : "Admisiones abiertas";
    summary.textContent = `${formatNumber(activePeopleCount, 0)} personas en la tienda · ${formatNumber(next.payment_queue.length, 0)} órdenes en fila de pago · ${formatNumber(next.pending_payments.length, 0)} órdenes con confirmación pendiente · ${formatNumber(next.preparation_queue.length, 0)} órdenes esperando preparación · ${formatNumber(preparingOrderCount, 0)} órdenes en preparación · ${formatNumber(activeWorkerCount, 0)} trabajadores activos · ${formatNumber(reservedWorkerCount, 0)} reservados · ${formatNumber(availableWorkerCount, 0)} disponibles · ${closeState}`;
  };

  const updateInspector = (): void => {
    if (!selectedEntity) {
      inspector.innerHTML = `<p class="help-text">Elige una persona o una orden para inspeccionar el estado y los tiempos conocidos.</p>`;
      return;
    }
    if (selectedEntity.startsWith("person:")) {
      inspector.innerHTML = renderPersonInspector(run, projected, selectedEntity.slice("person:".length), personMetrics, orderMetrics);
    } else if (selectedEntity.startsWith("order:")) {
      inspector.innerHTML = renderOrderInspector(run, projected, selectedEntity.slice("order:".length), orderMetrics);
    } else {
      inspector.innerHTML = `<p class="help-text">Elige una persona o una orden incluida en este resultado.</p>`;
    }
  };

  const syncEntitySelection = (): void => {
    if (entitySelect.value !== selectedEntity) entitySelect.value = selectedEntity;
    const personId = selectedEntity.startsWith("person:") ? selectedEntity.slice("person:".length) : null;
    scene?.setSelection(personId);
    updateInspector();
  };

  const setRenderStatus = (state: "loading" | "available" | "unavailable", message: string): void => {
    stage.dataset.state = state;
    renderStatus.textContent = message;
    retryButton.hidden = state !== "unavailable";
    for (const button of cameraButtons) button.disabled = state !== "available";
  };

  const availableStatus = (): string => reducedMotion()
    ? "Escena ilustrativa · movimiento decorativo reducido según la preferencia del dispositivo."
    : "Escena ilustrativa · arrastra para orbitar y usa la rueda para acercar o alejar.";

  const stopLoop = (): void => {
    if (loopTarget === "renderer") scene?.setAnimationLoop(null);
    if (fallbackAnimationFrame != null) {
      window.cancelAnimationFrame(fallbackAnimationFrame);
      fallbackAnimationFrame = null;
    }
    loopTarget = null;
    lastFrameMs = null;
  };

  const refreshStageVisibility = (): void => {
    const visible = document.visibilityState !== "hidden" && intersecting;
    if (!visible) {
      stopLoop();
      scene?.render();
      return;
    }
    if (clock.playing) startLoop();
    else scene?.render();
  };

  const onFrame = (timeMs: number): void => {
    if (disposed || !clock.playing) return;
    const elapsedS = lastFrameMs == null ? 0 : Math.min(0.25, Math.max(0, (timeMs - lastFrameMs) / 1000));
    lastFrameMs = timeMs;
    const previousClock = clock;
    clock = advance_playback_clock(clock, elapsedS);
    const eventTime = projector.next_event_time_s;
    if (eventTime != null && clock.time_s >= eventTime) {
      const previousState = projected;
      const changedOrderIds = new Set<string>();
      while (eventIndex < trace.events.length && trace.events[eventIndex].time_s <= clock.time_s) {
        const event = trace.events[eventIndex];
        if (event.order_id) changedOrderIds.add(event.order_id);
        eventIndex += 1;
      }
      const affected = [...changedOrderIds];
      projected = projector.project(clock.time_s);
      scene?.setState(projected, affected, true);
      scene?.setSimulationTime(clock.time_s);
      syncSummary(projected, affected, previousState);
      updateReplayLatestEvent(trace.events[eventIndex - 1] ?? null);
      updateInspector();
    }
    scene?.setSimulationTime(clock.time_s);
    scene?.render();
    syncReadout(false, timeMs);
    syncPlaybackControls();
    if (clock.time_s !== previousClock.time_s) options.onTimeChange?.(clock.time_s);
    if (!clock.playing) {
      scene?.finishCosmeticMotion();
      stopLoop();
    }
  };

  const runFallbackFrame = (timeMs: number): void => {
    fallbackAnimationFrame = null;
    onFrame(timeMs);
    if (!disposed && loopTarget === "fallback") {
      fallbackAnimationFrame = window.requestAnimationFrame(runFallbackFrame);
    }
  };

  const startLoop = (): void => {
    if (disposed || !clock.playing || document.visibilityState === "hidden" || !intersecting) return;
    const target = scene ? "renderer" : "fallback";
    if (loopTarget === target) return;
    stopLoop();
    loopTarget = target;
    lastFrameMs = null;
    if (scene) scene.setAnimationLoop(onFrame);
    else fallbackAnimationFrame = window.requestAnimationFrame(runFallbackFrame);
  };

  const projectAt = (timeS: number, animate: boolean): void => {
    const previous = projected;
    clock = seek(clock, timeS);
    projected = projector.project(clock.time_s);
    eventIndex = eventCountAt(trace, clock.time_s);
    scene?.setState(projected, null, animate);
    scene?.setSimulationTime(clock.time_s);
    syncSummary(projected, null, previous);
    updateReplayTimeline(run, clock.time_s);
    updateInspector();
    syncReadout();
    syncPlaybackControls();
    options.onTimeChange?.(clock.time_s);
    if (clock.playing) startLoop();
    else stopLoop();
    scene?.render();
  };

  const setSelection = (value: string): void => {
    if (value === selectedEntity) return;
    selectedEntity = value;
    syncEntitySelection();
    options.onSelectionChange?.(selectedEntity);
  };

  const handleContextLost = (): void => {
    stopLoop();
    scene?.dispose();
    scene = null;
    setRenderStatus("unavailable", "La vista 3D dejó de estar disponible. El reloj, el inspector y los resultados siguen funcionando.");
    if (clock.playing) startLoop();
  };

  const attemptScene = (): void => {
    if (disposed) return;
    stopLoop();
    scene?.dispose();
    scene = null;
    const replacement = document.createElement("canvas");
    replacement.id = "replay-canvas";
    replacement.tabIndex = -1;
    replacement.setAttribute("aria-label", "Vista ilustrativa de la tienda. Usa los controles externos de reproducción, selección y cámara.");
    if (canvas?.isConnected) canvas.replaceWith(replacement);
    else stage.prepend(replacement);
    canvas = replacement;
    setRenderStatus("loading", "Preparando la escena local…");
    try {
      scene = createShopScene(stage, replacement, trace, {
        reducedMotion: reducedMotion(),
        onPersonSelected: (personId) => {
          setSelection(personId ? `person:${personId}` : "");
        },
        onContextLost: handleContextLost,
      });
      scene.setState(projected, null, false);
      scene.setSimulationTime(clock.time_s);
      const personId = selectedEntity.startsWith("person:") ? selectedEntity.slice("person:".length) : null;
      scene.setSelection(personId);
      scene.render();
      setRenderStatus("available", availableStatus());
      syncEntitySelection();
      if (clock.playing) startLoop();
    } catch {
      scene?.dispose();
      scene = null;
      setRenderStatus("unavailable", "La vista 3D no está disponible en este navegador. El reloj, el inspector y los resultados siguen funcionando.");
      if (clock.playing) startLoop();
    }
  };

  const handleVisibilityChange = (): void => refreshStageVisibility();
  const handleMotionChange = (): void => {
    scene?.setReducedMotion(reducedMotion());
    if (stage.dataset.state === "available") renderStatus.textContent = availableStatus();
    scene?.render();
  };
  const handleRetry = (): void => attemptScene();
  const handleIntersection = (entries: IntersectionObserverEntry[]): void => {
    intersecting = entries.some((entry) => entry.isIntersecting);
    refreshStageVisibility();
  };

  slider.value = String(clock.time_s);
  if (speedSelect && PLAYBACK_SPEEDS.includes(Number(speedSelect.value) as PlaybackSpeed)) {
    clock = set_speed(clock, Number(speedSelect.value) as PlaybackSpeed);
  }
  syncPlaybackControls();
  syncReadout(true);
  updateReplayLatestEvent(trace.events[eventIndex - 1] ?? null);
  updateInspector();
  syncSummary(projected, null, null);
  setRenderStatus("loading", "Preparando la escena local…");
  retryButton.addEventListener("click", handleRetry);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  motionQuery?.addEventListener("change", handleMotionChange);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => scene?.render());
    resizeObserver.observe(stage);
  }
  if (typeof IntersectionObserver !== "undefined") {
    intersecting = false;
    intersectionObserver = new IntersectionObserver(handleIntersection, { threshold: 0.01 });
    intersectionObserver.observe(stage);
  }
  attemptScene();

  return {
    togglePlayback() {
      if (clock.playing) {
        clock = pause(clock);
        scene?.finishCosmeticMotion();
        stopLoop();
      } else {
        clock = play(clock);
        startLoop();
      }
      syncPlaybackControls();
      syncReadout(true);
    },
    restartPlayback() {
      clock = restart(clock);
      projectAt(0, false);
      syncPlaybackControls();
      syncReadout(true);
    },
    seekTo(timeS) {
      projectAt(timeS, false);
    },
    setSpeed(speed) {
      if (!PLAYBACK_SPEEDS.includes(speed as PlaybackSpeed)) return;
      clock = set_speed(clock, speed as PlaybackSpeed);
      syncPlaybackControls();
    },
    selectEntity(value) {
      setSelection(value);
    },
    resetCamera() {
      scene?.resetCamera();
    },
    zoom(direction) {
      scene?.zoom(direction);
    },
    retryScene() {
      attemptScene();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionQuery?.removeEventListener("change", handleMotionChange);
      retryButton.removeEventListener("click", handleRetry);
      scene?.dispose();
      scene = null;
    },
  };
}
