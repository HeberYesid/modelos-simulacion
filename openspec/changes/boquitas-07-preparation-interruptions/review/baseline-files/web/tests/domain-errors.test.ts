import { describe, expect, it } from "vitest";
import type { ImportIssue } from "../src/api/types";
import { validationMessage } from "../src/domain/errors";

describe("observation issue labels", () => {
  it("does not reuse another source's overlap counts as a generic warning", () => {
    const issue: ImportIssue = {
      affected_view: "normalized",
      code: "capacity_exceeded",
      fields: [],
      line_numbers: [5, 7],
      message: "Seven delivery intervals overlap while five preparers were reported.",
      row_keys: ["delivery:duplicate"],
      severity: "warning",
    };

    expect(validationMessage(issue)).toBe(
      "Los intervalos observados superan la capacidad de personal reportada para este segmento; consulta el detalle del pico de concurrencia.",
    );
  });
});
