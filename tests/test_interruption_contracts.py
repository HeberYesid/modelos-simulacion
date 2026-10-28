from __future__ import annotations

import math

import pytest
from pydantic import TypeAdapter, ValidationError

import boquitas
from boquitas import (
    ConstantTime,
    ExponentialTime,
    GroupWeight,
    metrics_models,
    models,
)
from boquitas import (
    experiments as experiment_models,
)
from boquitas import scenarios as scenario_models
from boquitas.models import (
    CashierInterruption,
    EngineConfigV2,
    EngineConfigVersion,
    InputValidationError,
)


def _make_v2_scenario():
    scenario_type = scenario_models.ScenarioV2
    return scenario_type(
        scenario_id="scripted-regular",
        display_name="Scripted regular scenario",
        engine_config=EngineConfigV2(
            horizon_s=20,
            cashier_interruptions=(
                CashierInterruption(
                    at_s=5,
                    suspended_order_id="future-a",
                    cashier_order_id="future-b",
                ),
            ),
        ),
        interarrival=ExponentialTime(mean_s=10),
        group_sizes=(GroupWeight(size=1, probability=1),),
        payment_active=ConstantTime(value_s=2),
        preparation=ConstantTime(value_s=3),
        transfer_probability=0,
        transfer_confirmation=ConstantTime(value_s=0),
        provenance="user_assumptions",
    )


def test_version_2_configuration_is_a_public_contract() -> None:
    assert hasattr(boquitas, "EngineConfigV2")
    config = EngineConfigV2()
    assert config.contract_version == 2
    assert config.mode == "regular"
    assert config.integrated_workers == 1
    assert config.preparation_interruption_policy == "scripted_cashier"
    assert config.cashier_interruptions == ()


def test_cashier_interruption_rejects_the_same_order_for_both_roles() -> None:
    with pytest.raises(InputValidationError):
        CashierInterruption(
            at_s=5,
            suspended_order_id="A",
            cashier_order_id="A",
        )


@pytest.mark.parametrize(
    ("suspended_order_id", "cashier_order_id"),
    [("", "B"), (" ", "B"), ("A", " ")],
)
def test_cashier_interruption_requires_nonempty_order_ids(
    suspended_order_id: str,
    cashier_order_id: str,
) -> None:
    with pytest.raises(InputValidationError):
        CashierInterruption(
            at_s=5,
            suspended_order_id=suspended_order_id,
            cashier_order_id=cashier_order_id,
        )


@pytest.mark.parametrize("at_s", [True, False, -1, math.inf, -math.inf, math.nan])
def test_interruption_times_reject_boolean_negative_and_nonfinite_values(at_s: object) -> None:
    with pytest.raises(InputValidationError):
        CashierInterruption(
            at_s=at_s,
            suspended_order_id="A",
            cashier_order_id="B",
        )


@pytest.mark.parametrize(
    "config_changes",
    [
        {"mode": "tuesday"},
        {"integrated_workers": 2},
        {"cashiers": 1},
        {"preparers": 1},
        {"preparation_interruption_policy": "automatic"},
    ],
)
def test_version_2_configuration_rejects_unsupported_mode_and_capacity(
    config_changes: dict[str, object],
) -> None:
    with pytest.raises(InputValidationError):
        EngineConfigV2(**config_changes)


def test_script_times_are_strictly_increasing_and_report_the_entry() -> None:
    with pytest.raises(InputValidationError) as error:
        EngineConfigV2(
            cashier_interruptions=(
                CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
                CashierInterruption(at_s=5, suspended_order_id="C", cashier_order_id="D"),
            ),
        )

    assert any(
        "cashier_interruptions[1].at_s" in issue.message
        for issue in error.value.issues
    )


