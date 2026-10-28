"""Immutable public result contracts for trace-derived run metrics."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

MetricCohort = Literal["all", "new", "initialized"]
OrderCohort = Literal["new", "initialized"]


class MetricsModel(BaseModel):
    """Base model for frozen metric output records."""

    model_config = ConfigDict(frozen=True, extra="forbid", allow_inf_nan=False)


class MetricSummary(MetricsModel):
    """One scalar estimate with its unit, population and validity counts."""

    metric_id: str
    value: float | None
    unit: str
    population: str
    cohort: MetricCohort
    count: int = Field(ge=0)
    n_valid: int = Field(ge=0)
    mean: float | None = None
    median: float | None = None
    p95: float | None = None
    maximum: float | None = None
    denominator: float | None = None
    unavailable_reason: str | None = None


class UnavailableField(MetricsModel):
    """Why one optional per-order or per-person measurement is unavailable."""

    field: str
    reason: str


class OrderMetric(MetricsModel):
    """Lifecycle timestamps and elapsed values for one shared order."""

    order_id: str
    person_ids: tuple[str, ...]
    cohort: OrderCohort
    state: str
    arrival_s: float | None
    payment_started_s: float | None
    payment_active_ended_s: float | None
    payment_completed_s: float | None
    preparation_started_s: float | None
    delivery_s: float | None
    abandonment_s: float | None
    payment_wait_s: float | None
    transaction_elapsed_s: float | None
    preparation_queue_wait_s: float | None
    preparation_elapsed_s: float | None
    permanence_s: float | None
    withdrawal_wait_s: float | None
    unavailable_fields: tuple[UnavailableField, ...] = ()


class OrderMetricV2(MetricsModel):
    """Version-2 lifecycle metrics for one shared order."""

    order_id: str
    person_ids: tuple[str, ...]
    cohort: OrderCohort
    state: str
    arrival_s: float | None
    payment_started_s: float | None
    payment_active_ended_s: float | None
    payment_completed_s: float | None
    preparation_started_s: float | None
    delivery_s: float | None
    abandonment_s: float | None
    payment_wait_s: float | None
    transaction_elapsed_s: float | None
    preparation_queue_wait_s: float | None
    preparation_elapsed_s: float | None
    preparation_active_s: float | None = Field(ge=0)
    preparation_paused_s: float | None = Field(ge=0)
    preparation_pause_count: int | None = Field(default=None, ge=0, strict=True)
    permanence_s: float | None
    withdrawal_wait_s: float | None
    unavailable_fields: tuple[UnavailableField, ...] = ()


class PersonMetric(MetricsModel):
    """Person-weighted view of their shared order's timestamps and durations."""

    person_id: str
    order_id: str
    cohort: OrderCohort
    state: str
    arrival_s: float | None
    payment_started_s: float | None
    payment_active_ended_s: float | None
    payment_completed_s: float | None
    preparation_started_s: float | None
    delivery_s: float | None
    abandonment_s: float | None
    payment_wait_s: float | None
    transaction_elapsed_s: float | None
    preparation_queue_wait_s: float | None
    preparation_elapsed_s: float | None
    permanence_s: float | None
    withdrawal_wait_s: float | None
    unavailable_fields: tuple[UnavailableField, ...] = ()


class PersonMetricV2(MetricsModel):
    """Version-2 person-weighted view of their shared order's metrics."""

    person_id: str
    order_id: str
    cohort: OrderCohort
    state: str
    arrival_s: float | None
    payment_started_s: float | None
    payment_active_ended_s: float | None
    payment_completed_s: float | None
    preparation_started_s: float | None
    delivery_s: float | None
    abandonment_s: float | None
    payment_wait_s: float | None
    transaction_elapsed_s: float | None
    preparation_queue_wait_s: float | None
    preparation_elapsed_s: float | None
    preparation_active_s: float | None = Field(ge=0)
    preparation_paused_s: float | None = Field(ge=0)
    preparation_pause_count: int | None = Field(default=None, ge=0, strict=True)
    permanence_s: float | None
    withdrawal_wait_s: float | None
    unavailable_fields: tuple[UnavailableField, ...] = ()


class QueueInterval(MetricsModel):
    """Settled order/person queue counts over a half-open time interval."""

    queue: Literal["payment", "preparation"]
    start_s: float
    end_s: float
    order_count: int = Field(ge=0)
    person_count: int = Field(ge=0)


class ResourceUsage(MetricsModel):
    """Active and reserved worker time for one pool/component pair."""

    pool: Literal["cashier", "preparer", "integrated", "all"]
    component: Literal[
        "payment",
        "preparation",
        "external_confirmation",
        "total",
    ]
    capacity: int = Field(ge=0)
    active_worker_s: float
    reserved_worker_s: float
    available_worker_s: float
    active_fraction: float | None
    reserved_fraction: float | None


class RunMetrics(MetricsModel):
    """Versioned, immutable metrics derived from one public simulation trace."""

    contract_version: Literal[1] = 1
    horizon_s: float
    drain_end_s: float
    overtime_s: float
    metric_summaries: tuple[MetricSummary, ...]
    orders: tuple[OrderMetric, ...]
    people: tuple[PersonMetric, ...]
    queue_series: tuple[QueueInterval, ...]
    resource_usage: tuple[ResourceUsage, ...]


class RunMetricsV2(MetricsModel):
    """Version-2 trace-derived run metrics with interruption accounting."""

    contract_version: Literal[2] = 2
    horizon_s: float
    drain_end_s: float
    overtime_s: float
    metric_summaries: tuple[MetricSummary, ...]
    orders: tuple[OrderMetricV2, ...]
    people: tuple[PersonMetricV2, ...]
    queue_series: tuple[QueueInterval, ...]
    resource_usage: tuple[ResourceUsage, ...]


RunMetricsVersion = Annotated[
    RunMetrics | RunMetricsV2,
    Field(discriminator="contract_version"),
]
