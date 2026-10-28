"""Local HTTP adapter for the versioned Boquitas public contracts."""

import json
import logging
import re
from collections.abc import Mapping
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, Form, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, ValidationError

from .api_models import (
    CSVExportRequest,
    CSVExportResponse,
    DemoResponse,
    ErrorIssue,
    ErrorResponse,
    ExperimentRequest,
    RunRequest,
    ValidatedFileResponse,
)
from .demand import WorkloadLimitExceeded
from .experiments import ExperimentResult, RunResult, run_experiment, run_scenario
from .exports import export_csv_tables, load_experiment_json, load_run_json, load_scenario_json
from .file_limits import MAX_OBSERVATION_BYTES, MAX_SAVED_RESULT_BYTES
from .models import InputValidationError
from .observation_import import ImportReport, import_observations
from .scenarios import Scenario, demo_scenario

MAX_UPLOAD_BYTES = MAX_OBSERVATION_BYTES
_API_FALLBACK_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
_LOGGER = logging.getLogger(__name__)


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ok"] = "ok"
    contract_version: Literal[1] = 1


def _error_response(
    status_code: int,
    *,
    code: str,
    message: str,
    issues: tuple[ErrorIssue, ...] = (),
    details: dict[str, object] | None = None,
) -> JSONResponse:
    error = ErrorResponse(
        code=code,
        message=message,
        issues=issues,
        details=details or {},
    )
    return JSONResponse(status_code=status_code, content=error.model_dump(mode="json"))


def _complete_result_response(result: RunResult | ExperimentResult) -> Response | JSONResponse:
    content = result.model_dump_json().encode("utf-8")
    if len(content) > MAX_SAVED_RESULT_BYTES:
        return _error_response(
            422,
            code="result_too_large",
            message=(
                "El resultado supera el límite local de 64 MiB. Reduzca el horizonte, "
                "la demanda o el número de réplicas antes de volver a ejecutar."
            ),
            details={"result_bytes": len(content), "limit_bytes": MAX_SAVED_RESULT_BYTES},
        )
    return Response(content=content, media_type="application/json")


def _validation_issue(error: Mapping[str, object]) -> ErrorIssue:
    error_type = str(error.get("type", "invalid"))
    raw_location = error.get("loc", ())
    location = raw_location if isinstance(raw_location, tuple) else ()
    path_parts = [
        str(part)
        for part in location
        if not isinstance(part, str)
        or part not in {"body", "query", "path", "header", "cookie"}
    ]
    message = "El valor no cumple las reglas del contrato de entrada."
    code = error_type

    if error_type == "missing":
        message = "Este campo es obligatorio."
    elif error_type == "extra_forbidden":
        message = "Este campo no está permitido."
    elif error_type in {"int_type", "int_parsing"}:
        message = "El valor debe ser un número entero."
    elif error_type in {"float_type", "float_parsing"}:
        message = "El valor debe ser numérico."
    elif error_type == "literal_error":
        message = "El valor no pertenece a las opciones permitidas."

    validation_message = str(error.get("msg", ""))
    staffing_match = re.search(
        r"config\.(cashiers|preparers|integrated_workers)",
        validation_message,
    )
    if staffing_match:
        prefix = path_parts or ["scenario"]
        path_parts = [*prefix, "engine_config", staffing_match.group(1)]
        code = "invalid_staffing"
        message = "La capacidad del personal debe permitir al menos un trabajador activo."

    return ErrorIssue(
        path=".".join(path_parts) or "request",
        code=code,
        message=message,
    )


def _saved_file_issues(error: InputValidationError | ValidationError) -> tuple[ErrorIssue, ...]:
    if isinstance(error, InputValidationError):
        return tuple(
            ErrorIssue(
                path=issue.path,
                code=issue.code,
                message="El contenido del archivo no cumple el contrato de Boquitas v1.",
            )
            for issue in error.issues
        )
    return tuple(_validation_issue(issue) for issue in error.errors())


