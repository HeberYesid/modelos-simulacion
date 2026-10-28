# Kit de preparación de evidencia empírica

Este kit ayuda a preparar registros, decisiones y trazabilidad para un estudio de campo. Las plantillas CSV contienen solo encabezados; no las complete con salidas simuladas ni copie promedios como si fueran mediciones. El archivo de [las visitas existentes](existing-visits/README.md) conserva por separado la evidencia histórica del 20 y 23 de octubre, con su procedencia y límites; no constituye una captura nueva ni estima parámetros.

La [lista concreta de faltantes](pendientes-de-medicion.md) identifica qué debe aclararse con el operador, los conflictos por fila y las decisiones previas para la validación. La consolidación histórica no convierte las plantillas en una muestra completa ni cambia las aprobaciones pendientes del plan de análisis.

El plan conserva la pregunta que ya figura en el informe académico. Los objetivos de precisión, tamaños de muestra, tolerancias y aprobaciones continúan pendientes; la pregunta existente no resuelve por sí sola esas decisiones.

## Preparar una copia de trabajo

Conserve `templates/` como referencia. Copie su contenido a una carpeta de trabajo protegida y use esa carpeta con el verificador. Mantenga las fuentes originales de solo lectura y guarde fuera de los CSV cualquier clave que permita volver de un identificador anónimo a una persona.

```powershell
uv --cache-dir .uv-cache run --frozen --offline python scripts/check_empirical_readiness.py --data-dir <carpeta-de-trabajo>
```

El comando imprime JSON. El código de salida `0` significa que la estructura y las decisiones documentadas pasan este chequeo; `1` señala datos o estructura inválidos; `2` señala evidencia o decisiones todavía pendientes. `STRUCTURALLY_READY` no significa que la muestra sea suficiente, que el modelo esté calibrado, que haya sido validado ni que otra persona haya aceptado sus resultados. El comando es de solo lectura y no ajusta parámetros.

## Archivos

| Archivo | Contenido |
| --- | --- |
| `visits.csv` | Una fila por sesión, con fecha, tipo de día, ventana real observada, cobertura, estado inicial y personal reportado. |
| `orders.csv` | Una fila por pedido o intento observado. Separa pedido, grupo, tamaño observado, llegada, resultado y censura. |
| `order_people.csv` | Una fila por vínculo persona-pedido que se haya observado y pueda sustentarse. |
| `worker_segments.csv` | Una fila por segmento individual de trabajo, espera de confirmación externa, preparación, pausa u otra actividad definida. |
| `source_manifest.csv` | Identidad estable de cada fuente, huella cuando esté disponible, base del reloj y esquema de referencias. |
| `visit_split.csv` | Una asignación por visita completa a calibración, validación, exclusión o pendiente. No dividir filas de una visita entre subconjuntos. |
| `parameter_provenance.csv` | Procedencia, unidades, método, incertidumbre y aprobación de cada parámetro que se documente. No se calcula ni se ajusta automáticamente. |
| `scenario_design.csv` | Diseño aprobado de escenarios y comparaciones; no es una tabla de resultados. |
| `analysis_plan.json` | Pregunta, aprobaciones y decisiones previas sobre cobertura, eventos, censura, precisión, muestras, tolerancias y aceptación. |

## Reglas de registro

- Use identificadores anónimos estables dentro de cada visita. Registre por separado `visit_id`, `order_id`, `group_id`, `person_id` y `worker_id`. Repita un vínculo solo cuando haya sido observado. Los ID de estaciones distintas no se enlazan por parecerse. Un ID de persona es local a su visita; que se repita en otra visita no prueba que sea la misma persona ni que sean personas distintas.
- Registre fechas y horas ISO 8601, con desplazamiento UTC cuando la fuente lo permita. Si la hora es local sin desplazamiento, documente la base exacta del reloj en la visita y en el manifiesto de la fuente; no mezcle bases sin documentarlo.
- `observation_start_at` y `observation_end_at` son los límites reales de la sesión observada, no la primera y última marca de un archivo de eventos. En `reported_staff_by_pool`, anote lo reportado por grupo de trabajo; registre cambios y tareas individuales en `worker_segments.csv`.
- No convierta vacío, no observado, desconocido o censurado en `0`. Para valores desconocidos use el estado correspondiente y explique cada campo en `unknown_reason` con el formato `nombre_del_campo: motivo`; separe varios motivos con punto y coma. Deje en blanco una hora o cantidad que no se observó; no la sustituya por un extremo de la ventana ni por una duración calculada.
- En `orders.csv`, use `group_size_status=unknown` y deje `observed_group_size` vacío cuando el tamaño no se haya medido. Un pedido no equivale necesariamente a una persona. Use `arrival_status=unknown` si no se observó la llegada bajo una definición aprobada.
- En `order_people.csv`, registre solo vínculos persona-pedido observados. No fabrique una fila por integrante supuesto. El verificador exige un motivo si se registra que un vínculo es desconocido.
- En `worker_segments.csv`, use filas distintas para trabajo activo de caja, espera externa de confirmación, preparación activa y pausa de preparación. La lista exacta de categorías y sus límites debe aprobarse antes de recolectar. No reste la ventana de caja a la preparación para declarar trabajo activo medido. Si un segmento cruza un límite de observación, marque su censura y conserve el límite desconocido en blanco.
- Ponga una referencia localizable en `source_reference` (por ejemplo, hoja y fila o un ID de evento) sin repetir `source_id`. En `parameter_provenance.csv`, escriba referencias como `source_id:record-reference`, separadas por punto y coma; cada referencia debe resolver a una única visita incluida en `source_visit_ids` y asignada a calibración. Registre una huella SHA-256 cuando exista una copia fuente estable. No incluya nombres ni rutas personales en los archivos de análisis.
- En `visit_split.csv`, asigne la visita completa y congele la decisión antes de estimar. La validación debe usar visitas completas no usadas para calibrar. Si no hay base suficiente para separar, deje el estado pendiente y documente la limitación; no reutilice registros calibrados como validación independiente.
- En `analysis_plan.json`, no cambie `null`, `unset` o `pending` hasta que las personas responsables hayan aprobado decisiones sustentadas. El verificador solo comprueba que las decisiones estén documentadas; no propone valores ni decide si son adecuados.

