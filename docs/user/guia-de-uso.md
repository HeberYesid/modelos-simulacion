# Guía rápida de uso de Boquitas

Esta guía resume cómo preparar y usar la aplicación local. Para instrucciones detalladas de cada formulario y control, consulta el [manual completo en español](MANUAL_USUARIO.md). La [guía técnica](../technical/technical-guide.md) reúne instalación, comandos y versiones fijadas.

Boquitas permite probar escenarios hipotéticos de llegada, pago, espera, preparación y entrega. **Los valores iniciales son sintéticos y no están calibrados con el negocio.**

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

El botón **Modo oscuro** de la barra superior cambia entre los temas claro y oscuro. En la primera visita se usa la preferencia del sistema; el navegador recuerda tu elección. Al volver al tema del sistema, la aplicación vuelve a seguirlo automáticamente. El cambio de tema conserva el escenario que estás editando y los resultados abiertos.

## Importar observaciones

1. Abre **Datos observados** y selecciona un archivo CSV/TXT en UTF-8 de hasta 10 MiB, o pega el texto completo.
2. Usa **Sin correcciones** para fuentes no reconocidas. El perfil aprobado se usa solo con sus archivos de referencia; no vuelvas a aplicar una corrección que ya esté reflejada en el archivo.
3. Revisa conteos, campos desconocidos, exclusiones y conflictos antes de interpretar los registros.

Los IDs de caja y entrega son locales a cada estación. No demuestran que los registros correspondan a la misma persona u orden. La referencia corregida conserva cantidades de personas desconocidas y un solapamiento de seis intervalos de entrega frente a cuatro preparadores reportados. **La importación no calibra el modelo ni autoriza a ajustar los parámetros para ocultar ese conflicto.**

