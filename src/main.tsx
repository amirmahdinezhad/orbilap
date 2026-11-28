import React from "react";
import ReactDOM from "react-dom/client";
import { lazy, Suspense } from "react";
const App = lazy(() => import("./App"));
const FloatingUsage = lazy(() => import("./components/FloatingUsage").then(m => ({ default: m.FloatingUsage })));
const floating = location.hash === "#floating";
if (floating) document.documentElement.dataset.surface = "floating";
import { TooltipProvider } from "./components/ui/tooltip";
import "./index.css";
import "./panel.css";
import "./home.css";
import "./surfaces.css";
import "./orbilap.css";
import "./floating.css";
import { applyDisplayPrefs, loadDisplayPrefs } from "./displayPrefs";

// Suppress the WebKit context menu across the panel, including portaled dialogs.
document.addEventListener("contextmenu", (event) => event.preventDefault(), { capture: true });

// Orbilap input modality: pointer feedback resumes on hover; keyboard actions
// remain immediate. Use native keyboard navigation and the existing dialog focus traps.
document.addEventListener("keydown", (event) => {
  if (!event.metaKey && !event.ctrlKey && !event.altKey) document.documentElement.dataset.keyboard = "true";
}, true);
const usePointerFeedback = () => { document.documentElement.dataset.keyboard = "false"; };
document.addEventListener("pointerdown", usePointerFeedback, true);
document.addEventListener("pointerover", usePointerFeedback, true);

// Paint theme + accent before first paint so the panel never flashes.
try {
  applyDisplayPrefs(loadDisplayPrefs());
} catch {
  // Non-DOM or private mode: App re-applies on mount.
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TooltipProvider><Suspense fallback={null}>{floating ? <FloatingUsage /> : <App />}</Suspense></TooltipProvider>
  </React.StrictMode>,
);
