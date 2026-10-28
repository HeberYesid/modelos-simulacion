# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: large-result-roundtrip.spec.ts >> downloads and reopens the full-day comparison byte-for-byte
- Location: e2e-audit\large-result-roundtrip.spec.ts:5:1

# Error details

```
TimeoutError: page.waitForResponse: Timeout 60000ms exceeded while waiting for event "response"
```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - complementary [ref=f1e4]:
    - link "Boquitas, inicio" [ref=f1e5] [cursor=pointer]:
      - /url: "#observations"
      - generic [ref=f1e13]:
        - strong [ref=f1e14]: Boquitas
        - generic [ref=f1e15]: modelo de atención
    - tablist "Vistas principales" [ref=f1e16]:
      - tab "Datos observados" [ref=f1e17] [cursor=pointer]
      - tab "Escenarios" [selected] [ref=f1e22] [cursor=pointer]
      - tab "Resultados" [ref=f1e29] [cursor=pointer]
  - generic [ref=f1e34]:
    - banner [ref=f1e35]:
      - generic [ref=f1e36]: Simulación de atención
      - generic [ref=f1e37]: Servicio local disponible
    - tabpanel "Escenarios" [ref=f1e41]:
      - generic [ref=f1e42]:
        - heading "Escenarios" [level=1] [ref=f1e43]
        - paragraph [ref=f1e44]: Configura una hipótesis completa. Las distribuciones sintéticas son valores de enseñanza; no son estimaciones de la tienda.
      - alert [active] [ref=f1e45]:
        - heading "La configuración no se aceptó" [level=2] [ref=f1e46]
        - paragraph [ref=f1e47]: A requested file or directory could not be found at the time an operation was processed.
      - generic [ref=f1e48]:
        - generic [ref=f1e49]:
          - region [ref=f1e50]:
            - generic [ref=f1e51]:
              - generic [ref=f1e52]:
                - heading "Escenarios para la siguiente ejecución" [level=2] [ref=f1e53]
                - paragraph [ref=f1e54]: La primera configuración es la referencia. Añade copias explícitas y edita cada una antes de comparar.
              - button "Copiar referencia como candidato" [ref=f1e55] [cursor=pointer]
            - tablist "Escenarios disponibles" [ref=f1e56]:
              - tab "Referencia Demostración sintética · sin calibrar" [selected] [ref=f1e58] [cursor=pointer]:
                - generic [ref=f1e59]: Referencia
                - strong [ref=f1e60]: Demostración sintética · sin calibrar
            - generic [ref=f1e61]:
              - generic [ref=f1e62]: Añade al menos un candidato para habilitar la comparación.
              - button "Comparar escenarios" [disabled] [ref=f1e63]
          - group "Modo y capacidad" [ref=f1e64]:
            - group "Modo de atención" [ref=f1e66]:
              - generic [ref=f1e67] [cursor=pointer]:
                - radio "Martes de promoción Cola de pago y preparación con equipos separados." [checked] [ref=f1e68]
                - strong [ref=f1e69]: Martes de promoción
                - generic [ref=f1e70]: Cola de pago y preparación con equipos separados.
              - generic [ref=f1e71] [cursor=pointer]:
                - radio "Día normal Una misma persona completa el pago y la preparación." [ref=f1e72]
                - strong [ref=f1e73]: Día normal
                - generic [ref=f1e74]: Una misma persona completa el pago y la preparación.
            - generic [ref=f1e75]:
              - generic [ref=f1e76]:
                - generic [ref=f1e77]: Cajeros
                - spinbutton "Cajeros" [ref=f1e78]: "1"
              - generic [ref=f1e79]:
                - generic [ref=f1e80]: Preparadores
                - spinbutton "Preparadores" [ref=f1e81]: "4"
            - paragraph [ref=f1e82]: Cambiar el modo ajusta el equipo correspondiente, pero deja igual la demanda, los tiempos, las transferencias y la paciencia.
          - group "Pausas programadas para cobrar" [ref=f1e83]:
            - paragraph [ref=f1e85]: La opción está desactivada. Puedes activarla solo para una persona en el equipo integrado del modo normal y definir cada hora y orden explícitamente.
            - button "Activar pausas programadas" [ref=f1e86] [cursor=pointer]
          - group "Ventana de simulación" [ref=f1e87]:
            - generic [ref=f1e89]:
              - generic [ref=f1e90]:
                - generic [ref=f1e91]: Hora de apertura
                - textbox "Hora de apertura" [ref=f1e92]: 15:00:00
                - paragraph [ref=f1e93]: Reloj local de la simulación; no usa la hora del navegador.
              - generic [ref=f1e94]:
                - generic [ref=f1e95]: Cierre de admisiones
                - textbox "Cierre de admisiones" [ref=f1e96]: 21:30:00
                - paragraph [ref=f1e97]: Debe ser posterior a la apertura y del mismo día. El trabajo admitido puede terminar después.
            - paragraph [ref=f1e98]:
              - text: Se admiten llegadas entre 0 y H; al cerrar admisiones, las órdenes iniciadas continúan hasta terminar. El reloj del recorrido puede avanzar a
              - code [ref=f1e99]: +1 día
              - text: .
          - group "Identificación del escenario" [ref=f1e100]:
            - generic [ref=f1e102]:
              - generic [ref=f1e103]:
                - generic [ref=f1e104]: Identificador
                - textbox "Identificador" [ref=f1e105]: synthetic-demo-tuesday
              - generic [ref=f1e106]:
                - generic [ref=f1e107]: Nombre visible
                - textbox "Nombre visible" [ref=f1e108]: Demostración sintética · sin calibrar
            - paragraph [ref=f1e109]:
              - text: "Procedencia actual:"
              - strong [ref=f1e110]: Demostración sintética
              - text: . Cualquier cambio queda marcado como supuesto del usuario.
          - group "Tiempos del sistema" [ref=f1e111]:
            - generic [ref=f1e113]:
              - generic [ref=f1e114]:
                - generic [ref=f1e115]:
                  - text: Tiempo entre llegadas
                  - generic [ref=f1e116]: Primera llegada después de la apertura
                - generic [ref=f1e117]:
                  - generic [ref=f1e118]: Forma
                  - combobox "Forma" [ref=f1e119]:
                    - option "Constante"
                    - option "Triangular"
                    - option "Exponencial" [selected]
                - generic [ref=f1e120]:
                  - generic [ref=f1e121]: Media (s)
                  - spinbutton "Media (s)" [ref=f1e122]: "180"
              - generic [ref=f1e123]:
                - generic [ref=f1e124]:
                  - text: Pago activo
                  - generic [ref=f1e125]: Trabajo activo por orden
                - generic [ref=f1e126]:
                  - generic [ref=f1e127]: Forma
                  - combobox "Forma" [ref=f1e128]:
                    - option "Constante"
                    - option "Triangular" [selected]
                    - option "Exponencial"
                - generic [ref=f1e129]:
                  - generic [ref=f1e130]: Mínimo (s)
                  - spinbutton "Mínimo (s)" [ref=f1e131]: "15"
                - generic [ref=f1e132]:
                  - generic [ref=f1e133]: Más probable (s)
                  - spinbutton "Más probable (s)" [ref=f1e134]: "30"
                - generic [ref=f1e135]:
                  - generic [ref=f1e136]: Máximo (s)
                  - spinbutton "Máximo (s)" [ref=f1e137]: "45"
              - generic [ref=f1e138]:
                - generic [ref=f1e139]:
                  - text: Preparación
                  - generic [ref=f1e140]: Un tiempo completo por orden; no depende del tamaño del grupo
                - generic [ref=f1e141]:
                  - generic [ref=f1e142]: Forma
                  - combobox "Forma" [ref=f1e143]:
                    - option "Constante"
                    - option "Triangular" [selected]
                    - option "Exponencial"
                - generic [ref=f1e144]:
                  - generic [ref=f1e145]: Mínimo (s)
                  - spinbutton "Mínimo (s)" [ref=f1e146]: "60"
                - generic [ref=f1e147]:
                  - generic [ref=f1e148]: Más probable (s)
                  - spinbutton "Más probable (s)" [ref=f1e149]: "120"
                - generic [ref=f1e150]:
                  - generic [ref=f1e151]: Máximo (s)
                  - spinbutton "Máximo (s)" [ref=f1e152]: "180"
              - generic [ref=f1e153]:
                - generic [ref=f1e154]:
                  - text: Confirmación externa
                  - generic [ref=f1e155]: Solo se usa para una transferencia
                - generic [ref=f1e156]:
                  - generic [ref=f1e157]: Forma
                  - combobox "Forma" [ref=f1e158]:
                    - option "Constante"
                    - option "Triangular" [selected]
                    - option "Exponencial"
                - generic [ref=f1e159]:
                  - generic [ref=f1e160]: Mínimo (s)
                  - spinbutton "Mínimo (s)" [ref=f1e161]: "30"
                - generic [ref=f1e162]:
                  - generic [ref=f1e163]: Más probable (s)
                  - spinbutton "Más probable (s)" [ref=f1e164]: "60"
                - generic [ref=f1e165]:
                  - generic [ref=f1e166]: Máximo (s)
                  - spinbutton "Máximo (s)" [ref=f1e167]: "90"
            - generic [ref=f1e169]:
              - generic [ref=f1e170]: Probabilidad de transferencia
              - spinbutton "Probabilidad de transferencia" [ref=f1e171]: "0.25"
              - paragraph [ref=f1e172]: Valor entre 0 y 1. La confirmación externa solo se sortea si hay transferencia.
            - generic [ref=f1e174]:
              - checkbox "Aplicar paciencia mientras se espera el primer pago" [ref=f1e175]
              - generic [ref=f1e176]: Aplicar paciencia mientras se espera el primer pago
            - paragraph [ref=f1e178]: La paciencia está desactivada; el grupo espera hasta que empiece el pago.
          - group "Tamaño de los grupos" [ref=f1e179]:
            - paragraph [ref=f1e181]: Los miembros llegan, pagan y terminan juntos; la preparación es por orden.
            - generic [ref=f1e182]:
              - generic [ref=f1e183]:
                - generic [ref=f1e184]:
                  - generic [ref=f1e185]: Personas en el grupo
                  - spinbutton "Personas en el grupo" [ref=f1e186]: "1"
                - generic [ref=f1e187]:
                  - generic [ref=f1e188]: Probabilidad
                  - spinbutton "Probabilidad" [ref=f1e189]: "0.6"
                - button "Quitar tamaño de grupo 1" [ref=f1e190] [cursor=pointer]: Quitar
              - generic [ref=f1e191]:
                - generic [ref=f1e192]:
                  - generic [ref=f1e193]: Personas en el grupo
                  - spinbutton "Personas en el grupo" [ref=f1e194]: "2"
                - generic [ref=f1e195]:
                  - generic [ref=f1e196]: Probabilidad
                  - spinbutton "Probabilidad" [ref=f1e197]: "0.4"
                - button "Quitar tamaño de grupo 2" [ref=f1e198] [cursor=pointer]: Quitar
            - generic [ref=f1e199]:
              - generic [ref=f1e200]: Las probabilidades deben sumar 1.
              - button "Añadir tamaño" [ref=f1e201] [cursor=pointer]
          - group "Estado al abrir" [ref=f1e202]:
            - paragraph [ref=f1e204]: Cada orden representa trabajo que ya existe en el minuto cero. Completa integrantes, etapa, tiempos restantes y fila o persona reteniendo trabajo según corresponda.
            - paragraph [ref=f1e206]: El estado inicial está vacío; no se supone trabajo que no esté descrito.
            - generic [ref=f1e207]:
              - generic [ref=f1e208]: Una etapa incompatible se conserva hasta que la cambies.
              - button "Añadir orden inicial" [ref=f1e209] [cursor=pointer]
          - group "Repetición" [ref=f1e210]:
            - generic [ref=f1e212]:
              - generic [ref=f1e213]:
                - generic [ref=f1e214]: Semilla raíz
                - spinbutton "Semilla raíz" [ref=f1e215]: "20261020"
                - paragraph [ref=f1e216]: La misma semilla, escenario e índice reproducen la misma réplica.
              - generic [ref=f1e217]:
                - generic [ref=f1e218]: Réplicas para comparar
                - spinbutton "Réplicas para comparar" [ref=f1e219]: "30"
                - paragraph [ref=f1e220]: Máximo 200 por experimento.
              - generic [ref=f1e221]:
                - generic [ref=f1e222]: Intervalo de confianza
                - textbox "Intervalo de confianza" [ref=f1e223]: 95 %
                - paragraph [ref=f1e224]: El servidor calcula intervalos y diferencias pareadas por réplica.
          - generic [ref=f1e225]:
            - status [ref=f1e226]: Los cambios se guardan en memoria hasta que los descargues como JSON.
            - generic [ref=f1e227]:
              - button "Descargar escenario JSON" [ref=f1e228] [cursor=pointer]
              - button "Ejecutar una réplica" [ref=f1e229] [cursor=pointer]
        - complementary "Notas del modelo y archivos" [ref=f1e230]:
          - generic [ref=f1e231]:
            - heading "Supuestos que acompañan al modelo" [level=2] [ref=f1e232]
            - list [ref=f1e233]:
              - listitem [ref=f1e234]: Una orden compartida tiene un pago y una preparación.
              - listitem [ref=f1e235]: El tamaño del grupo no cambia el tiempo de preparación.
              - listitem [ref=f1e236]: La paciencia solo cuenta antes de empezar el pago.
              - listitem [ref=f1e237]: El estado vacío al abrir es una decisión explícita.
              - listitem [ref=f1e238]: Los tiempos de confianza describen variación entre simulaciones, no incertidumbre de los datos reales.
          - generic [ref=f1e239]:
            - heading "Reabrir un archivo" [level=2] [ref=f1e240]
            - paragraph [ref=f1e241]: Valida un escenario, una réplica o un experimento guardado. Abrir un resultado no vuelve a ejecutar la simulación.
            - generic [ref=f1e242]:
              - generic [ref=f1e243] [cursor=pointer]: Elegir JSON guardado
              - button "Elegir JSON guardado" [ref=f1e244]
    - contentinfo [ref=f1e245]:
      - generic [ref=f1e246]: Trabajo local · sin envío de datos a servicios externos
      - generic [ref=f1e247]: Las observaciones y los escenarios simulados se interpretan por separado
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
  15  |   await page.goto("/");
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
> 72  |   const reopenResponsePromise = page.waitForResponse(
      |                                      ^ TimeoutError: page.waitForResponse: Timeout 60000ms exceeded while waiting for event "response"
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
  116 | });
  117 | 
```