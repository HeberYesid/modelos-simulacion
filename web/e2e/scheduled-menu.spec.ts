import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { RunResult, Scenario } from "../src/api/types";

async function openAdvancedOptions(page: Page): Promise<void> {
  const details = page.locator("details[data-advanced-options]");
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.locator("summary").click();
  }
}

async function downloadResult(page: Page): Promise<{ path: string; value: RunResult }> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar resultado JSON", exact: true }).click();
  const download = await pending;
  const path = await download.path();
  if (!path) throw new Error("Playwright did not provide the downloaded result path.");
  return { path, value: JSON.parse(readFileSync(path, "utf8")) as RunResult };
}

async function preserveResultAfterValidationError(page: Page, original: RunResult): Promise<void> {
  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
  expect((await downloadResult(page)).value).toEqual(original);
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await openAdvancedOptions(page);
}

async function seekReplay(page: Page, timeS: number): Promise<void> {
  await page.locator("#replay-slider").evaluate((element, time) => {
    const slider = element as HTMLInputElement;
    slider.value = String(time);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }, timeS);
}

test("arrival schedule windows can be split and rejoined without changing horizon coverage", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await openAdvancedOptions(page);
  await page.locator("#closing-time").fill("15:07:00");
  await page.locator("#arrival-schedule-enabled").check();
  await expect(page.locator("[data-arrival-window]")).toHaveCount(2);

  await page.locator("[data-add-arrival-window]").click();
  await expect(page.locator("[data-arrival-window]")).toHaveCount(3);
  await expect(page.locator('[data-arrival-window-end="1"]')).toHaveValue("5.25");
  await expect(page.locator('[data-arrival-window-end="2"]')).toHaveValue("7");

  await page.locator('[data-remove-arrival-window="1"]').click();
  await expect(page.locator("[data-arrival-window]")).toHaveCount(2);
  await expect(page.locator('[data-arrival-window-end="0"]')).toHaveValue("5.25");
  await expect(page.locator('[data-arrival-window-start="1"]')).toHaveValue("315");
  await expect(page.locator('[data-arrival-window-end="1"]')).toHaveValue("7");
});

