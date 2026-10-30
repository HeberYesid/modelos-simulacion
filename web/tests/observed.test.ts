import { describe, expect, it } from "vitest";
import {
  observedVisits,
  observedEvents,
  observedWarnings,
  observedSceneState,
  observedTimeSeconds,
  projectObservedVisit,
  type ObservedVisit,
} from "../src/replay/observed";

describe("measured visit replay data", () => {
  it("retains all source rows, three withdrawals, station-local Tuesday identities, and only confirmed Friday joins", () => {
    const tuesday = observedVisits.find((visit) => visit.date === "2026-10-20")!;
    const friday = observedVisits.find((visit) => visit.date === "2026-10-23")!;

    expect(tuesday.records).toHaveLength(119);
    expect(tuesday.records.filter((record) => record.station === "caja")).toHaveLength(61);
    expect(tuesday.records.filter((record) => record.station === "entrega")).toHaveLength(58);
    expect(tuesday.records.filter((record) => record.station === "caja" && record.raw_fields.hora_se_fue !== "")).toHaveLength(3);
    expect(tuesday.records.every((record) => record.confirmed_link_id === undefined)).toBe(true);
    expect(observedWarnings(tuesday)).toContain("El martes, los identificadores de caja y entrega son locales a cada estación; no hay vínculos confirmados entre sus registros.");
    expect(observedWarnings(tuesday)).toContain("Los intervalos entre marcas son tiempo transcurrido observado; no separan trabajo activo, espera externa ni pausas.");
    expect(observedWarnings(friday)).toContain("No se registraron cantidades de personas por pedido.");
    expect(friday.records).toHaveLength(16);
    expect(friday.records.filter((record) => record.confirmed_link_id !== undefined)).toHaveLength(16);
    expect(Object.isFrozen(observedVisits)).toBe(true);
    expect(Object.isFrozen(tuesday.records[0].raw_fields)).toBe(true);
    expect(tuesday.records[0]).toMatchObject({ record_id: "boquitas_tuesday_corrected_2026-10-20:line:002", source_line: 2 });
  });

  it("keeps the three recorded Tuesday withdrawals at their exact departure timestamps with no service duration", () => {
    const tuesday = observedVisits.find((visit) => visit.date === "2026-10-20")!;
    const departures = new Map([
      ["16", "17:10:36"],
      ["19", "17:16:49"],
      ["49", "18:00:37"],
    ]);
    for (const [localId, departure] of departures) {
      const record = tuesday.records.find((item) => item.station === "caja" && item.station_local_id === localId)!;
      const departure_s = observedTimeSeconds(tuesday, departure);
      const before = projectObservedVisit(tuesday, departure_s - 1).records.find((item) => item.order_id === record.record_id)!;
      const atDeparture = projectObservedVisit(tuesday, departure_s).records.find((item) => item.order_id === record.record_id)!;
      expect(record.raw_fields).toMatchObject({ hora_inicio: "", hora_fin: "", hora_se_fue: departure });
      expect(before.stage).toBe("waiting_payment");
      expect(atDeparture).toMatchObject({ stage: "withdrawn", service_start_s: null, service_end_s: null, departure_s });
    }
  });

  it("projects actual events deterministically across backward seeking and preserves the recorded final endpoint", () => {
    const friday = observedVisits.find((visit) => visit.date === "2026-10-23")!;
    const events = observedEvents(friday);
    expect(events[0]).toMatchObject({ time_s: 0, record_id: "boquitas_normal_cashier_2026-10-23:line:002", field: "hora_llegada" });
    expect(events.at(-1)).toMatchObject({ time_s: 3646, record_id: "boquitas_normal_delivery_2026-10-23:line:009", field: "hora_fin" });

    const atEnd = projectObservedVisit(friday, 3646);
    const backward = projectObservedVisit(friday, 0);
    expect(projectObservedVisit(friday, 3646)).toEqual(atEnd);
    expect(projectObservedVisit(friday, 0)).toEqual(backward);
    expect(atEnd.records.every((record) => record.stage === "completed")).toBe(true);
    expect(atEnd.workers).toEqual([]);
    const sceneState = observedSceneState(friday, 3646);
    const lastDelivery = "boquitas_normal_delivery_2026-10-23:line:009";
    expect(sceneState.orders[lastDelivery]).toMatchObject({
      arrival_s: null,
      delivery_s: 3646,
      payment_active_ended_s: null,
      worker_id: null,
    });
    expect(sceneState.workers).toEqual({});
    expect(sceneState.admissions_closed).toBe(false);
    expect(sceneState.finished).toBe(false);
  });

  it("rejects projections beyond the confirmed observation clip", () => {
    const friday = observedVisits.find((visit) => visit.date === "2026-10-23")!;
    expect(() => projectObservedVisit(friday, 3647)).toThrow(RangeError);
    expect(() => observedSceneState(friday, 3647)).toThrow(RangeError);
    expect(() => projectObservedVisit(friday, -1)).toThrow(RangeError);
    expect(() => projectObservedVisit(friday, Number.NaN)).toThrow(RangeError);
  });

  it("orders tied timestamps deterministically and creates only record glyph identities", () => {
    const sourceVisit = observedVisits.find((visit) => visit.date === "2026-10-23")!;
    const cashierRecords = sourceVisit.records.filter((record) => record.station === "caja").slice(0, 2);
    const tiedVisit: ObservedVisit = {
      ...sourceVisit,
      records: [
        cashierRecords[0],
        {
          ...cashierRecords[1],
          raw_fields: { ...cashierRecords[1].raw_fields, hora_llegada: cashierRecords[0].raw_fields.hora_llegada },
        },
      ],
    };
    const events = observedEvents(tiedVisit).filter((event) => event.field === "hora_llegada");
    expect(events.map((event) => event.time_s)).toEqual([0, 0]);
    expect(events.map((event) => event.record_id)).toEqual(cashierRecords.map((record) => record.record_id));
    const state = projectObservedVisit(tiedVisit, 38);
    expect(state.workers).toEqual([]);
    expect(state.records.map((record) => record.person_id)).toEqual(cashierRecords.map((record) => `record:${record.record_id}`));
  });
});