def test_version_2_inputs_are_immutable_and_legacy_shape_is_unchanged() -> None:
    config = EngineConfigV2(
        cashier_interruptions=(
            CashierInterruption(at_s=5, suspended_order_id="A", cashier_order_id="B"),
        ),
    )
    with pytest.raises(ValidationError):
        config.mode = "tuesday"  # type: ignore[misc]
    with pytest.raises(ValidationError):
        config.cashier_interruptions[0].at_s = 6  # type: ignore[misc]

    legacy = boquitas.EngineConfig()
    assert list(legacy.model_dump(mode="json")) == [
        "contract_version",
        "mode",
        "opening_time",
        "horizon_s",
        "cashiers",
        "preparers",
        "integrated_workers",
    ]
    assert legacy.model_dump(mode="json") == {
        "contract_version": 1,
        "mode": "tuesday",
        "opening_time": "15:00:00",
        "horizon_s": 23400.0,
        "cashiers": 1,
        "preparers": 4,
        "integrated_workers": 0,
    }
    assert list(models.EventData.model_fields) == [
        "stage",
        "queue",
        "queue_rank",
        "worker_reserved",
        "worker_active",
        "initial_stage",
        "remaining_s",
        "arrival_s",
    ]
    assert list(models.SimulationEvent.model_fields) == [
        "seq",
        "time_s",
        "type",
        "order_id",
        "person_ids",
        "worker_id",
        "data",
    ]
    assert list(models.SimulationTrace.model_fields) == [
        "contract_version",
        "config",
        "declared_resource_ids",
        "initialized_order_ids",
        "new_order_ids",
        "events",
        "window_end_s",
        "drain_end_s",
        "final_orders",
        "final_people",
        "final_workers",
    ]
    assert "cashier_interruptions" not in boquitas.EngineConfig.model_fields
    assert "preparation_active_s" not in metrics_models.OrderMetric.model_fields


def test_engine_configuration_version_alias_selects_the_declared_contract() -> None:
    adapter = TypeAdapter(EngineConfigVersion)
    assert isinstance(
        adapter.validate_python(boquitas.EngineConfig().model_dump()),
        boquitas.EngineConfig,
    )
    assert isinstance(adapter.validate_python(EngineConfigV2().model_dump()), EngineConfigV2)


def test_version_2_trace_can_represent_a_pause_event_without_widening_v1() -> None:
    event_data_type = models.EventDataV2
    event_type = models.SimulationEventV2
    trace_type = models.SimulationTraceV2
    worker_type = models.WorkerState

    pause_event = event_type(
        seq=0,
        time_s=5,
        type="preparation_paused",
        order_id="A",
        worker_id="integrated-1",
        data=event_data_type(
            stage="preparation_paused",
            remaining_s=7,
            related_cashier_order_id="B",
            assigned_order_id=None,
            worker_reserved=False,
            worker_active=False,
        ),
    )
    trace = trace_type(
        config=EngineConfigV2(horizon_s=20),
        declared_resource_ids=("integrated-1",),
        events=(pause_event,),
        window_end_s=20,
        drain_end_s=20,
        final_workers=(worker_type(worker_id="integrated-1", pool="integrated"),),
    )

    assert trace.contract_version == 2
    assert trace.events[0].data.related_cashier_order_id == "B"
    restored = TypeAdapter(models.SimulationTraceVersion).validate_python(
        trace.model_dump(mode="json")
    )
    assert isinstance(restored, trace_type)
    legacy_trace = models.SimulationTrace(
        config=boquitas.EngineConfig(horizon_s=20),
        declared_resource_ids=(),
        events=(),
        window_end_s=20,
        drain_end_s=20,
        final_workers=(),
    )
    assert isinstance(
        TypeAdapter(models.SimulationTraceVersion).validate_python(
            legacy_trace.model_dump(mode="json")
        ),
        models.SimulationTrace,
    )
    with pytest.raises(InputValidationError):
        models.SimulationEvent(
            seq=0,
            time_s=5,
            type="preparation_paused",
            order_id="A",
        )


def test_pause_event_requires_public_worker_and_remaining_work_state() -> None:
    with pytest.raises(InputValidationError):
        models.SimulationEventV2(
            seq=0,
            time_s=5,
            type="preparation_paused",
            order_id="A",
            worker_id="integrated-1",
        )


def test_pause_event_rejects_nonfinite_remaining_work() -> None:
    with pytest.raises(InputValidationError):
        models.SimulationEventV2(
            seq=0,
            time_s=5,
            type="preparation_paused",
            order_id="A",
            worker_id="integrated-1",
            data=models.EventDataV2(
                stage="preparation_paused",
                remaining_s=math.nan,
                related_cashier_order_id="B",
                assigned_order_id=None,
                worker_reserved=False,
                worker_active=False,
            ),
        )


