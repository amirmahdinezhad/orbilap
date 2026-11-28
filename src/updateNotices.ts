/** Version-scoped acknowledgement; checking/download preferences remain separate. */
export const SEEN_UPDATES_KEY = "orbilap.seenUpdateVersions";

export function loadSeenUpdates(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SEEN_UPDATES_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

export function saveSeenUpdates(versions: string[]) {
  try { localStorage.setItem(SEEN_UPDATES_KEY, JSON.stringify(versions)); }
  catch { /* The current session still acknowledges the version without storage. */ }
}
