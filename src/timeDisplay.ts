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

/** Two units keep long deadlines readable while near deadlines retain minutes. */
export function deadlineRemaining(deadline: number, now: number): string {
  const remaining = deadline - now;
  const future = remaining > 0;
  const absolute = Math.abs(remaining);
  if (absolute < 60_000) return future ? "<1m left" : "<1m past deadline";
  const minutes = future ? Math.ceil(absolute / 60_000) : Math.floor(absolute / 60_000);
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes / 60) % 24;
  const duration = days ? `${days}d ${hours}h` : minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  return `${duration} ${future ? "left" : "past deadline"}`;
}
