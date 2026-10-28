# Comprobación de entrega por otro integrante

Esta comprobación corresponde al uso del software en un entorno limpio. La realiza una persona distinta de quien preparó la entrega, siguiendo las guías y registrando resultados observados. Completar esta lista no calibra ni valida empíricamente el modelo.

## Identificar la entrega y el entorno

- Identificador de la persona que prepara la entrega: ____________________
- Identificador de quien la comprueba: ____________________
- Fecha y equipo utilizado: ____________________
- Sistema operativo y versión: ____________________
- Versión o manifiesto de archivos del paquete recibido: ____________________
- Versiones de Python, uv, Node y pnpm utilizadas: ____________________
- Ruta local del paquete: ____________________
- Navegador y versión: ____________________

El equipo actual conserva archivos sin seguimiento en Git. Un identificador de commit por sí solo no identifica toda la entrega: anote también el paquete concreto o su manifiesto de archivos. Conserve los archivos de dependencias bloqueadas y la referencia científica.

## Preparar y ejecutar

Siga la [guía técnica](../technical-guide.md) para la instalación inicial y la [guía de uso](../guia-de-uso.md) para las acciones de la aplicación. La instalación inicial puede necesitar internet. La ejecución del paquete ya instalado debe funcionar con sus recursos locales. No sustituya versiones ni cambie la política de ejecución de PowerShell para superar un error: registre el problema y use la alternativa documentada.

Marque una opción por fila y registre evidencia breve. Una actividad no ejecutada permanece pendiente.

| Comprobación | Pasa | Falla | Pendiente | Evidencia o dificultad |
| --- | --- | --- | --- | --- |
| Preparar un entorno limpio siguiendo la guía, sin depender del entorno virtual del desarrollador. | [ ] | [ ] | [ ] | |
| Instalar las dependencias bloqueadas y compilar los recursos de producción con los comandos documentados. | [ ] | [ ] | [ ] | |
| Iniciar mediante el lanzador y comprobar la dirección local indicada en la guía. | [ ] | [ ] | [ ] | |
| Detener desde la terminal correspondiente y volver a iniciar sin procesos ajenos ni errores de puerto. | [ ] | [ ] | [ ] | |
| Importar la referencia corregida del martes con su perfil explícito: 119 filas, tres retiros y advertencia de seis intervalos frente a cuatro preparadores. | [ ] | [ ] | [ ] | |
| Ejecutar la demostración y reconocer que sus entradas son sintéticas. | [ ] | [ ] | [ ] | |
| Reproducir la referencia científica con la semilla e índice documentados y comparar bytes o huella. | [ ] | [ ] | [ ] | |
| Comparar la jornada completa con una candidata de dos preparadores y 30 réplicas. | [ ] | [ ] | [ ] | |
| Descargar el JSON de esa comparación y conservarlo fuera de la sesión del navegador. | [ ] | [ ] | [ ] | |
| Recargar o cerrar y abrir la aplicación; reabrir el JSON sin ejecutar otra comparación y comprobar configuración, réplicas y métricas. | [ ] | [ ] | [ ] | |
| Exportar las tablas CSV y distinguir sus unidades, cohortes y valores no disponibles. | [ ] | [ ] | [ ] | |
| Seleccionar una réplica, reproducirla, pausar y buscar otro instante conservando su historia. | [ ] | [ ] | [ ] | |
| Comprobar tablas e inspección de resultados cuando WebGL no esté disponible. | [ ] | [ ] | [ ] | |
| Comprobar funcionamiento sin solicitudes externas durante la ejecución instalada. | [ ] | [ ] | [ ] | |
| Rechazar un archivo incompatible o fuera de límite con un mensaje claro y conservar el resultado válido anterior. | [ ] | [ ] | [ ] | |
| Si el paquete declara versión 2 aceptada, comprobar la pausa, cobro y reanudación con el caso y límites descritos en su guía. | [ ] | [ ] | [ ] | |

## Referencia y límites de archivos

La referencia de versión 1 se encuentra en `openspec/changes/boquitas-06-validation-and-delivery/reference-demo-run.json`. La guía técnica incluye el comando de comparación para la semilla `20261020` y la réplica `0`. Su huella SHA-256 esperada es:

```text
8bbe6b117f59dde367816d8ed63bb013b0ad624d916a57159c084fcff4051dd7
```

Las observaciones mantienen un límite de 10 MiB. Los JSON guardados y las salidas completas aceptadas por la API tienen un límite de 64 MiB. Una salida que lo exceda debe devolver un error que permita reducir la configuración; no se acepta como resultado completo. Los JSON nuevos se descargan usando el texto exacto recibido del servicio. Un CSV no reemplaza el JSON necesario para reabrir una historia completa.

## Registrar el resultado

- Resultado: [ ] Aceptado para el alcance probado  [ ] Requiere correcciones  [ ] Pendiente
- Flujos que efectivamente se comprobaron: ____________________
- Flujos pendientes y motivo: ____________________
- Archivos, capturas o huellas de referencia de la comprobación: ____________________
- Problemas de instalación o uso y pasos para reproducirlos: ____________________
- Identificador y fecha de quien comprueba: ____________________

El agente puede preparar esta lista y ejecutar pruebas técnicas en su entorno. La revisión por otro integrante solo se registra cuando esa persona la realiza.
