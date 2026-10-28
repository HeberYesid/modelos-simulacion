# Manual de usuario de Boquitas

**Versión documentada:** funciones implementadas hasta la spec 06.  
**Fecha:** 23 de octubre de 2026.  
**Idioma de la aplicación:** español.  
**Dirección local:** <http://127.0.0.1:8000>.

## 1. ¿Para qué sirve?

Boquitas permite explorar la atención de una heladería mediante simulaciones: llegada de grupos, espera para pagar, pago, confirmación de transferencias, preparación y entrega. También permite revisar archivos de observaciones y reproducir en una escena 3D el historial de una ejecución.

El flujo habitual es:

**Revisar observaciones → configurar escenarios → ejecutar → interpretar resultados → inspeccionar el recorrido → descargar archivos.**

La importación de observaciones es opcional para ejecutar una demostración. Los datos importados no se convierten automáticamente en parámetros del modelo. Los valores iniciales son ejemplos sintéticos, no estimaciones del funcionamiento real de Boquitas.

## 2. Abrir y cerrar la aplicación

### Si ya está funcionando

1. Abre <http://127.0.0.1:8000> en el navegador.
2. Comprueba que aparezca **Servicio local disponible** en la parte superior.
3. Identifica las tres pestañas: **Datos observados**, **Escenarios** y **Resultados**.

La dirección funciona en el equipo donde se ejecuta el servidor. Para apreciar la escena 3D se recomienda una pantalla de computador; las tablas, formularios e inspección textual también se pueden usar en una ventana estrecha.

### Iniciar una copia que ya está instalada y compilada

Abre PowerShell y ejecuta:

```powershell
Set-Location 'C:\Users\HeberYesid\Desktop\Universidad Trabajos\Modelos-simulación'
.\start-boquitas.ps1
```

El lanzador abre el navegador cuando el servicio responde. Mantén esa terminal abierta; puedes agregar `-NoBrowser` para abrir la dirección manualmente. También puedes ejecutar `.\.venv\Scripts\python.exe -m boquitas` directamente. Una vez instaladas las dependencias y generada la aplicación, su uso normal no necesita internet.

Si aún no está preparada, consulta el [procedimiento de instalación y compilación](../web/README.md). La instalación inicial sí puede necesitar internet. Este manual describe el inicio mediante PowerShell; no presupone un instalador ni un acceso directo de Windows.

### Cerrar

1. Descarga las configuraciones y resultados que quieras conservar.
2. Cierra la pestaña del navegador.
3. Si iniciaste el servidor en la terminal, pulsa **Ctrl+C** allí para detenerlo.

Cerrar la pestaña no detiene por sí solo el servidor ni demuestra que una solicitud en curso se haya cancelado. Si la aplicación fue iniciada en segundo plano por otra persona o herramienta, esa sesión debe detener su proceso correspondiente.

**Los cambios y resultados de la sesión están en memoria: al actualizar o cerrar la página puedes perder el trabajo que no hayas descargado.**

## 3. Primera simulación en pocos pasos

1. Entra a **Escenarios**.
2. Revisa la configuración de **Demostración sintética · sin calibrar**.
3. Para una prueba breve, conserva la apertura a las **15:00:00** y cambia **Cierre de admisiones** a **15:10:00**.
4. Deja el resto de los valores iniciales sin cambios.
5. Pulsa **Ejecutar una réplica** y espera a que termine el cálculo.
6. En **Resultados**, busca **Recorrido de la réplica**. Empieza pausado.
7. Pulsa **Reproducir**. Puedes cambiar la velocidad o mover el control **Reloj de simulación**.
8. Revisa los indicadores y pulsa **Descargar resultado JSON** para conservar la ejecución.

Este procedimiento usa parámetros sintéticos. La cantidad de personas y los tiempos que aparezcan son resultados de esa simulación, no nuevos datos observados de la tienda.

## 4. Revisar datos observados

### Importar un archivo

1. Abre **Datos observados**.
2. En **Elegir archivo**, pulsa **Buscar archivo**.
3. Selecciona un archivo **CSV o TXT**, codificado en **UTF-8**, de hasta **10 MiB**.
4. Elige la **Política de corrección**:

   - **Sin correcciones:** para revisar una fuente sin aplicar el perfil aprobado.
   - **Correcciones aprobadas · Boquitas 2026-10-20:** exclusivamente para las fuentes reconocidas de esa toma de datos.

