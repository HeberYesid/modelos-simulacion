import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { RunResult, Scenario } from "../src/api/types";

const correctedReference = fileURLToPath(new URL("../../tests/fixtures/observation-import/corrected-reference.txt", import.meta.url));
const demoScenarioFixture = JSON.parse(readFileSync(fileURLToPath(new URL("../contracts/fixtures/demo-scenario.json", import.meta.url)), "utf8")) as Scenario;

async function openDisclosure(page: Page, selector: string): Promise<void> {
  const disclosure = page.locator(selector);
  const isOpen = await disclosure.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) await disclosure.locator("summary").click();
}

async function openAdvancedOptions(page: Page): Promise<void> {
  await openDisclosure(page, "details[data-advanced-options]");
}

async function openComparisonOptions(page: Page): Promise<void> {
  await openDisclosure(page, "details[data-comparison-options]");
}

function replayScenario(): Scenario {
  const scenario = structuredClone(demoScenarioFixture) as Scenario;
  scenario.scenario_id = "synthetic-spec05-replay";
  scenario.display_name = "Demostración sintética para replay";
  scenario.engine_config.horizon_s = 2;
  scenario.engine_config.preparers = 1;
  scenario.initial_state = [{
    order_id: "initial-payment",
    person_ids: ["person-initial"],
    arrival_s: null,
    stage: "payment_active",
    worker_id: "cashier-1",
    remaining_s: 2,
    transfer_wait_s: 0,
    preparation_s: 2,
  }];
  scenario.interarrival = { kind: "constant", value_s: 1 };
  scenario.group_sizes = [{ size: 2, probability: 1 }];
  scenario.payment_active = { kind: "constant", value_s: 1 };
  scenario.preparation = { kind: "constant", value_s: 2 };
  scenario.transfer_probability = 0;
  scenario.transfer_confirmation = { kind: "constant", value_s: 1 };
  scenario.patience = null;
  return scenario;
}

function transferScenario(mode: "tuesday" | "regular"): Scenario {
  const scenario = structuredClone(demoScenarioFixture) as Scenario;
  scenario.scenario_id = `synthetic-spec05-${mode}-transfer`;
  scenario.display_name = "Demostración sintética de transferencia";
  scenario.engine_config.mode = mode;
  scenario.engine_config.horizon_s = 1.5;
  scenario.engine_config.cashiers = mode === "tuesday" ? 1 : 0;
  scenario.engine_config.preparers = mode === "tuesday" ? 1 : 0;
  scenario.engine_config.integrated_workers = mode === "regular" ? 1 : 0;
  scenario.initial_state = [];
  scenario.interarrival = { kind: "constant", value_s: 1 };
  scenario.group_sizes = [{ size: 2, probability: 1 }];
  scenario.payment_active = { kind: "constant", value_s: 0.25 };
  scenario.preparation = { kind: "constant", value_s: 1 };
  scenario.transfer_probability = 1;
  scenario.transfer_confirmation = { kind: "constant", value_s: 4 };
  scenario.patience = null;
  return scenario;
}

async function runThroughLocalApi(page: import("@playwright/test").Page, scenario: Scenario, seed: number): Promise<RunResult> {
  const response = await page.request.post("/api/v1/runs", {
    data: { scenario, root_seed: seed, replication_index: 0 },
  });
  const payload: unknown = await response.json();
  expect(response.status(), JSON.stringify(payload)).toBe(200);
  return payload as RunResult;
}

async function openSavedRun(page: import("@playwright/test").Page, run: RunResult): Promise<void> {
  await page.getByRole("tab", { name: "Escenarios" }).click();
  const validation = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/files/validate") && response.request().method() === "POST",
  );
  await page.locator("#saved-json-file").setInputFiles({
    name: "spec05-replay.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(run)),
  });
  expect((await validation).status()).toBe(200);
  await expect(page.getByRole("tab", { name: "Resultados" })).toHaveAttribute("aria-selected", "true");
}

