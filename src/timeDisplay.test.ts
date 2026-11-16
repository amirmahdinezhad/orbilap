import { describe, expect, it } from "vitest";
import { deadlineRemaining, formatClockTime, formatDateTime } from "./timeDisplay";

describe("deadline and clock display", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  it("uses two duration units and distinguishes past deadlines without claiming lost access", () => {
    expect(deadlineRemaining(now + 6 * 86400000 + 3 * 3600000, now)).toBe("6d 3h left");
    expect(deadlineRemaining(now + 65 * 60000, now)).toBe("1h 5m left");
    expect(deadlineRemaining(now + 30000, now)).toBe("<1m left");
    expect(deadlineRemaining(now, now)).toBe("<1m past deadline");
    expect(deadlineRemaining(now - 65 * 60000, now)).toBe("1h 5m past deadline");
  });
  it("formats midnight and noon correctly in both clock modes and omits card years", () => {
    const midnight = Date.parse("2026-11-14T00:00:00Z");
    expect(formatClockTime(midnight)).toBe("00:00");
    expect(formatClockTime(midnight, "12h")).toBe("12:00 AM");
    expect(formatClockTime(now, "12h")).toBe("12:00 PM");
    expect(formatDateTime(now)).toBe("Nov 14, 12:00");
    expect(formatDateTime(now, "12h")).toBe("Nov 14, 12:00 PM");
    expect(formatDateTime(now, "24h", true)).toContain("2026");
  });
});
