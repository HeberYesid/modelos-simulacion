# Estado de resolución de los hallazgos

Actualización del 25 de octubre de 2026. Este registro distingue correcciones verificadas, instrumentos preparados y actividades que requieren nueva evidencia. El informe original de hallazgos conserva su carácter histórico; no se reemplaza ni se modifica para borrar pendientes anteriores.

| Hallazgo | Trabajo realizado | Estado y siguiente condición de cierre |
| --- | --- | --- |
| H01 Reapertura de comparaciones grandes | Límites separados para observaciones y resultados, salida JSON compacta acotada y descarga del contenido exacto recibido; regresiones de API, archivos y navegador. | Corrección integrada y comprobada también con API/interfaz de Spec07: descarga y reapertura exactas de 14.240.829 bytes sin ejecutar otra comparación. |
| H02 Interrupciones del trabajador integrado | Spec07 implementa pausas explícitas para cobrar con un trabajador integrado y conserva H01 y la versión 1. | Aceptación de ingeniería completada: 28/28 tareas, pruebas y comprobación visual. Véase el [informe de Spec07](../openspec/changes/boquitas-07-preparation-interruptions/verification-report.md). La política es un supuesto programado; no constituye calibración ni validación empírica. |
| H03 Mediciones | Kit preparado y archivo trazable de las dos visitas disponibles: 135 registros de estación, tres fuentes con hashes y ocho enlaces confirmados solo para el viernes. Revisión independiente de filas, intervalos y resúmenes. El usuario confirmó el 25/10 los límites de observación en el primer y último registro de cada fecha: 20/10 de 16:45:35 a 18:41:30 (6955 s), y 23/10 de 17:20:23 a 18:21:09 (3646 s), así como el registro completo de pedidos sin pausas de observación ni omisiones. También confirmó clientes esperando al inicio del martes y ninguno esperando al inicio del viernes. | Parcial: consolidación histórica, ventanas y cobertura de pedidos confirmadas. Cantidad y fila inicial del martes: no registradas, por confirmación del observador; tratamiento documental resuelto sin imputación. Siguen pendientes identificación de pedidos iniciales y preparación en curso en ambas visitas, base del reloj, grupos, segmentos activos y aclaración de los solapamientos del martes. Si no pueden respaldarse retrospectivamente, requieren nuevas capturas. No hay muestra declarada suficiente ni aprobación empírica. |
| H04 Parámetros reales | Plantilla de procedencia y diagnóstico de identificabilidad de ocho grupos de entradas; conteos descriptivos por hora con ventanas confirmadas. | Diagnóstico completado con las fuentes disponibles. No hay parámetros activos ajustados: ventanas transcurridas y densidades de registros no se presentan como entradas calibradas. El personal conserva su condición de configuración reportada. |
| H05 Validación independiente | Plan de decisiones previas, manifiesto por visita y revisión científica. Se documentó la alineación de extremos: la captura incluye la última entrega; la ventana nativa del simulador usa `[0,H)`. | Instrumentos preparados. Faltan criterios sustentados, aprobaciones reales y visitas reservadas que permitan un contraste independiente. |
| H06 Experimentos e interpretación | Plantilla de diseño de escenarios y actualización de la comparación descriptiva en la copia académica. | La comparación existente no se presenta como experimento causal. Los experimentos operativos y recomendaciones requieren calibración y validación previas. |
| H07 Informe académico | Nueva [copia del 25 de octubre](<academic/Boquitas - Trabajo académico actualizado - 2026-10-25.docx>) con cierre de Spec07, ventanas y cobertura confirmadas, estado inicial parcial, datos no registrados y conteos descriptivos por hora. Se conservan los documentos anteriores. | Actualización del estado actual completada: 27 páginas revisadas, índice nativo actualizado, cinco tablas y dos imágenes preservadas. Véase la [verificación](academic/H07-verification-2026-10-25.md). Quedan pendientes los datos de portada y los resultados, discusión y conclusiones finales que dependan de calibración, validación y experimentación. |
| H08 Uso por otro integrante | Lista separada para instalación limpia, referencia científica, arranque/cierre, comparación, descarga, reapertura y reproducción. | Comprobación preparada. Otra persona debe ejecutarla y registrar sus resultados. |

## Utilizar los instrumentos

La [guía del kit](field-kit/README.md) explica cómo copiar las plantillas y conservar los desconocidos. La pregunta del análisis se tomó del informe académico existente; no se inventaron tamaños de muestra, tolerancias ni aprobaciones.

```powershell
uv --cache-dir .uv-cache run --frozen --offline python scripts/check_empirical_readiness.py --data-dir docs/field-kit/templates
```

Las plantillas vacías deben devolver `NOT_READY` y código de salida 2. Un resultado `STRUCTURALLY_READY` solo expresa el alcance del chequeo estructural; deja la validez empírica, la suficiencia estadística y la independencia de identidades entre visitas como no evaluadas. No debe modificarse un dato observado para obtener otro estado.

Los instrumentos distinguen la [revisión científica](field-kit/acceptance-checklist.md) de la [comprobación del software por otro integrante](field-kit/software-handoff-checklist.md).

## Evidencia técnica disponible

- [Corrección H01](audit-remediation-2026-10-24/H01-verification.md): defecto observado, límites, cambios y comprobaciones enfocadas.
- [Kit empírico](field-kit/implementation-notes.md): regresiones de integridad y límites del verificador.
- [Análisis por ventana e identificabilidad](field-kit/existing-visits/window-description.md): densidades descriptivas verificadas y límites para la calibración.
- [Visitas existentes](field-kit/existing-visits/README.md): 135 registros preservados, ocho enlaces de pedido confirmados para el viernes y revisión independiente. Los [pendientes de medición](field-kit/pendientes-de-medicion.md) delimitan lo que aún falta para H03 y el diseño previo de H05.
- [Actualización académica](audit-remediation-2026-10-24/academic-document-verification.md): cambios, conservación del original y revisión de presentación.
- [Actualización académica del 25 de octubre](academic/H07-verification-2026-10-25.md): cierre de Spec07 y últimas confirmaciones de campo incorporados a una nueva copia; conservación, índice y revisión visual independiente.
- [Spec07](../openspec/changes/boquitas-07-preparation-interruptions/tasks.md): tareas del bloque de interrupciones; sus marcas dependen de aceptación observada en el chat responsable.
- [Fuentes preservadas](audit-remediation-2026-10-24/preserved-sources.json): huellas del informe académico original, el informe de hallazgos, las tres fuentes de observación y la referencia científica de versión 1.

## Límites y conservación

Los IDs del martes no se enlazan entre estaciones. El enlace confirmado de los ocho pedidos del 23 de octubre se limita a esa visita. Se conserva el conflicto de seis intervalos frente a cuatro preparadores; no se ajustaron tiempos ni personal para eliminarlo.

La política vigente de archivos conserva 10 MiB para observaciones y permite hasta 64 MiB para JSON guardado y salidas completas de la API. Esta corrección del flujo de reapertura sucede después del diseño histórico de Spec04; las guías actuales y la evidencia de H01 documentan el comportamiento vigente. Los paquetes históricos no se reescriben.

No se realizaron nuevas mediciones, ajustes de parámetros, validación empírica, aprobación por un operador ni aceptación humana en otro equipo. La optimización de carga y la consolidación de una entrega versionada siguen como mejoras posteriores; no se hicieron commits, publicaciones ni despliegues.
