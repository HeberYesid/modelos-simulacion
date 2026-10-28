# Guía rápida de uso de Boquitas

Esta guía resume cómo preparar y usar la aplicación local. Para instrucciones detalladas de cada formulario y control, consulta el [manual completo en español](MANUAL_USUARIO.md). La [guía técnica](../technical/technical-guide.md) reúne instalación, comandos y versiones fijadas.

Boquitas permite probar escenarios hipotéticos de llegada, pago, confirmación, espera, preparación y entrega. **Los valores iniciales son sintéticos y no están calibrados con el negocio.**

Las operaciones V2 descritas aquí completaron la aceptación de ingeniería de las 28 tareas de Spec07, según su [informe de verificación](../../openspec/changes/boquitas-07-preparation-interruptions/verification-report.md). La calibración y validación empírica siguen pendientes.

## Preparar y abrir

Desde PowerShell en la carpeta raíz del proyecto, realiza la instalación inicial y genera los archivos web:

```powershell
uv sync --frozen
pnpm --dir web install --frozen-lockfile
pnpm --dir web build
```

La primera instalación puede necesitar internet. Después, inicia el servicio local con:

```powershell
.\start-boquitas.ps1
```

Para iniciar sin abrir el navegador, agrega `-NoBrowser`. También puedes iniciar directamente el entorno Python:

```powershell
.\.venv\Scripts\python.exe -m boquitas
```

El servicio se documenta en `http://127.0.0.1:8000`. Mantén abierta la terminal y pulsa **Ctrl+C en esa misma ventana** para detenerlo. Luego puedes ejecutar de nuevo el comando para reiniciarlo. No cambies la política de ejecución de PowerShell para abrir el script; usa el punto de entrada Python directo si tu política bloquea el lanzador.

El [informe de aceptación](../acceptance-report.md) registra las comprobaciones observadas y sus límites.

## Importar observaciones

1. Abre **Datos observados** y selecciona un archivo CSV/TXT en UTF-8 de hasta 10 MiB, o pega el texto completo.
2. Usa **Sin correcciones** para fuentes no reconocidas. El perfil aprobado se usa solo con sus archivos de referencia; no vuelvas a aplicar una corrección que ya esté reflejada en el archivo.
3. Revisa conteos, campos desconocidos, exclusiones y conflictos antes de interpretar los registros.

Los IDs de caja y entrega son locales a cada estación. No demuestran que los registros correspondan a la misma persona u orden. La referencia corregida conserva cantidades de personas desconocidas y un solapamiento de seis intervalos de entrega frente a cuatro preparadores reportados. **La importación no calibra el modelo ni autoriza a ajustar los parámetros para ocultar ese conflicto.**

