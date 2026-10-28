export const MAX_OBSERVATION_BYTES = 10 * 1024 * 1024;
export const MAX_SAVED_RESULT_BYTES = 64 * 1024 * 1024;

export const OBSERVATION_TOO_LARGE_MESSAGE =
  "El archivo de observaciones supera el límite local de 10 MiB.";
export const SAVED_FILE_TOO_LARGE_MESSAGE =
  "El archivo JSON guardado supera el límite local de 64 MiB.";
export const RESULT_TOO_LARGE_MESSAGE =
  "El resultado supera el límite local de 64 MiB. Reduzca el horizonte, la demanda o el número de réplicas antes de volver a ejecutar.";
