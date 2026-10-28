import pytest

from boquitas.statistics import mean_confidence_interval


def test_student_t_interval_uses_sample_standard_deviation_without_clamping() -> None:
    estimate = mean_confidence_interval([1.0, 2.0, 3.0], n_requested=3)

    assert estimate.mean == pytest.approx(2.0)
    assert estimate.lower == pytest.approx(-0.4841377117, abs=1e-9)
    assert estimate.upper == pytest.approx(4.4841377117, abs=1e-9)
    assert (estimate.n_requested, estimate.n_valid) == (3, 3)
    assert estimate.reason is None
    assert estimate.interpretation == (
        "Student-t intervals describe Monte Carlo variability conditional on the chosen inputs; "
        "they exclude uncertainty about actual Boquitas parameters."
    )


def test_confidence_interval_is_unavailable_below_two_values() -> None:
    estimate = mean_confidence_interval([2.0, None], n_requested=2)

    assert estimate.mean == 2.0
    assert estimate.lower is None
    assert estimate.upper is None
    assert (estimate.n_requested, estimate.n_valid) == (2, 1)
    assert estimate.reason == "insufficient_valid_replications"


def test_constant_values_return_zero_width_interval_with_reason() -> None:
    estimate = mean_confidence_interval([7.0, 7.0, 7.0], n_requested=3)

    assert (estimate.lower, estimate.mean, estimate.upper) == (7.0, 7.0, 7.0)
    assert estimate.reason == "zero_observed_variability"


def test_requested_replication_count_rejects_float_even_when_integral() -> None:
    with pytest.raises(ValueError):
        mean_confidence_interval([1.0], n_requested=1.0)  # type: ignore[arg-type]


@pytest.mark.parametrize("scale", [1e200, 1e-200])
def test_student_t_interval_scales_finite_extreme_values_without_over_or_underflow(
    scale: float,
) -> None:
    estimate = mean_confidence_interval(
        [scale, 2 * scale, 3 * scale],
        n_requested=3,
    )

    assert estimate.reason is None
    assert estimate.lower is not None and estimate.lower / scale == pytest.approx(
        -0.48413771175033
    )
    assert estimate.upper is not None and estimate.upper / scale == pytest.approx(
        4.48413771175033
    )


def test_interval_reports_crossed_physical_bounds_without_clamping() -> None:
    estimate = mean_confidence_interval(
        [1.0, 2.0, 3.0],
        n_requested=3,
        physical_bounds=(0.0, 1.0),
    )

    assert estimate.lower is not None and estimate.lower < 0
    assert estimate.upper is not None and estimate.upper > 1
    assert len(estimate.physical_bounds_crossed) == 2


def test_unrepresentable_interval_endpoints_fail_instead_of_returning_infinity() -> None:
    with pytest.raises(ValueError, match="finite float range"):
        mean_confidence_interval([-1e308, 1e308], n_requested=2)
