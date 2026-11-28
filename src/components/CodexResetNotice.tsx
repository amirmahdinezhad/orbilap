import { useEffect, useRef, useState } from "react";
import { afterRemovalFocus, snapRemoval } from "../snapRemoval";
import { codexResetStatus, type CodexResetStatus } from "../api";
import { BankedResetsIcon, CloseIcon, RefreshIcon } from "../icons";
import { loadDismissedResets, resetAnnouncementId, resetWatchId, resetCountdown, resetForecastTiming, resetLocalTime, saveDismissedResets } from "../codexResets";
import { DEFAULT_CODEX_RESET_SETTINGS, type CodexResetSettings } from "../types";
import { Button } from "./ui/button";
import { useTimeDisplay } from "../displayPrefsContext";

const MAX_AGE_MS = 15 * 60_000;

/** Provider-level outlook for upcoming resets; confirmed history is not a notice. */
export function CodexResetNotice({ refreshKey, settings = DEFAULT_CODEX_RESET_SETTINGS }: {
  refreshKey: unknown;
  settings?: CodexResetSettings;
}) {
  const { timeFormat } = useTimeDisplay();
  const notice = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<CodexResetStatus | null>(null);
  const [dismissed, setDismissed] = useState(loadDismissedResets);
  const [now, setNow] = useState(Date.now);
  const intervalMs = settings.refetchIntervalSecs * 1000;

  useEffect(() => saveDismissedResets(dismissed), [dismissed]);

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    const refresh = () => {
      const ticket = ++generation;
      setNow(Date.now());
      void codexResetStatus().then(
        (result) => {
          if (cancelled || ticket !== generation) return;
          setData(result);
          setNow(Date.now());
        },
        () => {
          if (!cancelled && ticket === generation) setData(null);
        },
      );
    };
    refresh();
    const polling = window.setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(polling);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [refreshKey, intervalMs]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const outlook = data;
  const generated = outlook ? Date.parse(outlook.generatedAt) : NaN;
  const maxAge = Math.max(MAX_AGE_MS, intervalMs + 60_000);
  const fresh = Number.isFinite(generated) && now - generated <= maxAge && generated - now <= 60_000;
  if (!fresh) return null;
  const announcement = outlook?.scheduledReset;
  const announcedAt = Date.parse(announcement?.announcedAt ?? "");
  const scheduledEnd = Date.parse(announcement?.scheduledFor ?? "");
  const scheduled = announcement && Number.isFinite(announcedAt) && announcedAt <= now + 60_000
    && (announcement.scheduledFor === null || (Number.isFinite(scheduledEnd) && scheduledEnd > now)) ? announcement : null;
  const forecast = !scheduled ? outlook?.activeWatch : null;
  const observedAt = Date.parse(forecast?.observedAt ?? "");
  const expiresAt = Date.parse(forecast?.expiresAt ?? "");
  const chance = forecast?.resetChancePercent;
  const confirmedAt = Date.parse(outlook?.latestReset?.announcedAt ?? "");
  const forecastWasConfirmed = Number.isFinite(confirmedAt) && confirmedAt <= now && observedAt <= confirmedAt;
  const watch = forecast && !forecastWasConfirmed && Number.isFinite(observedAt) && observedAt <= now + 60_000
    && Number.isFinite(expiresAt) && expiresAt > now && observedAt < expiresAt
    && (chance == null || (Number.isFinite(chance) && chance >= 0 && chance <= 100)) ? forecast : null;
  if (!scheduled && !watch) return null;
  const id = scheduled ? resetAnnouncementId(scheduled) : resetWatchId(watch!);
  if (dismissed.includes(id)) return null;
  const scheduledDate = scheduled?.scheduledFor;
  const isBankedReset = scheduled?.resetType === "banked";

  return (
    <div key={id} ref={notice} className="codex-reset-notice" aria-label="Codex reset outlook" data-kind={watch ? "possible" : "scheduled"}>
      <span className="codex-reset-mark">{isBankedReset ? <BankedResetsIcon size={17} /> : <RefreshIcon size={17} />}</span>
      <div className="codex-reset-copy">
        <div className="codex-reset-head">
          <strong>{watch ? "Possible reset" : scheduledDate ? resetCountdown(scheduledDate, now) : "Reset announced"}</strong>
          {watch && chance != null ? <span className="codex-reset-chance">{chance}% chance</span> : null}
        </div>
        <div className="codex-reset-meta">
          {watch ? <time dateTime={watch.expiresAt}>{resetForecastTiming(watch.expiresAt, now, timeFormat)}</time>
            : scheduledDate ? <time dateTime={scheduledDate}>At {resetLocalTime(scheduledDate, timeFormat)}</time> : "Time not announced"}
        </div>
        {isBankedReset ? <p className="codex-reset-description">Extra reset credit; current usage may stay unchanged.</p> : null}
      </div>
      <Button size="icon-sm" variant="ghost" className="codex-reset-close home-icon-button" aria-label={watch ? "Dismiss possible reset" : "Dismiss upcoming reset"}
        onClick={event => {
          const node = notice.current;
          const next = node ? afterRemovalFocus(node) : null;
          const dismiss = () => {
            if (node?.contains(document.activeElement) || document.activeElement === document.body) next?.focus({ preventScroll: true });
            setDismissed(previous => [...previous, id].slice(-100));
          };
          void snapRemoval(node, dismiss, { pointer: !!watch && event.detail > 0 });
        }}><CloseIcon size={15} /></Button>
    </div>
  );
}