5. Pulsa **Importar y revisar**.
6. Lee los conteos, segmentos por estación, correcciones y diagnósticos.
7. Abre **Ver filas afectadas** para inspeccionar los registros asociados con un conflicto.

También puedes elegir **Pegar texto**, pegar el encabezado y las filas completas, seleccionar la política y pulsar **Importar y revisar**.

El archivo original se conserva. Una advertencia de calidad requiere interpretación; no autoriza a cambiar automáticamente los tiempos o el personal reportado.

### Estructura del archivo

Usa el siguiente encabezado, con campos separados por comas:

```csv
lugar,fecha,tipo_dia,personal,id,hora_llegada,hora_inicio,hora_fin,hora_se_fue
```

| Campo | Contenido |
| --- | --- |
| `lugar` | `caja` o `entrega`. |
| `fecha` | Fecha en formato `AAAA-MM-DD`. |
| `tipo_dia` | Descripción del día observado. |
| `personal` | Personal reportado para esa estación. |
| `id` | Identificador local del registro. |
| `hora_llegada` | Hora de llegada registrada, en `HH:MM:SS`. |
| `hora_inicio` | Inicio registrado de la atención o preparación. |
| `hora_fin` | Fin registrado de la atención o entrega. |
| `hora_se_fue` | Hora de retiro, cuando corresponda. |

Ejemplo **ficticio** para practicar con **Sin correcciones**:

```csv
lugar,fecha,tipo_dia,personal,id,hora_llegada,hora_inicio,hora_fin,hora_se_fue
caja,2026-10-20,Ejemplo,1,1,15:00:00,15:00:10,15:00:40,
caja,2026-10-20,Ejemplo,1,2,15:02:00,,,15:03:00
entrega,2026-10-20,Ejemplo,4,1,15:01:00,15:01:15,15:03:00,
```

Los campos vacíos se conservan vacíos; no los rellenes con cero para ocultar información desconocida. Los IDs de caja y entrega son independientes: que ambas estaciones tengan un registro `1` no demuestra que pertenezcan a la misma orden.

### Cómo leer la referencia corregida

El archivo **Datos Boquitas 2026-10-20 corregidos.txt** está en la carpeta de fuentes académicas. Al importarlo con el perfil aprobado, la referencia revisada contiene:

- **119 filas:** 61 de caja y 58 de entrega.
- **Tres retiros** registrados en caja.
- Correcciones **ya reflejadas en la fuente**, por lo que no deben aplicarse otra vez.
- Un conflicto de **seis intervalos de entrega simultáneos frente a cuatro preparadores reportados**.
- Cantidad de personas y tamaños de grupo no observados.

En una fuente ya corregida puede aparecer **0 filas excluidas del perfil**: la entrega excluida ya no estaba en el archivo suministrado. Esto no significa que se haya vuelto a incluir.

Los intervalos de caja no equivalen necesariamente a trabajo activo exclusivo del cajero. Tampoco puedes deducir tiempos completos de una persona uniendo registros de ambas estaciones por su ID.

## 5. Configurar un escenario

En **Escenarios**, un escenario reúne los parámetros y supuestos que se enviarán al motor. Modificar el formulario no cambia una ejecución ya terminada.

### Modo de atención y personal

| Modo | Funcionamiento |
| --- | --- |
| **Martes de promoción** | Caja y preparación usan equipos separados. Valores iniciales: un cajero y cuatro preparadores. |
| **Día normal** | Un equipo integrado realiza pago y preparación. El valor inicial al cambiar a este modo es una persona. |

En martes, la confirmación externa de una transferencia libera al cajero para otra orden. En día normal, el trabajador conserva la orden durante esa confirmación, aunque no esté haciendo trabajo activo.

Cambiar de modo no duplica automáticamente la demanda ni cambia los tamaños de grupo. Un aumento de personal representa una hipótesis que tú estás configurando.

### Apertura y cierre

Configura **Hora de apertura** y **Cierre de admisiones**. El cierre editable debe ser posterior a la apertura y pertenecer al mismo día.

Al cerrar se dejan de admitir nuevas llegadas. Las órdenes ya admitidas continúan según las reglas del modelo hasta terminar o retirarse. Por eso el recorrido puede llegar más allá del cierre e incluso mostrar **+1 día**.

