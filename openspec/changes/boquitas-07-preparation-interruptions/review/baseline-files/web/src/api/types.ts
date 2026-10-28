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
export type ApiResponse<
  Path extends keyof paths,
  Method extends Methods<Path>,
  Status extends number = 200,
> = ResponseAt<Operation<Path, Method>, Status>;
export type ApiJsonBody<
  Path extends keyof paths,
  Method extends Methods<Path>,
> = JsonBody<Operation<Path, Method>>;

export type Scenario = ApiSchema<"Scenario">;
export type InitialOrder = ApiSchema<"InitialOrder">;
export type TimeDistribution = ApiSchema<"ConstantTime"> | ApiSchema<"TriangularTime"> | ApiSchema<"ExponentialTime">;
export type RunResult = ApiSchema<"RunResult">;
export type ExperimentResult = ApiSchema<"ExperimentResult">;
export type ImportReport = ApiSchema<"ImportReport">;
export type ObservationRow = ApiSchema<"ObservationRow">;
export type ImportIssue = ApiSchema<"ImportIssue">;
export type Correction = ApiSchema<"Correction">;
export type MetricSummary = ApiSchema<"MetricSummary">;
export type QueueInterval = ApiSchema<"QueueInterval">;

export type DemoResponse = ApiResponse<"/api/v1/demo", "get">;
export type RunRequest = ApiJsonBody<"/api/v1/runs", "post">;
export type ExperimentRequest = ApiJsonBody<"/api/v1/experiments", "post">;
export type FileValidationResponse = ApiResponse<"/api/v1/files/validate", "post">;
export type CsvExportRequest = ApiJsonBody<"/api/v1/exports/csv", "post">;
export type CsvExportResponse = ApiResponse<"/api/v1/exports/csv", "post">;
export type HealthResponse = ApiResponse<"/api/v1/health", "get">;

export type ImportedArtifact = FileValidationResponse["value"];
