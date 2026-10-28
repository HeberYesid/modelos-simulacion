import { describe, expect, it } from "vitest";
import { assertSafeJsonIntegerTokens, readExactJsonFile } from "../src/domain/format";

describe("saved JSON numeric precision", () => {
  it("rejects an integer the browser cannot represent exactly", () => {
    expect(() => assertSafeJsonIntegerTokens('{"root_seed":9007199254740992}'))
      .toThrow("no puede conservar con exactitud");
  });

  it("does not treat quoted digits, safe integers, decimals, or exponent notation as unsafe integers", () => {
    expect(() => assertSafeJsonIntegerTokens(
      '{"label":"9007199254740992","seed":9007199254740991,"duration":0.123456789123,"rate":1e30}',
    )).not.toThrow();
  });

  it("reports an actionable Spanish error for invalid UTF-8 file bytes", async () => {
    const file = new File([Uint8Array.from([0xff])], "invalid.json", { type: "application/json" });
    await expect(readExactJsonFile(file)).rejects.toThrow("no está codificado en UTF-8");
  });
});