def test_version_2_scenario_keeps_future_tape_ids_without_empty_tape_preflight() -> None:
    scenario = _make_v2_scenario()

    assert scenario.contract_version == 2
    assert scenario.engine_config.cashier_interruptions[0].cashier_order_id == "future-b"
    restored = TypeAdapter(scenario_models.ScenarioVersion).validate_python(
        scenario.model_dump(mode="json")
    )
    assert isinstance(restored, scenario_models.ScenarioV2)
    assert isinstance(
        TypeAdapter(scenario_models.ScenarioVersion).validate_python(
            boquitas.demo_scenario().model_dump(mode="json")
        ),
        boquitas.Scenario,
    )


def test_version_2_scenario_keeps_legacy_initial_preparation_but_rejects_paid_queue() -> None:
    scenario = _make_v2_scenario()
    legacy_preparing_order = {
        "order_id": "initial-a",
        "person_ids": ("person-a",),
        "stage": "preparing",
        "worker_id": "integrated-1",
        "remaining_s": 5,
    }
    payload = scenario.model_dump(mode="python")
    payload["initial_state"] = (legacy_preparing_order,)
    assert scenario_models.ScenarioV2(**payload).initial_state[0].stage == "preparing"

    payload["initial_state"] = (
        {
            "order_id": "already-paid",
            "person_ids": ("person-b",),
            "stage": "waiting_preparation",
            "queue_rank": 0,
            "preparation_s": 3,
        },
    )
    with pytest.raises(InputValidationError):
        scenario_models.ScenarioV2(**payload)

    with pytest.raises(InputValidationError):
        scenario_models.ScenarioV2(
            **{
                **scenario.model_dump(mode="python"),
                "initial_state": (
                    {
                        "order_id": "paused",
                        "person_ids": ("person-c",),
                        "stage": "preparation_paused",
                    },
                ),
            }
        )


def test_version_2_order_metrics_separate_active_paused_and_elapsed_time() -> None:
    metric_type = metrics_models.OrderMetricV2
    metric = metric_type(
        order_id="A",
        person_ids=("person-A",),
        cohort="new",
        state="delivered",
        arrival_s=0,
        payment_started_s=0,
        payment_active_ended_s=2,
        payment_completed_s=2,
        preparation_started_s=2,
        delivery_s=14,
        abandonment_s=None,
        payment_wait_s=0,
        transaction_elapsed_s=2,
        preparation_queue_wait_s=0,
        preparation_elapsed_s=12,
        preparation_active_s=10,
        preparation_paused_s=2,
        preparation_pause_count=1,
        permanence_s=14,
        withdrawal_wait_s=None,
    )

    assert metric.preparation_active_s == 10
    assert metric.preparation_paused_s == 2
    assert metric.preparation_elapsed_s == 12
    assert metric.preparation_pause_count == 1

    invalid = metric.model_dump()
    invalid["preparation_active_s"] = -1
    with pytest.raises(ValidationError):
        metric_type(**invalid)

    v2_metrics = metrics_models.RunMetricsV2(
        horizon_s=20,
        drain_end_s=20,
        overtime_s=0,
        metric_summaries=(),
        orders=(metric,),
        people=(),
        queue_series=(),
        resource_usage=(),
    )
    assert isinstance(
        TypeAdapter(metrics_models.RunMetricsVersion).validate_python(
            v2_metrics.model_dump(mode="json")
        ),
        metrics_models.RunMetricsV2,
    )
    legacy_metrics = metrics_models.RunMetrics(
        horizon_s=20,
        drain_end_s=20,
        overtime_s=0,
        metric_summaries=(),
        orders=(),
        people=(),
        queue_series=(),
        resource_usage=(),
    )
    assert isinstance(
        TypeAdapter(metrics_models.RunMetricsVersion).validate_python(
            legacy_metrics.model_dump(mode="json")
        ),
        metrics_models.RunMetrics,
    )