async function seekReplay(page: import("@playwright/test").Page, timeS: number): Promise<void> {
  await page.locator("#replay-slider").evaluate((element, time) => {
    const slider = element as HTMLInputElement;
    slider.value = String(time);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }, timeS);
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string): number => {
    const [red = 0, green = 0, blue = 0] = color.match(/[\d.]+/g)?.map(Number) ?? [];
    const linear = [red, green, blue].map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("imports the corrected reference and keeps its audit warnings visible", async ({ page }, testInfo) => {
  const importDesktopEvidence = testInfo.outputPath("import-desktop-after-fix.png");
  const importMobileEvidence = testInfo.outputPath("import-mobile-after-fix.png");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Datos observados" }).click();
  await expect(page.getByText("Elige un archivo CSV o TXT codificado en UTF-8.")).toBeVisible();
  await page.locator("#observation-file").setInputFiles(correctedReference);
  await page.locator("#correction-policy").selectOption("boquitas-2026-10-20-v1");
  const importResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/observations/import") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Importar y revisar" }).click();
  expect((await importResponse).status()).toBe(200);

  await expect(page.locator(".report-count").first().locator("strong")).toHaveText("119");
  await expect(page.locator(".report-count.highlight strong")).toHaveText("3");
  await expect(page.getByText(/La fuente corregida ya contiene los cambios aprobados/)).toBeVisible();
  await expect(page.getByText(/6 intervalos de entrega coinciden/)).toBeVisible();
  await expect(page.getByText(/cantidad de personas no observados en 119 filas/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: importDesktopEvidence, fullPage: true, animations: "disabled" });
  const tableScroller = await page.locator('.audit-list > section[aria-labelledby="station-summary-title"] .data-table-wrap').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
  }));
  expect(tableScroller.overflowX).toBe("auto");
  expect(tableScroller.scrollWidth).toBeGreaterThan(tableScroller.clientWidth);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: importMobileEvidence, fullPage: true, animations: "disabled" });
});

test("keeps the submitted run visible with its original parameters after an edit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await openAdvancedOptions(page);
  await expect(page.locator("#root-seed")).toHaveValue("20261020");
  await openComparisonOptions(page);
  await page.getByRole("button", { name: "Copiar referencia como candidato" }).click();
  await openAdvancedOptions(page);
  await page.locator("#scenario-id").fill("candidate-single-run");
  await page.locator("#scenario-name").fill("Candidato para una réplica");
  const runResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  expect((await runResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "La configuración visible tiene cambios sin ejecutar" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Escenarios" }).click();
  await page.locator('[data-distribution-field="preparation.low_s"]').fill("61.23456789");
  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(page.getByRole("heading", { name: "La configuración visible tiene cambios sin ejecutar" })).toBeVisible();
  await page.getByText("Ver parámetros exactos enviados al motor").click();
  await expect(page.getByText("Triangular · 60 / 120 / 180 s")).toBeVisible();

  await page.getByRole("tab", { name: "Escenarios" }).click();
  await openAdvancedOptions(page);
  await page.locator("#group-prob-0").fill("0.2");
  await page.locator("#group-prob-1").fill("0.2");
  const invalidRun = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  expect((await invalidRun).status()).toBe(422);
  await expect(page.getByRole("heading", { name: "La configuración no se aceptó" })).toBeVisible();
  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(page.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "La configuración visible tiene cambios sin ejecutar" })).toBeVisible();

  await page.getByRole("tab", { name: "Escenarios" }).click();
  await page.locator("#saved-json-file").setInputFiles({
    name: "future-version.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"contract_version":2}'),
  });
  await expect(page.getByText(/Esta versión de archivo no es compatible/)).toBeVisible();
  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(page.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
  await expect(page.getByText(/versión de archivo no es compatible/)).toBeVisible();
});

