import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test as base, type Page, type TestInfo } from "@playwright/test";
import type { ExperimentResult, ImportReport, RunResult } from "../src/api/types";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const localOrigin = "http://127.0.0.1:8000";
const historicalReferencePath = resolve(
  projectRoot,
  "openspec/changes/boquitas-06-validation-and-delivery/review/release-reproducibility-reference.json",
);
const currentReferencePath = resolve(projectRoot, "web/contracts/fixtures/release-reproducibility-v2.json");
const originalSource = resolve(projectRoot, "tests/fixtures/observation-import/original.txt");
const correctedSource = resolve(
  projectRoot,
  "tests/fixtures/observation-import/corrected-reference.txt",
);
const correctedPolicy = "boquitas-2026-10-20-v1";

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

type OfflineNetworkAudit = {
  guardActive: boolean;
  localRequestCount: number;
  localRequestPaths: string[];
  externalHttpAttempts: string[];
};

type ReleaseFixtures = { offlineNetworkAudit: OfflineNetworkAudit };
const test = base.extend<ReleaseFixtures>({
  offlineNetworkAudit: [async ({ context }, use) => {
    const audit: OfflineNetworkAudit = {
      guardActive: false,
      localRequestCount: 0,
      localRequestPaths: [],
      externalHttpAttempts: [],
    };
    const origin = new URL(localOrigin).origin;
    context.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      if (url.origin === origin) {
        audit.localRequestCount += 1;
        audit.localRequestPaths.push(`${request.method()} ${url.pathname}`);
      } else {
        audit.externalHttpAttempts.push(`${request.method()} ${url.href}`);
      }
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const isHttp = url.protocol === "http:" || url.protocol === "https:";
      if (isHttp && url.origin !== origin) {
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });
    audit.guardActive = true;
    await use(audit);
  }, { auto: true }],
});

test.beforeEach(async ({ offlineNetworkAudit }) => {
  expect(offlineNetworkAudit.guardActive, "offline request guard was not activated").toBe(true);
  expect(offlineNetworkAudit.localRequestCount).toBe(0);
});

