"""Typed HTTP input and helper response models for the local API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .experiments import (
    MAX_REPLICATIONS,
    MAX_SCENARIOS,
    ExperimentResultVersion,
    RunResultVersion,
)
from .observation_import import ImportReport
from .scenarios import Scenario, ScenarioVersion


class APIModel(BaseModel):
    """Forbid undeclared JSON fields at the HTTP boundary."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class ErrorIssue(APIModel):
    """One field-level diagnostic safe to return to the local browser."""

    path: str
    code: str
    message: str


class ErrorResponse(APIModel):
    """Version-independent envelope for API failures."""

    code: str
    message: str
    issues: tuple[ErrorIssue, ...] = ()
    details: dict[str, Any] = Field(default_factory=dict)


class ExecutionCancelResponse(APIModel):
    """Acknowledgement that an execution cancellation signal was recorded."""

    status: Literal["cancel_requested"]


class RunRequest(APIModel):
    """One immutable scenario/seed/index tuple to execute or replay."""

    scenario: ScenarioVersion
    root_seed: int = Field(ge=0, strict=True)
    replication_index: int = Field(ge=0, strict=True)

    @model_validator(mode="before")
    @classmethod
    def default_legacy_scenario_version(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        scenario = value.get("scenario")
        if not isinstance(scenario, dict) or "contract_version" in scenario:
            return value
        normalized = dict(value)
        normalized_scenario = dict(scenario)
        normalized_scenario["contract_version"] = 1
        normalized["scenario"] = normalized_scenario
        return normalized


class ExperimentRequest(APIModel):
    """Bounded batch of scenario replications."""

    scenarios: tuple[ScenarioVersion, ...] = Field(min_length=1, max_length=MAX_SCENARIOS)
    root_seed: int = Field(ge=0, strict=True)
    replications: int = Field(ge=1, le=MAX_REPLICATIONS, strict=True)

    @model_validator(mode="before")
    @classmethod
    def default_legacy_scenario_versions(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        scenarios = value.get("scenarios")
        if not isinstance(scenarios, (list, tuple)):
            return value
        normalized_scenarios = [
            ({**scenario, "contract_version": 1}
             if isinstance(scenario, dict) and "contract_version" not in scenario
             else scenario)
            for scenario in scenarios
        ]
        normalized = dict(value)
        normalized["scenarios"] = normalized_scenarios
        return normalized


class DemoResponse(APIModel):
    """Labeled synthetic inputs and teaching defaults."""

    scenario: Scenario
    root_seed: int
    replications: int


class ValidatedFileResponse(APIModel):
    """One saved, validated upstream artifact without rerunning it."""

    kind: Literal["scenario", "run", "experiment"]
    value: ScenarioVersion | RunResultVersion | ExperimentResultVersion


class CSVExportRequest(APIModel):
    """Existing result plus optional observation provenance for CSV export."""

    result: RunResultVersion | ExperimentResultVersion
    observations: ImportReport | None = None

    @model_validator(mode="before")
    @classmethod
    def default_legacy_result_version(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = value.get("result")
        if not isinstance(result, dict) or "contract_version" in result:
            return value
        normalized = dict(value)
        normalized_result = dict(result)
        normalized_result["contract_version"] = 1
        normalized["result"] = normalized_result
        return normalized


class CSVExportResponse(APIModel):
    """UTF-8 CSV tables returned by the existing domain exporter."""

    tables: dict[str, str]