La ventana **H** es el tiempo entre apertura y cierre. No es necesariamente el tiempo total hasta la última entrega.

### Nombre e identificador

- **Identificador:** usa uno distinto por escenario, por ejemplo `referencia-1-preparador`.
- **Nombre visible:** escribe una descripción fácil de reconocer, por ejemplo `Referencia: un preparador`.

### Tiempos y distribuciones

Todos los tiempos de los parámetros se expresan en **segundos**.

| Distribución | Qué debes indicar | Ejemplo sintético |
| --- | --- | --- |
| **Constante** | Una duración fija. | Preparación de 90 segundos en todas las órdenes. |
| **Triangular** | Mínimo, valor más probable y máximo. | Pago de 15 / 30 / 45 segundos. |
| **Exponencial** | Una media positiva. | Tiempo entre llegadas con media de 180 segundos. |

Para la triangular debe cumplirse **mínimo ≤ más probable ≤ máximo**, con mínimo menor que máximo. Si quieres los tres iguales, utiliza **Constante**. El tiempo entre llegadas debe ser estrictamente positivo.

Un intervalo medio entre llegadas menor representa más llegadas por unidad de tiempo. El primer grupo también llega después de un intervalo generado: no se supone necesariamente una llegada al instante cero.

Configura por separado el tiempo entre llegadas, el trabajo activo de pago, la preparación por orden y la confirmación externa.

### Transferencias y paciencia

- **Probabilidad de transferencia:** valor de 0 a 1. `0.25` representa un 25 %; no escribas `25` para expresar ese porcentaje.
- **Confirmación externa:** espera adicional cuando la orden usa transferencia.
- **Aplicar paciencia mientras se espera el primer pago:** si se activa, el grupo puede retirarse antes de empezar a pagar cuando vence su paciencia. Una vez iniciado el pago, esta regla ya no lo hace abandonar.

### Tamaño de los grupos

Introduce tamaños enteros positivos y sus probabilidades. Ejemplo inicial:

| Personas en el grupo | Probabilidad |
| --- | --- |
| 1 | 0.6 |
| 2 | 0.4 |

Las probabilidades deben sumar **1**. Usa **Añadir tamaño** o **Quitar** para editar la lista.

Un grupo comparte una orden: tiene un pago y una preparación, aunque incluya varias personas. En esta versión, el tamaño del grupo no aumenta automáticamente el tiempo de preparación.

### Semilla y réplicas

- **Semilla raíz:** controla la generación reproducible. La demostración utiliza `20261020`. La misma configuración, semilla e índice de réplica reproducen la misma ejecución en esta versión del software.
- **Réplicas para comparar:** número de repeticiones por escenario del experimento. El valor inicial es 30 y el máximo es 200.
- **Intervalo de confianza:** las comparaciones nuevas de la interfaz usan 95 %; el campo se muestra como solo lectura.

**Ejecutar una réplica** realiza una ejecución del escenario activo. El número de réplicas del formulario se utiliza al pulsar **Comparar escenarios**, no para repetir automáticamente ese botón de ejecución individual.

## 6. Declarar trabajo que ya existe al abrir

La demostración empieza sin personas ni órdenes pendientes. Si deseas representar trabajo existente, utiliza **Estado al abrir → Añadir orden inicial**.

Completa un identificador de orden, los identificadores de sus personas —uno por línea— y la etapa actual. Según la etapa, el formulario solicita posición en la fila, trabajador asignado y tiempos pendientes.

- **Llegada previa:** se expresa en segundos respecto a la apertura. `-120` significa que llegó dos minutos antes. En blanco significa desconocida; `0` sería una llegada conocida en la apertura.
- **Posición de esta fila:** utiliza posiciones enteras desde 0 y evita repetirlas dentro de la misma fila.
- **Persona que conserva la orden:** selecciona un trabajador compatible con el modo y la etapa. No asignes dos órdenes simultáneas al mismo trabajador.
- **Tiempo restante:** indica lo que falta desde la apertura, no una duración histórica completa inventada.

Ejemplo sintético sencillo en martes:

| Campo | Valor |
| --- | --- |
| Identificador de la orden | `inicial-01` |
| Personas vinculadas | `persona-inicial-01` y `persona-inicial-02`, en líneas separadas |
| Etapa actual | En preparación |
| Llegada previa | En blanco, si es desconocida |
| Persona que conserva la orden | `preparer-1` |
| Tiempo restante de esta etapa | `90` |

