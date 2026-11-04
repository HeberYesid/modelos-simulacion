import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["preloaded-visits.spec.ts", "observed-replay.spec.ts"],
  reporter: "list",
  outputDir: "./test-results/visits",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:8013",
    trace: "retain-on-failure",
  },
  webServer: {
    command: ".venv\\Scripts\\python.exe -m uvicorn boquitas.api:app --host 127.0.0.1 --port 8013",
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: "http://127.0.0.1:8013/api/v1/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
