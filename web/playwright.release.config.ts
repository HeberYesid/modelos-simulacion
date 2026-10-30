import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(webRoot, "..");

export default defineConfig({
  testDir: "./e2e-release",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  outputDir: resolve(projectRoot, ".tmp/release-playwright-results"),
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8000",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
