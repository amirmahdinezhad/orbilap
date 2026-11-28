import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { applyDisplayPrefs, DISPLAY_PREFS_KEY, loadDisplayPrefs } from "../displayPrefs";
import type { FloatingUsageSnapshot } from "../types";
import { FloatingUsagePreview } from "./FloatingUsagePreview";

export function FloatingUsage() {
  const [snapshot, setSnapshot] = useState<FloatingUsageSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const action = async (action: "ready" | "open" | "hide" | "drag") => {
    try { await (action === "drag" ? invoke("floating_usage_drag") : invoke("floating_usage_action", { action })); setError(null); }
    catch { setError("Couldn’t complete that action. Try again."); }
  };
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    let revision = 0;
    void listen<FloatingUsageSnapshot>("floating-usage-updated", event => {
      revision++; if (!disposed) setSnapshot(event.payload);
    }).then(async unlisten => {
      if (disposed) { unlisten(); return; }
      stop = unlisten;
      const before = revision;
      const sample = await invoke<FloatingUsageSnapshot>("floating_usage_snapshot");
      if (disposed) return;
      if (revision === before) setSnapshot(sample);
      await invoke("floating_usage_action", { action: "ready" });
    }).catch(() => { if (!disposed) setError("Floating usage is unavailable. Reopen it from Settings."); });
    const theme = () => applyDisplayPrefs(loadDisplayPrefs());
    const storage = (event: StorageEvent) => { if (!event.key || event.key === DISPLAY_PREFS_KEY) theme(); };
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    theme(); window.addEventListener("storage", storage); media?.addEventListener("change", theme);
    return () => { disposed = true; stop?.(); window.removeEventListener("storage", storage); media?.removeEventListener("change", theme); };
  }, []);
  return <FloatingUsagePreview snapshot={snapshot} error={error} onOpen={()=>void action("open")}
    onDragStart={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();void action("drag");}}/>;
}