test("selects and replays the exact completed experiment member", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await page.locator("#closing-time").fill("15:01:00");
  await openAdvancedOptions(page);
  await page.locator("#replications").fill("5");
  await openComparisonOptions(page);
  await page.getByRole("button", { name: "Copiar referencia como candidato" }).click();
  await openAdvancedOptions(page);
  await page.locator("#scenario-id").fill("candidate-fast-preparation");
  await page.locator("#scenario-name").fill("Preparación breve");
  await page.locator('[data-distribution-field="preparation.low_s"]').fill("5.125");
  await page.locator('[data-distribution-field="preparation.mode_s"]').fill("8.25");
  await page.locator('[data-distribution-field="preparation.high_s"]').fill("12.75");
  await page.locator("details[data-comparison-options] > summary").click();
  await expect(page.locator("[data-active-scenario-name]")).toHaveText("Preparación breve");
  await expect(page.locator("details[data-comparison-options]")).toHaveJSProperty("open", false);
  await openComparisonOptions(page);

  const experimentResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/experiments") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Comparar escenarios" }).click();
  const response = await experimentResponse;
  expect(response.status()).toBe(200);
  const experiment = await response.json();
  expect(experiment.scenarios.map((scenario: { scenario_id: string }) => scenario.scenario_id))
    .toEqual(["synthetic-demo-tuesday", "candidate-fast-preparation"]);
  expect(experiment.n_requested).toBe(5);

  await page.locator("#selected-scenario").selectOption("candidate-fast-preparation");
  await page.locator("#selected-replication").selectOption("4");
  const selectedRunResponse = page.waitForResponse((result) =>
    result.url().endsWith("/api/v1/runs") && result.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Inspeccionar esta réplica" }).click();
  const selectedResponse = await selectedRunResponse;
  expect(selectedResponse.status()).toBe(200);
  const selected = await selectedResponse.json();
  expect(selected.scenario.scenario_id).toBe("candidate-fast-preparation");
  expect(selected.root_seed).toBe(experiment.root_seed);
  expect(selected.replication_index).toBe(4);
  const stored = experiment.replication_results.find((record: { scenario_id: string; replication_index: number }) =>
    record.scenario_id === selected.scenario.scenario_id && record.replication_index === selected.replication_index,
  );
  const storedDuration = stored.metrics.metric_summaries.find((metric: { metric_id: string }) =>
    metric.metric_id === "duration.preparation_elapsed.order.new",
  );
  const selectedDuration = selected.metrics.metric_summaries.find((metric: { metric_id: string }) =>
    metric.metric_id === "duration.preparation_elapsed.order.new",
  );
  expect(selectedDuration).toEqual(storedDuration);
  await expect(page.getByText("Réplica 4 · candidate-fast-preparation", { exact: true })).toBeVisible();

  const selectedCsvResponse = page.waitForResponse((result) =>
    result.url().endsWith("/api/v1/exports/csv") && result.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Preparar CSV de réplica seleccionada" }).click();
  const selectedCsv = await selectedCsvResponse;
  expect(selectedCsv.status()).toBe(200);
  expect(selectedCsv.request().postDataJSON().result.scenario.scenario_id).toBe("candidate-fast-preparation");
  await expect(page.getByRole("heading", { name: "Tablas de la réplica seleccionada" })).toBeVisible();

  const experimentCsvResponse = page.waitForResponse((result) =>
    result.url().endsWith("/api/v1/exports/csv") && result.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Preparar CSV del experimento" }).click();
  const experimentCsv = await experimentCsvResponse;
  expect(experimentCsv.status()).toBe(200);
  expect(experimentCsv.request().postDataJSON().result.scenarios).toHaveLength(2);
  await expect(page.getByRole("heading", { name: "Tablas del experimento" })).toBeVisible();
});

test("preserves demand on regular mode and inspects explicit work draining past midnight", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await page.locator('[data-distribution-field="interarrival.mean_s"]').fill("211.125");
  await openAdvancedOptions(page);
  await page.getByRole("button", { name: "Añadir orden inicial" }).click();
  await page.locator('[data-initial-stage="0"]').selectOption("waiting_preparation");
  await page.locator("#initial-0-id").fill("initial-preparation");
  await page.locator("#initial-0-people").fill("person-1");
  await page.locator("#initial-0-rank").fill("0");
  await page.locator("#initial-0-preparation").fill("30");
  await page.locator('[data-mode="regular"]').check();
  await expect(page.locator("#integrated-workers")).toHaveValue("1");
  await expect(page.locator('[data-distribution-field="interarrival.mean_s"]')).toHaveValue("211.125");
  await expect(page.locator('[data-group-field="probability"]').nth(0)).toHaveValue("0.6");
  await expect(page.locator('[data-group-field="probability"]').nth(1)).toHaveValue("0.4");
  await expect(page.locator('[data-initial-stage="0"]')).toHaveValue("waiting_preparation");
  await expect(page.getByText(/etapa inicial que no existe en este modo/)).toBeVisible();

  const incompatibleRun = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  expect((await incompatibleRun).status()).toBe(422);
  await expect(page.getByRole("heading", { name: "La configuración no se aceptó" })).toBeVisible();
  await expect(page.locator('[data-initial-stage="0"]')).toHaveValue("waiting_preparation");

  await page.locator('[data-initial-stage="0"]').selectOption("preparing");
  await page.locator("#initial-0-worker").selectOption("integrated-1");
  await page.locator("#initial-0-remaining").fill("7200");

  await page.locator("#opening-time").fill("23:00:00");
  await page.locator("#closing-time").fill("23:30:00");

  const runResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  const response = await runResponse;
  expect(response.status()).toBe(200);
  const run = await response.json();
  expect(run.scenario.engine_config).toMatchObject({ mode: "regular", integrated_workers: 1, horizon_s: 1800 });
  expect(run.scenario.interarrival.mean_s).toBe(211.125);
  expect(run.scenario.group_sizes).toEqual([
    { size: 1, probability: 0.6 },
    { size: 2, probability: 0.4 },
  ]);
  expect(run.initial_state[0]).toMatchObject({
    order_id: "initial-preparation",
    person_ids: ["person-1"],
    stage: "preparing",
    worker_id: "integrated-1",
    remaining_s: 7200,
    arrival_s: null,
  });
  await expect(page.getByRole("heading", { name: "Órdenes en fila" })).toBeVisible();
  await expect(page.locator("#replay-slider")).toBeVisible();
  await expect(page.getByText(/fin de la réplica: .*\(\+1 día\)/)).toBeVisible();
});

