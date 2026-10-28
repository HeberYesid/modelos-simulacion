"""Typed HTTP input and helper response models for the local API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .experiments import MAX_REPLICATIONS, MAX_SCENARIOS, ExperimentResult, RunResult
from .observation_import import ImportReport
from .scenarios import Scenario


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


class RunRequest(APIModel):
    """One immutable scenario/seed/index tuple to execute or replay."""

    scenario: Scenario
    root_seed: int = Field(ge=0, strict=True)
    replication_index: int = Field(ge=0, strict=True)


class ExperimentRequest(APIModel):
    """Bounded batch of scenario replications."""

    scenarios: tuple[Scenario, ...] = Field(min_length=1, max_length=MAX_SCENARIOS)
    root_seed: int = Field(ge=0, strict=True)
    replications: int = Field(ge=1, le=MAX_REPLICATIONS, strict=True)


class DemoResponse(APIModel):
    """Labeled synthetic inputs and teaching defaults."""

    scenario: Scenario
    root_seed: int
    replications: int


class ValidatedFileResponse(APIModel):
    """One saved, validated upstream artifact without rerunning it."""

    kind: Literal["scenario", "run", "experiment"]
    value: Scenario | RunResult | ExperimentResult


class CSVExportRequest(APIModel):
    """Existing result plus optional observation provenance for CSV export."""

    result: RunResult | ExperimentResult
    observations: ImportReport | None = None


class CSVExportResponse(APIModel):
    """UTF-8 CSV tables returned by the existing domain exporter."""

    tables: dict[str, str]
