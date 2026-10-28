# Registros existentes de las visitas

Este archivo acompaña a [evidence.json](evidence.json), que conserva las **135 filas fuente** disponibles: 119 del martes 20/10/2026 y 16 del día normal 23/10/2026. Es un archivo de evidencia existente; no documenta una nueva recolección.

## Qué contiene

- Cada registro conserva el identificador estable de la fuente (source_id), su record_id, la línea de origen, el ID local de estación y todos los campos crudos como texto.
- Las marcas de hora permiten calcular algunos intervalos transcurridos en segundos. Se distinguen las parejas de campos usadas. Estos valores no separan trabajo activo de espera o pausa.
- Los ocho IDs del 23/10 se enlazan entre caja y entrega porque esa correspondencia fue confirmada para esa visita. Las referencias a ambas líneas aparecen en confirmed_order_joins.
- Las filas del martes se mantienen separadas por estación. No hay enlaces entre sus IDs de caja y entrega.

Los IDs de estación no son IDs globales de pedido. Las 61 filas de caja y las 58 filas de entrega del martes son registros por estación; no permiten deducir cuántas personas o grupos participaron. En la visita normal, el mismo ID de caja y entrega corresponde al pedido enlazado dentro de esa visita, pero tampoco informa el tamaño del grupo.

## Límites de lo observado

El 25/10/2026 el usuario confirmó que el primer dato de cada fecha marca el inicio de la observación. Se registró el primer evento cronológico: **20/10 a las 16:45:35** (caja, ID 1, línea 60 de la fuente corregida) y **23/10 a las 17:20:23** (caja, ID 1, línea 2). La confirmación y sus referencias están en `observation_start_confirmation` de cada visita en el JSON.

El mismo día el usuario confirmó que se retiraba a la hora del último registro de cada fecha. La última marca cronológica corresponde a una entrega en ambas visitas: **20/10 a las 18:41:30** y **23/10 a las 18:21:09**. La confirmación y sus referencias están en `observation_end_confirmation`.

| Visita | Inicio confirmado | Fin confirmado | Duración transcurrida |
| --- | --- | --- | --- |
| 20/10/2026 | 16:45:35 | 18:41:30 | 1 h 55 min 55 s (6955 s) |
| 23/10/2026 | 17:20:23 | 18:21:09 | 1 h 00 min 46 s (3646 s) |

El usuario confirmó también que registró todos los pedidos de ambas visitas durante esos intervalos, sin pausas de observación ni omisiones. La cobertura de pedidos queda registrada como **completa según declaración del observador**, con la declaración original en `observation_coverage_confirmation`. Esta confirmación no significa que el trabajador nunca pausara la preparación ni que se midieran todos los segmentos de actividad.

El usuario confirmó que **el martes ya había clientes esperando al empezar y el viernes no había clientes en espera**. Indicó después que no recuerda cuántos esperaban el martes ni en qué fila: ambos campos quedan **no registrados**, con valor nulo y estado `not_recorded`, y no se reconstruirán de memoria. No se identificaron sus pedidos ni se confirmó si había pedidos ya en preparación en alguna de las visitas. No se asignaron esos clientes a filas fuente ni se reconstruyeron llegadas anteriores al inicio. La ausencia de clientes esperando el viernes no se equipara automáticamente a ausencia de trabajo en curso.

La base del reloj y los tamaños de grupo/personas siguen desconocidos o sin confirmar. Los extremos se consideran límites de observación por la aclaración explícita del usuario; la coincidencia con marcas de eventos por sí sola no habría confirmado esos límites. El reloj no trae zona horaria ni desplazamiento confirmado.

Los segundos derivados expresan únicamente tiempo transcurrido entre dos marcas fuente. No son duraciones de trabajo activo, utilización ni capacidad. La fuente del día normal muestra 183 segundos transcurridos entre el inicio de preparación y la entrega del pedido 6, con una interrupción para cobrar el pedido 7; los límites exactos de la pausa y reanudación siguen desconocidos. No se presentan 173 segundos como preparación activa medida.

El informe descriptivo vigente está en [comparacion-martes-vs-normal-2026-10.md](../../../plans/comparacion-martes-vs-normal-2026-10.md). La nota histórica de ese informe que dejaba la propuesta de interrupciones pendiente/no implementada fue superada por el cierre de ingeniería de Spec07: [informe de verificación Spec07](../../../openspec/changes/boquitas-07-preparation-interruptions/verification-report.md). Ese cierre confirma aceptación de ingeniería y aclara que no calibra ni valida empíricamente el modelo.

empirical_status queda en NOT_READY. Este paquete no estima parámetros ni declara calibración, validación o representatividad. La pregunta y las decisiones aún pendientes en las plantillas del [kit de campo](../README.md) se conservan sin cambios.

## Revisión y siguiente paso

La [revisión independiente](review.json) comprobó las 135 filas, sus líneas, los tres hashes de origen y todos los intervalos derivados; confirmó los ocho enlaces del viernes y reprodujo las cuatro estadísticas descriptivas por estación. Las nueve plantillas del kit permanecen idénticas. Esa comprobación verifica trazabilidad y aritmética, no la suficiencia de la muestra ni la validez del modelo.

La organización de la evidencia disponible está terminada. **H03 queda parcialmente resuelto:** faltan aclaraciones y mediciones para su cierre empírico. La [lista de pendientes por registro](../pendientes-de-medicion.md) permite revisar con el operador las ventanas, cobertura, reloj, grupos, solapamientos y segmentos activos, además de las decisiones previas de H05. Una respuesta que no tenga respaldo permanece por confirmar; no se completa con una simulación.

El [análisis por ventana](window-description.md), con sus [cálculos completos](window-description.json), aprovecha las ventanas y la cobertura confirmadas: reporta conteos por hora observada, comprueba la entrega exactamente en cada extremo final y clasifica qué entradas del modelo siguen sin identificarse. La cantidad y fila inicial del martes se conservan como **no registradas**; no vuelven a tratarse como una pregunta de memoria pendiente. Este avance completa el diagnóstico con las fuentes disponibles, sin presentar las densidades de registros como parámetros calibrados.
