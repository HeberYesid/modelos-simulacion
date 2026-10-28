import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_SAVED_RESULT_BYTES, SAVED_FILE_TOO_LARGE_MESSAGE } from "../src/domain/file-limits";
import { importObservations, validateSavedFile } from "../src/services/api";

afterEach(() => vi.unstubAllGlobals());

describe("separate observation and saved JSON size policies", () => {
  it("sends saved JSON larger than the observation limit to the local validator", async () => {
    const size = 10 * 1024 * 1024 + 1;
    const file = new File([" ".repeat(size)], "saved-result.json", { type: "application/json" });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      '{"kind":"scenario","value":{"contract_version":1,"scenario_id":"large"}}',
      { headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await validateSavedFile(file);

    expect(result.kind).toBe("scenario");
    expect(fetchMock).toHaveBeenCalledOnce();
    const form = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect((form.get("file") as File).size).toBe(size);
  });

  it("keeps observation uploads limited to ten MiB", async () => {
    const file = new File(["x".repeat(10 * 1024 * 1024 + 1)], "large-observations.txt");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(Promise.resolve().then(() => importObservations(file, "none")))
      .rejects.toMatchObject({
        status: 413,
        code: "upload_too_large",
        message: "El archivo de observaciones supera el límite local de 10 MiB.",
      });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects saved JSON above 64 MiB before sending it", async () => {
    const file = new File(["{}"], "oversized-result.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: MAX_SAVED_RESULT_BYTES + 1 });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(Promise.resolve().then(() => validateSavedFile(file))).rejects.toMatchObject({
      status: 413,
      code: "saved_file_too_large",
      message: SAVED_FILE_TOO_LARGE_MESSAGE,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
