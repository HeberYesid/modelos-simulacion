import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Scenario } from "../src/api/types";

const demoScenarioFixture = JSON.parse(readFileSync(fileURLToPath(new URL("../contracts/fixtures/demo-scenario.json", import.meta.url)), "utf8")) as Scenario;
const workLimits = JSON.parse(readFileSync(fileURLToPath(new URL("../contracts/work-limits.json", import.meta.url)), "utf8")) as { max_workers_per_pool: number; max_experiment_work_units: number };

function workloadScenario(): Scenario {
  const scenario = structuredClone(demoScenarioFixture) as unknown as Scenario;
  scenario.scenario_id = "execution-cancellation-load";
  scenario.display_name = "Carga sintética para cancelar";
  scenario.provenance = "user_assumptions";
  scenario.engine_config.mode = "tuesday";
  scenario.engine_config.cashiers = 1;
  scenario.engine_config.preparers = 1;
  scenario.engine_config.integrated_workers = 0;
  scenario.initial_state = [];
  scenario.group_sizes = [{ size: 1, probability: 1 }];
  scenario.interarrival = {
    kind: "constant",
    value_s: scenario.engine_config.horizon_s / (Math.floor(Math.sqrt(workLimits.max_experiment_work_units * 0.99)) + 0.5),
  };
  scenario.payment_active = { kind: "constant", value_s: 1 };
  scenario.preparation = { kind: "constant", value_s: 1 };
  scenario.transfer_probability = 0;
  scenario.transfer_confirmation = { kind: "constant", value_s: 0 };
  scenario.patience = null;
  return scenario;
}

function isRunRequest(request: { url(): string; method(): string }): boolean {
  return request.method() === "POST" && request.url().endsWith("/api/v1/runs");
}

test("oversized staffing stays editable and safe across a view change", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="scenario"]').click();
  await expect(page.locator("#scenario-form")).toBeVisible();

  await page.locator('[data-mode="regular"]').check();
  const advanced = page.locator("details[data-advanced-options]");
  if (!(await advanced.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await advanced.locator("summary").click();
  }
  await page.locator("[data-add-initial]").click();
  await page.locator("#initial-0-stage").selectOption("preparing");
  await page.locator("#integrated-workers").fill("4294967296");
  await page.locator("#integrated-workers").blur();

  const workerOptions = page.locator('[data-initial-field="0.worker_id"] option');
  await expect(page.locator("#integrated-workers")).toHaveValue("4294967296");
  await expect(page.locator("#integrated-workers")).toHaveAttribute("max", String(workLimits.max_workers_per_pool));
  await expect(page.locator("#integrated-workers")).toHaveAttribute("aria-invalid", "true");
  await expect(workerOptions).toHaveCount(1);

  await page.locator('[data-view="observations"]').click();
  await page.locator('[data-view="scenario"]').click();
  await expect(page.locator("#integrated-workers")).toHaveValue("4294967296");
  await expect(page.locator('[data-initial-field="0.worker_id"] option')).toHaveCount(1);
});

