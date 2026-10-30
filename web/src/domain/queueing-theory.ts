import type { Scenario, TimeDistribution } from "../api/types";
import workLimits from "../../contracts/work-limits.json";

export interface QueueMeasures {
  lambdaPerHour: number;
  muPerHour: number;
  servers: number;
  rho: number;
  L: number | null;
  Lq: number | null;
  WSeconds: number | null;
  WqSeconds: number | null;
  p0: number | null;
  pWait: number | null;
  status: "stable" | "unstable" | "invalid";
}

export interface QueueStageTheory {
  id: "payment" | "preparation" | "integrated";
  label: string;
  model: "M/M/1" | "M/M/s";
  servers: number;
  applicability: "applicable" | "approximation" | "unavailable";
  reasons: string[];
  lambdaPerHour: number | null;
  muPerHour: number | null;
  rateNotes: string[];
  measures: QueueMeasures | null;
}

const SECONDS_PER_HOUR = 3_600;
const MAX_WORKERS_PER_POOL = workLimits.max_workers_per_pool;

/** Erlang-C steady-state measures for an M/M/s queue. */
export function calculateMmQueue(lambdaPerHour: number, muPerHour: number, servers: number): QueueMeasures {
  const valid = Number.isFinite(lambdaPerHour)
    && lambdaPerHour >= 0
    && Number.isFinite(muPerHour)
    && muPerHour > 0
    && Number.isInteger(servers)
    && servers >= 1
    && servers <= MAX_WORKERS_PER_POOL;
  if (!valid) {
    return {
      lambdaPerHour, muPerHour, servers, rho: Number.NaN,
      L: null, Lq: null, WSeconds: null, WqSeconds: null, p0: null, pWait: null, status: "invalid",
    };
  }

  const capacityPerHour = servers * muPerHour;
  if (!Number.isFinite(capacityPerHour) || capacityPerHour <= 0) {
    return {
      lambdaPerHour, muPerHour, servers, rho: Number.NaN,
      L: null, Lq: null, WSeconds: null, WqSeconds: null, p0: null, pWait: null, status: "invalid",
    };
  }
  const rho = lambdaPerHour / capacityPerHour;
  if (rho >= 1) {
    return {
      lambdaPerHour, muPerHour, servers, rho,
      L: null, Lq: null, WSeconds: null, WqSeconds: null, p0: null, pWait: null, status: "unstable",
    };
  }
  if (lambdaPerHour === 0) {
    return {
      lambdaPerHour, muPerHour, servers, rho: 0,
      L: 0, Lq: 0, WSeconds: SECONDS_PER_HOUR / muPerHour,
      WqSeconds: 0, p0: 1, pWait: 0, status: "stable",
    };
  }

  // Work in Erlang units; the stability condition keeps these terms bounded
  // for the supported worker limit, avoiding factorial and power overflow.
  const offeredLoad = lambdaPerHour / muPerHour;
  if (!Number.isFinite(offeredLoad) || offeredLoad === 0) {
    return {
      lambdaPerHour, muPerHour, servers, rho,
      L: null, Lq: null, WSeconds: null, WqSeconds: null, p0: null, pWait: null, status: "invalid",
    };
  }
  let term = 1;
  let normalizer = 1;
  for (let n = 1; n < servers; n += 1) {
    term *= offeredLoad / n;
    normalizer += term;
  }
  const atCapacity = term * offeredLoad / servers;
  const tail = atCapacity / (1 - rho);
  normalizer += tail;
  const p0 = 1 / normalizer;
  const pWait = tail * p0;
  const Lq = pWait * rho / (1 - rho);
  const L = Lq + offeredLoad;
  return {
    lambdaPerHour, muPerHour, servers, rho, L, Lq,
    WSeconds: L / lambdaPerHour * SECONDS_PER_HOUR,
    WqSeconds: Lq / lambdaPerHour * SECONDS_PER_HOUR,
    p0, pWait, status: "stable",
  };
}

function meanSeconds(distribution: TimeDistribution): number {
  switch (distribution.kind) {
    case "constant": return distribution.value_s;
    case "exponential": return distribution.mean_s;
    case "triangular": return (distribution.low_s + distribution.mode_s + distribution.high_s) / 3;
  }
}

function serviceIsExponential(distribution: TimeDistribution): boolean {
  return distribution.kind === "exponential";
}

