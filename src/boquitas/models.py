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

from .work_limits import (
    MAX_GROUP_SIZE,
    MAX_INITIAL_ORDERS,
    MAX_NEW_ORDERS,
    MAX_WORKERS_PER_POOL,
)

EngineMode = Literal["tuesday", "regular"]
VisualKind = Literal["fruit_salad", "ice_cream", "slush"]
MAX_MENU_PRODUCTS = 24
MAX_MENU_BASKETS = 32
MAX_MENU_ITEMS = 24
MAX_MENU_UNITS_PER_ORDER = 50
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


class OrderItem(PublicModel):
    """Immutable product metadata attached to one shared order for replay."""

    product_id: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=100)
    visual_kind: VisualKind
    quantity: int = Field(ge=1, le=MAX_MENU_UNITS_PER_ORDER, strict=True)

    @field_validator("product_id", "display_name")
    @classmethod
    def require_nonblank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Product IDs and display names must not be blank.")
        return value


class MenuProduct(PublicModel):
    """A selectable product with an explicit, per-unit preparation assumption."""

    product_id: str = Field(min_length=1, max_length=100)
    display_name: str = Field(min_length=1, max_length=100)
    visual_kind: VisualKind
    preparation_s: float = Field(ge=0, allow_inf_nan=False)

    @field_validator("product_id", "display_name")
    @classmethod
    def require_nonblank_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Product IDs and display names must not be blank.")
        return value

    @field_validator("preparation_s", mode="before")
    @classmethod
    def reject_boolean_preparation(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("Boolean values are not valid preparation times.")
        return value


class BasketItem(PublicModel):
    """One product selection and quantity in a generated order basket."""

    product_id: str = Field(min_length=1, max_length=100)
    quantity: int = Field(ge=1, le=MAX_MENU_UNITS_PER_ORDER, strict=True)

    @field_validator("product_id")
    @classmethod
    def require_nonblank_product_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Product IDs must not be blank.")
        return value


class OrderBasket(PublicModel):
    """One weighted, complete product basket for a generated shared order."""

    probability: float = Field(ge=0, le=1, allow_inf_nan=False)
    items: tuple[BasketItem, ...] = Field(min_length=1, max_length=MAX_MENU_ITEMS)

    @field_validator("probability", mode="before")
    @classmethod
    def reject_boolean_probability(cls, value: object) -> object:
        if isinstance(value, bool):
            raise ValueError("Boolean values are not valid basket probabilities.")
        return value

    @model_validator(mode="after")
    def validate_items(self) -> OrderBasket:
        _validate_item_quantities(self.items)
        return self


class MenuConfig(PublicModel):
    """Explicit menu products and weighted complete order baskets."""

    products: tuple[MenuProduct, ...] = Field(
        min_length=1,
        max_length=MAX_MENU_PRODUCTS,
    )
    baskets: tuple[OrderBasket, ...] = Field(
        min_length=1,
        max_length=MAX_MENU_BASKETS,
    )

    @model_validator(mode="after")
    def validate_menu(self) -> MenuConfig:
        product_ids = [product.product_id for product in self.products]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("Menu product IDs must be unique.")
        known_product_ids = set(product_ids)
        for basket_index, basket in enumerate(self.baskets):
            for item_index, item in enumerate(basket.items):
                if item.product_id not in known_product_ids:
                    raise ValueError(
                        f"baskets[{basket_index}].items[{item_index}] references an "
                        "unknown product."
                    )
        total_probability = sum(basket.probability for basket in self.baskets)
        if total_probability <= 0 or abs(total_probability - 1.0) > 1e-9:
            raise ValueError("Basket probabilities must sum to 1 within 1e-9.")
        if total_probability != 1.0:
            object.__setattr__(
                self,
                "baskets",
                tuple(
                    basket.model_copy(
                        update={"probability": basket.probability / total_probability}
                    )
                    for basket in self.baskets
                ),
            )
        return self


def _validate_item_quantities(items: tuple[BasketItem | OrderItem, ...]) -> None:
    product_ids = [item.product_id for item in items]
    if len(product_ids) != len(set(product_ids)):
        raise ValueError("Each product may appear only once in an order basket.")
    if sum(item.quantity for item in items) > MAX_MENU_UNITS_PER_ORDER:
        raise ValueError(f"An order may contain at most {MAX_MENU_UNITS_PER_ORDER} product units.")


class EngineConfig(PublicModel):
    """Simulation rules and capacities, expressed in simulation seconds."""

    contract_version: Literal[1] = 1
    mode: EngineMode = "tuesday"
    opening_time: str = "15:00:00"
    horizon_s: float = Field(default=23_400, gt=0, allow_inf_nan=False)
    cashiers: int | None = Field(default=None, le=MAX_WORKERS_PER_POOL)
    preparers: int | None = Field(default=None, le=MAX_WORKERS_PER_POOL)
    integrated_workers: int | None = Field(default=None, le=MAX_WORKERS_PER_POOL)

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
    cashier_interruptions: tuple[CashierInterruption, ...] = Field(
        default=(), max_length=MAX_INITIAL_ORDERS + MAX_NEW_ORDERS
    )

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
    person_ids: tuple[str, ...] = Field(max_length=MAX_GROUP_SIZE)
    arrival_s: float = Field(ge=0, allow_inf_nan=False)
    payment_active_s: float = Field(ge=0, allow_inf_nan=False)
    transfer_wait_s: float = Field(ge=0, allow_inf_nan=False)
    preparation_s: float = Field(ge=0, allow_inf_nan=False)
    patience_s: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    payment_method: Literal["cash", "transfer"] | None = Field(
        default=None, exclude_if=lambda value: value is None
    )
    items: tuple[OrderItem, ...] = Field(
        default_factory=tuple,
        max_length=MAX_MENU_ITEMS,
        exclude_if=lambda value: not value,
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

    @field_validator("items")
    @classmethod
    def validate_product_items(cls, items: tuple[OrderItem, ...]) -> tuple[OrderItem, ...]:
        _validate_item_quantities(items)
        return items


class InitialOrder(PublicModel):
    """An order already present at simulation time zero."""

    order_id: str
    person_ids: tuple[str, ...] = Field(max_length=MAX_GROUP_SIZE)
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
    items: tuple[OrderItem, ...] = Field(
        default_factory=tuple,
        max_length=MAX_MENU_ITEMS,
        exclude_if=lambda value: not value,
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

    @field_validator("items")
    @classmethod
    def validate_product_items(cls, items: tuple[OrderItem, ...]) -> tuple[OrderItem, ...]:
        _validate_item_quantities(items)
        return items


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
    items: tuple[OrderItem, ...] = Field(
        default_factory=tuple,
        max_length=MAX_MENU_ITEMS,
        exclude_if=lambda value: not value,
    )

    @field_validator("items")
    @classmethod
    def validate_product_items(cls, items: tuple[OrderItem, ...]) -> tuple[OrderItem, ...]:
        _validate_item_quantities(items)
        return items


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
