# Boquitas portátil: llevar a la sustentación

## Requisitos del otro computador

- Windows 10 u 11 de 64 bits (x64).
- Un navegador actualizado, por ejemplo Edge o Chrome.
- Para la escena 3D, navegador y controlador gráfico compatibles con WebGL 2.
- Permiso de la institución para ejecutar aplicaciones locales.

El paquete incluye Python, las bibliotecas del simulador y la interfaz compilada. No necesitas instalar Python, Node.js, uv ni pnpm en el computador de destino. El funcionamiento normal usa únicamente este computador y no requiere internet. No ejecutes la aplicación directamente dentro del ZIP.

## Preparar y abrir

1. Lleva el ZIP completo `Boquitas-Windows-x64.zip` en la memoria USB y conserva otra copia.
2. En el computador de la sustentación, copia el ZIP al disco local. Haz clic derecho y selecciona **Extraer todo**. Espera a que termine.
3. Abre la carpeta extraída y haz doble clic en **INICIAR_BOQUITAS.cmd**. También puedes abrir **Boquitas.exe**.
4. Mantén abierta la consola. El navegador se abre cuando el servidor está preparado; si no se abre, escribe `http://127.0.0.1:8000` en Edge o Chrome.
5. Al terminar, guarda los resultados que quieras conservar y pulsa **Ctrl+C en la consola**. Cerrar la pestaña del navegador no detiene el servidor.

Conserva toda la carpeta, incluido `_internal`; copiar únicamente el ejecutable no funciona. Puedes mover la carpeta completa a otra ruta. Los archivos descargados se guardan según la configuración del navegador: cópialos a tu USB si quieres conservarlos.

## Recorrido para mostrar el software

1. Abre **Escenarios**. Explica el horario, las llegadas, el personal, los tiempos de pago y preparación y la semilla. Los valores iniciales son ejemplos sintéticos.
2. Pulsa **Ejecutar una réplica**. Revisa los resultados, las esperas y la diferencia entre órdenes y personas.
3. Muestra la reproducción 3D: reproducir, pausar, cambiar velocidad, mover la cámara y buscar un instante. La escena representa el historial ya calculado.
4. Cambia de martes a modo normal y ejecuta una nueva réplica. Explica la diferencia entre cajeros/preparadores separados y un trabajador integrado.
5. Guarda el resultado JSON y un CSV. Usa **Escenarios → Reabrir un archivo → Elegir JSON guardado** para abrir el JSON y recuperar el historial.
6. Para mostrar las pausas, abre `ejemplos/pausa-programada-v2.json` desde el selector anterior y ejecuta una réplica. Es un ejemplo sintético con IDs fijos A y B. En el segundo 6, A está pausada mientras se cobra B; en el segundo 8, A ya reanudó la preparación. A termina en 14 s y B en 17 s. A tiene 10 s activos y 2 s de pausa.
7. Si vas a mostrar una comparación, copia la referencia como candidato, cambia el personal y ejecuta la comparación de réplicas. Conserva la explicación de los supuestos y de las unidades.

La carpeta `ejemplos` contiene entradas sintéticas, no mediciones del negocio. Lleva por separado los archivos de observaciones y resultados que estés autorizado a mostrar. El paquete no incluye las fuentes de campo. La importación de observaciones no calibra automáticamente el modelo. Las pruebas de software no establecen validación empírica.

## Si aparece un problema

- **No abre el navegador:** deja la consola abierta y entra manualmente a `http://127.0.0.1:8000`.
- **Puerto 8000 ocupado:** comprueba si ya abriste Boquitas. No cierres procesos ajenos. Para usar otro puerto, abre una terminal en la carpeta extraída y ejecuta `Boquitas.exe --port 8001`; abre `http://127.0.0.1:8001`.
- **Faltan archivos o aparece un error de DLL/interfaz:** vuelve a extraer el ZIP completo. Conserva el mensaje exacto para diagnosticarlo.
- **Windows o las políticas de la institución bloquean el ejecutable:** solicita al responsable del equipo autorización para ejecutarlo. No desactives el antivirus ni las restricciones del equipo. Usa tu portátil como respaldo si no está permitido.
- **La escena 3D no está disponible:** muestra las tablas, métricas y línea de tiempo. La compatibilidad gráfica depende del equipo y debe probarse antes.

## Ensayo previo en la máquina de destino

- [ ] Extraer el ZIP en una carpeta nueva del disco local.
- [ ] Desconectar Wi-Fi o el cable de red y abrir Boquitas.
- [ ] Ejecutar martes y modo normal; revisar resultados.
- [ ] Probar la escena 3D y la pausa del ejemplo V2.
- [ ] Descargar JSON/CSV y reabrir el JSON.
- [ ] Cerrar con Ctrl+C y volver a iniciar.
- [ ] Confirmar que se pueden leer las cifras al conectar el proyector.
- [ ] Llevar cargador, copia adicional del ZIP y tu portátil como respaldo.

El paquete se comprueba durante su preparación, pero la prueba en este equipo no sustituye este ensayo en el computador y proyector de la sustentación.
