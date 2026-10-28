import { expect, test } from "@playwright/test";

test("main views remain keyboard operable in the desktop sidebar and mobile bar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const observations = page.getByRole("tab", { name: "Datos observados", exact: true });
  const scenarios = page.getByRole("tab", { name: "Escenarios", exact: true });
  const results = page.getByRole("tab", { name: "Resultados", exact: true });
  const navigation = page.getByRole("tablist", { name: "Vistas principales" });
  await expect(navigation).toHaveAttribute("aria-orientation", "vertical");

  await observations.press("ArrowDown");
  await expect(scenarios).toBeFocused();
  await expect(scenarios).toHaveAttribute("aria-selected", "true");
  await scenarios.press("ArrowUp");
  await expect(observations).toBeFocused();
  await expect(observations).toHaveAttribute("aria-selected", "true");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(navigation).toHaveAttribute("aria-orientation", "horizontal");
  await observations.press("ArrowRight");
  await expect(scenarios).toBeFocused();
  await expect(scenarios).toHaveAttribute("aria-selected", "true");
  await scenarios.press("End");
  await expect(results).toBeFocused();
  await expect(results).toHaveAttribute("aria-selected", "true");
  await results.press("Home");
  await expect(observations).toBeFocused();
  await expect(observations).toHaveAttribute("aria-selected", "true");
});

test("the order table can receive keyboard focus and scroll without a pointer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Escenarios", exact: true }).click();
  await page.getByRole("button", { name: "Ejecutar una réplica", exact: true }).click();
  const orders = page.locator(".result-orders");
  await expect(orders).toBeVisible();
  await orders.focus();
  await expect(orders).toBeFocused();
  const before = await orders.evaluate((element) => element.scrollTop);
  await page.keyboard.press("PageDown");
  await expect.poll(() => orders.evaluate((element) => element.scrollTop)).toBeGreaterThan(before);
});