test("saves and reopens versioned files and exposes CSV downloads", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await page.locator("#closing-time").fill("15:01:00");
  const saveScenarioResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/files/validate") && response.request().method() === "POST",
  );
  const scenarioDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar escenario JSON" }).click();
  expect((await saveScenarioResponse).status()).toBe(200);
  const scenarioDownload = await scenarioDownloadPromise;
  const scenarioPath = await scenarioDownload.path();
  expect(scenarioPath).not.toBeNull();
  const openScenarioResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/files/validate") && response.request().method() === "POST",
  );
  await page.locator("#saved-json-file").setInputFiles(scenarioPath as string);
  expect((await openScenarioResponse).status()).toBe(200);
  await openAdvancedOptions(page);
  await expect(page.locator("#scenario-id")).toHaveValue("synthetic-demo-tuesday");

  const runResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  expect((await runResponse).status()).toBe(200);
  await page.getByRole("button", { name: "Preparar CSV de esta réplica" }).click();
  await expect(page.locator('a[download$=".csv"]').first()).toBeVisible();
  const csvDownloadPromise = page.waitForEvent("download");
  await page.locator('a[download$=".csv"]').first().click();
  expect((await csvDownloadPromise).suggestedFilename()).toMatch(/\.csv$/);

  const runDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar resultado JSON" }).click();
  const runDownload = await runDownloadPromise;
  const runPath = await runDownload.path();
  expect(runPath).not.toBeNull();
  await page.getByRole("tab", { name: "Escenarios" }).click();
  let runRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/runs") && request.method() === "POST") runRequests += 1;
  });
  const openRunResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/files/validate") && response.request().method() === "POST",
  );
  await page.locator("#saved-json-file").setInputFiles(runPath as string);
  expect((await openRunResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
  expect(runRequests).toBe(0);
});

