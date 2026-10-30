import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { RunResult, Scenario } from "../src/api/types";

const fixturePath = fileURLToPath(new URL("../contracts/fixtures/demo-scenario.json", import.meta.url));
const interruptedPath = fileURLToPath(new URL("../contracts/fixtures/sample-run-v2.json", import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Scenario;
const interruptedRun = JSON.parse(readFileSync(interruptedPath, "utf8")) as RunResult;

async function openRun(page: Page, run: RunResult): Promise<void> {
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await page.locator("#saved-json-file").setInputFiles({
    name: "visual-review.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(run)),
  });
  await expect(page.locator("#replay-stage")).toHaveAttribute("data-state", "available");
  await page.locator("#replay-canvas").scrollIntoViewIfNeeded();
}

async function seek(page: Page, timeS: number): Promise<void> {
  await page.locator("#replay-slider").evaluate((element, time) => {
    const slider = element as HTMLInputElement;
    slider.value = String(time);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }, timeS);
  await expect(page.locator("#replay-slider")).toHaveValue(String(timeS));
}

async function downloadRun(page: Page): Promise<unknown> {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descargar resultado JSON", exact: true }).click();
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  return JSON.parse(readFileSync(path!, "utf8"));
}

for (const mode of ["tuesday", "regular"] as const) {
  test(`${mode}: payment, preparation and delivery artwork preserves the saved run`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const scenario = structuredClone(fixture);
    scenario.scenario_id = `visual-only-${mode}`;
    scenario.engine_config = {
      contract_version: 1, mode, opening_time: "15:00:00", horizon_s: 25,
      cashiers: mode === "tuesday" ? 1 : 0,
      preparers: mode === "tuesday" ? 2 : 0,
      integrated_workers: mode === "regular" ? 1 : 0,
    };
    scenario.initial_state = [];
    scenario.interarrival = { kind: "constant", value_s: 6 };
    scenario.payment_active = { kind: "constant", value_s: 2 };
    scenario.preparation = { kind: "constant", value_s: 8 };
    scenario.group_sizes = [{ size: 2, probability: 1 }];
    scenario.transfer_probability = mode === "regular" ? 1 : 0;
    scenario.transfer_confirmation = { kind: "constant", value_s: 0 };
    scenario.patience = null;
    const response = await page.request.post("http://127.0.0.1:8000/api/v1/runs", {
      data: { scenario, root_seed: 42, replication_index: 0 },
    });
    expect(response.status()).toBe(200);
    const run = await response.json() as RunResult;
    const original = JSON.stringify(run);
    await openRun(page, run);
    const canvas = page.locator("#replay-canvas");

    // First order: arrival 6, payment [6, 8), preparation [8, 16), delivery 16.
    await seek(page, 6.5);
    await expect(page.locator("#replay-scene-summary")).toContainText("1 trabajadores activos");
    const payment = await canvas.screenshot({ path: testInfo.outputPath(`${mode}-payment.png`) });
    await seek(page, 10);
    await expect(page.locator("#replay-scene-summary")).toContainText("1 órdenes en preparación");
    const preparation = await canvas.screenshot({ path: testInfo.outputPath(`${mode}-preparation.png`) });
    expect(preparation.equals(payment)).toBe(false);
    await seek(page, 16.5);
    const summary = await page.locator("#replay-scene-summary").innerText();
    const delivered = await canvas.screenshot({ path: testInfo.outputPath(`${mode}-delivery.png`) });
    await seek(page, 6.5);
    await seek(page, 16.5);
    expect((await canvas.screenshot()).equals(delivered)).toBe(true);

    await page.getByRole("button", { name: "Ver fachada", exact: true }).click();
    await canvas.screenshot({ path: testInfo.outputPath(`${mode}-facade.png`) });
    await expect(page.locator("#replay-slider")).toHaveValue("16.5");
    await expect(page.locator("#replay-scene-summary")).toHaveText(summary);
    await page.getByRole("button", { name: "Ver interior", exact: true }).click();
    expect((await canvas.screenshot()).equals(delivered)).toBe(true);
    expect(await downloadRun(page)).toEqual(JSON.parse(original));
    expect(errors).toEqual([]);
  });
}

test("reduced motion and mobile preserve interrupted preparation across seeks", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const pause = interruptedRun.trace.events.find((event) => event.type === "preparation_paused");
  const resume = interruptedRun.trace.events.find((event) => event.type === "preparation_resumed");
  expect(pause).toBeDefined();
  expect(resume).toBeDefined();
  const pausedTime = pause!.time_s;
  await openRun(page, interruptedRun);
  await seek(page, pausedTime);
  await expect(page.locator("#replay-scene-summary")).toContainText("1 orden con preparación pausada");
  const canvas = page.locator("#replay-canvas");
  const paused = await canvas.screenshot({ path: testInfo.outputPath("mobile-paused.png") });
  expect((await canvas.screenshot()).equals(paused)).toBe(true);
  await seek(page, resume!.time_s);
  await seek(page, pausedTime);
  expect((await canvas.screenshot()).equals(paused)).toBe(true);
  await page.getByRole("button", { name: "Ver fachada", exact: true }).click();
  await expect(page.locator("#replay-slider")).toHaveValue(String(pausedTime));
  await canvas.screenshot({ path: testInfo.outputPath("mobile-facade.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await downloadRun(page)).toEqual(interruptedRun);
  expect(errors).toEqual([]);
});
