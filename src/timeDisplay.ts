import type { TimeFormat } from "./displayPrefs";

function clock(format: TimeFormat): Intl.DateTimeFormatOptions {
  return { hour: "2-digit", minute: "2-digit", hourCycle: format === "12h" ? "h12" : "h23" };
}

export function formatClockTime(date: Date | number, format: TimeFormat = "24h"): string {
  return new Intl.DateTimeFormat("en-US", clock(format)).format(date);
}

/** Cards omit the year; exact dates remain available in accessible tooltips. */
export function formatDateTime(date: Date | number, format: TimeFormat = "24h", full = false): string {
  return new Intl.DateTimeFormat("en-US", {
    month: full ? "long" : "short", day: "numeric", ...clock(format),
    ...(full ? { weekday: "long", year: "numeric" } as const : {}),
  }).format(date);
}

/** Keep near deadlines precise to the minute and omit a zero-minute remainder. */
export function deadlineRemaining(deadline: number, now: number): string {
  const remaining = deadline - now;
  const future = remaining > 0;
  const absolute = Math.abs(remaining);
  if (absolute < 60_000) return future ? "<1m left" : "<1m past deadline";
  const minutes = future ? Math.ceil(absolute / 60_000) : Math.floor(absolute / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes / 60) % 24;
  const minuteRemainder = minutes % 60;
  let duration = `${minutes}m`;
  if (days) {
    duration = `${days}d ${hours}h`;
  } else if (hours) {
    duration = minuteRemainder ? `${hours}h ${minuteRemainder}m` : `${hours}h`;
  }
  return `${duration} ${future ? "left" : "past deadline"}`;
}