def create_app(frontend_dist: str | Path | None = None) -> FastAPI:
    """Build an app with an optional locally bundled frontend directory."""

    app = FastAPI(title="Boquitas Local API", version="1.0.0", docs_url=None, redoc_url=None)

    @app.exception_handler(RequestValidationError)
    def request_validation_error_handler(
        _request: object,
        error: RequestValidationError,
    ) -> JSONResponse:
        issues = tuple(_validation_issue(item) for item in error.errors())
        return _error_response(
            422,
            code="invalid_request",
            message="La solicitud contiene datos inválidos.",
            issues=issues,
        )

    @app.exception_handler(InputValidationError)
    def input_validation_error_handler(
        _request: object,
        error: InputValidationError,
    ) -> JSONResponse:
        issues = tuple(
            ErrorIssue(path=item.path, code=item.code, message=item.message)
            for item in error.issues
        )
        return _error_response(
            422,
            code="invalid_request",
            message="La solicitud contiene una configuración inválida.",
            issues=issues,
        )

    @app.exception_handler(Exception)
    def unhandled_exception_handler(_request: object, error: Exception) -> JSONResponse:
        diagnostic_ref = uuid4().hex
        _LOGGER.error(
            "Local API diagnostic %s (%s)",
            diagnostic_ref,
            type(error).__name__,
        )
        return _error_response(
            500,
            code="internal_error",
            message="Ocurrió un error local. Guarde la referencia y vuelva a intentarlo.",
            details={"diagnostic_ref": diagnostic_ref},
        )

    @app.get("/api/v1/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    @app.get(
        "/api/v1/demo",
        response_model=DemoResponse,
        responses={500: {"model": ErrorResponse}},
    )
    def get_demo() -> DemoResponse:
        scenario = demo_scenario()
        return DemoResponse(
            scenario=scenario,
            root_seed=scenario.default_root_seed,
            replications=30,
        )

    @app.post(
        "/api/v1/runs",
        response_model=RunResult,
        response_class=JSONResponse,
        responses={422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    )
    def create_run(request: RunRequest) -> Response | JSONResponse:
        try:
            result = run_scenario(
                request.scenario,
                root_seed=request.root_seed,
                replication_index=request.replication_index,
            )
        except WorkloadLimitExceeded:
            return _error_response(
                422,
                code="workload_limit_exceeded",
                message="La demanda generada supera el límite permitido para una simulación.",
                issues=(
                    ErrorIssue(
                        path="scenario",
                        code="workload_limit_exceeded",
                        message="Reduzca la demanda o el horizonte antes de volver a ejecutar.",
                    ),
                ),
            )
        return _complete_result_response(result)

    @app.post(
        "/api/v1/observations/import",
        response_model=ImportReport,
        responses={
            413: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
            500: {"model": ErrorResponse},
        },
    )
    def import_observation_upload(
        file: UploadFile,
        correction_policy: str = Form(default="none"),
    ) -> ImportReport | JSONResponse:
        if file.size is not None and file.size > MAX_OBSERVATION_BYTES:
            return _error_response(
                413,
                code="upload_too_large",
                message="El archivo de observaciones supera el límite local de 10 MiB.",
            )
        content = file.file.read(MAX_OBSERVATION_BYTES + 1)
        if len(content) > MAX_OBSERVATION_BYTES:
            return _error_response(
                413,
                code="upload_too_large",
                message="El archivo de observaciones supera el límite local de 10 MiB.",
            )

        source_name = (file.filename or "observations.txt").replace("\\", "/").rsplit("/", 1)[-1]
        report = import_observations(
            content,
            source_name=source_name or "observations.txt",
            correction_policy=correction_policy,
        )
        if report.fatal_error:
            return _error_response(
                422,
                code="invalid_observations",
                message="No se pudo importar el archivo; revise el informe de validación.",
                details={"report": report.model_dump(mode="json")},
            )
        return report

    @app.post(
        "/api/v1/files/validate",
        response_model=ValidatedFileResponse,
        responses={
            413: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
            500: {"model": ErrorResponse},
        },
    )
    def validate_saved_file(file: UploadFile) -> ValidatedFileResponse | JSONResponse:
        if file.size is not None and file.size > MAX_SAVED_RESULT_BYTES:
            return _error_response(
                413,
                code="saved_file_too_large",
                message="El archivo JSON guardado supera el límite local de 64 MiB.",
            )
        content = file.file.read(MAX_SAVED_RESULT_BYTES + 1)
        if len(content) > MAX_SAVED_RESULT_BYTES:
            return _error_response(
                413,
                code="saved_file_too_large",
                message="El archivo JSON guardado supera el límite local de 64 MiB.",
            )

        try:
            payload = json.loads(content)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return _error_response(
                422,
                code="invalid_saved_file",
                message="El archivo no contiene JSON UTF-8 válido.",
                issues=(
                    ErrorIssue(
                        path="file",
                        code="invalid_json",
                        message="Guarde un archivo JSON válido y vuelva a abrirlo.",
                    ),
                ),
            )

        if not isinstance(payload, dict):
            return _error_response(
                422,
                code="invalid_saved_file",
                message="El archivo no contiene un objeto Boquitas reconocido.",
                issues=(
                    ErrorIssue(
                        path="file",
                        code="invalid_artifact",
                        message="Elija un escenario, una ejecución o un experimento válido.",
                    ),
                ),
            )

        version = payload.get("contract_version")
        if type(version) is not int or version != 1:
            return _error_response(
                422,
                code="invalid_saved_file",
                message="Esta versión de archivo no es compatible con Boquitas.",
                issues=(
                    ErrorIssue(
                        path="contract_version",
                        code="unsupported_version",
                        message="Abra un archivo con contract_version 1.",
                    ),
                ),
            )

        artifact_kind: Literal["scenario", "run", "experiment"] | None = None
        if "scenario_id" in payload and "engine_config" in payload:
            artifact_kind = "scenario"
        elif "scenario" in payload and "trace" in payload and "metrics" in payload:
            artifact_kind = "run"
        elif "scenarios" in payload and "replication_results" in payload:
            artifact_kind = "experiment"

        if artifact_kind is None:
            return _error_response(
                422,
                code="invalid_saved_file",
                message="El archivo no contiene un objeto Boquitas reconocido.",
                issues=(
                    ErrorIssue(
                        path="file",
                        code="invalid_artifact",
                        message="Elija un escenario, una ejecución o un experimento válido.",
                    ),
                ),
            )

        artifact: Scenario | RunResult | ExperimentResult
        try:
            if artifact_kind == "scenario":
                artifact = load_scenario_json(content)
            elif artifact_kind == "run":
                artifact = load_run_json(content)
            else:
                artifact = load_experiment_json(content)
        except (InputValidationError, ValidationError) as error:
            return _error_response(
                422,
                code="invalid_saved_file",
                message="El JSON no cumple el contrato declarado por su contenido.",
                issues=_saved_file_issues(error),
            )
        except ValueError:
            return _error_response(
                422,
                code="invalid_saved_file",
                message="El archivo no contiene un escenario o resultado válido.",
                issues=(
                    ErrorIssue(
                        path="file",
                        code="invalid_artifact",
                        message="Compruebe que el archivo conserve todos sus campos originales.",
                    ),
                ),
            )

        return ValidatedFileResponse(kind=artifact_kind, value=artifact)

    @app.post(
        "/api/v1/experiments",
        response_model=ExperimentResult,
        response_class=JSONResponse,
        responses={422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    )
    def create_experiment(
        request: ExperimentRequest,
    ) -> Response | JSONResponse:
        try:
            result = run_experiment(
                request.scenarios,
                root_seed=request.root_seed,
                replications=request.replications,
            )
        except ValueError:
            return _error_response(
                422,
                code="invalid_experiment",
                message="La configuración de la comparación no es válida.",
                issues=(
                    ErrorIssue(
                        path="scenarios",
                        code="invalid_experiment",
                        message="Revise las combinaciones e identificadores de escenarios.",
                    ),
                ),
            )

        if result.status == "failed":
            return _error_response(
                422,
                code="experiment_failed",
                message="Una o más réplicas no pudieron completarse.",
                issues=tuple(
                    ErrorIssue(
                        path=f"scenarios.{issue.scenario_id}",
                        code=issue.code,
                        message="La réplica falló; consulte sus detalles en el resultado parcial.",
                    )
                    for issue in result.issues
                ),
                details={"partial_result": result.model_dump(mode="json")},
            )
        return _complete_result_response(result)

    @app.post(
        "/api/v1/exports/csv",
        response_model=CSVExportResponse,
        responses={422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    )
    def create_csv_export(request: CSVExportRequest) -> CSVExportResponse:
        return CSVExportResponse(
            tables=export_csv_tables(
                request.result,
                observations=request.observations,
            )
        )

    @app.api_route(
        "/api",
        methods=_API_FALLBACK_METHODS,
        include_in_schema=False,
    )
    @app.api_route(
        "/api/{path:path}",
        methods=_API_FALLBACK_METHODS,
        include_in_schema=False,
    )
    def api_route_not_found(path: str = "") -> JSONResponse:
        return _error_response(
            404,
            code="route_not_found",
            message="La ruta solicitada no existe en la API local.",
        )

    if frontend_dist is not None:
        static_root = Path(frontend_dist).resolve(strict=True)
        if not static_root.is_dir() or not (static_root / "index.html").is_file():
            raise ValueError("frontend_dist must contain a built index.html file.")
        app.mount(
            "/",
            StaticFiles(directory=str(static_root), html=True),
            name="frontend",
        )

    return app


_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_FRONTEND_DIST = _PROJECT_ROOT / "web" / "dist"
app = create_app(
    frontend_dist=(
        _DEFAULT_FRONTEND_DIST
        if (_DEFAULT_FRONTEND_DIST / "index.html").is_file()
        else None
    )
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