Este ejemplo declara una orden compartida que ya estaba preparándose y tiene 90 segundos pendientes. No permite calcular una permanencia histórica completa cuando la llegada es desconocida.

Si cambias de modo y alguna etapa o asignación queda incompatible, corrígela expresamente antes de ejecutar. Los datos incompatibles no deben interpretarse como una configuración aceptada.

## 7. Ejecutar y consultar los resultados

1. Selecciona el escenario que quieres ejecutar.
2. Revisa los campos y pulsa **Ejecutar una réplica**.
3. Espera mientras aparece **Calculando…**. Evita enviar de nuevo la solicitud.
4. En **Resultados**, revisa la identidad del escenario, la semilla y la réplica.
5. Abre **Ver parámetros exactos enviados al motor** para comprobar la configuración que produjo el resultado.

Si después cambias un parámetro, el resultado anterior conserva su configuración original y la aplicación indica que hay **cambios sin ejecutar**. Necesitas una nueva ejecución para obtener resultados de esos cambios.

### Interpretar los indicadores

Lee siempre la unidad, población y cohorte de cada indicador:

| Concepto | Interpretación |
| --- | --- |
| **Órdenes / personas** | Una orden puede representar varias personas. Sus conteos y promedios no son intercambiables. |
| **Órdenes nuevas / iniciales** | Distinguen las admitidas después de abrir del trabajo que ya existía al inicio. |
| **Espera de pago** | Tiempo antes de comenzar el primer pago. |
| **Pago activo / confirmación** | Separan trabajo del empleado y espera externa. |
| **Espera de preparación** | Tiempo de una orden pagada antes de empezar a prepararse, aplicable al esquema de equipos separados. |
| **Preparación** | Duración de la preparación por orden. |
| **Permanencia** | Tiempo desde la llegada conocida hasta la entrega. |
| **Utilización activa / reserva** | Un trabajador puede estar reservado sin estar trabajando activamente, como en una confirmación del modo normal. |
| **Ventana / finalización de la cohorte** | Las medidas durante H pueden diferir de los resultados que incluyen entregas posteriores al cierre. |

**No disponible** no significa cero: puede faltar historia, no haber muestras válidas o no aplicar el indicador. **Ver identificador y validez** permite revisar más detalles.

La gráfica **Órdenes en fila** utiliza escalones y representa órdenes, no personas. Las tablas anchas pueden desplazarse horizontalmente dentro de su contenedor.

## 8. Comparar alternativas

1. Prepara el primer escenario: será la **referencia**.
2. Pulsa **Copiar referencia como candidato**.
3. Cambia su identificador y nombre.
4. Modifica el parámetro que deseas estudiar; para una comparación de personal, conserva las distribuciones, grupos y semilla.
5. Define **Réplicas para comparar**, por ejemplo 30.
6. Pulsa **Comparar escenarios**.
7. Revisa **Resumen de escenarios**, **Diferencias por réplica**, intervalos y cantidades de réplicas válidas/solicitadas.

Se admiten hasta ocho escenarios por experimento. El primer escenario es la referencia para las diferencias pareadas.

### Ejercicio guiado: uno frente a dos preparadores

Ejercicio **sintético**, no recomendación para la tienda:

1. En martes, configura un cajero, un preparador y una ventana de 15:00 a 15:10.
2. Usa tiempos constantes: llegadas cada 30 segundos, pago de 20 segundos y preparación de 90 segundos.
3. Coloca la probabilidad de transferencia en 0, desactiva paciencia y deja el estado inicial vacío.
4. Mantén los mismos tamaños de grupo y la misma semilla para ambas alternativas.
5. Guarda la referencia con un identificador propio.
6. Copia la referencia como candidato y cambia únicamente los preparadores de 1 a 2, además del nombre e identificador.
7. Compara 30 réplicas y revisa espera, utilización y finalización después del cierre.

No se anticipa aquí una cifra de resultado: debes leer la ejecución obtenida. Con tiempos constantes, algunas medidas pueden no variar entre réplicas; un intervalo de ancho cero no demuestra que el modelo sea válido para la tienda real.

### Leer las diferencias

La diferencia se calcula como **candidato menos referencia**. Una diferencia negativa en espera indica menos espera simulada del candidato; en producción o entregas, el signo debe interpretarse según el indicador.

