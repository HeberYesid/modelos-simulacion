# Comparación observada: martes de promoción y día normal

Preparado el 24 de octubre de 2026. Alcance: análisis descriptivo de las tomas del 20 y 23 de octubre y propuesta de modelado. No se han ajustado distribuciones, ejecutado experimentos nuevos ni modificado el simulador.

## Resultado principal

En los registros analizados, el día normal presenta menores esperas medias y menores intervalos medios de caja y preparación que el martes. Los datos corresponden a dos sesiones, con distinto personal y distinto número de registros. Estas diferencias no permiten atribuir el resultado al tipo de día, al número de trabajadores o a una mayor productividad.

El día normal también aporta una observación que el modelo actual no representa: una misma persona interrumpió la preparación de un pedido para cobrar otro y luego retomó la preparación.

## Fuentes y significado de los registros

| Aspecto | Martes, 20/10/2026 | Día normal, 23/10/2026 |
| --- | --- | --- |
| Fuente | `Datos Boquitas 2026-10-20 corregidos.txt`, en la carpeta académica MODELOS | Dos bloques suministrados por el usuario en esta conversación; copias en `evidence/normal-2026-10-23-caja.txt` y `evidence/normal-2026-10-23-entrega.txt` |
| Registros de caja | 61: 58 con atención completa y 3 retiros | 8 con atención completa |
| Registros de preparación/entrega | 58 con entrega completa | 8 con entrega completa |
| Personal | 1 reportado en caja y 4 en preparación | 1 persona integrada, que cobra y prepara; no son dos trabajadores |
| Correspondencia entre estaciones | Sin vinculación de pedidos confirmada | Confirmada por el usuario: caja y entrega con el mismo ID corresponden al mismo pedido, IDs 1–8 |
| Tamaños de grupo/personas | No observados | No informados; los 8 pedidos no equivalen necesariamente a 8 personas |

En entrega, `hora_inicio` es el comienzo de la preparación y `hora_fin` la entrega del último producto del pedido. El usuario confirmó este significado para el día normal. La diferencia entre ambas marcas mide tiempo transcurrido: puede incluir pausas.

En caja, `hora_fin − hora_inicio` es la ventana registrada del cobro. No se ha separado trabajo activo de posibles esperas externas de confirmación del pago.

La vinculación confirmada del 23/10 se limita a esa toma. No establece una vinculación del martes ni convierte el ID de estación en una clave global para fuentes futuras.

## Cobertura visible en los archivos

| Marca | Martes | Día normal |
| --- | --- | --- |
| Primera llegada registrada a caja | 16:45:35 | 17:20:23 |
| Última llegada registrada a caja | 18:32:51 | 18:18:46 |
| Primera llegada registrada a entrega | 16:47:05 | 17:21:03 |
| Última llegada registrada a entrega | 18:33:01 | 18:19:33 |
| Última entrega registrada | 18:41:30 | 18:21:09 |

Estas son marcas de los registros, no el inicio y fin confirmados del trabajo de observación. Tampoco confirman que se hayan registrado todas las llegadas del período. Por ello no se calculan tasas por hora, utilización ni capacidad real a partir de estos extremos. La base del reloj y el estado inicial del local quedan pendientes de confirmar.

## Comparación por etapa

Todos los valores de esta tabla están en **segundos**. La diferencia es **día normal menos martes**. Para cada métrica se emplean 58 registros completos del martes y 8 del día normal; los 3 retiros de caja del martes se conservan en los conteos, pero no se convierten en servicios o esperas completas de valor cero.

| Métrica | Media martes | Media normal | Diferencia | Mediana martes | Mediana normal |
| --- | ---: | ---: | ---: | ---: | ---: |
| Llegada a caja → inicio del cobro | 109,5 | 41,0 | −68,5 | 76,5 | 37,5 |
| Inicio → fin registrado del cobro | 83,0 | 22,5 | −60,5 | 60,0 | 21,0 |
| Llegada registrada a entrega → inicio de preparación | 22,9 | 15,5 | −7,4 | 8,5 | 1,5 |
| Inicio de preparación → entrega final | 285,0 | 146,0 | −139,0 | 253,0 | 138,0 |

| Métrica | Mínimo–máximo martes, s | Mínimo–máximo normal, s |
| --- | ---: | ---: |
| Espera antes del cobro | 1–474 | 1–96 |
| Ventana del cobro | 1–271 | 10–39 |
| Espera antes de preparar | 0–238 | 0–106 |
| Preparación hasta entrega | 8–538 | 95–232 |

La preparación transcurrida media fue de aproximadamente **4 min 45 s** el martes y **2 min 26 s** el día normal. La diferencia observada es de aproximadamente **2 min 19 s**. El archivo no permite separar sus posibles causas: tipo y tamaño de los pedidos, carga de trabajo, pausas, medios de pago u otras tareas. No se realizó una prueba de significancia ni se estima aquí un efecto generalizable.

Se registraron 3 retiros entre 61 observaciones de caja del martes y ninguno entre las 8 del día normal. Esto describe lo registrado; no demuestra que no exista abandono en los días normales ni proporciona una distribución de paciencia.

## Recorrido completo de los ocho pedidos del día normal