def test_version_2_selected_run_requires_version_2_members() -> None:
    run_type = experiment_models.RunResultV2
    trace = models.SimulationTraceV2(
        config=_make_v2_scenario().engine_config,
        declared_resource_ids=("integrated-1",),
        events=(),
        window_end_s=20,
        drain_end_s=20,
        final_workers=(),
    )
    metrics = metrics_models.RunMetricsV2(
        horizon_s=20,
        drain_end_s=20,
        overtime_s=0,
        metric_summaries=(),
        orders=(),
        people=(),
        queue_series=(),
        resource_usage=(),
    )
    run = run_type(
        scenario=_make_v2_scenario(),
        root_seed=1,
        replication_index=0,
        assumptions=(),
        demand_tape=(),
        initial_state=(),
        trace=trace,
        metrics=metrics,
    )

    restored = TypeAdapter(experiment_models.RunResultVersion).validate_python(
        run.model_dump(mode="json")
    )
    assert isinstance(restored, run_type)
    assert restored.trace.contract_version == restored.metrics.contract_version == 2

    legacy_trace = models.SimulationTrace(
        config=boquitas.EngineConfig(mode="regular", horizon_s=20),
        declared_resource_ids=("integrated-1",),
        events=(),
        window_end_s=20,
        drain_end_s=20,
        final_workers=(),
    )
    payload = run.model_dump(mode="json")
    payload["trace"] = legacy_trace.model_dump(mode="json")
    with pytest.raises(ValidationError):
        TypeAdapter(experiment_models.RunResultVersion).validate_python(payload)


def test_version_2_experiment_envelope_can_retain_mixed_members() -> None:
    experiment_type = experiment_models.ExperimentResultV2
    legacy_scenario = boquitas.demo_scenario()
    scripted_scenario = _make_v2_scenario()
    legacy_metrics = metrics_models.RunMetrics(
        horizon_s=20,
        drain_end_s=20,
        overtime_s=0,
        metric_summaries=(),
        orders=(),
        people=(),
        queue_series=(),
        resource_usage=(),
    )
    scripted_metrics = metrics_models.RunMetricsV2(
        horizon_s=20,
        drain_end_s=20,
        overtime_s=0,
        metric_summaries=(),
        orders=(),
        people=(),
        queue_series=(),
        resource_usage=(),
    )
    experiment = experiment_type(
        scenarios=(legacy_scenario, scripted_scenario),
        root_seed=1,
        n_requested=1,
        n_valid=1,
        confidence_level=0.95,
        replication_results=(
            experiment_models.ReplicationResultV2(
                scenario_id=legacy_scenario.scenario_id,
                replication_index=0,
                status="complete",
                metrics=legacy_metrics,
            ),
            experiment_models.ReplicationResultV2(
                scenario_id=scripted_scenario.scenario_id,
                replication_index=0,
                status="complete",
                metrics=scripted_metrics,
            ),
        ),
        aggregate_estimates=(),
        comparisons=(),
        status="complete",
        provenance=(),
    )

    restored = TypeAdapter(experiment_models.ExperimentResultVersion).validate_python(
        experiment.model_dump(mode="json")
    )
    assert isinstance(restored, experiment_type)
    assert [scenario.contract_version for scenario in restored.scenarios] == [1, 2]


def test_version_2_experiment_rejects_metrics_from_the_wrong_scenario_version() -> None:
    scenario = _make_v2_scenario()
    legacy_metrics = metrics_models.RunMetrics(
        horizon_s=20,
        drain_end_s=20,
        overtime_s=0,
        metric_summaries=(),
        orders=(),
        people=(),
        queue_series=(),
        resource_usage=(),
    )

    with pytest.raises(InputValidationError):
        experiment_models.ExperimentResultV2(
            scenarios=(scenario,),
            root_seed=1,
            n_requested=1,
            n_valid=1,
            confidence_level=0.95,
            replication_results=(
                experiment_models.ReplicationResultV2(
                    scenario_id=scenario.scenario_id,
                    replication_index=0,
                    status="complete",
                    metrics=legacy_metrics,
                ),
            ),
            aggregate_estimates=(),
            comparisons=(),
            status="complete",
            provenance=(),
        )