function menuPreparationMean(scenario: Scenario): number {
  if (!scenario.menu) return meanSeconds(scenario.preparation);
  const products = new Map(scenario.menu.products.map((product) => [product.product_id, product.preparation_s]));
  return scenario.menu.baskets.reduce((sum, basket) => {
    const basketSeconds = basket.items.reduce((basketSum, item) => basketSum + (products.get(item.product_id) ?? 0) * item.quantity, 0);
    return sum + basket.probability * basketSeconds;
  }, 0);
}

function rateFromMeanSeconds(mean: number): number | null {
  if (!Number.isFinite(mean) || mean <= 0) return null;
  const rate = SECONDS_PER_HOUR / mean;
  return Number.isFinite(rate) ? rate : null;
}

function nominalArrivalRate(scenario: Scenario): { rate: number | null; notes: string[] } {
  const schedule = scenario.arrival_schedule;
  if (schedule?.length) {
    let durationSeconds = 0;
    let orderCount = 0;
    for (const period of schedule) {
      const duration = period.end_s - period.start_s;
      if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(period.orders_per_hour) || period.orders_per_hour < 0) continue;
      durationSeconds += duration;
      orderCount += duration / SECONDS_PER_HOUR * period.orders_per_hour;
    }
    const rate = durationSeconds > 0 ? orderCount / (durationSeconds / SECONDS_PER_HOUR) : null;
    return {
      rate: rate !== null && Number.isFinite(rate) ? rate : null,
      notes: [rate !== null && Number.isFinite(rate)
        ? "λ es el promedio ponderado por duración del horario configurado; no equivale a una tasa Poisson constante."
        : "λ no se puede calcular porque el horario no contiene tramos válidos con duración positiva."],
    };
  }
  const rate = rateFromMeanSeconds(meanSeconds(scenario.interarrival));
  return {
    rate,
    notes: rate === null ? ["λ no se puede calcular con el intervalo medio configurado."] : [],
  };
}

function stage(
  id: QueueStageTheory["id"],
  label: string,
  servers: number,
  lambda: number | null,
  serviceMeanSeconds: number,
  serviceIsExpo: boolean,
  scenario: Scenario,
  options: {
    approximation?: boolean;
    aggregateService?: boolean;
    reasons?: string[];
    upstreamStatus?: "stable" | "unstable" | "unavailable";
    rateNotes?: string[];
    forceUnavailableReason?: string;
  } = {},
): QueueStageTheory {
  const reasons = [...(options.reasons ?? [])];
  const rateNotes = [...(options.rateNotes ?? [])];
  const muPerHour = rateFromMeanSeconds(serviceMeanSeconds);
  if (scenario.patience) rateNotes.push("La paciencia puede reducir las llegadas efectivas a las etapas posteriores por abandono.");
  if (id === "preparation") rateNotes.push("λ corresponde a la demanda externa nominal; las llegadas a preparación dependen de las salidas de pago.");
  if (muPerHour === null) rateNotes.push("μ no se puede calcular porque la media de servicio no es finita y positiva.");
  if (options.forceUnavailableReason) reasons.push(options.forceUnavailableReason);
  if (scenario.arrival_schedule?.length) reasons.push("La demanda cambia por franjas horarias y no sigue una tasa Poisson constante.");
  if (scenario.interarrival.kind !== "exponential") reasons.push("Los tiempos entre llegadas no son exponenciales; las llegadas no son Poisson.");
  if (!serviceIsExpo) reasons.push("El tiempo de servicio no es exponencial.");
  if (scenario.patience) reasons.push("La paciencia puede hacer que órdenes abandonen la cola.");
  if (scenario.initial_state.length > 0) reasons.push("La condición inicial finita puede diferir del régimen de largo plazo de referencia.");
  const hasTransferWait = scenario.transfer_probability > 0 && meanSeconds(scenario.transfer_confirmation) > 0;
  if (hasTransferWait) {
    reasons.push("La confirmación de transferencias añade esperas y modifica la ocupación de la caja.");
  }
  if (options.upstreamStatus === "unstable") reasons.push("La carga nominal alcanza o supera la capacidad de referencia de pago; no hay régimen estacionario en esa referencia.");
  if (options.upstreamStatus === "unavailable") reasons.push("No se puede asumir que las salidas de pago sean Poisson con esta configuración.");

  const disqualifying = scenario.arrival_schedule?.length
    || scenario.interarrival.kind !== "exponential"
    || (!serviceIsExpo && !options.approximation)
    || scenario.patience
    || (hasTransferWait && !options.approximation && !options.aggregateService)
    || (options.upstreamStatus !== undefined && options.upstreamStatus !== "stable");
  const measures = lambda !== null && muPerHour !== null ? calculateMmQueue(lambda, muPerHour, servers) : null;
  if (disqualifying || options.forceUnavailableReason || measures === null || measures.status === "invalid") {
    return {
      id, label, model: servers === 1 ? "M/M/1" : "M/M/s", servers,
      applicability: "unavailable", reasons, lambdaPerHour: lambda, muPerHour, rateNotes, measures: null,
    };
  }
  if (options.approximation) {
    reasons.push("Se muestra como referencia M/M; el servicio agregado combina componentes y no es exponencial.");
    return {
      id, label, model: servers === 1 ? "M/M/1" : "M/M/s", servers,
      applicability: "approximation", reasons, lambdaPerHour: lambda, muPerHour, rateNotes, measures,
    };
  }
  return {
    id, label, model: servers === 1 ? "M/M/1" : "M/M/s", servers,
    applicability: "applicable", reasons, lambdaPerHour: lambda, muPerHour, rateNotes, measures,
  };
}

