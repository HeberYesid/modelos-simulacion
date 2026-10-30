import type { ImportIssue } from "../api/types";

const FIELD_LABELS: Record<string, string> = {
  "engine_config.cashiers": "cajeros",
  "engine_config.preparers": "preparadores",
  "engine_config.integrated_workers": "personas en el equipo integrado",
  "engine_config.opening_time": "hora de apertura",
  "engine_config.horizon_s": "hora de cierre",
  "engine_config.cashier_interruptions.at_s": "tiempo de la pausa programada",
  "engine_config.cashier_interruptions.suspended_order_id": "orden cuya preparación se pausa",
  "engine_config.cashier_interruptions.cashier_order_id": "orden que pasa a cobrar",
  "initial_state": "estado inicial",
  "initial_state.stage": "etapa inicial",
  "initial_state.worker_id": "persona asignada",
  "initial_state.queue_rank": "posición en la fila",
  "initial_state.order_id": "identificador de orden",
  "initial_state.person_ids": "identificadores de personas",
  "interarrival": "tiempo entre llegadas",
  "group_sizes": "pesos de tamaño de grupo",
  "payment_active": "pago activo",
  "preparation": "preparación por orden",
  "transfer_probability": "probabilidad de transferencia",
  "transfer_confirmation": "confirmación externa",
  "patience": "paciencia",
  "root_seed": "semilla raíz",
  "replications": "cantidad de réplicas",
};

const ISSUE_LABELS: Record<string, string> = {
  capacity_exceeded: "Los intervalos observados superan la capacidad de personal reportada para este segmento; consulta el detalle del pico de concurrencia.",
  cashier_window_overlap: "Los intervalos de transacción en caja se superponen. No representan tiempo de trabajo activo ni utilización.",
  inconsistent_reported_staff: "El personal reportado cambia dentro de este segmento. No se asigna una capacidad única.",
  unknown_reported_staff: "No hay personal reportado de forma consistente para este segmento.",
  correction_profile_mismatch: "La fuente no coincide con el perfil de corrección aprobado. El perfil no se aplicó.",
  duplicate_qualified_key: "Hay identificadores de observación repetidos. Revisa las filas señaladas antes de interpretar los resúmenes.",
  invalid_date: "La fecha no usa el formato esperado AAAA-MM-DD.",
  invalid_time: "La hora no usa el formato esperado HH:MM:SS.",
  missing_required_header: "Faltan columnas obligatorias en el encabezado.",
  unsupported_encoding: "El archivo no está codificado en UTF-8. Guárdalo como UTF-8 e inténtalo de nuevo.",
  invalid_csv: "El contenido no se pudo leer como CSV.",
  missing_required_value: "Falta un valor obligatorio en una o más filas.",
  invalid_field_count: "Una o más filas no tienen el mismo número de columnas que el encabezado.",
  invalid_interval: "El intervalo de tiempo de una fila no es válido.",
  invalid_withdrawal: "El registro de retiro contiene datos incompatibles.",
  zero_service_duration: "Se observó una duración de servicio igual a cero. No se usa como duración positiva de servicio.",
  unsupported_correction_policy: "La política de corrección seleccionada no está disponible.",
  workload_limit_exceeded: "La solicitud superaría el límite de trabajo por réplica. Reduce la demanda o el horizonte.",
  required_for_stage: "Completa los tiempos requeridos para esta etapa inicial.",
  incompatible_stage_field: "Quita el valor que no corresponde a esta etapa inicial.",
  queue_rank_required: "Indica la posición de esta orden en la fila.",
  queue_rank_incompatible: "Esta etapa no usa una posición de fila.",
  duplicate_queue_rank: "Cada orden en una misma fila necesita una posición distinta.",
  stage_incompatible_with_mode: "Esta etapa no está disponible en el modo elegido. Cambia la etapa o el modo.",
  worker_required: "Elige la persona que conserva esta orden durante la etapa activa.",
  unknown_worker: "La persona asignada no existe con la capacidad configurada.",
  worker_pool_mismatch: "La persona elegida no pertenece al equipo de esta etapa.",
  worker_overassigned: "Una misma persona no puede conservar dos órdenes en el estado inicial.",
  worker_incompatible_with_stage: "Esta etapa en espera no reserva una persona.",
  value_error: "El dato no cumple las reglas del modelo. Revisa el campo señalado.",
  missing: "Completa este campo.",
  greater_than_equal: "El valor está por debajo del mínimo permitido.",
  greater_than: "El valor debe ser mayor que el mínimo permitido.",
  less_than_equal: "El valor supera el máximo permitido.",
  literal_error: "El valor no coincide con una opción disponible.",
  int_type: "Usa un número entero en este campo.",
  float_type: "Usa un número en este campo.",
  invalid_staffing: "La capacidad debe permitir al menos una persona activa en el modo elegido.",
  unsupported_version: "Esta versión de archivo no es compatible o su contenido no cumple el contrato V1/V2. Abre un JSON completo de una versión compatible.",
  invalid_json: "El archivo no contiene JSON válido. Conserva el archivo anterior y revisa su contenido.",
  invalid_artifact: "El archivo no corresponde a un escenario, una réplica o un experimento válido.",
  invalid_saved_file: "El archivo no cumple el contrato de Boquitas V1 o V2. El resultado anterior se conserva.",
  invalid_experiment: "El experimento contiene una entrada que no se pudo validar.",
  experiment_failed: "El experimento no terminó; sus diagnósticos parciales no representan un resultado completo.",
  upload_too_large: "El archivo supera el máximo local de 10 MiB.",
};

