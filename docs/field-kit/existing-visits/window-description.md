# Descripción de las ventanas observadas

Este informe resume los conteos por estación dentro de las dos ventanas ya confirmadas y qué entradas del modelo siguen sin poder identificarse. Es una ampliación descriptiva de la evidencia existente; no incorpora nuevas mediciones.

## Conteos por ventana

Las ventanas se cuentan con sus dos extremos incluidos. El usuario confirmó cobertura completa, sin pausas de observación ni pedidos omitidos. La tasa se calculó como `conteo × 3600 / segundos observados`; el numerador y el denominador aparecen en cada resultado.

| Visita | Ventana | Conteo registrado | Cálculo | Registros por hora observada |
| --- | --- | --- | --- | ---: |
| Martes 2x1, 20/10/2026 | 16:45:35–18:41:30 (6.955 s; 1,9319 h) | Caja: 61 registros; 58 clasificados completos y 3 retiros | 61 / 6.955 s × 3.600; 58 / 6.955 s × 3.600; 3 / 6.955 s × 3.600 | Caja: 31,57; completos en caja: 30,02; retiros: 1,55 |
| Martes 2x1, 20/10/2026 | 16:45:35–18:41:30 (6.955 s; 1,9319 h) | Entrega final: 58 registros | 58 / 6.955 s × 3.600 | 30,02 |
| Día normal, 23/10/2026 | 17:20:23–18:21:09 (3.646 s; 1,0128 h) | Caja: 8 registros clasificados completos | 8 / 3.646 s × 3.600 | 7,90 |
| Día normal, 23/10/2026 | 17:20:23–18:21:09 (3.646 s; 1,0128 h) | Entrega final: 8 registros | 8 / 3.646 s × 3.600 | 7,90 |

Son conteos de registros de etapa por hora observada. No representan una tasa global de llegadas, capacidad de servicio, utilización ni rendimiento de equilibrio. El martes ya había clientes esperando al inicio; su cantidad y estación **no se registraron y no se pueden recordar**. También se desconoce si había pedidos en preparación al comenzar cualquiera de las visitas. Por tanto, los conteos podrían incluir trabajo que ya estaba en curso antes del inicio.

Los registros incluyen eventos en ambos límites confirmados; la última entrega de cada visita ocurre exactamente al final de la ventana. El simulador cuenta sobre `[0,H)`, que excluye el evento en `H`; se requiere una regla común de inclusión de extremos antes de comparar esos conteos.

| Visita | Entregas registradas con fin incluido | Entregas en el mismo intervalo con fin excluido | Registro exactamente en el fin |
| --- | ---: | ---: | --- |
| 20/10/2026 | 58 | 57 | Entrega ID 59, 18:41:30 |
| 23/10/2026 | 8 | 7 | Entrega ID 8, 18:21:09 |

Es una diferencia de regla de conteo, no una pérdida de datos. En un contraste futuro, puede calcularse por separado el conteo de eventos de la traza en `0 <= t <= H` para compararlo con la captura completa; las métricas nativas del simulador deben conservar su definición y etiqueta `[0,H)`. No se alteran los tiempos fuente ni se añade un épsilon al horizonte para forzar coincidencias.

Como medida enlazada ya documentada, los ocho pedidos del día normal tienen un tiempo transcurrido medio de **226,625 s/pedido** desde la llegada a caja hasta la entrega. Es un resultado descriptivo del recorrido observado, no tiempo de trabajo activo. Los IDs del martes no están enlazados entre estaciones.

## Identificabilidad de entradas del modelo

| Entrada | Estado con la evidencia actual | Respaldo y límite |
| --- | --- | --- |
| Duración activa de caja | No medida ni identificable | Las marcas delimitan ventanas transcurridas, no segmentos activos. El martes se solapan tres ventanas de caja a las 16:51:10 con una persona reportada en caja. |
| Duración activa de preparación | No medida ni identificable | Las marcas son tiempo transcurrido. El viernes se confirmó una interrupción para cobrar, pero no se midieron sus límites exactos; el martes se solapan seis ventanas de entrega a las 17:00:10 frente a cuatro personas reportadas en preparación. |
| Llegadas entre pedidos, definición de llegada global y cohorte inicial | No identificables | Las llegadas están registradas por estación y no establecen una definición global ni la historia anterior al inicio. El martes había clientes esperando, pero el número y la estación no se registraron y no se pueden recordar. El trabajo inicial en preparación sigue sin confirmar en ambas visitas. |
| Tamaños de grupo | No registrados | Los registros e IDs son de pedidos/estaciones, no de personas. Los ocho enlaces del viernes no revelan el tamaño de grupo; los IDs del martes no se enlazan entre estaciones. |
| Medio de pago, probabilidad y confirmación de pago por transferencia | No identificables como entradas del modelo | No se registró el medio de pago ni se separó la espera de confirmación externa del trabajo activo de caja. La diferencia de marcas entre caja y entrega no mide confirmación bancaria ni permite estimar la probabilidad de pagar por transferencia. |
| Paciencia | No identificable | Se registraron tres retiros el martes, pero la evidencia disponible no identifica una entrada o distribución general de paciencia; también falta el conteo y estación de la fila inicial. |
| Límites de pausas programadas | No medidos ni identificables | Se confirmó que el trabajador interrumpió la preparación el viernes para cobrar, pero no se cronometraron el inicio y la reanudación de la pausa. Los 183 s transcurridos del pedido 6 no son preparación activa medida. |
| Personal reportado | Configuración reportada, no capacidad medida | Martes: una persona en caja y cuatro en preparación. Día normal: una persona integrada. Los solapamientos del martes son una discrepancia por revisar; no justifican inferir personal adicional, asignaciones ni capacidad. |

Estas conclusiones aportan un diagnóstico descriptivo para H04. No ajustan entradas ni establecen umbrales de aceptación. La revisión independiente conserva el estado **NOT_READY**; no se realizó calibración ni validación empírica.

## Trazabilidad y pendientes

- [Registros fuente, ventanas confirmadas y hashes](evidence.json)
- [Revisión independiente y cambios de confirmación](review.json)
- [Cálculos descriptivos existentes](../../../plans/evidence/comparison-calculations.json)
- [Mediciones y decisiones pendientes](../pendientes-de-medicion.md)