Los estados de cobertura de visita son `complete`, `partial` o `unknown`; los resultados de pedido son `delivered`, `withdrawn`, `still_present` o `unknown`; los tamaños de grupo son `observed` o `unknown`. Para segmentos use `observed_complete`, `left_censored`, `right_censored`, `both_censored` o `unknown`. La censura identifica límites no observados; no autoriza reemplazarlos por cero ni por el inicio/fin de la visita.

## Límites de la evidencia previa

La comparación descriptiva existente analiza dos sesiones concretas y sus límites están detallados en [`plans/comparacion-martes-vs-normal-2026-10.md`](../../plans/comparacion-martes-vs-normal-2026-10.md). No copie esas filas ni sus promedios a estas plantillas como si fueran una nueva captura.

- **Martes 20/10/2026:** las filas de caja y entrega no tienen vínculo confirmado entre estaciones. Los tamaños de grupo/persona no se observaron. El usuario confirmó el 25/10 los límites de observación en el primer y último registro: 16:45:35–18:41:30. El usuario confirmó el registro de todos los pedidos sin pausas de observación ni omisiones y que ya había clientes esperando al inicio; la cantidad y fila inicial quedaron **no registradas** por instrucción del usuario. La identificación de esos pedidos y el posible trabajo en curso siguen sin confirmar. Se informó cuatro personas en preparación mientras seis ventanas de entrega se solapaban; hacen falta segmentos de actividad para interpretar el conflicto.
- **Día normal 23/10/2026:** los ID 1–8 se confirmaron como los mismos pedidos solo en esa visita. El usuario confirmó la ventana de observación en 17:20:23–18:21:09; la cobertura de pedidos está confirmada como completa por el observador, sin pausas de captura ni omisiones. No había clientes esperando al empezar, según el usuario; sigue por confirmar si había pedidos ya en preparación. La misma persona integrada interrumpió la preparación del pedido 6 para cobrar el pedido 7, pero los límites exactos de pausa y reanudación no se registraron. Los 10 segundos de la ventana de caja no son una duración medida de preparación que pueda restarse automáticamente.

Estas notas describen procedencia y límites; no completan la plantilla, no fijan parámetros y no prueban que el simulador represente otras jornadas.

## Interpretar el chequeo

Cada problema incluye un `path` relativo al directorio de datos y un `code` estable. Corrija el dato fuente o documente el estado desconocido; no cambie datos para que el chequeo dé listo. Un resultado sin errores estructurales sigue sin evaluar suficiencia estadística, representatividad, calibración o validez predictiva. Antes de presentar conclusiones, use la [`lista de aceptación independiente`](acceptance-checklist.md) con otra persona y registre la evidencia que revisó.

El CLI comprueba que cada visita tenga una sola asignación de subconjunto y que una visita no aparezca en calibración y validación a la vez. El reporte deja `cross_visit_identity_independence` como `NOT_ASSESSED`: no comprueba si las mismas personas o condiciones aparecen en visitas distintas. Esa independencia requiere una revisión separada basada en evidencia; los ID anónimos locales no se deben unir entre visitas.

La [comprobación de entrega del software](software-handoff-checklist.md) cubre la instalación y el uso por otro integrante en un entorno limpio. Es una actividad distinta de la revisión científica de los registros y sigue pendiente hasta que esa persona la ejecute.
