import type { RunResult } from "../api/types";

/** Read the recorded method without inventing one for older saved results. */
export function paymentMethodLabel(run: RunResult, orderId: string): string {
  const metric = run.metrics.orders.find((order) => order.order_id === orderId);
  if (metric?.state === "abandoned") return "Sin pago";
  const input = run.demand_tape.find((order) => order.order_id === orderId)
    ?? run.initial_state.find((order) => order.order_id === orderId);
  const method = (input as { payment_method?: string | null } | undefined)?.payment_method;
  if (method === "cash") return "Efectivo";
  if (method === "transfer") return "Transferencia";
  if ((input?.transfer_wait_s ?? 0) > 0 || (input && "stage" in input && input.stage === "payment_pending")) {
    return "Transferencia";
  }
  return "No registrado";
}
