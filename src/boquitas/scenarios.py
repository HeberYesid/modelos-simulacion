"""Typed scenario inputs and the explicitly synthetic demonstration case."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from .engine import simulate
from .models import EngineConfig, EngineConfigV2, InitialOrder, PublicModel


class ConstantTime(PublicModel):
    """A fixed time in simulation seconds."""

    kind: Literal["constant"] = "constant"
    value_s: float = Field(ge=0, allow_inf_nan=False)

    @field_validator("value_s", mode="before")
    @classmethod
    def reject_boolean_time(cls, value: object) -> object:
        return _reject_boolean_number(value)


class TriangularTime(PublicModel):
    """A triangular time distribution in simulation seconds."""

    kind: Literal["triangular"] = "triangular"
    low_s: float = Field(ge=0, allow_inf_nan=False)
    mode_s: float = Field(ge=0, allow_inf_nan=False)
    high_s: float = Field(ge=0, allow_inf_nan=False)

    @field_validator("low_s", "mode_s", "high_s", mode="before")
    @classmethod
    def reject_boolean_bounds(cls, value: object) -> object:
        return _reject_boolean_number(value)

    @model_validator(mode="after")
    def validate_bounds(self) -> TriangularTime:
        if not self.low_s <= self.mode_s <= self.high_s or self.low_s == self.high_s:
            raise ValueError("Triangular times require low <= mode <= high and low < high.")
        return self


class ExponentialTime(PublicModel):
    """An exponential time distribution in simulation seconds."""

    kind: Literal["exponential"] = "exponential"
    mean_s: float = Field(gt=0, allow_inf_nan=False)

    @field_validator("mean_s", mode="before")
    @classmethod
    def reject_boolean_mean(cls, value: object) -> object:
        return _reject_boolean_number(value)


type TimeDistribution = Annotated[
    ConstantTime | TriangularTime | ExponentialTime,
    Field(discriminator="kind"),
]


class GroupWeight(PublicModel):
    """One positive order group size and its probability weight."""

    size: int = Field(ge=1, strict=True)
    probability: float = Field(ge=0, le=1, allow_inf_nan=False)

    @field_validator("probability", mode="before")
    @classmethod
    def reject_boolean_probability(cls, value: object) -> object:
        return _reject_boolean_number(value)


class Scenario(PublicModel):
    """A versioned, immutable set of hypothetical simulation inputs."""

    contract_version: Literal[1] = 1
    scenario_id: str
    display_name: str
    engine_config: EngineConfig
    initial_state: tuple[InitialOrder, ...] = ()
    interarrival: TimeDistribution
    group_sizes: tuple[GroupWeight, ...]
    payment_active: TimeDistribution
    preparation: TimeDistribution
    transfer_probability: float = Field(ge=0, le=1, allow_inf_nan=False)
    transfer_confirmation: TimeDistribution
    patience: TimeDistribution | None = None
    provenance: Literal["synthetic_demo", "user_assumptions"]
    assumptions: tuple[str, ...] = ()
    default_root_seed: int = Field(default=20261020, ge=0, strict=True)

    @field_validator("transfer_probability", mode="before")
    @classmethod
    def reject_boolean_transfer_probability(cls, value: object) -> object:
        return _reject_boolean_number(value)

    @model_validator(mode="after")
    def validate_scenario(self) -> Scenario:
        if not self.scenario_id.strip():
            raise ValueError("Scenario ID must not be empty or whitespace.")
        if not self.display_name.strip():
            raise ValueError("Scenario display name must not be empty or whitespace.")
        if not self.group_sizes:
            raise ValueError("At least one group size is required.")
        sizes = [group.size for group in self.group_sizes]
        if len(sizes) != len(set(sizes)):
            raise ValueError("Group sizes must be unique.")
        weights_total = sum(group.probability for group in self.group_sizes)
        if weights_total <= 0 or abs(weights_total - 1.0) > 1e-9:
            raise ValueError("Group probabilities must sum to 1 within 1e-9.")

        if isinstance(self.interarrival, ConstantTime) and self.interarrival.value_s <= 0:
            raise ValueError("Interarrival times must be strictly positive.")
        if isinstance(self.interarrival, TriangularTime) and self.interarrival.low_s <= 0:
            raise ValueError("Interarrival times must have a strictly positive lower bound.")

        normalized = tuple(
            group.model_copy(update={"probability": group.probability / weights_total})
            for group in self.group_sizes
        )
        if normalized != self.group_sizes:
            object.__setattr__(self, "group_sizes", normalized)

        # The deterministic engine is the shared public validator for resource
        # availability, initial-stage fields, queue ranks, and worker assignments.
        # This preflight contains no generated demand and is not retained as a run.
        simulate(self.engine_config, demand=(), initial_state=self.initial_state)
        return self


class ScenarioV2(PublicModel):
    """A version-2 scenario with explicit scripted scheduling assumptions."""

    contract_version: Literal[2] = 2
    scenario_id: str
    display_name: str
    engine_config: EngineConfigV2
    initial_state: tuple[InitialOrder, ...] = ()
    interarrival: TimeDistribution
    group_sizes: tuple[GroupWeight, ...]
    payment_active: TimeDistribution
    preparation: TimeDistribution
    transfer_probability: float = Field(ge=0, le=1, allow_inf_nan=False)
    transfer_confirmation: TimeDistribution
    patience: TimeDistribution | None = None
    provenance: Literal["synthetic_demo", "user_assumptions"]
    assumptions: tuple[str, ...] = ()
    default_root_seed: int = Field(default=20261020, ge=0, strict=True)

    @field_validator("transfer_probability", mode="before")
    @classmethod
    def reject_boolean_transfer_probability(cls, value: object) -> object:
        return _reject_boolean_number(value)

    @model_validator(mode="after")
    def validate_scenario(self) -> ScenarioV2:
        if not self.scenario_id.strip():
            raise ValueError("Scenario ID must not be empty or whitespace.")
        if not self.display_name.strip():
            raise ValueError("Scenario display name must not be empty or whitespace.")
        if not self.group_sizes:
            raise ValueError("At least one group size is required.")
        sizes = [group.size for group in self.group_sizes]
        if len(sizes) != len(set(sizes)):
            raise ValueError("Group sizes must be unique.")
        weights_total = sum(group.probability for group in self.group_sizes)
        if weights_total <= 0 or abs(weights_total - 1.0) > 1e-9:
            raise ValueError("Group probabilities must sum to 1 within 1e-9.")

        if isinstance(self.interarrival, ConstantTime) and self.interarrival.value_s <= 0:
            raise ValueError("Interarrival times must be strictly positive.")
        if isinstance(self.interarrival, TriangularTime) and self.interarrival.low_s <= 0:
            raise ValueError("Interarrival times must have a strictly positive lower bound.")

        normalized = tuple(
            group.model_copy(update={"probability": group.probability / weights_total})
            for group in self.group_sizes
        )
        if normalized != self.group_sizes:
            object.__setattr__(self, "group_sizes", normalized)

        # Validate only the legacy-compatible initial state. Script IDs may name
        # future generated demand and are checked once a concrete tape exists.
        preflight_config = EngineConfig(
            mode="regular",
            opening_time=self.engine_config.opening_time,
            horizon_s=self.engine_config.horizon_s,
            cashiers=0,
            preparers=0,
            integrated_workers=1,
        )
        simulate(preflight_config, demand=(), initial_state=self.initial_state)
        return self


ScenarioVersion = Annotated[
    Scenario | ScenarioV2,
    Field(discriminator="contract_version"),
]


def demo_scenario() -> Scenario:
    """Return the labeled teaching defaults; no observation fitting is performed."""

    return Scenario(
        scenario_id="synthetic-demo-tuesday",
        display_name="Synthetic demonstration (not calibrated)",
        engine_config=EngineConfig(mode="tuesday"),
        interarrival=ExponentialTime(mean_s=180),
        group_sizes=(
            GroupWeight(size=1, probability=0.6),
            GroupWeight(size=2, probability=0.4),
        ),
        payment_active=TriangularTime(low_s=15, mode_s=30, high_s=45),
        preparation=TriangularTime(low_s=60, mode_s=120, high_s=180),
        transfer_probability=0.25,
        transfer_confirmation=TriangularTime(low_s=30, mode_s=60, high_s=90),
        patience=None,
        provenance="synthetic_demo",
        assumptions=(
            "Synthetic teaching inputs only; these values are not estimates from Boquitas data.",
            "Each shared order has one payment and one preparation regardless of group size.",
            "The initial state is empty; no unobserved opening work is assumed.",
            "No warm-up period is applied; observation-window metrics start at opening.",
        ),
        default_root_seed=20261020,
    )


def _reject_boolean_number(value: object) -> object:
    if isinstance(value, bool):
        raise ValueError("Boolean values are not valid numeric scenario inputs.")
    return value
