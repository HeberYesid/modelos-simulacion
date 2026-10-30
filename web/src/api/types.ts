import type { components, paths } from "./schema";

type Methods<Path extends keyof paths> = keyof NonNullable<paths[Path]>;
type Operation<Path extends keyof paths, Method extends Methods<Path>> = NonNullable<
  NonNullable<paths[Path]>[Method]
>;
type JsonContent<Value> = Value extends { content: infer Content }
  ? Content extends { "application/json": infer Json }
    ? Json
    : never
  : never;
type ResponseAt<Op, Status extends number> = Op extends { responses: infer Responses }
  ? Status extends keyof Responses
    ? JsonContent<Responses[Status]>
    : never
  : never;
type JsonBody<Op> = Op extends { requestBody: infer Body }
  ? JsonContent<Body>
  : never;

export type ApiSchema<Name extends keyof components["schemas"]> = components["schemas"][Name];
// Generated discriminator mappings use string keys; the public JSON version tags are numeric.
// Keep wire corrections here so generated declarations remain reproducible.
type NumericContract<T, Version extends 1 | 2> = Omit<T, "contract_version"> & { contract_version: Version };

export interface ArrivalScheduleEntry {
  start_s: number;
  end_s: number;
  orders_per_hour: number;
}

export interface ArrivalScheduleEntryDraft {
  start_s: number | null;
  end_s: number | null;
  orders_per_hour: number | null;
}

export type ProductVisualKind = "fruit_salad" | "ice_cream" | "slush";

export interface MenuProduct {
  product_id: string;
  display_name: string;
  visual_kind: ProductVisualKind;
  preparation_s: number;
}

export interface MenuBasketItem {
  product_id: string;
  quantity: number;
}

export interface MenuBasket {
  probability: number;
  items: MenuBasketItem[];
}

export interface MenuConfiguration {
  products: MenuProduct[];
  baskets: MenuBasket[];
}

export interface MenuConfigurationDraft {
  products: Array<Omit<MenuProduct, "preparation_s"> & { preparation_s: number | null }>;
  baskets: Array<{ probability: number | null; items: Array<{ product_id: string; quantity: number | null }> }>;
}

type ScenarioOptionalInputs = {
  arrival_schedule?: ArrivalScheduleEntry[];
  menu?: MenuConfiguration | null;
};
export type ApiResponse<
  Path extends keyof paths,
  Method extends Methods<Path>,
  Status extends number = 200,
> = ResponseAt<Operation<Path, Method>, Status>;
export type ApiJsonBody<
  Path extends keyof paths,
  Method extends Methods<Path>,
> = JsonBody<Operation<Path, Method>>;

export type ScenarioV1 = NumericContract<
  Omit<ApiSchema<"Scenario">, "arrival_schedule" | "menu"> & ScenarioOptionalInputs,
  1
>;
export type ScenarioV2 = NumericContract<
  Omit<ApiSchema<"ScenarioV2">, "arrival_schedule" | "menu"> & ScenarioOptionalInputs,
  2
>;
export type Scenario = ScenarioV1 | ScenarioV2;
export type InitialOrder = ApiSchema<"InitialOrder">;
export type TimeDistribution = ApiSchema<"ConstantTime"> | ApiSchema<"TriangularTime"> | ApiSchema<"ExponentialTime">;
export type RunMetricsV1 = NumericContract<ApiSchema<"RunMetrics">, 1>;
export type RunMetricsV2 = NumericContract<ApiSchema<"RunMetricsV2">, 2>;
export type RunResultV1 = NumericContract<
  Omit<ApiSchema<"RunResult">, "scenario" | "metrics"> & { scenario: ScenarioV1; metrics: RunMetricsV1 },
  1
>;
export type RunResultV2 = NumericContract<
  Omit<ApiSchema<"RunResultV2">, "scenario" | "metrics"> & { scenario: ScenarioV2; metrics: RunMetricsV2 },
  2
>;
export type RunResult = RunResultV1 | RunResultV2;
export type ReplicationResultV1 = Omit<ApiSchema<"ReplicationResult">, "metrics"> & {
  metrics?: RunMetricsV1 | null;
};
export type ReplicationResultV2 = Omit<ApiSchema<"ReplicationResultV2">, "metrics"> & {
  metrics?: RunMetricsV1 | RunMetricsV2 | null;
};
export type ExperimentResultV1 = NumericContract<
  Omit<ApiSchema<"ExperimentResult">, "scenarios" | "replication_results"> & {
    scenarios: ScenarioV1[];
    replication_results: ReplicationResultV1[];
  },
  1