Un intervalo que contiene cero no permite afirmar una diferencia clara bajo esas condiciones. Un intervalo que no lo contiene tampoco valida por sí solo los supuestos ni demuestra un beneficio real del negocio.

Revisa las etiquetas de demanda compartida o distinta. Cambiar parámetros de generación puede cambiar las entradas comparadas. Los intervalos describen variación entre simulaciones condicionada a los supuestos, no incertidumbre estimada de parámetros reales.

### Ver una réplica del experimento

1. Busca **Abrir una réplica concreta**.
2. Selecciona **Escenario** y **Réplica completada**.
3. Pulsa **Inspeccionar esta réplica**.
4. Comprueba el identificador e índice que aparecen junto al recorrido.

Los índices empiezan en **0**: el índice 4 corresponde a la quinta réplica. El software reconstruye ese miembro con la semilla y configuración guardadas, sin sustituir el resumen del experimento.

## 9. Usar la reproducción 3D

La escena aparece en **Resultados → Recorrido de la réplica**, después de ejecutar una réplica, abrir un resultado guardado o inspeccionar un miembro de un experimento.

| Control | Uso |
| --- | --- |
| **Reproducir / Pausar** | Inicia o detiene el avance del historial. |
| **Volver al inicio** | Regresa al instante cero y queda pausado. |
| **Velocidad** | Selecciona 1×, 5×, 20× o 60×. La velocidad inicial es 20×. |
| **Reloj de simulación** | Busca un instante, hacia adelante o atrás, hasta el fin del drenaje. |
| Arrastrar sobre la escena | Orbita la cámara. |
| Rueda del ratón o botones **− / +** | Aleja o acerca la cámara. |
| **Restablecer cámara** | Recupera la vista general. |
| Clic en una persona / selector **Inspeccionar** | Muestra sus vínculos, estado y tiempos disponibles. |

La animación reproduce hechos que ya calculó el motor. Cambiar la velocidad, cámara o instante no modifica llegadas, tiempos, asignaciones ni métricas. Al llegar al final se pausa.

En el inspector puedes consultar la orden compartida, sus integrantes, el trabajador asignado y los tiempos registrados. Las personas entregadas o retiradas dejan de aparecer esperando en la tienda, pero siguen disponibles en listas e indicadores.

La distribución de la tienda y los desplazamientos son ilustrativos. No representan medidas reales del local, capacidad física de espera ni tiempos de caminar del modelo.

Si el sistema tiene activada la preferencia de **movimiento reducido**, se desactivan desplazamientos y gestos decorativos; los estados y el reloj siguen siendo utilizables. La reproducción se suspende al quedar fuera de vista o con la pestaña oculta para evitar trabajo gráfico innecesario.

## 10. Guardar y volver a abrir archivos

| Archivo | Cómo obtenerlo | Qué conserva |
| --- | --- | --- |
| Escenario JSON | **Escenarios → Descargar escenario JSON**. | Configuración y supuestos; no un historial de ejecución. |
| Resultado JSON | **Resultados → Descargar resultado JSON**. | Configuración, semilla, entradas, historial y métricas de la réplica. |
| Experimento JSON | **Descargar experimento JSON**. | Escenarios, réplicas resumidas, estimaciones y comparaciones. |
| Réplica seleccionada JSON | **Descargar réplica seleccionada JSON**, después de inspeccionar un miembro del experimento. | Historial completo de ese miembro. |
| Tablas CSV | **Preparar CSV…**, seguido de los enlaces de descarga. | Tablas separadas para análisis; no una escena reproducible por sí solas. |

Para reabrir:

1. Entra a **Escenarios → Reabrir un archivo**.
2. Pulsa **Elegir JSON guardado**.
3. Selecciona un escenario, resultado o experimento compatible.
4. Espera su validación.

Abrir un resultado individual conserva su historial sin volver a simularlo. Abrir un experimento recupera sus resúmenes; al elegir un miembro para inspección, se solicita su ejecución exacta por semilla e índice.

Conserva el JSON si necesitas reproducibilidad. Los CSV facilitan el análisis de tablas, pero no sustituyen ese archivo. Al exportar desde un experimento, distingue **Preparar CSV del experimento** de **Preparar CSV de réplica seleccionada**.

