import type {
  ApiJsonBody,
  ApiResponse,
  DemoResponse,
  ExperimentRequest,
  ExperimentResult,
  FileValidationResponse,
  HealthResponse,
  ImportReport,
  RunRequest,
  RunResult,
  Scenario,
  CsvExportRequest,
  CsvExportResponse,
} from "../api/types";
import { issueMessage, serviceErrorMessage } from "../domain/errors";
import {
  MAX_OBSERVATION_BYTES,
  MAX_SAVED_RESULT_BYTES,
  OBSERVATION_TOO_LARGE_MESSAGE,
  RESULT_TOO_LARGE_MESSAGE,
  SAVED_FILE_TOO_LARGE_MESSAGE,
} from "../domain/file-limits";

export const MAX_FILE_BYTES = MAX_OBSERVATION_BYTES;

const exactResponseJson = new WeakMap<object, string>();

export function exactResponseJsonFor(value: object): string | undefined {
  return exactResponseJson.get(value);
}

export class ServiceError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly issues: Array<{ path: string; code: string; message: string }>;
  readonly partialResult: unknown;
  readonly diagnosticReport: unknown;
  readonly diagnosticReference: string | null;

  constructor(
    status: number,
    problem: { code?: unknown; message?: unknown; issues?: unknown; details?: unknown },
  ) {
    const rawIssues = Array.isArray(problem.issues) ? problem.issues : [];
    const issues = rawIssues.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      if (typeof item.path !== "string" || typeof item.code !== "string") return [];
      return [{ path: item.path, code: item.code, message: issueMessage(item.code, item.path) }];
    });
    const code = typeof problem.code === "string" ? problem.code : null;
    const details = problem.details && typeof problem.details === "object"
      ? problem.details as Record<string, unknown>
      : {};
    const partial = details.partial_result ?? details.partialResult;
    const diagnosticReport = details.report ?? details.diagnostic_report;
    const diagnosticReference = typeof details.diagnostic_reference === "string"
      ? details.diagnostic_reference
      : typeof details.diag_ref === "string"
        ? details.diag_ref
        : typeof details.diagnostic_ref === "string"
          ? details.diagnostic_ref
      : null;
    const fallbackMessage = serviceErrorMessage(code) ?? (
      issues.length > 0
        ? "El servicio local encontró datos que deben corregirse. El resultado anterior sigue disponible."
        : status === 413
          ? code === "saved_file_too_large"
            ? SAVED_FILE_TOO_LARGE_MESSAGE
            : code === "upload_too_large"
              ? OBSERVATION_TOO_LARGE_MESSAGE
              : "El archivo seleccionado supera su límite local."
          : code === "result_too_large"
            ? RESULT_TOO_LARGE_MESSAGE
          : status === 422
            ? "El servicio local no aceptó estos datos. Revisa las indicaciones antes de intentarlo de nuevo."
            : "No se pudo completar la solicitud al servicio local. Verifica que la aplicación siga activa e inténtalo de nuevo.");
    const serverMessage = typeof problem.message === "string" ? problem.message : null;
    const message = serverMessage ?? fallbackMessage;
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.partialResult = partial;
    this.diagnosticReport = diagnosticReport;
    this.diagnosticReference = diagnosticReference;
  }
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ServiceError(0, {});
  }
  const contentType = response.headers.get("content-type") ?? "";
  const responseText = contentType.includes("application/json")
    ? await response.text().catch(() => "")
    : "";
  let body: unknown = null;
  if (responseText) {
    try {
      body = JSON.parse(responseText);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const problem = body && typeof body === "object" ? body as Record<string, unknown> : {};
    throw new ServiceError(response.status, problem);
  }
  if (
    body
    && typeof body === "object"
    && (path === "/api/v1/runs" || path === "/api/v1/experiments")
  ) {
    exactResponseJson.set(body, responseText);
  }
  return body as T;
}

function postJson<T>(path: string, payload: unknown, headers?: Record<string, string>): Promise<T> {
  return jsonRequest<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

export function loadDemo(): Promise<DemoResponse> {
  return jsonRequest<DemoResponse>("/api/v1/demo");
}

export function checkHealth(): Promise<HealthResponse> {
  return jsonRequest<HealthResponse>("/api/v1/health");
}

export function importObservations(file: File, correctionPolicy: string): Promise<ImportReport> {
  if (file.size > MAX_OBSERVATION_BYTES) {
    throw new ServiceError(413, {
      code: "upload_too_large",
      message: OBSERVATION_TOO_LARGE_MESSAGE,
    });
  }
  const form = new FormData();
  form.set("file", file, file.name || "observaciones.txt");
  form.set("correction_policy", correctionPolicy);
  return jsonRequest<ImportReport>("/api/v1/observations/import", { method: "POST", body: form });
}

export function executeRun(request: RunRequest, executionId?: string): Promise<RunResult> {
  const headers = executionId ? { "X-Boquitas-Execution-Id": executionId } : undefined;
  return postJson<RunResult>("/api/v1/runs", request, headers);
}

export function executeExperiment(request: ExperimentRequest, executionId?: string): Promise<ExperimentResult> {
  const headers = executionId ? { "X-Boquitas-Execution-Id": executionId } : undefined;
  return postJson<ExperimentResult>("/api/v1/experiments", request, headers);
}

export function cancelExecution(executionId: string): Promise<{ status: "cancel_requested" }> {
  return jsonRequest<{ status: "cancel_requested" }>(
    `/api/v1/executions/${encodeURIComponent(executionId)}/cancel`,
    { method: "POST" },
  );
}

export function validateSavedFile(file: File): Promise<FileValidationResponse> {
  if (file.size > MAX_SAVED_RESULT_BYTES) {
    throw new ServiceError(413, {
      code: "saved_file_too_large",
      message: SAVED_FILE_TOO_LARGE_MESSAGE,
    });
  }
  const form = new FormData();
  form.set("file", file, file.name || "boquitas.json");
  return jsonRequest<FileValidationResponse>("/api/v1/files/validate", {
    method: "POST",
    body: form,
  });
}

export function exportCsv(request: CsvExportRequest): Promise<CsvExportResponse> {
  return postJson<CsvExportResponse>("/api/v1/exports/csv", request);
}

export type _ImportedTypeCheck =
  | ApiJsonBody<"/api/v1/runs", "post">
  | ApiJsonBody<"/api/v1/experiments", "post">
  | ApiResponse<"/api/v1/runs", "post">
  | Scenario;
