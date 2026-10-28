import { expect, test } from "@playwright/test";

test("interior and facade views preserve the selected simulation state", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await page.getByRole("button", { name: "Ejecutar una réplica", exact: true }).click();
  await expect(page.locator("#replay-stage")).toHaveAttribute("data-state", "available");
  await page.locator("#replay-slider").evaluate((element) => {
    const slider = element as HTMLInputElement;
    slider.value = "120";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const summary = await page.locator("#replay-scene-summary").innerText();
  const canvas = page.locator("#replay-canvas");
  const interior = await canvas.screenshot();
  await page.getByRole("button", { name: "Ver fachada", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ver interior", exact: true })).toBeVisible();
  const facade = await canvas.screenshot();
  expect(facade.equals(interior)).toBe(false);
  await expect(page.locator("#replay-slider")).toHaveValue("120");
  await expect(page.locator("#replay-scene-summary")).toHaveText(summary);
  await page.getByRole("button", { name: "Ver interior", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ver fachada", exact: true })).toBeVisible();
  await expect(page.locator("#replay-slider")).toHaveValue("120");
  await expect(page.locator("#replay-scene-summary")).toHaveText(summary);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Ver fachada", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