La confirmación del usuario permite unir caja y entrega por fecha e ID únicamente para el 23/10. El tiempo total se calcula directamente como **entrega final − llegada a caja**.

| Pedido | Espera caja, s | Cobro, s | Fin caja → llegada a entrega, s | Espera preparación, s | Preparación transcurrida, s | Total |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 21 | 17 | 2 | 9 | 232 | 4 min 41 s |
| 2 | 1 | 30 | 1 | 1 | 131 | 2 min 44 s |
| 3 | 72 | 24 | 2 | 4 | 135 | 3 min 57 s |
| 4 | 96 | 39 | 2 | 2 | 154 | 4 min 53 s |
| 5 | 43 | 18 | 1 | 0 | 97 | 2 min 39 s |
| 6 | 39 | 32 | 2 | 1 | 183 | 4 min 17 s |
| 7 | 20 | 10 | 2 | 106 | 141 | 4 min 39 s |
| 8 | 36 | 10 | 1 | 1 | 95 | 2 min 23 s |

Media total: **226,625 s = 3 min 46,625 s**; mediana: **247 s = 4 min 7 s**. La suma de los ocho tiempos totales es **1813 s**. En cada fila, el tiempo total coincide exactamente con la suma de sus cinco intervalos.

La descomposición media exacta es `41 + 22,5 + 1,625 + 15,5 + 146 = 226,625 s`. El intervalo de 1–2 s entre estaciones es una diferencia entre marcas registradas; no establece un tiempo físico de desplazamiento que deba incorporarse al simulador.

No se calcula un tiempo completo del martes: falta confirmar qué registros de ambas estaciones pertenecen a los mismos pedidos. Sumar sus promedios por etapa no sustituye esa vinculación. Tampoco se presentan tiempos por persona a partir de tamaños de grupo desconocidos.

## Interrupción confirmada y límites de la medición

| Hecho | Evidencia |
| --- | --- |
| Pedido 6 en preparación | 18:13:13–18:16:16: 183 s transcurridos |
| Pedido 7 llega a caja | 18:13:59 |
| Cobro del pedido 7 | 18:14:19–18:14:29: ventana de 10 s |
| Explicación confirmada por el usuario | La misma persona pausó la preparación, cobró y después continuó preparando |

El intervalo del cobro está contenido en la ventana de preparación del pedido 6. Se conserva la fuente: el solapamiento tiene una explicación operativa confirmada. La hora exacta de la pausa y de la reanudación no se registró; no debe asumirse que ambas coinciden exactamente con los extremos del cobro. Por eso **no se registra 173 s como preparación activa medida**, ni se resta automáticamente 10 s a los tiempos para calibrar.

El pedido 7 esperó 20 s antes de iniciar el cobro. Este caso demuestra que hubo una interrupción, pero no establece una política de interrupción inmediata al llegar un pedido. Tampoco permite estimar su frecuencia ni una probabilidad aplicable a otras jornadas.

En el martes, el importador mantiene la advertencia de seis ventanas de preparación abiertas a las 17:00:10 frente a cuatro preparadores reportados. Es una incompatibilidad con el supuesto de trabajo continuo y exclusivo; se necesitan segmentos de trabajo y asignaciones para interpretarla. La confirmación de una pausa el viernes no explica por sí sola los solapamientos del martes. Las ventanas de caja del martes también se superponen y no representan mediciones exclusivas de trabajo activo.

## Propuesta resumida para el simulador

Se recomienda comenzar con una opción explícita de **pausa programada para cobrar y reanudación**, disponible para un trabajador integrado en modo normal. Cada interrupción indicaría el instante, el pedido que se pausa y el pedido que se cobra. Esto permite representar y verificar el mecanismo sin inventar una política general del negocio.

El trabajador conserva el progreso del pedido pausado, atiende un cobro, retoma primero la preparación pendiente y deja el nuevo pedido pagado esperando su preparación. Los tiempos de trabajo activo, pausa y preparación transcurrida se informan por separado. La opción estaría desactivada en los escenarios actuales y requeriría adaptar contratos, métricas, guardado y reproducción antes de exponerse en la interfaz.

Una política automática de prioridad al cobro sería una ampliación posterior. Requeriría decidir y contrastar cuándo se permite interrumpir, cómo se elige el momento seguro y si se cobra uno o varios pedidos antes de retomar. El diseño técnico, casos resueltos y verificaciones propuestas están en [001-scripted-preparation-interruptions.md](001-scripted-preparation-interruptions.md). **La propuesta queda pendiente de aprobación; no está implementada.**

## Evidencia y uso siguiente

Los resultados exactos, denominadores, extremos temporales, hashes y correspondencias confirmadas se conservan en [comparison-calculations.json](evidence/comparison-calculations.json). El análisis independiente con CSV y fechas coincidió con los conteos y totales del importador existente. El martes se revisó con el perfil aprobado, que informó correcciones ya reflejadas; el día normal se revisó sin correcciones.

Para una futura calibración hacen falta el horario real de observación y su cobertura, el estado inicial, los segmentos activos y pausas, y una cobertura suficiente de pedidos y jornadas. Los datos que se usen para estimar parámetros deberán separarse de la validación independiente. En esta entrega se realiza la comparación descriptiva y la propuesta; la calibración y la validación empírica siguen pendientes.