Consulta el [manual completo de observaciones](MANUAL_USUARIO.md#4-revisar-datos-observados) para el encabezado, los campos y un ejemplo ficticio.

## Entender la demostración

Todos estos valores son entradas sintéticas para aprender a usar el simulador:

| Parámetro | Valor inicial |
| --- | --- |
| Modo martes | 1 cajero y 4 preparadores, en equipos separados |
| Modo normal | 1 trabajador integrado |
| Horario | Apertura 15:00; cierre de admisiones 21:30 (`H = 23.400 s`) |
| Estado inicial | Vacío, como supuesto |
| Llegadas | Exponencial, media 180 s; primera llegada después de una espera generada |
| Grupo | 1 persona con probabilidad 0,6; 2 con probabilidad 0,4 |
| Pago activo | Triangular 15 / 30 / 45 s |
| Preparación por orden | Triangular 60 / 120 / 180 s, independiente del tamaño del grupo |
| Transferencia | Probabilidad 0,25; confirmación triangular 30 / 60 / 90 s |
| Paciencia | Desactivada (`null`); si se activa, solo afecta la espera antes del primer pago |
| Semilla raíz | `20261020` |
| Comparación | 30 réplicas; intervalo bilateral del 95 % |

Un grupo comparte una orden, un pago y una preparación; esta versión no aumenta la preparación según el tamaño del grupo. En martes, el cajero queda disponible durante la confirmación externa. En modo normal, el trabajador integrado mantiene la reserva aunque no haga trabajo activo. No se modelan recetas ni entregas parciales y la cola lógica no representa un aforo físico.

Puedes editar distribuciones, personal, tamaños y probabilidades de grupo, transferencias, paciencia, horario, semilla y órdenes presentes al abrir. Los tiempos se escriben en segundos; las probabilidades deben sumar 1. Toda edición necesita una ejecución nueva.

### Programar una pausa para cobrar (V2)

En **Escenarios**, pulsa **Activar pausas programadas** y conserva el modo **Normal** con exactamente una persona integrada. Añade una fila en **Pausas programadas para cobrar** y escribe el segundo desde la apertura, la orden cuya preparación se pausará y la orden que pasará a cobrar. Los tres valores son supuestos explícitos del usuario: no se infieren de las observaciones. Usa IDs literales presentes en cada réplica; los IDs aleatorios llevan el índice de réplica y no se sustituyen automáticamente. Si cambias a una capacidad incompatible, la interfaz conserva la fila y muestra cómo resolver el conflicto.

El [ejemplo A/B](../../openspec/changes/boquitas-07-preparation-interruptions/review/scripted-demo-input.json) da una ejecución sintética reproducible: A trabaja de 2 a 5, pausa 2 s, reanuda de 7 a 14 y entrega en 14; B paga de 5 a 7, espera hasta 14 y entrega en 17. En el archivo A y B ya esperan pago al abrir; sus IDs permanecen fijos entre réplicas. Para ejecutarlo tal cual, abre **Escenarios → Reabrir un archivo → Elegir JSON guardado**, selecciona el archivo del ejemplo y pulsa **Ejecutar una réplica**. A registra 10 s activos, 2 s en pausa, una pausa y 12 s transcurridos. Estos valores prueban la aritmética del escenario, no el desempeño real. En la visita normal del 23 de octubre se observó un intervalo de preparación de 183 s, pero no se midieron los límites de la pausa ni el trabajo activo; 173 s no es una medida activa. No hay calibración ni validación empírica.

## Leer resultados y comparaciones

Revisa la unidad, la población y la cohorte de cada indicador:

- Esperas, pagos, preparación, permanencia y horas simuladas se reportan en segundos.
- Conteos, filas y esperas se distinguen por **órdenes** o **personas**; no intercambies sus denominadores.
- Las cohortes separan órdenes nuevas, trabajo ya presente al abrir e indicadores combinados.
- La ventana usa `[0,H)`. Utilización, colas y entregas dentro de la ventana se distinguen de la finalización de órdenes ya admitidas después del cierre.
- Utilización **activa** y **reservada** son diferentes. Una reserva puede cubrir una espera externa.
- `No disponible` y un dato desconocido no significan cero: conserva la razón mostrada.

La misma semilla y el mismo índice de réplica permiten reconstruir entradas reproducibles en el entorno fijado. Cuando dos escenarios solo cambian el personal, sus comparaciones comparten la misma demanda simulada. El intervalo del 95 % se calcula entre réplicas y la diferencia pareada es candidato menos referencia. Describe variación de la simulación bajo esos supuestos; no mide incertidumbre sobre parámetros reales.

Un intervalo que no contiene cero tampoco demuestra por sí solo un efecto real en la tienda. **Las observaciones importadas no se ajustan automáticamente a una distribución y los resultados siguen siendo hipotéticos.**

## Guardar y reproducir

- Descarga el escenario JSON para guardar su configuración.
- Descarga el resultado JSON para conservar entradas, historial, semilla y métricas de una ejecución.
- Descarga el experimento JSON para conservar réplicas y comparaciones.
- Descarga CSV para analizar tablas; conserva también el JSON si necesitarás reabrir el historial.

Los resultados V2 incluyen el guion y las medidas de preparación activa, en pausa, recuento de pausas y tiempo transcurrido. Para reabrir un resultado, ve a **Escenarios → Reabrir un archivo → Elegir JSON guardado**: carga el historial y las métricas sin ejecutar otra simulación. Abrir un experimento restaura sus resúmenes; inspeccionar una réplica solicita el miembro exacto con su semilla e índice.

La reproducción 3D empieza pausada a 20×. Puedes reproducir, pausar, volver al inicio, cambiar entre 1×/5×/20×/60×, buscar un instante hasta el final del drenaje, mover la cámara e inspeccionar las personas y sus órdenes. La escena ilustra eventos ya simulados: no cambia la historia, las métricas ni añade tiempo de traslado. Si WebGL no funciona, usa las tablas y la línea de tiempo.

## Resolver problemas comunes

| Problema | Qué revisar |
| --- | --- |
| La página no responde | Mantén el servidor abierto en la terminal y usa `127.0.0.1:8000`. |
| El puerto ya está ocupado | Comprueba si ya hay una instancia abierta; no cierres procesos ajenos. |
| No se encuentra el entorno Python | Desde la raíz, ejecuta `uv sync --frozen`. |
| No aparece la interfaz | Ejecuta `pnpm --dir web install --frozen-lockfile` y `pnpm --dir web build`. |
| El archivo de observaciones no se acepta | Verifica formato UTF-8, encabezado, tamaño y política compatible con la fuente. |
| Escenario inválido | Lee el mensaje y corrige duraciones, probabilidades, capacidades o asignaciones iniciales. |
| Pausa V2 inválida | Revisa la fila indicada, el segundo desde apertura, los IDs literales, la etapa de ambas órdenes y que haya exactamente una persona integrada en modo normal. No remapees ni retimes el guion para ocultar una réplica fallida. |
| Un indicador no está disponible | Lee su explicación; no escribas cero para reemplazarlo. |
| No se muestra la escena 3D | Continúa con los indicadores y la línea de tiempo; revisa compatibilidad de WebGL si necesitas la escena. |

Los diagnósticos con referencia se deben conservar junto con la acción que estabas realizando. No se deben presentar comparaciones sintéticas como recomendaciones para la heladería. Para el procedimiento completo, vuelve al [manual de usuario](MANUAL_USUARIO.md).