test.afterEach(async ({ offlineNetworkAudit }, testInfo) => {
  const testSlug = testInfo.title.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const retrySuffix = testInfo.retry > 0 ? `-retry-${testInfo.retry}` : "";
  const record = {
    test: testInfo.title,
    status: testInfo.status,
    expectedStatus: testInfo.expectedStatus,
    localOrigin,
    serviceWorkers: "blocked",
    guardActive: offlineNetworkAudit.guardActive,
    localHttpRequestCount: offlineNetworkAudit.localRequestCount,
    localRequestPaths: offlineNetworkAudit.localRequestPaths,
    externalHttpAttempts: offlineNetworkAudit.externalHttpAttempts,
  };
  writeFileSync(
    testInfo.outputPath(`network-audit-${testSlug}${retrySuffix}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
  expect(record.guardActive, "offline request guard was not activated").toBe(true);
  expect(record.localHttpRequestCount, "test did not contact the local production origin").toBeGreaterThan(0);
  expect(record.externalHttpAttempts, "browser attempted external HTTP(S) requests").toEqual([]);
});

async function captureEvidence(page: Page, name: string, testInfo: TestInfo): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
    animations: "disabled",
  });
}

async function importObservation(
  page: Page,
  sourcePath: string,
  policy: "none" | typeof correctedPolicy,
): Promise<ImportReport> {
  await page.getByRole("tab", { name: "Datos observados" }).click();
  await page.locator("#observation-file").setInputFiles(sourcePath);
  await page.locator("#correction-policy").selectOption(policy);
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/observations/import")
      && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Importar y revisar" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page.locator("#audit-title")).toBeVisible();
  return await response.json() as ImportReport;
}

async function runVisibleScenario(page: Page): Promise<RunResult> {
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
  return await response.json() as RunResult;
}

async function seekReplay(page: Page, timeS: number): Promise<void> {
  await page.locator("#replay-slider").evaluate((element, time) => {
    const slider = element as HTMLInputElement;
    slider.value = String(time);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }, timeS);
  await expect(page.locator("#replay-slider")).toHaveValue(String(timeS));
}

function canonicalScientificValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalScientificValue);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      normalized[key] = canonicalScientificValue(record[key]);
    }
    return normalized;
  }
  return value;
}

function scientificHash(result: unknown): { value: unknown; hash: string } {
  const value = canonicalScientificValue(result);
  const serialized = JSON.stringify(value);
  return {
    value,
    hash: createHash("sha256").update(serialized, "utf8").digest("hex"),
  };
}

type ReproducibilityReference = {
  reference_version: number;
  sha256: string;
  excluded_wall_clock_metadata: string[];
  scientific_result: RunResult;
};

function loadReference(path: string): ReproducibilityReference {
  return JSON.parse(readFileSync(path, "utf8")) as ReproducibilityReference;
}

function currentScientificResultFromHistorical(reference: RunResult, current: RunResult): RunResult {
  const expected = structuredClone(reference);
  const transferAssumption = "Los pagos por transferencia no añaden espera de confirmación.";
  const excludedConfirmationAssumption = "External transfer confirmation time is excluded from app executions.";
  for (const assumptions of [expected.assumptions, expected.scenario.assumptions]) {
    assumptions.splice(4, 0, transferAssumption);
    assumptions.push(excludedConfirmationAssumption);
  }

  expect(current.demand_tape).toHaveLength(expected.demand_tape.length);
  expected.demand_tape = expected.demand_tape.map((demand, index) => {
    const currentDemand = current.demand_tape[index]!;
    const { payment_method: _paymentMethod, ...currentWithoutPaymentMethod } = currentDemand;
    expect(currentWithoutPaymentMethod).toEqual(demand);
    return { ...demand, payment_method: currentDemand.payment_method };
  });
  expected.scenario.transfer_confirmation = { kind: "constant", value_s: 0 };
  const paymentSecondsFromDemandTape = expected.demand_tape.reduce(
    (sum, demand) => sum + demand.payment_active_s,
    0,
  );

  for (const pool of ["cashier", "preparer", "integrated"] as const) {
    const components = expected.metrics.resource_usage.filter(
      (usage) => usage.pool === pool && usage.component !== "total",
    );
    const total = expected.metrics.resource_usage.find(
      (usage) => usage.pool === pool && usage.component === "total",
    );
    expect(components.length).toBeGreaterThan(0);
    expect(total).toBeDefined();
    total!.active_worker_s = components.reduce((sum, usage) => sum + usage.active_worker_s, 0);
    total!.reserved_worker_s = components.reduce((sum, usage) => sum + usage.reserved_worker_s, 0);
    if (pool === "cashier") {
      expect(total!.active_worker_s).toBeCloseTo(paymentSecondsFromDemandTape, 12);
    }
    if (total!.available_worker_s > 0) {
      total!.active_fraction = total!.active_worker_s / total!.available_worker_s;
      total!.reserved_fraction = total!.reserved_worker_s / total!.available_worker_s;
      for (const [measure, value] of [
        ["active_fraction", total!.active_fraction],
        ["reserved_fraction", total!.reserved_fraction],
      ] as const) {
        const metricId = `resource.${pool}.total.${measure}`;
        const metric = expected.metrics.metric_summaries.find((summary) => summary.metric_id === metricId);
        expect(metric, `missing expected resource summary ${metricId}`).toBeDefined();
        metric!.value = value;
      }
    }
  }

  return expected;
}

function verifyReproducibilityReference(result: RunResult): string {
  const historical = loadReference(historicalReferencePath);
  const currentReference = loadReference(currentReferencePath);
  expect(historical.reference_version).toBe(1);
  expect(historical.excluded_wall_clock_metadata).toEqual([]);
  const historicalHash = scientificHash(historical.scientific_result).hash;
  expect(historical.sha256).toBe(historicalHash);
  expect(historicalHash)
    .toBe("62a4384e6e889698a5a62e6b63869a75efcf43bf125bc943c22cd3082a746c47");

  expect(currentReference.reference_version).toBe(2);
  expect(currentReference.excluded_wall_clock_metadata).toEqual([]);
  const currentReferenceHash = scientificHash(currentReference.scientific_result).hash;
  expect(currentReference.sha256).toBe(currentReferenceHash);
  expect(currentReferenceHash)
    .toBe("0a5cf9339fff5eb2dd463c4a9865f10ad7336cc0b74cb3e4c382d76aaa7e730b");
  expect(currentReference.scientific_result).toEqual(
    currentScientificResultFromHistorical(historical.scientific_result, currentReference.scientific_result),
  );

  const current = scientificHash(result);
  expect(current.hash).toBe(currentReference.sha256);
  expect(current.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(current.value).toEqual(currentReference.scientific_result);
  return current.hash;
}

test("imports original and corrected sources with their policies and exposes the known overlap", async ({ page }, testInfo) => {
  await page.goto("/");

  const originalUncorrected = await importObservation(page, originalSource, "none");
  expect(originalUncorrected.policy_status).toBe("none");
  expect(originalUncorrected.raw_rows).toHaveLength(120);
  expect(originalUncorrected.normalized_rows).toHaveLength(120);
  expect(originalUncorrected.station_summaries.map((summary) => [summary.station, summary.row_count]))
    .toEqual(expect.arrayContaining([["caja", 61], ["entrega", 59]]));

  const originalCorrected = await importObservation(page, originalSource, correctedPolicy);
  expect(originalCorrected.policy_status).toBe("applied");
  expect(originalCorrected.raw_rows).toHaveLength(120);
  expect(originalCorrected.normalized_rows).toHaveLength(119);
  expect(originalCorrected.excluded_rows).toHaveLength(1);
  const correctedCashier = originalCorrected.normalized_rows.find((row) =>
    row.station === "caja" && row.local_id === "35",
  );
  expect(correctedCashier?.end_time).toBe("17:46:20");
  const delivery = originalCorrected.station_summaries.find((summary) => summary.station === "entrega");
  const overlap = delivery?.concurrency.overlap_points.find((point) => point.at === "17:00:10");
  expect(overlap?.concurrent_count).toBe(6);
  expect(overlap?.row_keys.map((key) => key.slice(key.lastIndexOf("|") + 1)).sort())
    .toEqual(["10", "11", "6", "7", "8", "9"]);
  await expect(page.getByText(/6 intervalos de entrega coinciden/)).toBeVisible();
  await expect(page.getByText(/se reportaron 4 preparadores/)).toBeVisible();
  await captureEvidence(page, "observation-original-corrected-overlap", testInfo);

  const correctedReference = await importObservation(page, correctedSource, correctedPolicy);
  expect(correctedReference.policy_status).toBe("already_reflected");
  expect(correctedReference.raw_rows).toHaveLength(119);
  expect(correctedReference.normalized_rows).toHaveLength(119);
  expect(correctedReference.excluded_rows).toHaveLength(0);
  expect(correctedReference.corrections).toHaveLength(2);
  expect(correctedReference.corrections.every((correction) => correction.status === "already_reflected"))
    .toBe(true);
  await expect(page.getByText(/La fuente corregida ya contiene los cambios aprobados/)).toBeVisible();
  await expect(page.getByText(/se reportaron 4 preparadores/)).toBeVisible();
  await captureEvidence(page, "observation-corrected-reference", testInfo);
});

test("runs the installed demonstration in Tuesday and regular modes", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await openAdvancedOptions(page);
  await expect(page.locator("#scenario-id")).toHaveValue("synthetic-demo-tuesday");
  await page.locator("#closing-time").fill("15:30:00");
  await page.locator("#root-seed").fill("20261020");

  const tuesday = await runVisibleScenario(page);
  expect(tuesday.scenario.engine_config.mode).toBe("tuesday");
  expect(tuesday.scenario.engine_config.cashiers).toBe(1);
  expect(tuesday.scenario.engine_config.preparers).toBe(4);
  await captureEvidence(page, "demo-tuesday-run", testInfo);

  await page.getByRole("tab", { name: "Escenarios" }).click();
  await page.locator('[data-mode="regular"]').check();
  const regular = await runVisibleScenario(page);
  expect(regular.scenario.engine_config.mode).toBe("regular");
  expect(regular.scenario.engine_config.integrated_workers).toBe(1);
  expect(regular.scenario.interarrival).toEqual(tuesday.scenario.interarrival);
  expect(regular.scenario.group_sizes).toEqual(tuesday.scenario.group_sizes);
  await captureEvidence(page, "demo-regular-run", testInfo);
});

test("compares 30 matched staffing replications, selects one indexed run, and downloads CSV", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await openAdvancedOptions(page);
  await expect(page.locator("#scenario-id")).toHaveValue("synthetic-demo-tuesday");
  await page.locator("#closing-time").fill("15:30:00");
  await page.locator("#root-seed").fill("20261020");
  await page.locator("#replications").fill("30");
  await openComparisonOptions(page);
  await page.getByRole("button", { name: "Copiar referencia como candidato" }).click();
  await openAdvancedOptions(page);
  await page.locator("#scenario-id").fill("candidate-staffing-five");
  await page.locator("#scenario-name").fill("Cinco preparadores");
  await page.locator("#preparers").fill("5");

  const experimentPromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/experiments")
      && response.request().method() === "POST",
    { timeout: 8_000 },
  );
  await page.getByRole("button", { name: "Comparar escenarios" }).click();
  const experimentResponse = await experimentPromise;
  expect(experimentResponse.status()).toBe(200);
  const experiment = await experimentResponse.json() as ExperimentResult;
  expect(experiment.root_seed).toBe(20261020);
  expect(experiment.n_requested).toBe(30);
  expect(experiment.n_valid).toBe(30);
  expect(experiment.scenarios.map((scenario) => scenario.scenario_id))
    .toEqual(["synthetic-demo-tuesday", "candidate-staffing-five"]);
  expect(experiment.scenarios[0]?.engine_config.preparers).toBe(4);
  expect(experiment.scenarios[1]?.engine_config.preparers).toBe(5);
  expect(experiment.replication_results).toHaveLength(60);
  for (const scenarioId of ["synthetic-demo-tuesday", "candidate-staffing-five"]) {
    const records = experiment.replication_results.filter((record) => record.scenario_id === scenarioId);
    expect(records.every((record) => record.status === "complete")).toBe(true);
    expect(records.map((record) => record.replication_index).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 30 }, (_, index) => index));
  }
  const paired = experiment.comparisons.filter((comparison) =>
    comparison.reference_scenario_id === "synthetic-demo-tuesday"
      && comparison.candidate_scenario_id === "candidate-staffing-five",
  );
  expect(paired.length).toBeGreaterThan(0);
  expect(paired.every((comparison) => comparison.demand_matched)).toBe(true);
  expect(paired.every((comparison) => comparison.demand_tapes_identical === true)).toBe(true);
  expect(paired.every((comparison) => comparison.replication_differences.length === 30)).toBe(true);
  await expect(page.getByRole("heading", { name: "Resumen de escenarios" })).toBeVisible();
  await captureEvidence(page, "paired-staffing-30-replications", testInfo);

  await page.locator("#selected-scenario").selectOption("candidate-staffing-five");
  await page.locator("#selected-replication").selectOption("0");
  const selectedRunPromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Inspeccionar esta réplica" }).click();
  const selectedResponse = await selectedRunPromise;
  expect(selectedResponse.status()).toBe(200);
  const selectedRun = await selectedResponse.json() as RunResult;
  expect(selectedRun.scenario.scenario_id).toBe("candidate-staffing-five");
  expect(selectedRun.root_seed).toBe(experiment.root_seed);
  expect(selectedRun.replication_index).toBe(0);
  const stored = experiment.replication_results.find((record) =>
    record.scenario_id === selectedRun.scenario.scenario_id
      && record.replication_index === selectedRun.replication_index,
  );
  expect(selectedRun.metrics).toEqual(stored?.metrics);
  await expect(page.getByText("Réplica 0 · candidate-staffing-five", { exact: true })).toBeVisible();
  await expect(page.locator("#replay-stage")).toHaveAttribute("data-state", "available");
  await captureEvidence(page, "indexed-replication-replay", testInfo);

  const csvResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/exports/csv") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Preparar CSV de réplica seleccionada" }).click();
  const csvResponse = await csvResponsePromise;
  expect(csvResponse.status()).toBe(200);
  expect(csvResponse.request().postDataJSON().result.scenario.scenario_id)
    .toBe("candidate-staffing-five");
  await expect(page.getByRole("heading", { name: "Tablas de la réplica seleccionada" })).toBeVisible();
  const csvLink = page.locator('a[download$=".csv"]').first();
  await expect(csvLink).toBeVisible();
  const csvDownloadPromise = page.waitForEvent("download");
  await csvLink.click();
  const csvDownload = await csvDownloadPromise;
  expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/);
  const csvPath = testInfo.outputPath("selected-replication.csv");
  await csvDownload.saveAs(csvPath);
  const csvText = readFileSync(csvPath, "utf8");
  expect(csvText).toContain("scenario_id");
  expect(csvText).toContain("candidate-staffing-five");
});

test("commits a preparer increase on the first run click and exposes the new worker", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await openAdvancedOptions(page);
  await expect(page.locator("#scenario-id")).toHaveValue("synthetic-demo-tuesday");
  await page.locator("#closing-time").fill("15:02:00");
  await page.getByRole("button", { name: "Añadir orden inicial" }).click();
  await page.locator('[data-initial-stage="0"]').selectOption("preparing");
  await page.locator("#initial-0-id").fill("initial-preparing-capacity-check");
  await page.locator("#initial-0-people").fill("person-initial-capacity");
  await page.locator("#initial-0-worker").selectOption("preparer-1");
  await page.locator("#initial-0-remaining").fill("15");
  await expect(page.locator('#initial-0-worker option[value="preparer-5"]')).toHaveCount(0);

  await page.locator("#preparers").fill("5");
  const runPromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/runs")
      && response.request().method() === "POST",
    { timeout: 8_000 },
  );
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  const runResponse = await runPromise;
  expect(runResponse.status()).toBe(200);
  const run = await runResponse.json() as RunResult;
  expect(run.scenario.engine_config.preparers).toBe(5);
  expect(run.initial_state[0]).toMatchObject({
    order_id: "initial-preparing-capacity-check",
    stage: "preparing",
    worker_id: "preparer-1",
    remaining_s: 15,
  });

  await page.getByRole("tab", { name: "Escenarios" }).click();
  const workerSelect = page.locator("#initial-0-worker");
  await expect(workerSelect.locator('option[value="preparer-5"]')).toHaveCount(1);
  await expect(workerSelect).toHaveValue("preparer-1");
  await workerSelect.selectOption("preparer-5");
  await expect(workerSelect).toHaveValue("preparer-5");
  await captureEvidence(page, "initial-preparer-capacity-update", testInfo);
});

test("exports and reopens JSON and matches the full scientific SHA-256 reference", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await openAdvancedOptions(page);
  await expect(page.locator("#scenario-id")).toHaveValue("synthetic-demo-tuesday");
  await page.locator("#closing-time").fill("15:20:00");
  await page.locator("#root-seed").fill("424242");
  let runRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/runs") && request.method() === "POST") runRequests += 1;
  });
  const firstRun = await runVisibleScenario(page);

  const runDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar resultado JSON" }).click();
  const runDownload = await runDownloadPromise;
  expect(runDownload.suggestedFilename()).toMatch(/\.json$/);
  const downloadedRunPath = testInfo.outputPath("run-export.json");
  await runDownload.saveAs(downloadedRunPath);
  const downloadedRun = JSON.parse(readFileSync(downloadedRunPath, "utf8")) as RunResult;
  expect(downloadedRun).toEqual(firstRun);
  const referenceHash = verifyReproducibilityReference(downloadedRun);
  expect(referenceHash).toMatch(/^[a-f0-9]{64}$/);
  expect(downloadedRun.trace.events.some((event) => event.time_s > 0)).toBe(true);

  const validationPromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/files/validate") && response.request().method() === "POST",
  );
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await page.locator("#saved-json-file").setInputFiles(downloadedRunPath);
  expect((await validationPromise).status()).toBe(200);
  await expect(page.getByRole("tab", { name: "Resultados" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
  expect(runRequests).toBe(1);
  await captureEvidence(page, "json-reopened-result", testInfo);

  await page.getByRole("tab", { name: "Escenarios" }).click();
  await openAdvancedOptions(page);
  await expect(page.locator("#scenario-id")).toHaveValue("synthetic-demo-tuesday");
  await expect(page.locator("#root-seed")).toHaveValue("424242");
  const repeatedRun = await runVisibleScenario(page);
  const repeatedHash = scientificHash(repeatedRun);
  expect(repeatedHash.hash).toBe(referenceHash);
  expect(repeatedHash.value).toEqual(scientificHash(downloadedRun).value);
});

test("inspects 3D stages, playback, camera controls, and repeated replay mounts", async ({ page }, testInfo) => {
  const prepareMotionDemo = async (navigate = true): Promise<void> => {
    if (navigate) await page.goto("/");
    await page.getByRole("tab", { name: "Escenarios" }).click();
    await openAdvancedOptions(page);
    await expect(page.locator("#scenario-id")).toHaveValue("synthetic-demo-tuesday");
    await page.locator("#closing-time").fill("15:02:00");
    await page.locator("#root-seed").fill("20261020");
    await expect(page.locator('[data-distribution-row="transfer_confirmation"]')).toHaveCount(0);

    const constantFields: Array<[string, string]> = [
      ["interarrival", "20"],
      ["payment_active", "30"],
      ["preparation", "10"],
    ];
    for (const [key, value] of constantFields) {
      await page.locator(`#dist-${key}-kind`).selectOption("constant");
      await page.locator(`[data-distribution-field="${key}.value_s"]`).fill(value);
    }
    await page.locator("#transfer-probability").fill("1");
    await page.locator("#patience-enabled").check();
    await page.locator("#dist-patience-kind").selectOption("constant");
    await page.locator('[data-distribution-field="patience.value_s"]').fill("5");
  };

  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  const historicalTransferRun = resolve(
    projectRoot,
    "web/tests/fixtures/replay/legacy-transfer-regular-run.json",
  );
  await page.locator("#saved-json-file").setInputFiles(historicalTransferRun);
  await expect(page.getByRole("tab", { name: "Resultados" })).toHaveAttribute("aria-selected", "true");
  await seekReplay(page, 1.3);
  await expect(page.locator("#replay-scene-summary")).toContainText("1 órdenes con confirmación pendiente");
  await expect(page.locator("#replay-scene-summary")).toContainText("1 reservados");
  await captureEvidence(page, "legacy-transfer-confirmation", testInfo);

  await prepareMotionDemo();
  const run = await runVisibleScenario(page);
  expect(run.demand_tape.length).toBeGreaterThan(0);
  expect(run.demand_tape.every((demand) => demand.payment_method === "transfer")).toBe(true);
  expect(run.demand_tape.every((demand) => demand.transfer_wait_s === 0)).toBe(true);
  const events = run.trace.events;
  const paymentStarted = events.find((event) => event.type === "payment_started");
  expect(paymentStarted).toBeDefined();
  const activeEnded = events.find((event) =>
    event.type === "payment_active_ended" && event.order_id === paymentStarted?.order_id,
  );
  const paymentCompleted = events.find((event) =>
    event.type === "payment_completed" && event.order_id === paymentStarted?.order_id,
  );
  const preparationStarted = events.find((event) =>
    event.type === "preparation_started" && event.order_id === paymentStarted?.order_id,
  );
  expect(activeEnded).toBeDefined();
  expect(paymentCompleted).toBeDefined();
  expect(preparationStarted).toBeDefined();
  expect(paymentCompleted!.time_s).toBe(activeEnded!.time_s);
  const firstOrderDelivered = events.find((event) =>
    event.type === "order_delivered" && event.order_id === paymentStarted?.order_id,
  );
  expect(firstOrderDelivered).toBeDefined();
  const abandonment = events.find((event) => event.type === "order_abandoned");
  expect(abandonment).toBeDefined();
  expect(events.some((event) => event.type === "order_delivered")).toBe(true);

  const stage = page.locator("#replay-stage");
  await expect(stage).toHaveAttribute("data-state", "available");
  await expect(page.locator("#replay-canvas")).toBeVisible();
  await page.locator('[data-replay-speed]').selectOption("60");
  await page.getByRole("button", { name: "Acercar cámara" }).click();
  await page.getByRole("button", { name: "Alejar cámara" }).click();
  await page.getByRole("button", { name: "Restablecer cámara" }).click();

  await seekReplay(page, paymentStarted!.time_s + 1);
  const activeWorkers = Number((await page.locator("#replay-scene-summary").textContent())
    ?.match(/(\d+) trabajadores activos/)?.[1] ?? 0);
  expect(activeWorkers).toBeGreaterThan(0);
  await expect(page.locator("#replay-event-detail")).toContainText("Inicio del pago");
  await captureEvidence(page, "replay-payment-active", testInfo);

  await seekReplay(page, paymentCompleted!.time_s + 1);
  await expect(page.locator("#replay-scene-summary")).not.toContainText("confirmación pendiente");
  await expect(page.locator("#replay-event-detail")).toContainText("Inicio de preparación");
  await captureEvidence(page, "replay-transfer-no-confirmation-wait", testInfo);

  const preparationTime = (preparationStarted!.time_s + firstOrderDelivered!.time_s) / 2;
  await seekReplay(page, preparationTime);
  const preparingOrders = Number((await page.locator("#replay-scene-summary").textContent())
    ?.match(/(\d+) órdenes en preparación/)?.[1] ?? 0);
  expect(preparingOrders).toBeGreaterThan(0);
  await expect(page.locator("#replay-event-detail")).toContainText("Inicio de preparación");
  await captureEvidence(page, "replay-preparation", testInfo);

  const abandonmentIndex = events.findIndex((event, index) =>
    event.type === "order_abandoned" && events[index + 1]?.time_s !== event.time_s,
  );
  expect(abandonmentIndex).toBeGreaterThanOrEqual(0);
  const abandonmentBoundary = events[abandonmentIndex]!;
  const nextAfterAbandonment = events[abandonmentIndex + 1];
  const abandonmentTime = nextAfterAbandonment
    ? (abandonmentBoundary.time_s + nextAfterAbandonment.time_s) / 2
    : abandonmentBoundary.time_s;
  await seekReplay(page, abandonmentTime);
  await expect(page.locator("#replay-event-detail")).toContainText("Retiro de la fila");
  await captureEvidence(page, "replay-abandonment", testInfo);

  await seekReplay(page, 0);
  const slider = page.locator("#replay-slider");
  const timeBeforePlayback = Number(await slider.inputValue());
  await page.getByRole("button", { name: "Reproducir" }).click();
  await expect(page.getByRole("button", { name: "Pausar" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => Number(await slider.inputValue()), { timeout: 5_000 })
    .toBeGreaterThan(timeBeforePlayback);
  await page.getByRole("button", { name: "Pausar" }).click();
  await expect(page.getByRole("button", { name: "Reproducir" })).toHaveAttribute("aria-pressed", "false");
  await captureEvidence(page, "replay-motion-playing", testInfo);
  await page.getByRole("button", { name: "Volver al inicio" }).click();
  await expect(slider).toHaveValue("0");

  await page.getByRole("tab", { name: "Escenarios" }).click();
  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(stage).toHaveAttribute("data-state", "available");
  await expect(page.locator("#replay-canvas")).toHaveCount(1);
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(stage).toHaveAttribute("data-state", "available");
  await expect(page.locator("#replay-canvas")).toHaveCount(1);
  await captureEvidence(page, "replay-repeated-mounts", testInfo);

  await page.reload();
  await prepareMotionDemo(false);
  await runVisibleScenario(page);
  await expect(page.locator("#replay-stage")).toHaveAttribute("data-state", "available");
  await expect(page.locator("#replay-canvas")).toBeVisible();
  await captureEvidence(page, "replay-after-page-reload", testInfo);
});
