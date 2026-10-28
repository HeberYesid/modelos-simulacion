"""Versioned public models for deterministic Boquitas simulation runs."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)

EngineMode = Literal["tuesday", "regular"]
InitialStage = Literal[
    "waiting_payment",
    "payment_active",
    "payment_pending",
    "waiting_preparation",
    "preparing",
]


class InputValidationIssue(BaseModel):
    """One machine-readable input validation problem."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    path: str
    code: str
    message: str


class InputValidationError(ValueError):
    """Raised when a simulation input cannot be scheduled safely."""

    def __init__(self, issues: tuple[InputValidationIssue, ...]) -> None:
        self.issues = list(issues)
        detail = "; ".join(f"{issue.path}: {issue.message}" for issue in issues)
        super().__init__(detail or "Simulation input is invalid.")


class PublicModel(BaseModel):
    """Base for immutable public input and output records."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    def __init__(self, **data: object) -> None:
        try:
            super().__init__(**data)
        except ValidationError as error:
            issues = tuple(
                InputValidationIssue(
                    path=".".join(str(part) for part in item["loc"]),
                    code=item["type"],
                    message=item["msg"],
                )
                for item in error.errors(
                    include_url=False,
                    include_context=False,
                    include_input=False,
                )
            )
            raise InputValidationError(issues) from error


class EngineConfig(PublicModel):
    """Simulation rules and capacities, expressed in simulation seconds."""

    contract_version: Literal[1] = 1
    mode: EngineMode = "tuesday"
    opening_time: str = "15:00:00"
    horizon_s: float = Field(default=23_400, gt=0, allow_inf_nan=False)
    cashiers: int | None = None
    preparers: int | None = None
    integrated_workers: int | None = None

    @model_validator(mode="before")
    @classmethod
    def apply_mode_capacity_defaults(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        if normalized.get("mode", "tuesday") == "tuesday":
            normalized.setdefault("cashiers", 1)
            normalized.setdefault("preparers", 4)
            normalized.setdefault("integrated_workers", 0)
        else:
            normalized.setdefault("cashiers", 0)
            normalized.setdefault("preparers", 0)
            normalized.setdefault("integrated_workers", 1)
        return normalized


class CashierInterruption(PublicModel):
    """One explicit request to pause preparation and serve a cashier order."""

    at_s: float = Field(ge=0, allow_inf_nan=False)
    suspended_order_id: str
    cashier_order_id: str

    @field_validator("at_s", mode="before")
    @classmethod
    def reject_boolean_time(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("Boolean values are not valid interruption times.")
        return value

    @field_validator("suspended_order_id", "cashier_order_id")
    @classmethod
    def require_nonempty_order_ids(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Order IDs must not be empty or whitespace.")
        return value

    @model_validator(mode="after")
    def require_distinct_orders(self) -> CashierInterruption:
        if self.suspended_order_id == self.cashier_order_id:
            raise ValueError("The suspended and cashier order IDs must differ.")
        return self


class EngineConfigV2(PublicModel):
    """Opt-in version-2 configuration for explicitly scripted interruptions."""

    contract_version: Literal[2] = 2
    mode: Literal["regular"] = "regular"
    opening_time: str = "15:00:00"
    horizon_s: float = Field(default=23_400, gt=0, allow_inf_nan=False)
    cashiers: Literal[0] = 0
    preparers: Literal[0] = 0
    integrated_workers: Literal[1] = 1
    preparation_interruption_policy: Literal["scripted_cashier"] = "scripted_cashier"
    cashier_interruptions: tuple[CashierInterruption, ...] = ()

    @field_validator("cashiers", "preparers", "integrated_workers", mode="before")
    @classmethod
    def reject_boolean_capacity(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("Boolean values are not valid worker capacities.")
        return value

    @field_validator("cashier_interruptions")
    @classmethod
    def validate_interruption_order(
        cls,
        entries: tuple[CashierInterruption, ...],
    ) -> tuple[CashierInterruption, ...]:
        previous_time: float | None = None
        for index, entry in enumerate(entries):
            if entry.suspended_order_id == entry.cashier_order_id:
                raise ValueError(
                    f"cashier_interruptions[{index}].cashier_order_id must differ from "
                    "suspended_order_id."
                )
            if previous_time is not None and entry.at_s <= previous_time:
                raise ValueError(
                    f"cashier_interruptions[{index}].at_s must be strictly greater than "
                    "the preceding script time."
                )
            previous_time = entry.at_s
        return entries


EngineConfigVersion = Annotated[
    EngineConfig | EngineConfigV2,
    Field(discriminator="contract_version"),
]


class OrderInput(PublicModel):
    """One newly arriving shared order with its individual members."""

    order_id: str
    person_ids: tuple[str, ...]
    arrival_s: float = Field(ge=0, allow_inf_nan=False)
    payment_active_s: float = Field(ge=0, allow_inf_nan=False)
    transfer_wait_s: float = Field(ge=0, allow_inf_nan=False)
    preparation_s: float = Field(ge=0, allow_inf_nan=False)
    patience_s: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    payment_method: Literal["cash", "transfer"] | None = Field(
        default=None, exclude_if=lambda value: value is None
    )

    @field_validator("person_ids")
    @classmethod
    def require_unique_person_ids(cls, person_ids: tuple[str, ...]) -> tuple[str, ...]:
        if not person_ids:
            raise ValueError("An order must contain at least one person.")
        if any(not person_id.strip() for person_id in person_ids):
            raise ValueError("Person IDs must not be empty or whitespace.")
        if len(person_ids) != len(set(person_ids)):
            raise ValueError("Person IDs must be unique within an order.")
        return person_ids


class InitialOrder(PublicModel):
    """An order already present at simulation time zero."""

    order_id: str
    person_ids: tuple[str, ...]
    arrival_s: float | None = Field(default=None, le=0, allow_inf_nan=False)
    stage: InitialStage
    queue_rank: int | None = Field(default=None, ge=0)
    worker_id: str | None = None
    remaining_s: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    patience_remaining_s: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    payment_active_s: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    transfer_wait_s: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    preparation_s: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    payment_method: Literal["cash", "transfer"] | None = Field(
        default=None, exclude_if=lambda value: value is None
    )

    @field_validator("person_ids")
    @classmethod
    def require_unique_person_ids(cls, person_ids: tuple[str, ...]) -> tuple[str, ...]:
        if not person_ids:
            raise ValueError("An order must contain at least one person.")
        if any(not person_id.strip() for person_id in person_ids):
            raise ValueError("Person IDs must not be empty or whitespace.")
        if len(person_ids) != len(set(person_ids)):
            raise ValueError("Person IDs must be unique within an order.")
        return person_ids


class WorkerState(PublicModel):
    """Public current state of a declared worker."""

    worker_id: str
    pool: Literal["cashier", "preparer", "integrated"]
    assigned_order_id: str | None = None
    reserved: bool = False
    active: bool = False
    stage: str | None = None


class FinalOrderState(PublicModel):
    """Final state of one shared order."""

    order_id: str
    person_ids: tuple[str, ...]
    state: str
    arrival_s: float | None = None
    worker_id: str | None = None


class FinalPersonState(PublicModel):
    """Final state of one person linked to a shared order."""

    person_id: str
    order_id: str
    state: str


class EventData(PublicModel):
    """Immutable scalar details attached to a public trace event."""

    stage: str | None = None
    queue: str | None = None
    queue_rank: int | None = None
    worker_reserved: bool | None = None
    worker_active: bool | None = None
    initial_stage: str | None = None
    remaining_s: float | None = None
    arrival_s: float | None = None


class EventDataV2(PublicModel):
    """Version-2 event details, including the assignment after a pause/resume."""

    stage: str | None = None
    queue: str | None = None
    queue_rank: int | None = None
    worker_reserved: bool | None = None
    worker_active: bool | None = None
    initial_stage: str | None = None
    remaining_s: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    arrival_s: float | None = None
    related_cashier_order_id: str | None = None
    assigned_order_id: str | None = None


class SimulationEvent(PublicModel):
    """One ordered event in a version 1 simulation trace."""

    seq: int = Field(ge=0)
    time_s: float = Field(ge=0, allow_inf_nan=False)
    type: Literal[
        "order_initialized",
        "order_arrived",
        "payment_started",
        "payment_active_ended",
        "payment_completed",
        "preparation_started",
        "order_delivered",
        "order_abandoned",
        "admissions_closed",
        "run_finished",
    ]
    order_id: str | None = None
    person_ids: tuple[str, ...] = ()
    worker_id: str | None = None
    data: EventData = Field(default_factory=EventData)


class SimulationEventV2(PublicModel):
    """One ordered event in a version-2 simulation trace."""

    seq: int = Field(ge=0)
    time_s: float = Field(ge=0, allow_inf_nan=False)
    type: Literal[
        "order_initialized",
        "order_arrived",
        "payment_started",
        "payment_active_ended",
        "payment_completed",
        "preparation_started",
        "preparation_paused",
        "preparation_resumed",
        "order_delivered",
        "order_abandoned",
        "admissions_closed",
        "run_finished",
    ]
    order_id: str | None = None
    person_ids: tuple[str, ...] = ()
    worker_id: str | None = None
    data: EventDataV2 = Field(default_factory=EventDataV2)

    @model_validator(mode="after")
    def validate_interruption_state(self) -> SimulationEventV2:
        if self.type not in {"preparation_paused", "preparation_resumed"}:
            return self
        if (
            not self.order_id
            or not self.order_id.strip()
            or not self.worker_id
            or not self.worker_id.strip()
        ):
            raise ValueError("Pause and resume events require an order and worker ID.")
        if (
            not self.data.related_cashier_order_id
            or not self.data.related_cashier_order_id.strip()
            or self.data.related_cashier_order_id == self.order_id
        ):
            raise ValueError("Pause and resume events require a distinct related cashier order.")
        if self.data.remaining_s is None or self.data.remaining_s <= 0:
            raise ValueError("Pause and resume events require positive remaining preparation work.")
        if (
            self.data.worker_reserved is None
            or self.data.worker_active is None
            or "assigned_order_id" not in self.data.model_fields_set
        ):
            raise ValueError("Pause and resume events require the resulting worker state.")

        if self.type == "preparation_paused":
            if (
                self.data.stage != "preparation_paused"
                or self.data.assigned_order_id is not None
                or self.data.worker_reserved
                or self.data.worker_active
            ):
                raise ValueError("A pause event must show the worker released from preparation.")
        elif (
            self.data.stage != "preparing"
            or self.data.assigned_order_id != self.order_id
            or not self.data.worker_reserved
            or not self.data.worker_active
        ):
            raise ValueError("A resume event must show the same worker assigned to preparation.")
        return self


class SimulationTrace(PublicModel):
    """Deterministic, deeply immutable event history and terminal state."""

    contract_version: Literal[1] = 1
    config: EngineConfig
    declared_resource_ids: tuple[str, ...]
    initialized_order_ids: tuple[str, ...] = ()
    new_order_ids: tuple[str, ...] = ()
    events: tuple[SimulationEvent, ...]
    window_end_s: float = Field(ge=0, allow_inf_nan=False)
    drain_end_s: float = Field(ge=0, allow_inf_nan=False)
    final_orders: tuple[FinalOrderState, ...] = ()
    final_people: tuple[FinalPersonState, ...] = ()
    final_workers: tuple[WorkerState, ...]


class SimulationTraceV2(PublicModel):
    """Version-2 deterministic event history and terminal state."""

    contract_version: Literal[2] = 2
    config: EngineConfigV2
    declared_resource_ids: tuple[str, ...]
    initialized_order_ids: tuple[str, ...] = ()
    new_order_ids: tuple[str, ...] = ()
    events: tuple[SimulationEventV2, ...]
    window_end_s: float = Field(ge=0, allow_inf_nan=False)
    drain_end_s: float = Field(ge=0, allow_inf_nan=False)
    final_orders: tuple[FinalOrderState, ...] = ()
    final_people: tuple[FinalPersonState, ...] = ()
    final_workers: tuple[WorkerState, ...]


SimulationTraceVersion = Annotated[
    SimulationTrace | SimulationTraceV2,
    Field(discriminator="contract_version"),
]
