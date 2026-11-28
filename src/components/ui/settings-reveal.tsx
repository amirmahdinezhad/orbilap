import { useEffect, useState, type ReactNode } from "react";

/** Keep outgoing content painted until the reversible CSS collapse has finished. */
export function SettingsReveal({ open, children, id }: { open: boolean; children: ReactNode; id?: string }) {
  const [retained, setRetained] = useState<ReactNode>(open ? children : null);
  useEffect(() => {
    if (open) { setRetained(children); return; }
    const instant = document.documentElement.dataset.keyboard === "true"
      || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (instant) { setRetained(null); return; }
    const timer = window.setTimeout(() => setRetained(null), 200);
    return () => window.clearTimeout(timer);
  }, [open, children]);
  return <div id={id} className="settings-reveal" data-open={open} inert={!open} aria-hidden={!open}>
    <div className="settings-reveal-clip">{open ? children : retained}</div>
  </div>;
}
