"""Replication-level summaries with two-sided Student-t intervals."""

from __future__ import annotations

import math
from collections.abc import Iterable

from pydantic import Field
from scipy.stats import t

from .models import PublicModel


class MeanInterval(PublicModel):
    """A mean and its unclamped replication-level confidence interval."""

    method: str = "student_t"
    interpretation: str = (
        "Student-t intervals describe Monte Carlo variability conditional on the chosen inputs; "
        "they exclude uncertainty about actual Boquitas parameters."
    )
    confidence_level: float = Field(gt=0, lt=1, allow_inf_nan=False)
    n_requested: int = Field(ge=0, strict=True)
    n_valid: int = Field(ge=0, strict=True)
    mean: float | None = None
    lower: float | None = None
    upper: float | None = None
    reason: str | None = None
    physical_bounds_crossed: tuple[str, ...] = ()


def mean_confidence_interval(
    values: Iterable[float | None],
    *,
    n_requested: int,
    confidence_level: float = 0.95,
    physical_bounds: tuple[float | None, float | None] | None = None,
) -> MeanInterval:
    """Summarize one scalar per independent replication using sample variance."""

    if isinstance(n_requested, bool) or not isinstance(n_requested, int) or n_requested < 0:
        raise ValueError("n_requested must be a nonnegative integer.")
    raw_values = tuple(values)
    if n_requested < len(raw_values):
        raise ValueError("n_requested cannot be smaller than the supplied replication count.")
    if not math.isfinite(confidence_level) or not 0 < confidence_level < 1:
        raise ValueError("confidence_level must be finite and strictly between 0 and 1.")

    valid: list[float] = []
    for value in raw_values:
        if value is None:
            continue
        if isinstance(value, bool) or not math.isfinite(value):
            raise ValueError("Replication summaries must be finite numeric values or null.")
        valid.append(float(value))

    n_valid = len(valid)
    scale = max((abs(value) for value in valid), default=0.0)
    scaled_values = [value / scale for value in valid] if scale else [0.0] * n_valid
    scaled_mean = math.fsum(scaled_values) / n_valid if n_valid else None
    mean = scale * scaled_mean if scaled_mean is not None else None
    if n_valid < 2:
        return MeanInterval(
            confidence_level=confidence_level,
            n_requested=n_requested,
            n_valid=n_valid,
            mean=mean,
            reason="insufficient_valid_replications",
        )

    assert scaled_mean is not None and mean is not None
    deviations = [value - scaled_mean for value in scaled_values]
    scaled_sample_variance = math.fsum(value * value for value in deviations) / (n_valid - 1)
    if scaled_sample_variance == 0:
        return MeanInterval(
            confidence_level=confidence_level,
            n_requested=n_requested,
            n_valid=n_valid,
            mean=mean,
            lower=mean,
            upper=mean,
            reason="zero_observed_variability",
        )

    critical_value = float(t.ppf((1 + confidence_level) / 2, n_valid - 1))
    scaled_margin = critical_value * math.sqrt(scaled_sample_variance / n_valid)
    lower = scale * (scaled_mean - scaled_margin)
    upper = scale * (scaled_mean + scaled_margin)
    if not math.isfinite(lower) or not math.isfinite(upper):
        raise ValueError("Student-t interval endpoints are outside the finite float range.")
    crossed: list[str] = []
    if physical_bounds is not None:
        physical_lower, physical_upper = physical_bounds
        if any(
            bound is not None and not math.isfinite(bound)
            for bound in physical_bounds
        ):
            raise ValueError("Physical bounds must be finite or null.")
        if physical_lower is not None and lower < physical_lower:
            crossed.append(
                f"lower endpoint {lower:g} is below physical lower bound "
                f"{physical_lower:g}"
            )
        if physical_upper is not None and upper > physical_upper:
            crossed.append(
                f"upper endpoint {upper:g} is above physical upper bound "
                f"{physical_upper:g}"
            )

    return MeanInterval(
        confidence_level=confidence_level,
        n_requested=n_requested,
        n_valid=n_valid,
        mean=mean,
        lower=lower,
        upper=upper,
        physical_bounds_crossed=tuple(crossed),
    )