const SERVICE_ERROR_MESSAGES: Record<string, string> = {
  execution_cancelled: "La ejecución fue cancelada. El resultado anterior se conserva.",
  execution_timed_out: "La ejecución superó el tiempo disponible. Reduce la carga y vuelve a intentarlo.",
  execution_busy: "El servicio local está atendiendo otra ejecución. Espera a que termine e inténtalo de nuevo.",
  experiment_workload_limit_exceeded: "La comparación supera el límite computacional. Reduce la cantidad de escenarios, réplicas o demanda.",
};

const CORRECTION_REASONS: Record<string, string> = {
  "Correct the recorded cashier end time per the approved 2026-10-20 correction.": "Ajustar la hora de fin registrada en caja según la corrección aprobada del 20 de octubre de 2026.",
  "Exclude delivery 26 because the user identified it as a recording error.": "Excluir la entrega 26 porque se informó un error de registro.",
  "The corrected end time is already present in the supplied source.": "La hora de fin corregida ya aparece en la fuente suministrada.",
  "Delivery 26 is absent from the supplied corrected source.": "La entrega 26 no aparece en la fuente corregida suministrada.",
};

const SYSTEM_ASSUMPTIONS: Record<string, string> = {
  "External transfer confirmation time is excluded from app executions.": "Los pagos por transferencia no añaden espera de confirmación.",
  "Synthetic teaching inputs only; these values are not estimates from Boquitas data.": "Los valores de enseñanza son sintéticos y no son estimaciones de datos de Boquitas.",
  "Each shared order has one payment and one preparation regardless of group size.": "Cada orden compartida tiene un pago y una preparación, sin importar el tamaño del grupo.",
  "The initial state is empty; no unobserved opening work is assumed.": "El estado inicial está vacío; no se supone trabajo previo que no haya sido observado.",
  "No warm-up period is applied; observation-window metrics start at opening.": "No se aplica un periodo de calentamiento; las medidas de ventana empiezan en la apertura.",
};

