from boquitas import EngineConfig, OrderInput, simulate
from boquitas.metrics import summarize


def test_tuesday_pool_totals_match_each_pool_component_time() -> None:
    trace = simulate(
        EngineConfig(mode="tuesday", horizon_s=10, cashiers=1, preparers=2),
        demand=[
            OrderInput(
                order_id="A",
                person_ids=("A1",),
                arrival_s=0,
                payment_active_s=2,
                transfer_wait_s=0,
                preparation_s=6,
            )
        ],
        initial_state=[],
    )
    metrics = summarize(trace)
    usage = {(item.pool, item.component): item for item in metrics.resource_usage}

    cashier_total = usage[("cashier", "total")]
    assert cashier_total.active_worker_s == 2
    assert cashier_total.reserved_worker_s == 2
    assert usage[("cashier", "payment")].active_worker_s == 2
    assert usage[("cashier", "payment")].reserved_worker_s == 2

    preparation_total = usage[("preparer", "total")]
    assert preparation_total.active_worker_s == 6
    assert preparation_total.reserved_worker_s == 6
    assert usage[("preparer", "preparation")].active_worker_s == 6
    assert usage[("preparer", "preparation")].reserved_worker_s == 6

    integrated_total = usage[("integrated", "total")]
    assert integrated_total.active_worker_s == 0
    assert integrated_total.reserved_worker_s == 0
    assert integrated_total.active_fraction is None
    assert integrated_total.reserved_fraction is None
