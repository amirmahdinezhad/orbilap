import { useId, useState, type ReactNode } from "react";
import { Button } from "./button";
import { SettingsReveal } from "./settings-reveal";
import { NextIcon } from "../../icons";

/** Shared settings disclosure with reversible entry and exit. */
export function SettingsDisclosure({ title, value, children }: { title: string; value?: string; children: ReactNode }) {
  const valueId = useId(), contentId = useId();
  const [open, setOpen] = useState(false);
  return <div className="settings-disclosure" data-open={open}>
    <Button variant="ghost" className="settings-disclosure-trigger" aria-label={title}
      aria-expanded={open} aria-controls={contentId} aria-describedby={value ? valueId : undefined}
      onClick={() => setOpen(current => !current)}>
      <NextIcon className="summary-chevron" size={14} />
      <span className="setting-name">{title}</span>
      {value ? <span className="settings-disclosure-value" id={valueId}>{value}</span> : null}
    </Button>
    <SettingsReveal id={contentId} open={open}><div className="settings-disclosure-body">{children}</div></SettingsReveal>
  </div>;
}
