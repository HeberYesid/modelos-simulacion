import { describe, expect, it, vi } from "vitest";
import { assertSafeJsonIntegerTokens, readExactJsonFile } from "../src/domain/format";
import { MAX_SAVED_RESULT_BYTES, SAVED_FILE_TOO_LARGE_MESSAGE } from "../src/domain/file-limits";

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

  it("reads a valid saved result larger than the observation import limit", async () => {
    const size = 11 * 1024 * 1024;
    const text = `{"x":1}${" ".repeat(size - 7)}`;
    const file = new File([text], "large-result.json", { type: "application/json" });

    const opened = await readExactJsonFile(file);

    expect(opened.bytes.byteLength).toBe(size);
    expect(opened.text).toBe(text);
  });

  it("rejects a saved file above 64 MiB before reading its bytes", async () => {
    const file = new File(["{}"], "oversized-result.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: MAX_SAVED_RESULT_BYTES + 1 });
    const readBytes = vi.spyOn(file, "arrayBuffer");

    await expect(readExactJsonFile(file)).rejects.toThrow(SAVED_FILE_TOO_LARGE_MESSAGE);
    expect(readBytes).not.toHaveBeenCalled();
  });
});