/** Builds idealized stationary queue references from a scenario's stated inputs. */
export function analyzeQueueScenario(scenario: Scenario): QueueStageTheory[] {
  const arrival = nominalArrivalRate(scenario);
  const lambda = arrival.rate;
  const config = scenario.engine_config;
  if (config.mode === "tuesday") {
    const cashiers = config.cashiers ?? 1;
    const preparers = config.preparers ?? 4;
    const payment = stage(
      "payment", "Pago", cashiers, lambda, meanSeconds(scenario.payment_active),
      serviceIsExponential(scenario.payment_active), scenario, { rateNotes: arrival.notes },
    );
    const upstreamStatus = payment.measures?.status === "unstable"
      ? "unstable"
      : payment.applicability === "unavailable" ? "unavailable" : "stable";
    const preparationMean = menuPreparationMean(scenario);
    const preparationExponential = !scenario.menu && serviceIsExponential(scenario.preparation);
    const preparation = stage(
      "preparation", "Preparación", preparers, lambda, preparationMean, preparationExponential, scenario,
      { upstreamStatus, rateNotes: arrival.notes },
    );
    return [payment, preparation];
  }

  const workers = config.integrated_workers ?? 1;
  if (scenario.contract_version === 2 && scenario.engine_config.cashier_interruptions.length > 0) {
    const preparationMean = menuPreparationMean(scenario);
    const transferMean = scenario.transfer_probability > 0
      ? scenario.transfer_probability * meanSeconds(scenario.transfer_confirmation)
      : 0;
    const serviceMean = meanSeconds(scenario.payment_active) + preparationMean + transferMean;
    return [stage(
      "integrated", "Atención integrada", workers, lambda, serviceMean, false, scenario,
      {
        rateNotes: [...arrival.notes, "μ es nominal y no incluye la sobrecarga de las interrupciones programadas."],
        forceUnavailableReason: "La versión 2 incluye interrupciones programadas; el servicio no es una distribución exponencial independiente.",
      },
    )];
  }

  const preparationMean = menuPreparationMean(scenario);
  const transferMean = scenario.transfer_probability > 0
    ? scenario.transfer_probability * meanSeconds(scenario.transfer_confirmation)
    : 0;
  const serviceMean = meanSeconds(scenario.payment_active) + preparationMean + transferMean;
  const components = [scenario.payment_active, scenario.menu ? null : scenario.preparation,
    scenario.transfer_probability === 1 ? scenario.transfer_confirmation : null].filter((part): part is TimeDistribution => part !== null);
  const nonzero = components.filter((part) => meanSeconds(part) > 0);
  const probabilisticTransferMixture = scenario.transfer_probability > 0
    && scenario.transfer_probability < 1
    && meanSeconds(scenario.transfer_confirmation) > 0;
  const nonzeroMenuService = Boolean(scenario.menu) && preparationMean > 0;
  const exactCompositeExponential = !probabilisticTransferMixture
    && !nonzeroMenuService
    && nonzero.length === 1
    && serviceIsExponential(nonzero[0]!);
  const combinedExponential = exactCompositeExponential;
  const stageReasons = scenario.transfer_probability > 0 && meanSeconds(scenario.transfer_confirmation) > 0
    ? ["La media incluye la espera de confirmación ponderada por su probabilidad."]
    : [];
  return [stage(
    "integrated", "Atención integrada", workers, lambda, serviceMean, combinedExponential, scenario,
    { approximation: !combinedExponential, aggregateService: true, reasons: stageReasons, rateNotes: arrival.notes },
  )];
}