test("scheduled arrivals and menu quantities survive editing, execution, errors, and reopening", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const runRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/runs")) runRequests.push(request.url());
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await openAdvancedOptions(page);
  await page.locator("#closing-time").fill("15:07:00");
  await page.locator("#dist-preparation-low").fill("33");
  await page.locator("#dist-preparation-mode").fill("47");
  await page.locator("#dist-preparation-high").fill("59");
  await page.locator("#group-prob-0").fill("0");
  await page.locator("#group-prob-1").fill("1");

  await page.locator("#arrival-schedule-enabled").check();
  await page.locator('[data-arrival-window-end="0"]').fill("0.25");
  await page.locator('[data-arrival-orders-per-hour="0"]').fill("3600");
  await page.locator('[data-arrival-window-end="1"]').fill("7");
  await page.locator('[data-arrival-orders-per-hour="1"]').fill("0");

  await page.locator("#menu-enabled").check();
  await page.locator('[data-menu-product-time="0"]').fill("180");
  await page.locator('[data-menu-product-time="1"]').fill("60");
  await page.locator('[data-menu-product-time="2"]').fill("90");
  await page.locator('[data-menu-basket-probability="0"]').fill("1");
  await page.locator('[data-menu-basket-probability="1"]').fill("0");
  await page.locator('[data-menu-basket-probability="2"]').fill("0");
  await page.locator('[data-menu-quantity="ensalada-frutas"]').first().fill("2");
  await page.locator('[data-menu-quantity="helado"]').first().fill("1");
  await page.locator('[data-menu-quantity="granizado"]').first().fill("0");

  await page.locator("#arrival-schedule-enabled").uncheck();
  await page.locator("#arrival-schedule-enabled").check();
  await page.locator("#menu-enabled").uncheck();
  await page.locator("#menu-enabled").check();
  await expect(page.locator('[data-arrival-window-end="0"]')).toHaveValue("0.25");
  await expect(page.locator('[data-arrival-orders-per-hour="1"]')).toHaveValue("0");
  await expect(page.locator('[data-menu-quantity="ensalada-frutas"]').first()).toHaveValue("2");
  await expect(page.locator('[data-menu-quantity="helado"]').first()).toHaveValue("1");
  await expect(page.locator("#dist-preparation-low")).toHaveValue("33");
  await expect(page.locator("#dist-preparation-mode")).toHaveValue("47");
  await expect(page.locator("#dist-preparation-high")).toHaveValue("59");

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("scheduled-menu-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("scheduled-menu-mobile-390.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const scenarioDownloadPromise = page.waitForEvent("download");
  const scenarioValidationPromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/files/validate") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Descargar escenario JSON", exact: true }).click();
  expect((await scenarioValidationPromise).status()).toBe(200);
  const scenarioDownload = await scenarioDownloadPromise;
  const scenarioPath = await scenarioDownload.path();
  if (!scenarioPath) throw new Error("Playwright did not provide the downloaded scenario path.");
  const scenario = JSON.parse(readFileSync(scenarioPath, "utf8")) as Scenario;
  expect(scenario.engine_config.horizon_s).toBe(420);
  expect(scenario.arrival_schedule).toEqual([
    { start_s: 0, end_s: 15, orders_per_hour: 3600 },
    { start_s: 15, end_s: 420, orders_per_hour: 0 },
  ]);
  expect(scenario.menu?.products.map(({ display_name, preparation_s }) => ({ display_name, preparation_s }))).toEqual([
    { display_name: "Ensalada de frutas", preparation_s: 180 },
    { display_name: "Helado", preparation_s: 60 },
    { display_name: "Granizado", preparation_s: 90 },
  ]);
  expect(scenario.menu?.baskets[0]?.items).toEqual([
    { product_id: "ensalada-frutas", quantity: 2 },
    { product_id: "helado", quantity: 1 },
  ]);
  expect(scenario.preparation).toEqual({ kind: "triangular", low_s: 33, mode_s: 47, high_s: 59 });
  expect(scenario).not.toHaveProperty("arrival_schedule_enabled");
  expect(scenario).not.toHaveProperty("menu_enabled");

  const reopenedScenarioValidation = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/files/validate") && response.request().method() === "POST",
  );
  await page.locator("#saved-json-file").setInputFiles(scenarioPath);
  expect((await reopenedScenarioValidation).status()).toBe(200);
  await expect(page.locator("#arrival-schedule-enabled")).toBeChecked();
  await expect(page.locator("#menu-enabled")).toBeChecked();
  await expect(page.locator('[data-menu-quantity="ensalada-frutas"]').first()).toHaveValue("2");
  await expect(page.locator('[data-menu-quantity="helado"]').first()).toHaveValue("1");

  const runResponse = await page.request.post("/api/v1/runs", {
    data: { scenario, root_seed: 20261020, replication_index: 0 },
  });
  const payload: unknown = await runResponse.json();
  expect(runResponse.status(), JSON.stringify(payload)).toBe(200);
  const run = payload as RunResult;
  expect(run.trace.window_end_s).toBe(420);
  expect(run.demand_tape.length).toBeGreaterThan(0);
  expect(run.demand_tape.every((order) => order.arrival_s < 15)).toBe(true);
  const firstOrder = run.demand_tape[0];
  expect(firstOrder?.preparation_s).toBe(420);
  expect(firstOrder?.items).toEqual([
    {
      product_id: "ensalada-frutas",
      display_name: "Ensalada de frutas",
      visual_kind: "fruit_salad",
      quantity: 2,
    },
    { product_id: "helado", display_name: "Helado", visual_kind: "ice_cream", quantity: 1 },
  ]);
  expect(run.trace.final_orders.find((order) => order.order_id === firstOrder?.order_id)?.items).toEqual(firstOrder?.items);
  expect(runRequests).toEqual([]);

  const openedRunValidation = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/files/validate") && response.request().method() === "POST",
  );
  await page.locator("#saved-json-file").setInputFiles({
    name: "scheduled-menu-run.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(run)),
  });
  expect((await openedRunValidation).status()).toBe(200);
  await expect(page.getByRole("tab", { name: "Resultados", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#replay-stage")).toHaveAttribute("data-state", "available", { timeout: 20_000 });
  await seekReplay(page, run.trace.drain_end_s);
  await page.locator("#replay-entity").selectOption(`order:${firstOrder?.order_id}`);
  await expect(page.locator("#replay-inspector-detail")).toContainText("2 × Ensalada de frutas");
  await expect(page.locator("#replay-inspector-detail")).toContainText("1 × Helado");

  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await openAdvancedOptions(page);
  await page.locator("#closing-time").fill("15:08:00");
  await page.locator("[data-run-scenario]").click();
  await expect(page.locator("#scenario-error")).toContainText("debe terminar exactamente al cierre actual");
  await expect(page.locator("#closing-time")).toHaveValue("15:08:00");
  await expect(page.locator('[data-arrival-window-end="1"]')).toHaveValue("7");
  expect(runRequests).toEqual([]);
  await preserveResultAfterValidationError(page, run);

  await page.locator("#closing-time").fill("15:07:00");
  await page.locator("#dist-interarrival-kind").selectOption("constant");
  await page.locator("#dist-interarrival-value").fill("1");
  await page.locator("[data-run-scenario]").click();
  await expect(page.locator("#scenario-error")).toContainText("requieren interarribos exponenciales");
  await expect(page.locator("#dist-interarrival-kind")).toHaveValue("constant");
  expect(runRequests).toEqual([]);
  await preserveResultAfterValidationError(page, run);

  await page.locator("#dist-interarrival-kind").selectOption("exponential");
  await page.locator("#dist-interarrival-mean").fill("180");
  await page.locator('[data-menu-basket-probability="0"]').fill("0.8");
  await page.locator('[data-menu-basket-probability="1"]').fill("0.3");
  await page.locator('[data-menu-basket-probability="2"]').fill("0.3");
  await page.locator("[data-run-scenario]").click();
  await expect(page.locator("#scenario-error")).toContainText("deben sumar exactamente 1");
  await expect(page.locator('[data-menu-basket-probability="0"]')).toHaveValue("0.8");
  await expect(page.locator('[data-menu-basket-probability="1"]')).toHaveValue("0.3");
  expect(runRequests).toEqual([]);

  await page.getByRole("tab", { name: "Resultados", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Indicadores calculados por el motor" })).toBeVisible();
  const savedRun = await downloadResult(page);
  expect(savedRun.value).toEqual(run);
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  const reopenedRunValidation = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/files/validate") && response.request().method() === "POST",
  );
  await page.locator("#saved-json-file").setInputFiles(savedRun.path);
  expect((await reopenedRunValidation).status()).toBe(200);
  await expect(page.getByRole("tab", { name: "Resultados", exact: true })).toHaveAttribute("aria-selected", "true");
  expect((await downloadResult(page)).value).toEqual(savedRun.value);
});