>;
export type ExperimentResultV2 = NumericContract<
  Omit<ApiSchema<"ExperimentResultV2">, "scenarios" | "replication_results"> & {
    scenarios: Scenario[];
    replication_results: ReplicationResultV2[];
  },
  2
>;
export type ExperimentResult = ExperimentResultV1 | ExperimentResultV2;

export type TimeDistributionDraft =
  | { kind: "constant"; value_s: number | null }
  | { kind: "triangular"; low_s: number | null; mode_s: number | null; high_s: number | null }
  | { kind: "exponential"; mean_s: number | null };

export interface InterruptionScheduleEntryDraft {
  at_s: number | null;
  suspended_order_id: string;
  cashier_order_id: string;
}

export interface EngineConfigDraft {
  contract_version: 1 | 2;
  mode: "tuesday" | "regular";
  opening_time: string;
  horizon_s: number | null;
  cashiers?: number | null;
  preparers?: number | null;
  integrated_workers?: number | null;
  preparation_interruption_policy?: "scripted_cashier";
  cashier_interruptions?: InterruptionScheduleEntryDraft[];
}

export interface InitialOrderDraft {
  payment_method?: "cash" | "transfer" | null;
  items?: InitialOrder["items"];
  order_id: string;
  person_ids: string[];
  arrival_s?: number | null;
  stage: InitialOrder["stage"];
  queue_rank?: number | null;
  worker_id?: string | null;
  remaining_s?: number | null;
  patience_remaining_s?: number | null;
  payment_active_s?: number | null;
  transfer_wait_s?: number | null;
  preparation_s?: number | null;
}

export interface ScenarioDraft {
  contract_version: "1" | "2";
  scenario_id: string;
  display_name: string;
  engine_config: EngineConfigDraft;
  initial_state: InitialOrderDraft[];
  interarrival: TimeDistributionDraft;
  arrival_schedule?: ArrivalScheduleEntryDraft[];
  arrival_schedule_enabled?: boolean;
  menu?: MenuConfigurationDraft | MenuConfiguration | null;
  menu_enabled?: boolean;
  group_sizes: Array<{ size: number | null; probability: number | null }>;
  payment_active: TimeDistributionDraft;
  preparation: TimeDistributionDraft;
  transfer_probability: number | null;
  transfer_confirmation: TimeDistributionDraft;
  patience?: TimeDistributionDraft | null;
  provenance: "synthetic_demo" | "user_assumptions";
  assumptions: string[];
  default_root_seed: number | null;
}
export type ImportReport = ApiSchema<"ImportReport">;
export type ObservationRow = ApiSchema<"ObservationRow">;
export type ImportIssue = ApiSchema<"ImportIssue">;
export type Correction = ApiSchema<"Correction">;
export type MetricSummary = ApiSchema<"MetricSummary">;
export type QueueInterval = ApiSchema<"QueueInterval">;

type GeneratedDemoResponse = ApiResponse<"/api/v1/demo", "get">;
export type DemoResponse = Omit<GeneratedDemoResponse, "scenario"> & { scenario: ScenarioV1 };
type GeneratedRunRequest = ApiJsonBody<"/api/v1/runs", "post">;
export type RunRequest = Omit<GeneratedRunRequest, "scenario"> & { scenario: Scenario };
type GeneratedExperimentRequest = ApiJsonBody<"/api/v1/experiments", "post">;
export type ExperimentRequest = Omit<GeneratedExperimentRequest, "scenarios"> & { scenarios: Scenario[] };
type GeneratedFileValidationResponse = ApiResponse<"/api/v1/files/validate", "post">;
export type FileValidationResponse = Omit<GeneratedFileValidationResponse, "value"> & {
  value: Scenario | RunResult | ExperimentResult;
};
type GeneratedCsvExportRequest = ApiJsonBody<"/api/v1/exports/csv", "post">;
export type CsvExportRequest = Omit<GeneratedCsvExportRequest, "result"> & { result: RunResult | ExperimentResult };
export type CsvExportResponse = ApiResponse<"/api/v1/exports/csv", "post">;
export type HealthResponse = ApiResponse<"/api/v1/health", "get">;

export type ImportedArtifact = FileValidationResponse["value"];
