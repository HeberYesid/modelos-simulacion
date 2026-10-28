import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { ExperimentResult } from "../src/api/types";

test("downloads and reopens the full-day comparison byte-for-byte", async ({ page }, testInfo) => {
  let experimentPosts = 0;
  let runPosts = 0;
  page.on("request", (request) => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/experiments") experimentPosts += 1;
    if (path === "/api/v1/runs") runPosts += 1;
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios" }).click();
  await expect(page.locator("#scenario-id")).toHaveValue("synthetic-demo-tuesday");
  await expect(page.locator("#closing-time")).toHaveValue("21:30:00");
  await page.locator("#replications").fill("30");
  await page.getByRole("button", { name: "Copiar referencia como candidato" }).click();
  await page.locator("#scenario-id").fill("candidate-two-preparers");
  await page.locator("#scenario-name").fill("Dos preparadores");
  await page.locator("#preparers").fill("2");

  const experimentResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/experiments")
      && response.request().method() === "POST",
    { timeout: 180_000 },
  );
  await page.getByRole("button", { name: "Comparar escenarios" }).click();
  const experimentResponse = await experimentResponsePromise;
  expect(experimentResponse.status()).toBe(200);
  const experimentBytes = await experimentResponse.body();
  expect(experimentBytes.byteLength).toBeGreaterThan(10 * 1024 * 1024);
  const experiment = JSON.parse(experimentBytes.toString("utf8")) as ExperimentResult;

  expect(experiment.status).toBe("complete");
  expect(experiment.root_seed).toBe(20261020);
  expect(experiment.n_requested).toBe(30);
  expect(experiment.n_valid).toBe(30);
  expect(experiment.scenarios.map((scenario) => scenario.scenario_id))
    .toEqual(["synthetic-demo-tuesday", "candidate-two-preparers"]);
  expect(experiment.scenarios[0]?.engine_config.opening_time).toBe("15:00:00");
  expect(experiment.scenarios[0]?.engine_config.horizon_s).toBe(23_400);
  expect(experiment.scenarios[0]?.engine_config.preparers).toBe(4);
  expect(experiment.scenarios[1]?.engine_config.horizon_s).toBe(23_400);
  expect(experiment.scenarios[1]?.engine_config.preparers).toBe(2);
  expect(experiment.replication_results).toHaveLength(60);
  expect(experiment.replication_results.every((record) => record.status === "complete")).toBe(true);
  for (const scenarioId of ["synthetic-demo-tuesday", "candidate-two-preparers"]) {
    const records = experiment.replication_results.filter((record) => record.scenario_id === scenarioId);
    expect(records.map((record) => record.replication_index).sort((first, second) => first - second))
      .toEqual(Array.from({ length: 30 }, (_, index) => index));
  }
  expect(experiment.aggregate_estimates.length).toBeGreaterThan(0);
  expect(experiment.comparisons.length).toBeGreaterThan(0);
  expect(experimentPosts).toBe(1);
  expect(runPosts).toBe(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar experimento JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const downloadedPath = testInfo.outputPath("full-day-comparison.json");
  await download.saveAs(downloadedPath);
  const downloadedBytes = readFileSync(downloadedPath);
  expect(downloadedBytes.byteLength).toBeGreaterThan(10 * 1024 * 1024);
  expect(downloadedBytes.equals(experimentBytes)).toBe(true);

  await page.reload();
  await page.getByRole("tab", { name: "Escenarios" }).click();
  const reopenResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/files/validate")
      && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#saved-json-file").setInputFiles(downloadedPath);
  const reopenResponse = await reopenResponsePromise;
  expect(reopenResponse.status()).toBe(200);
  const reopened = await reopenResponse.json() as { kind: string; value: ExperimentResult };
  expect(reopened.kind).toBe("experiment");
  expect(reopened.value).toEqual(experiment);
  expect(reopened.value.replication_results).toHaveLength(60);
  expect(reopened.value.scenarios.map((scenario) => scenario.engine_config.preparers)).toEqual([4, 2]);
  expect(experimentPosts).toBe(1);
  expect(runPosts).toBe(0);
  await expect(page.getByRole("heading", { name: "2 escenarios guardados", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resumen de escenarios" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("large-result-reopened.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.screenshot({
    path: testInfo.outputPath("large-result-reopened-viewport.png"),
    animations: "disabled",
  });

  await page.getByRole("tab", { name: "Escenarios" }).click();
  const invalidResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/files/validate")
      && response.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page.locator("#saved-json-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  expect((await invalidResponsePromise).status()).toBe(422);
  await page.getByRole("tab", { name: "Resultados" }).click();
  await expect(page.getByRole("heading", { name: "2 escenarios guardados", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resumen de escenarios" })).toBeVisible();
  expect(experimentPosts).toBe(1);
  expect(runPosts).toBe(0);
});