test("cancellation uses the server request, remains available across views, and releases the next run", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="scenario"]').click();
  await expect(page.locator("#scenario-form")).toBeVisible();

  const baselineResponse = page.waitForResponse((response) => isRunRequest(response.request()));
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  expect((await baselineResponse).status()).toBe(200);
  await expect(page.locator("#run-metrics-title")).toBeVisible();

  await page.locator('[data-view="scenario"]').click();
  const advanced = page.locator("details[data-advanced-options]");
  if (!(await advanced.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await advanced.locator("summary").click();
  }
  const scenario = workloadScenario();
  await page.locator("#saved-json-file").setInputFiles({
    name: "carga-cancelable.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(scenario)),
  });
  await expect(page.locator("#scenario-id")).toHaveValue(scenario.scenario_id);
  await expect(page.locator('#dist-interarrival-value')).toBeVisible();

  const runRequestPromise = page.waitForRequest(isRunRequest);
  const runResponsePromise = page.waitForResponse((response) => isRunRequest(response.request()));
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  const runRequest = await runRequestPromise;
  const executionId = runRequest.headers()["x-boquitas-execution-id"];
  expect(executionId).toMatch(/^[0-9a-f-]{36}$/i);

  await page.locator('[data-view="observations"]').click();
  const cancelButton = page.getByRole("button", { name: "Cancelar ejecución" });
  await expect(cancelButton).toBeVisible();
  const cancelResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST"
      && response.url().endsWith(`/api/v1/executions/${executionId}/cancel`),
  );
  await cancelButton.click();
  const cancelResponse = await cancelResponsePromise;
  expect(cancelResponse.status()).toBe(202);
  expect(await cancelResponse.json()).toEqual({ status: "cancel_requested" });

  const cancelledRun = await runResponsePromise;
  expect(cancelledRun.status()).toBe(409);
  expect((await cancelledRun.json()).code).toBe("execution_cancelled");
  await expect(page.locator("[data-cancel-execution]")).toHaveCount(0);

  await page.locator('[data-view="results"]').click();
  await expect(page.locator("#run-metrics-title")).toBeVisible();
  await expect(page.getByRole("heading", { name: "La solicitud no terminó" })).toBeVisible();

  await page.locator('[data-view="scenario"]').click();
  await expect(page.locator("#scenario-id")).toHaveValue(scenario.scenario_id);
  await expect(page.locator("#dist-interarrival-value")).toHaveValue(scenario.interarrival.kind === "constant" ? String(scenario.interarrival.value_s) : "");
  await page.locator("#dist-interarrival-value").fill(String(scenario.engine_config.horizon_s));

  const nextRunRequestPromise = page.waitForRequest(isRunRequest);
  const nextRunResponse = page.waitForResponse((response) => isRunRequest(response.request()));
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  const nextRequest = await nextRunRequestPromise;
  expect(nextRequest.headers()["x-boquitas-execution-id"]).not.toBe(executionId);
  expect((await nextRunResponse).status()).toBe(200);
});

test("cancelling a comparison stops the batch and preserves the previous result", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="scenario"]').click();
  const baseline = page.waitForResponse((response) => isRunRequest(response.request()));
  await page.getByRole("button", { name: "Ejecutar una réplica" }).click();
  expect((await baseline).status()).toBe(200);
  await expect(page.locator("#run-metrics-title")).toBeVisible();

  await page.locator('[data-view="scenario"]').click();
  await page.locator("#saved-json-file").setInputFiles({
    name: "comparacion-cancelable.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(workloadScenario())),
  });
  await expect(page.locator("#scenario-id")).toHaveValue("execution-cancellation-load");
  const comparison = page.locator("details[data-comparison-options]");
  if (!(await comparison.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await comparison.locator("summary").click();
  }
  await page.locator("[data-add-candidate]").click();
  const requestPromise = page.waitForRequest((request) => request.method() === "POST" && request.url().endsWith("/api/v1/experiments"));
  const responsePromise = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v1/experiments"));
  await page.getByRole("button", { name: "Comparar escenarios", exact: true }).click();
  const request = await requestPromise;
  const executionId = request.headers()["x-boquitas-execution-id"];
  expect(executionId).toMatch(/^[0-9a-f-]{36}$/i);
  const cancelPromise = page.waitForResponse((response) => response.url().endsWith(`/api/v1/executions/${executionId}/cancel`));
  await page.getByRole("button", { name: "Cancelar ejecución", exact: true }).click();
  expect((await cancelPromise).status()).toBe(202);
  const response = await responsePromise;
  expect(response.status()).toBe(409);
  expect((await response.json()).code).toBe("execution_cancelled");
  await expect(page.locator("[data-cancel-execution]")).toHaveCount(0);
  await page.locator('[data-view="results"]').click();
  await expect(page.locator("#run-metrics-title")).toBeVisible();
  await expect(page.getByRole("heading", { name: "La solicitud no terminó" })).toBeVisible();
});