test("keeps keyboard navigation and narrow scenario controls usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tab", { name: "Datos observados" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Escenarios" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Escenarios" })).toBeFocused();
  await expect(page.locator("#scenario-form")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.getByRole("tab", { name: "Escenarios" }).evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  const primaryColors = await page.locator(".primary-button").first().evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element).backgroundColor,
  }));
  expect(contrastRatio(primaryColors.foreground, primaryColors.background)).toBeGreaterThanOrEqual(4.5);
});

test("shows missing metric samples as unavailable while the empty run remains inspectable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await page.locator("#closing-time").fill("15:00:30");
  await page.locator('[data-distribution-kind="interarrival"]').selectOption("constant");
  await page.locator("#dist-interarrival-value").fill("3600");

  const runResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  const response = await runResponse;
  expect(response.status()).toBe(200);
  const run = await response.json();
  expect(run.metrics.orders).toHaveLength(0);
  expect(run.metrics.metric_summaries.some((metric: { value: number | null; unavailable_reason?: string }) =>
    metric.value == null && metric.unavailable_reason === "no_eligible_samples",
  )).toBe(true);
  await expect(page.locator(".metric-unavailable").first()).toContainText("No hay muestras válidas");
  await expect(page.getByRole("heading", { name: "Órdenes en fila" })).toBeVisible();
  await expect(page.locator("#replay-slider")).toBeVisible();
});

