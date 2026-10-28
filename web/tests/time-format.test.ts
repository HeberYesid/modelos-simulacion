import { describe, expect, it } from "vitest";
import { formatClockFromOpening, formatSeconds } from "../src/domain/format";

describe("millisecond time formatting", () => {
  it("rounds fractions before carrying into the next minute or day", () => {
    expect(formatSeconds(59.9999)).toBe("00:01:00");
    expect(formatSeconds(86_399.9999)).toBe("24:00:00 (+1 día)");
    expect(formatClockFromOpening("23:59:00", 59.9999)).toBe("00:00:00 (+1 día)");
  });
});
