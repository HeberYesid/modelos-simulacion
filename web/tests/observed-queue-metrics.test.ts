import { describe, expect, it } from "vitest";
import { calculateObservedQueueMeasures } from "../src/domain/observed-queue-metrics";
import type { ObservedVisit } from "../src/replay/observed";

const visit: ObservedVisit = {
  visit_id: "example",
  label: "Example",
  date: "2026-10-23",
  start_time: "10:00:00",
  end_time: "10:00:10",
  duration_s: 10,
  sources: [],
  warning_ids: [],
  records: [
    {
      record_id: "a", source_id: "s", source_line: 1, station: "caja", station_local_id: "1",
      raw_fields: { lugar: "", fecha: "", tipo_dia: "", personal: "", id: "1", hora_llegada: "10:00:00", hora_inicio: "10:00:02", hora_fin: "10:00:06", hora_se_fue: "" },
    },
    {
      record_id: "b", source_id: "s", source_line: 2, station: "caja", station_local_id: "2",
      raw_fields: { lugar: "", fecha: "", tipo_dia: "", personal: "", id: "2", hora_llegada: "10:00:04", hora_inicio: "10:00:06", hora_fin: "10:00:08", hora_se_fue: "" },
    },
  ],
};

describe("observed queue measures", () => {
  it("calculates time averages, completed-order waits and occupied/empty fractions from station timestamps", () => {
    const [cashier] = calculateObservedQueueMeasures(visit);
    expect(cashier).toMatchObject({
      station: "caja", L: 1, Lq: 0.4, WqSeconds: 2, WSeconds: 5, pOccupied: 0.8, pEmpty: 0.2,
      completedOrders: 2,
    });
  });
});