Consulta el [manual completo de observaciones](MANUAL_USUARIO.md#4-revisar-datos-observados) para el encabezado, los campos y un ejemplo ficticio.

## Reproducir los días medidos en 3D

1. Abre **Datos observados → Reproducir días medidos en 3D**.
2. Pulsa **Ver martes 20 de octubre** o **Ver viernes 23 de octubre**. Los 135 registros de esas visitas ya están incluidos; no necesitas importar archivos.
3. Pulsa **Reproducir datos medidos**. Puedes pausar, cambiar entre 1×, 5×, 20× y 60×, retroceder con el **Reloj del día medido** o volver al inicio.
4. En **Inspeccionar registro medido**, selecciona una fila. Sus horas son botones que llevan al instante registrado. El inspector conserva la fuente y la línea de origen; los últimos ocho eventos hasta ese instante se muestran debajo.

Cada cubo representa un registro de estación, no una persona ni un trabajador. Las posiciones son ilustrativas y no se dibujan recorridos entre estaciones. El martes, caja y entrega mantienen sus IDs independientes; el viernes, el inspector señala el vínculo confirmado de los pedidos 1–8. Los campos no registrados permanecen desconocidos. **Qué se conoce y qué falta** explica el estado inicial parcial, los solapamientos y la pausa sin límites medidos.

La reproducción usa las marcas originales de la ventana observada: martes 16:45:35–18:41:30 y viernes 17:20:23–18:21:09, incluida la última entrega. No son las horas de apertura y cierre del negocio. No ejecuta el motor ni calcula métricas de simulación. No completa datos faltantes ni constituye calibración o validación empírica. Si falla la vista 3D, el reloj, los eventos y el inspector siguen disponibles; puedes reintentar la vista.

## Entender la demostración

Todos estos valores son entradas sintéticas para aprender a usar el simulador:

Para probarla sin cargar datos, en **Datos observados** pulsa **Preparar mi primera simulación**. La importación sigue disponible para revisar fuentes por separado.

| Parámetro | Valor inicial |
| --- | --- |
| Modo martes | 1 cajero y 4 preparadores, en equipos separados |
| Modo normal | 1 trabajador integrado |
| Horario | Apertura 15:00; cierre de admisiones 21:30 (`H = 23.400 s`) |
| Estado inicial | Vacío, como supuesto |
| Llegadas | Exponencial, media 180 s; primera llegada después de una espera generada |
| Grupo | 1 persona con probabilidad 0,6; 2 con probabilidad 0,4 |
| Pago | Triangular 15 / 30 / 45 s |
| Preparación por orden | Triangular 60 / 120 / 180 s, independiente del tamaño del grupo |
| Medio de pago | Transferencia con probabilidad 0,25; efectivo en las demás órdenes, sin espera adicional |
| Paciencia | Desactivada (`null`); si se activa, solo afecta la espera antes del primer pago |
| Semilla raíz | `20261020` |
| Comparación | 30 réplicas; intervalo bilateral del 95 % |

Un grupo comparte una orden, un pago y una preparación; esta versión no aumenta la preparación según el tamaño del grupo. Las nuevas ejecuciones no añaden espera por confirmación de transferencias. La tabla de órdenes y el inspector muestran el medio de pago: efectivo o transferencia. Si un archivo antiguo no registró ese dato, aparece como no registrado. Los resultados guardados conservan sus tiempos originales al reabrirlos. No se modelan recetas ni entregas parciales y la cola lógica no representa un aforo físico.

En **Escenarios**, el modo, la capacidad, el horario y los tiempos quedan a la vista. Abre **Opciones avanzadas** para cambiar la identificación, los grupos, las órdenes presentes al abrir, las pausas programadas, la semilla y las réplicas de comparación. Abre **Comparar alternativas** para copiar un candidato. Los tiempos se escriben en segundos; las probabilidades deben sumar 1. Toda edición necesita una ejecución nueva.

Para proteger la ejecución durante las pruebas extremas, cada equipo admite hasta 32 trabajadores y cada pedido hasta 50 personas; una réplica admite como máximo 10.000 personas y 1.000 órdenes iniciales. Estos son límites de cálculo del programa, no medidas del aforo ni de la capacidad real de Boquitas. Las comparaciones tienen además un presupuesto total de trabajo: si aparece un aviso de tamaño, reduce las réplicas, la demanda o el horario y vuelve a intentarlo.

Mientras se calcula una réplica o comparación, puedes pulsar **Cancelar ejecución**. Espera a que se confirme la detención antes de iniciar otra; el resultado anterior y el borrador se conservan. Una solicitud que supera 60 segundos se detiene con un mensaje para reducir su tamaño. Para conservar resultados antes de recargar o cerrar la página, descarga su JSON.

### Afluencia por horarios y productos del menú

En **Escenarios**, activa **Definir llegadas por franja** para indicar el ritmo de cada parte de la jornada. Los límites se expresan en minutos desde la apertura y las tasas en **órdenes o grupos por hora**, no en personas. Las franjas deben cubrir toda la jornada, en orden y sin huecos. Una tasa de cero representa un tramo sin llegadas. Si cambias el cierre, revisa el límite de la última franja.

Esta opción requiere la forma **Exponencial**. Usa un proceso de Poisson con tasa distinta por franja: conserva la aleatoriedad, pero los tiempos entre llegadas de toda la jornada ya no tienen una única media exponencial. Al cruzar un límite, el generador aplica también la tasa del tramo siguiente; no mantiene el ritmo anterior hasta que llegue otro cliente. Al desactivar la opción, vuelve a usarse la distribución base conservada.

Activa **Generar órdenes con productos del menú** para elegir las cantidades de cada tipo de pedido y su probabilidad. Se incluyen **ensalada de frutas, helado y granizado**, con tiempos por unidad editables. Los valores iniciales son ejemplos, no mediciones del negocio ni una lista completa de su oferta. Las probabilidades de los tipos de pedido deben sumar 1. Para usar siempre la misma combinación, deja un solo tipo con probabilidad 1.

La preparación de una orden suma la cantidad de cada producto multiplicada por su tiempo por unidad. Por ejemplo, con ensalada a 180 s y helado a 60 s, dos ensaladas y un helado necesitan 420 s. El grupo conserva una sola orden, un pago y un trabajador durante esa preparación; no se modelan recetas, preparación paralela por producto ni entregas parciales. Las órdenes presentes al abrir conservan sus tiempos explícitos. Al desactivar el menú, vuelve a usarse el tiempo global de preparación conservado.

El resultado JSON guarda los productos y sus cantidades. La reproducción 3D muestra modelos distintos durante la preparación y el inspector permite consultar el pedido exacto. Los archivos antiguos sin productos conservan su representación genérica; no se les asigna un menú por inferencia.

### Programar una pausa para cobrar (V2)

En **Escenarios → Opciones avanzadas**, pulsa **Activar pausas programadas** y conserva el modo **Normal** con exactamente una persona integrada. Añade una fila en **Pausas programadas para cobrar** y escribe el segundo desde la apertura, la orden cuya preparación se pausará y la orden que pasará a cobrar. Los tres valores son supuestos explícitos del usuario: no se infieren de las observaciones. Usa IDs literales presentes en cada réplica; los IDs aleatorios llevan el índice de réplica y no se sustituyen automáticamente. Si cambias a una capacidad incompatible, la interfaz conserva la fila y muestra cómo resolver el conflicto.

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

## Modelos de colas y desempeño

En **Resultados → Modelos de colas y desempeño → Ver métricas por etapa**, consulta:

- **Martes:** pago y preparación en serie. El encabezado identifica el equipo y su cantidad de servidores. Debajo aparece el **modelo de referencia** M/M/1 con una persona o M/M/s con varias; esa etiqueta no afirma que el escenario cumpla sus supuestos.
- **Viernes:** una persona cobra y prepara; se muestra una sola etapa con referencia M/M/1. Los archivos de otros escenarios integrados conservan su cantidad de personal.
- **L y Lq:** promedio de órdenes en la etapa y en espera durante la jornada. **W y Wq:** tiempo promedio en la etapa y antes de iniciar el servicio, para órdenes nuevas completadas. Los tiempos incluyen la finalización después del cierre. **ρ:** carga teórica o fracción del tiempo que el equipo estuvo reservado en la simulación.

La tabla compara la referencia teórica con una réplica; el martes también muestra el recorrido completo. Las tasas λ y μ se expresan en órdenes por hora y por servidor, respectivamente; μ no es la capacidad total del equipo. P₀ y P(esperar) son probabilidades teóricas.

Las tasas configuradas λ y μ se muestran también cuando las fórmulas M/M no aplican. Se calculan a partir de los tiempos medios de la configuración y no son mediciones de la réplica. μ usa la preparación por productos cuando el menú está activado y el servicio total en atención integrada. Con franjas horarias, λ se identifica como un promedio de la jornada, no como una tasa constante. En preparación, λ es una referencia externa; puede diferir de las llegadas efectivas desde pago, especialmente si hay retiros. Si un tiempo medio no permite una tasa finita, se indica «No disponible» y su motivo.

Un servicio de pago no exponencial no demuestra que caja sea inestable. En ese caso, el aviso de preparación indica que **no se puede asumir que las salidas de pago sean Poisson con esta configuración**. La falta de régimen estable de una referencia M/M se informa por separado cuando su carga alcanza o supera el 100 %.

Las fórmulas M/M requieren llegadas Poisson a tasa constante y servicios exponenciales independientes. Si la carga alcanza o supera el 100 %, no se muestran promedios estacionarios finitos. Con paciencia, franjas de demanda, interrupciones o distribuciones incompatibles se explica por qué no aplica la referencia. Las llegadas a preparación solo se consideran Poisson cuando la etapa de pago cumple los supuestos y es estable.

El viernes, el motor suma pago y preparación. Esa suma normalmente no es exponencial: por eso sus valores M/M/1 se identifican como **aproximación**, conservando los resultados simulados. El sistema no cambia las distribuciones para forzar una etiqueta. En atención integrada, Lq y Wq describen la espera antes del primer pago; los indicadores de pausas se consultan por separado.

Los valores se vuelven a calcular al abrir un resultado guardado y no cambian si editas un escenario sin ejecutarlo. Los nuevos indicadores de esta vista no agregan columnas a los archivos CSV del motor. Una comparación con la teoría no constituye calibración ni validación empírica.

## Entender qué podrías mejorar

En **Resultados**, el apartado **Dónde se acumula la espera** muestra si hubo más fila antes de pagar o mientras se esperaba la preparación. Explica los números y propone otra situación que podrías probar. Cuando una misma persona cobra y prepara, la fila de pago también puede crecer mientras prepara pedidos.

Después de comparar escenarios, busca **Qué puedes mejorar** y elige **¿Qué quieres mejorar?**: recibir el pedido más pronto, reducir los retiros por espera o reducir el tiempo después del cierre. Cambiar esta opción vuelve a leer el resultado guardado; no ejecuta otra simulación.

Cada alternativa se compara con el primer escenario. **Ver datos y qué probar** explica qué apoya la sugerencia y qué podrías probar después. Si mejora un aspecto pero empeora otro, la desventaja queda visible. **Sin ventaja clara** significa que estas pruebas no permiten recomendar el cambio para ese objetivo. Si faltan datos o cambiaron las condiciones comparadas, el programa lo indica.

El diagnóstico de una prueba elegida describe solo esa prueba, no todas las pruebas de la comparación. Los cambios del formulario que todavía no hayas ejecutado no modifican el análisis guardado.

**Las sugerencias dependen de los supuestos de la simulación.** Sirven para plantear pruebas; no son mediciones del negocio ni garantizan que el mismo resultado ocurra en la tienda.

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

Los diagnósticos con referencia se deben conservar junto con la acción que estabas realizando. Las sugerencias de la simulación son ideas para comprobar; no deben presentarse como mejoras ya demostradas para la heladería. Para el procedimiento completo, vuelve al [manual de usuario](MANUAL_USUARIO.md).
