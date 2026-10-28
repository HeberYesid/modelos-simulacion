# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: large-result-roundtrip.spec.ts >> downloads and reopens the full-day comparison byte-for-byte
- Location: e2e-audit\large-result-roundtrip.spec.ts:5:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:8011/
Call log:
  - navigating to "http://127.0.0.1:8011/", waiting until "load"

```

# Test source

```ts
  1   | import { readFileSync } from "node:fs";
  2   | import { expect, test } from "@playwright/test";
  3   | import type { ExperimentResult } from "../src/api/types";
  4   | 
  5   | test("downloads and reopens the full-day comparison byte-for-byte", async ({ page }, testInfo) => {
  6   |   let experimentPosts = 0;
  7   |   let runPosts = 0;
  8   |   page.on("request", (request) => {
  9   |     if (request.method() !== "POST") return;
  10  |     const path = new URL(request.url()).pathname;
  11  |     if (path === "/api/v1/experiments") experimentPosts += 1;
  12  |     if (path === "/api/v1/runs") runPosts += 1;
  13  |   });
  14  | 
> 15  |   await page.goto("/");
      |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:8011/
  16  |   await page.getByRole("tab", { name: "Escenarios" }).click();
  17  |   await expect(page.locator("#scenario-id")).toHaveValue("synthetic-demo-tuesday");
  18  |   await expect(page.locator("#closing-time")).toHaveValue("21:30:00");
  19  |   await page.locator("#replications").fill("30");
  20  |   await page.getByRole("button", { name: "Copiar referencia como candidato" }).click();
  21  |   await page.locator("#scenario-id").fill("candidate-two-preparers");
  22  |   await page.locator("#scenario-name").fill("Dos preparadores");
  23  |   await page.locator("#preparers").fill("2");
  24  | 
  25  |   const experimentResponsePromise = page.waitForResponse(
  26  |     (response) => response.url().endsWith("/api/v1/experiments")
  27  |       && response.request().method() === "POST",
  28  |     { timeout: 180_000 },
  29  |   );
  30  |   await page.getByRole("button", { name: "Comparar escenarios" }).click();
  31  |   const experimentResponse = await experimentResponsePromise;
  32  |   expect(experimentResponse.status()).toBe(200);
  33  |   const experimentBytes = await experimentResponse.body();
  34  |   expect(experimentBytes.byteLength).toBeGreaterThan(10 * 1024 * 1024);
  35  |   const experiment = JSON.parse(experimentBytes.toString("utf8")) as ExperimentResult;
  36  | 
  37  |   expect(experiment.status).toBe("complete");
  38  |   expect(experiment.root_seed).toBe(20261020);
  39  |   expect(experiment.n_requested).toBe(30);
  40  |   expect(experiment.n_valid).toBe(30);
  41  |   expect(experiment.scenarios.map((scenario) => scenario.scenario_id))
  42  |     .toEqual(["synthetic-demo-tuesday", "candidate-two-preparers"]);
  43  |   expect(experiment.scenarios[0]?.engine_config.opening_time).toBe("15:00:00");
  44  |   expect(experiment.scenarios[0]?.engine_config.horizon_s).toBe(23_400);
  45  |   expect(experiment.scenarios[0]?.engine_config.preparers).toBe(4);
  46  |   expect(experiment.scenarios[1]?.engine_config.horizon_s).toBe(23_400);
  47  |   expect(experiment.scenarios[1]?.engine_config.preparers).toBe(2);
  48  |   expect(experiment.replication_results).toHaveLength(60);
  49  |   expect(experiment.replication_results.every((record) => record.status === "complete")).toBe(true);
  50  |   for (const scenarioId of ["synthetic-demo-tuesday", "candidate-two-preparers"]) {
  51  |     const records = experiment.replication_results.filter((record) => record.scenario_id === scenarioId);
  52  |     expect(records.map((record) => record.replication_index).sort((first, second) => first - second))
  53  |       .toEqual(Array.from({ length: 30 }, (_, index) => index));
  54  |   }
  55  |   expect(experiment.aggregate_estimates.length).toBeGreaterThan(0);
  56  |   expect(experiment.comparisons.length).toBeGreaterThan(0);
  57  |   expect(experimentPosts).toBe(1);
  58  |   expect(runPosts).toBe(0);
  59  | 
  60  |   const downloadPromise = page.waitForEvent("download");
  61  |   await page.getByRole("button", { name: "Descargar experimento JSON" }).click();
  62  |   const download = await downloadPromise;
  63  |   expect(download.suggestedFilename()).toMatch(/\.json$/);
  64  |   const downloadedPath = testInfo.outputPath("full-day-comparison.json");
  65  |   await download.saveAs(downloadedPath);
  66  |   const downloadedBytes = readFileSync(downloadedPath);
  67  |   expect(downloadedBytes.byteLength).toBeGreaterThan(10 * 1024 * 1024);
  68  |   expect(downloadedBytes.equals(experimentBytes)).toBe(true);
  69  | 
  70  |   await page.reload();
  71  |   await page.getByRole("tab", { name: "Escenarios" }).click();
  72  |   const reopenResponsePromise = page.waitForResponse(
  73  |     (response) => response.url().endsWith("/api/v1/files/validate")
  74  |       && response.request().method() === "POST",
  75  |     { timeout: 60_000 },
  76  |   );
  77  |   await page.locator("#saved-json-file").setInputFiles(downloadedPath);
  78  |   const reopenResponse = await reopenResponsePromise;
  79  |   expect(reopenResponse.status()).toBe(200);
  80  |   const reopened = await reopenResponse.json() as { kind: string; value: ExperimentResult };
  81  |   expect(reopened.kind).toBe("experiment");
  82  |   expect(reopened.value).toEqual(experiment);
  83  |   expect(reopened.value.replication_results).toHaveLength(60);
  84  |   expect(reopened.value.scenarios.map((scenario) => scenario.engine_config.preparers)).toEqual([4, 2]);
  85  |   expect(experimentPosts).toBe(1);
  86  |   expect(runPosts).toBe(0);
  87  |   await expect(page.getByRole("heading", { name: "2 escenarios guardados", exact: true })).toBeVisible();
  88  |   await expect(page.getByRole("heading", { name: "Resumen de escenarios" })).toBeVisible();
  89  |   await page.screenshot({
  90  |     path: testInfo.outputPath("large-result-reopened.png"),
  91  |     fullPage: true,
  92  |     animations: "disabled",
  93  |   });
  94  |   await page.screenshot({
  95  |     path: testInfo.outputPath("large-result-reopened-viewport.png"),
  96  |     animations: "disabled",
  97  |   });
  98  | 
  99  |   await page.getByRole("tab", { name: "Escenarios" }).click();
  100 |   const invalidResponsePromise = page.waitForResponse(
  101 |     (response) => response.url().endsWith("/api/v1/files/validate")
  102 |       && response.request().method() === "POST",
  103 |     { timeout: 60_000 },
  104 |   );
  105 |   await page.locator("#saved-json-file").setInputFiles({
  106 |     name: "invalid.json",
  107 |     mimeType: "application/json",
  108 |     buffer: Buffer.from("{"),
  109 |   });
  110 |   expect((await invalidResponsePromise).status()).toBe(422);
  111 |   await page.getByRole("tab", { name: "Resultados" }).click();
  112 |   await expect(page.getByRole("heading", { name: "2 escenarios guardados", exact: true })).toBeVisible();
  113 |   await expect(page.getByRole("heading", { name: "Resumen de escenarios" })).toBeVisible();
  114 |   expect(experimentPosts).toBe(1);
  115 |   expect(runPosts).toBe(0);
```