Usa los archivos generados por el programa. Un contrato incompatible, historial desordenado o entero que la interfaz no pueda representar exactamente se rechaza con un mensaje. Los archivos abiertos no deben superar 10 MiB.

## 11. Problemas frecuentes

| Situación | Qué hacer |
| --- | --- |
| No abre la dirección local o indica servicio sin conexión. | Comprueba que el servidor esté iniciado en la terminal y que uses `127.0.0.1:8000`. |
| El inicio informa que el puerto está ocupado. | Revisa si ya tienes una instancia abierta y prueba su dirección. No cierres procesos ajenos para liberar el puerto. |
| Falta la interfaz o no está compilada. | Sigue el procedimiento de preparación de `web/README.md`; después inicia el servidor. |
| La configuración no se aceptó. | Lee el mensaje y los campos señalados; corrige capacidades, probabilidades, tiempos o asignaciones. Vuelve a ejecutar. |
| Las probabilidades de grupos son inválidas. | Usa tamaños enteros positivos y probabilidades que sumen 1. |
| La política de corrección no coincide con la fuente. | Usa el perfil solo con sus fuentes reconocidas. Para otros archivos, revisa con **Sin correcciones**. |
| El archivo no es UTF-8. | Guarda una copia en UTF-8 con un editor adecuado y vuelve a seleccionarla. |
| El archivo supera 10 MiB. | Revisa el tamaño antes de cargarlo. En observaciones, trabaja con una fuente más pequeña que conserve el encabezado; no recortes arbitrariamente un resultado JSON. |
| El resultado muestra cambios sin ejecutar. | Estás viendo una ejecución anterior. Ejecuta otra réplica o comparación para aplicar la edición. |
| Un indicador muestra No disponible. | Consulta su validez, cohorte y disponibilidad de muestras. No lo reemplaces por cero. |
| No aparece la escena 3D o se perdió el contexto gráfico. | Usa las tablas, el reloj y el inspector. Puedes pulsar **Intentar abrir la vista 3D otra vez**. |
| No se ven desplazamientos decorativos. | Revisa la preferencia de movimiento reducido y si la escena está visible; el estado lógico puede seguir siendo correcto. |
| El experimento falla por límite de trabajo. | Reduce el horizonte o la frecuencia de llegadas, por ejemplo aumentando el tiempo entre llegadas. El límite es de 10 000 órdenes nuevas por réplica. |
| Aparece un error local con referencia. | Conserva la referencia de diagnóstico y describe la acción que estabas realizando para su revisión. |

Mientras aparece **Calculando…**, el programa no ofrece un porcentaje de avance ni un botón de cancelación computacional. Un diagnóstico parcial de experimento no debe interpretarse como un resultado completo.

## 12. Qué representa esta versión

- Cada grupo comparte una orden, un pago y una preparación; sus integrantes llegan y terminan juntos.
- Cada preparador atiende una orden completa antes de tomar otra.
- La paciencia se aplica solo antes del primer pago; no hay abandono posterior al pago.
- No se modelan recetas, productos individuales ni entregas parciales.
- La fila lógica no impone una capacidad física de espera.
- El estado vacío al abrir es un supuesto configurable, no un hecho observado.
- Los datos de caja y entrega no identifican automáticamente a las mismas personas u órdenes.
- Las simulaciones y sus intervalos no constituyen validación empírica del modelo ni una recomendación operativa comprobada.

## 13. Lista de comprobación para una sesión

Antes de ejecutar:

- [ ] Servicio local disponible.
- [ ] Observaciones y conflictos revisados, si se importaron datos.
- [ ] Escenarios identificados y supuestos explícitos.
- [ ] Modo, personal, ventana, tiempos, grupos y estado inicial revisados.
- [ ] Misma semilla y condiciones comparables cuando corresponda.

Antes de cerrar:

- [ ] Resultado asociado con la configuración realmente ejecutada.
- [ ] Unidades, cohortes y valores no disponibles interpretados.
- [ ] Réplica correcta seleccionada para el recorrido.
- [ ] Escenarios, resultados y experimento descargados como JSON según lo necesario.
- [ ] CSV descargados si se van a analizar tablas fuera del programa.

Para la preparación técnica, consulta la [guía técnica](technical-guide.md) o la [guía rápida](guia-de-uso.md). El [informe de aceptación](acceptance-report.md) registra la verificación del software; la calibración y validación empírica del modelo siguen pendientes.
