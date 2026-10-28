import { describe, expect, it } from "vitest";
import { ServiceError } from "../src/services/api";

describe("ServiceError", () => {
  it("preserves the backend diagnostic_ref for local 500 errors", () => {
    const error = new ServiceError(500, {
      code: "internal_error",
      message: "No se pudo completar la solicitud.",
      details: { diagnostic_ref: "diag-20261022-abc123" },
    });

    expect(error.diagnosticReference).toBe("diag-20261022-abc123");
  });
});