const QUALITY_FLAGS: Record<string, string> = {
  malformed_csv: "CSV mal formado",
  unexpected_preamble: "Texto previo al encabezado",
  missing_header: "Falta el encabezado",
  field_count: "Cantidad de columnas distinta a la esperada",
  invalid_station: "Estación no reconocida",
  invalid_date: "Fecha inválida",
  invalid_reported_staff: "Personal reportado inválido",
  missing_local_id: "Falta el identificador local",
  invalid_hora_llegada: "Hora de llegada inválida",
  invalid_hora_inicio: "Hora de inicio inválida",
  invalid_hora_fin: "Hora de fin inválida",
  invalid_hora_se_fue: "Hora de retiro inválida",
  contradictory_outcome: "Resultado y tiempos incompatibles",
  start_before_arrival: "El inicio aparece antes de la llegada",
  end_before_start: "El fin aparece antes del inicio",
  end_before_arrival: "El fin aparece antes de la llegada",
  departure_before_arrival: "El retiro aparece antes de la llegada",
  zero_duration: "Duración igual a cero",
  duplicate_key: "Clave de fila repetida",
};

export function fieldLabel(path: string): string {
  if (FIELD_LABELS[path]) return FIELD_LABELS[path];
  const normalizedPath = path.replace(/\[\d+\]/g, "").replace(/\.\d+(?=\.)/g, "");
  if (FIELD_LABELS[normalizedPath]) return FIELD_LABELS[normalizedPath];
  const parts = path.split(".");
  const leaf = parts.at(-1) ?? path;
  const indexed = leaf.replace(/\[\d+\]/g, "");
  return FIELD_LABELS[indexed] ?? indexed.replaceAll("_", " ");
}

export function validationMessage(issue: ImportIssue): string {
  return ISSUE_LABELS[issue.code] ?? "Revisa la fila y los campos señalados; el resumen conserva la información sin corregirla automáticamente.";
}

export function issueMessage(code: string, path: string): string {
  return ISSUE_LABELS[code] ?? `Revisa ${fieldLabel(path)} e inténtalo de nuevo.`;
}

export function serviceErrorMessage(code: string | null): string | null {
  return code ? SERVICE_ERROR_MESSAGES[code] ?? null : null;
}

export function correctionReason(reason: string): string {
  return CORRECTION_REASONS[reason] ?? "Se conserva la razón registrada junto con la fuente original.";
}

export function systemAssumption(assumption: string): string {
  return SYSTEM_ASSUMPTIONS[assumption] ?? assumption;
}

export function qualityFlagLabel(flag: string): string {
  return QUALITY_FLAGS[flag] ?? "Fila marcada para revisión";
}

export function translateEnum(value: string): string {
  const labels: Record<string, string> = {
    tuesday: "Martes · equipos separados",
    regular: "Día normal · equipo integrado",
    waiting_payment: "En fila para pagar",
    payment_active: "Pago activo",
    payment_pending: "Confirmación externa",
    waiting_preparation: "En fila para preparación",
    preparing: "En preparación",
    preparation_paused: "Preparación pausada",
    preparation_resumed: "Reanudar preparación",
    completed: "Completada",
    served: "Atendido",
    withdrawn: "Retirado",
    incomplete: "Incompleto",
    invalid: "Inválido",
    delivered: "Entregada",
    abandoned: "Retirada",
    raw: "Original",
    normalized: "Normalizado",
    both: "Ambos",
    error: "Error",
    warning: "Advertencia",
    information: "Información",
    applied: "Aplicada",
    already_reflected: "Ya reflejada en la fuente",
    synthetic_demo: "Demostración sintética",
    user_assumptions: "Supuestos del usuario",
    all: "Todas las cohortes",
    new: "Órdenes nuevas",
    initialized: "Órdenes iniciales",
    order: "Órdenes",
    person: "Personas",
    seconds: "segundos",
    orders: "órdenes",
    people: "personas",
    caja: "Caja",
    entrega: "Entrega",
    observation: "observación",
    reference: "referencia",
    candidate: "candidato",
    complete: "completa",
    failed: "fallida",
    student_t: "t de Student",
    waiting_orders: "órdenes que esperaron en fila",
    waiting_people: "personas que esperaron en fila",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function translatePolicy(policy: string): string {
  if (policy === "boquitas-2026-10-20-v1") return "Correcciones aprobadas · Boquitas 2026-10-20";
  if (policy === "none") return "Sin aplicar correcciones";
  return policy;
}
