import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../src/services/api";

afterEach(() => vi.unstubAllGlobals());

describe("exact JSON returned by the local service", () => {
  it("retains compact UTF-8 response text by the returned object's identity", async () => {
    const responseText = '{"label":"Demostración café 🧁","root_seed":20261024,"duration":0.123456789012345678901}';
    vi.stubGlobal("fetch", vi.fn(async () => new Response(responseText, {
      headers: { "content-type": "application/json" },
    })));

    const result = await api.executeRun({} as Parameters<typeof api.executeRun>[0]);
    const responseTextFor = (api as typeof api & {
      exactResponseJsonFor?: (value: object) => string | undefined;
    }).exactResponseJsonFor;

    expect(responseTextFor?.(result)).toBe(responseText);
    expect(responseTextFor?.({ ...result })).toBeUndefined();
  });
});