test("runs and reopens results locally without WebGL or external network access", async ({ page }) => {
  let externalRequests = 0;
  let runRequests = 0;
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = ((contextId: string) => {
      if (contextId === "webgl2" || contextId === "webgl") return null;
      return null;
    }) as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.route("**/*", async (route) => {
    const { hostname } = new URL(route.request().url());
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      await route.continue();
    } else {
      externalRequests += 1;
      await route.abort("blockedbyclient");
    }
  });
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/runs") && request.method() === "POST") runRequests += 1;
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await page.locator("#closing-time").fill("15:01:00");
  const runResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  expect((await runResponse).status()).toBe(200);

  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(page.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
  await expect(page.locator(".metric-table tbody tr").first()).toBeVisible();
  await expect(page.locator(".chart-frame svg")).toBeVisible();
  await expect(page.getByText("La vista 3D no está disponible en este navegador")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar resultado JSON" }).click();
  const resultDownload = await downloadPromise;
  const resultPath = await resultDownload.path();
  expect(resultPath).not.toBeNull();
  await page.getByRole("tab", { name: "Escenarios" }).click();
  const validationResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/files/validate") && response.request().method() === "POST",
  );
  await page.locator("#saved-json-file").setInputFiles(resultPath as string);
  expect((await validationResponse).status()).toBe(200);
  await expect(page.getByRole("tab", { name: "Resultados" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("La vista 3D no está disponible en este navegador")).toBeVisible();
  expect(runRequests).toBe(1);

  const exportResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/exports/csv") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Preparar CSV de esta réplica" }).click();
  expect((await exportResponse).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Tablas de esta réplica" })).toBeVisible();
  await expect(page.locator("#replay-slider")).toBeVisible();
  const readoutBefore = await page.locator("#replay-readout").innerText();
  const traceEnd = await page.locator("#replay-slider").evaluate((element) => Number((element as HTMLInputElement).max));
  expect(traceEnd).toBeGreaterThan(0);
  await page.locator("#replay-slider").evaluate((element) => {
    const slider = element as HTMLInputElement;
    slider.value = slider.max;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#replay-readout")).not.toHaveText(readoutBefore);
  expect(externalRequests).toBe(0);
});

test("renders the immutable engine trace, moves a shared group, and resets across repeated saved runs", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const scenario = replayScenario();
  const run = await runThroughLocalApi(page, scenario, 20261020);
  expect(run.trace.new_order_ids).toHaveLength(1);
  expect(run.trace.drain_end_s).toBe(6);
  expect(run.trace.events.find((event) => event.type === "order_arrived")?.time_s).toBe(1);
  expect(run.trace.final_orders.find((order) => order.order_id === run.trace.new_order_ids[0])?.person_ids).toHaveLength(2);

  await page.goto("/");
  await openSavedRun(page, run);
  const stage = page.locator("#replay-stage");
  const canvas = page.locator("#replay-canvas");
  await expect(stage).toHaveAttribute("data-state", "available");
  await expect(canvas).toBeVisible();
  await expect(page.locator("[data-replay-retry]")).toBeHidden();
  const canvasBounds = await canvas.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  expect(canvasBounds.width).toBeGreaterThan(900);
  expect(canvasBounds.height).toBeGreaterThan(400);

  await seekReplay(page, 0.2);
  const activeWorkerBefore = await canvas.screenshot();
  await page.locator("#replay-speed").selectOption("1");
  await page.getByRole("button", { name: "Reproducir" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Pausar" }).click();
  const activeWorkerAfter = await canvas.screenshot();
  expect(activeWorkerAfter.equals(activeWorkerBefore)).toBe(false);

  await seekReplay(page, 0.9);
  const beforeArrival = await canvas.screenshot();
  await seekReplay(page, 1.1);
  const afterArrival = await canvas.screenshot();
  expect(afterArrival.equals(beforeArrival)).toBe(false);
  await expect(page.locator("#replay-scene-summary")).toContainText("3 personas en la tienda");

  const initialPerson = run.initial_state[0]?.person_ids[0];
  const newOrderId = run.trace.new_order_ids[0];
  const sharedOrder = run.trace.final_orders.find((order) => order.order_id === newOrderId);
  const sharedPerson = sharedOrder?.person_ids[0];
  expect(initialPerson).toBeTruthy();
  expect(sharedPerson).toBeTruthy();
  await page.locator("#replay-entity").selectOption(`person:${initialPerson}`);
  await expect(page.locator("#replay-inspector-detail")).toContainText("Desconocida · orden presente al abrir");
  await page.locator("#replay-entity").selectOption(`person:${sharedPerson}`);
  await expect(page.locator("#replay-inspector-detail")).toContainText(newOrderId);
  await expect(page.locator("#replay-inspector-detail")).toContainText(sharedOrder?.person_ids.join(", ") ?? "");

  await seekReplay(page, 3.5);
  await expect(page.locator("#replay-scene-summary")).toContainText("1 órdenes esperando preparación");
  await expect(page.locator("#replay-scene-summary")).toContainText("1 órdenes en preparación");
  await seekReplay(page, 4.1);
  await expect(page.locator("#replay-scene-summary")).toContainText("2 personas en la tienda");
  await expect(page.locator("#replay-scene-summary")).toContainText("1 órdenes en preparación");
  await seekReplay(page, run.trace.drain_end_s);
  await expect(page.locator("#replay-scene-summary")).toContainText("0 personas en la tienda");
  await expect(page.locator("#replay-readout")).toContainText("15:00:06");

  await seekReplay(page, 0);
  await page.locator("#replay-speed").selectOption("1");
  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect(page.locator("#replay-play")).toHaveText("Pausar");
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "Pausar" }).click();
  const pausedAt = await page.locator("#replay-slider").inputValue();
  await page.waitForTimeout(250);
  await expect(page.locator("#replay-slider")).toHaveValue(pausedAt);
  await page.locator("#replay-speed").selectOption("60");
  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect(page.locator("#replay-slider")).toHaveValue("6");
  await expect(page.locator("#replay-play")).toBeDisabled();
  await page.getByRole("button", { name: "Volver al inicio" }).click();
  await expect(page.locator("#replay-slider")).toHaveValue("0");

  for (const seed of [20261021, 20261022, 20261023]) {
    await page.locator("#replay-speed").selectOption("1");
    await page.getByRole("button", { name: "Reproducir" }).click();
    await page.waitForTimeout(250);
    expect(Number(await page.locator("#replay-slider").inputValue())).toBeGreaterThan(0);
    const repeated = await runThroughLocalApi(page, replayScenario(), seed);
    await openSavedRun(page, repeated);
    await expect(page.locator("#replay-slider")).toHaveValue("0");
    await expect(page.locator("#replay-entity")).toHaveValue("");
    await expect(page.locator("#replay-stage canvas")).toHaveCount(1);
    await expect(page.locator("#replay-stage")).toHaveAttribute("data-state", "available");
    await page.waitForTimeout(250);
    await expect(page.locator("#replay-slider")).toHaveValue("0");
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotionRun = await runThroughLocalApi(page, replayScenario(), 20261024);
  await openSavedRun(page, reducedMotionRun);
  await expect(page.locator("#replay-render-status")).toContainText("movimiento decorativo reducido");
  await seekReplay(page, 0.2);
  await page.locator("#replay-speed").selectOption("1");
  await page.getByRole("button", { name: "Reproducir" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Pausar" }).click();
  expect(Number(await page.locator("#replay-slider").inputValue())).toBeGreaterThan(0.2);
  await expect(page.locator("#replay-render-status")).toContainText("movimiento decorativo reducido");
});

test("camera zoom, orbit, and reset change the rendered view without browser errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const run = await runThroughLocalApi(page, replayScenario(), 20261025);
  await page.goto("/");
  await openSavedRun(page, run);
  const stage = page.locator("#replay-stage");
  const canvas = page.locator("#replay-canvas");
  await expect(stage).toHaveAttribute("data-state", "available");
  await expect(canvas).toBeVisible();

  const initialView = await canvas.screenshot();
  for (let click = 0; click < 3; click += 1) {
    await page.getByRole("button", { name: "Acercar cámara" }).click();
  }
  const zoomedView = await canvas.screenshot();
  expect(zoomedView.equals(initialView)).toBe(false);

  await page.getByRole("button", { name: "Restablecer cámara" }).click();
  const resetView = await canvas.screenshot();
  expect(resetView.equals(zoomedView)).toBe(false);

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const centerX = bounds!.x + bounds!.width / 2;
  const centerY = bounds!.y + bounds!.height / 2;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + 110, centerY + 35, { steps: 5 });
  await page.mouse.up();
  const orbitedView = await canvas.screenshot();
  expect(orbitedView.equals(resetView)).toBe(false);
  expect(pageErrors).toEqual([]);
});

test("new transfers show only their method and add no confirmation wait", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await expect(page.locator('[data-distribution-row="transfer_confirmation"]')).toHaveCount(0);
  for (const mode of ["tuesday", "regular"] as const) {
    const run = await runThroughLocalApi(page, transferScenario(mode), 20261020);
    expect(run.demand_tape[0]?.payment_method).toBe("transfer");
    expect(run.demand_tape[0]?.transfer_wait_s).toBe(0);
    expect(run.metrics.orders[0]?.payment_completed_s).toBe(1.25);
    expect(run.metrics.orders[0]?.preparation_started_s).toBe(1.25);
    await openSavedRun(page, run);
    await seekReplay(page, 1.3);
    await expect(page.locator("#replay-scene-summary")).not.toContainText("confirmación pendiente");
    await expect(page.locator(".result-orders")).toContainText("Transferencia");
    await page.locator("[data-replay-entity]").selectOption(`order:${run.demand_tape[0]!.order_id}`);
    await expect(page.locator("#replay-inspector-detail")).toContainText("Transferencia");
  }
});

test("reopens legacy released and reserved transfer workers and survives real WebGL context loss", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const tuesday = JSON.parse(readFileSync(fileURLToPath(new URL("../tests/fixtures/replay/legacy-transfer-tuesday-run.json", import.meta.url)), "utf8")) as RunResult;
  await page.goto("/");
  await openSavedRun(page, tuesday);
  await seekReplay(page, 1.3);
  await expect(page.locator("#replay-scene-summary")).toContainText("1 órdenes con confirmación pendiente");
  await expect(page.locator("#replay-scene-summary")).toContainText("0 trabajadores activos");
  await expect(page.locator("#replay-scene-summary")).toContainText("0 reservados");
  await expect(page.locator("#replay-scene-summary")).toContainText("2 disponibles");

  const regular = JSON.parse(readFileSync(fileURLToPath(new URL("../tests/fixtures/replay/legacy-transfer-regular-run.json", import.meta.url)), "utf8")) as RunResult;
  await openSavedRun(page, regular);
  await seekReplay(page, 1.3);
  await expect(page.locator("#replay-scene-summary")).toContainText("1 órdenes con confirmación pendiente");
  await expect(page.locator("#replay-scene-summary")).toContainText("0 trabajadores activos");
  await expect(page.locator("#replay-scene-summary")).toContainText("1 reservados");
  await expect(page.locator("#replay-scene-summary")).toContainText("0 disponibles");

  const canLoseContext = await page.locator("#replay-canvas").evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const extension = context?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(canLoseContext).toBe(true);
  await expect(page.locator("#replay-stage")).toHaveAttribute("data-state", "unavailable");
  await expect(page.getByText("La vista 3D dejó de estar disponible.")).toBeVisible();
  await expect(page.locator("#replay-slider")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
  await page.locator("#replay-speed").selectOption("60");
  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect(page.locator("#replay-slider")).toHaveValue(String(regular.trace.drain_end_s));
  await expect(page.getByText("La vista 3D dejó de estar disponible.")).toBeVisible();
  await page.getByRole("button", { name: "Intentar abrir la vista 3D otra vez" }).click();
  await expect(page.locator("#replay-stage")).toHaveAttribute("data-state", "available");
  await expect(page.locator("#replay-stage canvas")).toHaveCount(1);
});

test("rejects a shape-valid run with a nonmonotone trace and preserves the last replay", async ({ page }) => {
  const run = await runThroughLocalApi(page, replayScenario(), 20261020);
  await page.goto("/");
  await openSavedRun(page, run);
  const selectedPerson = run.initial_state[0]?.person_ids[0] ?? "";
  await seekReplay(page, 1.1);
  await page.locator("#replay-entity").selectOption(`person:${selectedPerson}`);

  const invalidRun = structuredClone(run);
  invalidRun.trace.events[1] = {
    ...invalidRun.trace.events[1],
    seq: invalidRun.trace.events[0]!.seq,
  };
  await page.getByRole("tab", { name: "Escenarios" }).click();
  const validation = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/files/validate") && response.request().method() === "POST",
  );
  await page.locator("#saved-json-file").setInputFiles({
    name: "malformed-replay-order.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalidRun)),
  });
  expect((await validation).status()).toBe(200);
  await expect(page.getByRole("alert")).toContainText("El historial de eventos no cumple el contrato de reproducción");

  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(page.locator(".results-toolbar")).toContainText(run.scenario.scenario_id);
  await expect(page.locator("#replay-slider")).toHaveValue("1.1");
  await expect(page.locator("#replay-entity")).toHaveValue(`person:${selectedPerson}`);
  await expect(page.locator("#replay-inspector-detail")).toContainText(selectedPerson);
});
