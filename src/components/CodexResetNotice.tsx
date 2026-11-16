import { useEffect, useRef, useState } from "react";
import { afterRemovalFocus, snapRemoval } from "../snapRemoval";
import { codexResetStatus, type CodexResetStatus } from "../api";
import { BankedResetsIcon, CloseIcon, RefreshIcon } from "../icons";
import { loadDismissedResets, resetAnnouncementId, resetWatchId, resetCountdown, resetForecastTiming, resetLocalTime, saveDismissedResets } from "../codexResets";
import { DEFAULT_CODEX_RESET_SETTINGS, type CodexResetSettings } from "../types";
import { Button } from "./ui/button";
import { useTimeDisplay } from "../displayPrefsContext";

const MAX_AGE_MS = 15 * 60_000;

/** Provider-level reset updates; completion requires fresh source confirmation. */
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

  const generated = data ? Date.parse(data.generatedAt) : NaN;
  const maxAge = Math.max(MAX_AGE_MS, intervalMs + 60_000);
  const fresh = Number.isFinite(generated) && now - generated <= maxAge && generated - now <= 60_000;
  if (!fresh) return null;
  const announcement = data?.scheduledReset;
  const announcedAt = Date.parse(announcement?.announcedAt ?? "");
  const scheduledEnd = Date.parse(announcement?.scheduledFor ?? "");
  const scheduled = announcement && Number.isFinite(announcedAt) && announcedAt <= now + 60_000
    && (announcement.scheduledFor === null || (Number.isFinite(scheduledEnd) && scheduledEnd > now)) ? announcement : null;
  const completedAt = Date.parse(data?.latestReset?.announcedAt ?? "");
  const completed = !scheduled && data?.latestReset && Number.isFinite(completedAt)
    && completedAt <= now && now - completedAt < 24 * 60 * 60_000 ? data.latestReset : null;
  const forecast = !scheduled && !completed && settings.showProbableResets ? data?.activeWatch : null;
  const observedAt = Date.parse(forecast?.observedAt ?? "");
  const expiresAt = Date.parse(forecast?.expiresAt ?? "");
  const chance = forecast?.resetChancePercent;
  const watch = forecast && Number.isFinite(observedAt) && observedAt <= now + 60_000
    && Number.isFinite(expiresAt) && expiresAt > now && observedAt < expiresAt
    && (chance == null || (Number.isFinite(chance) && chance >= 0 && chance <= 100)) ? forecast : null;
  if (!scheduled && !completed && !watch) return null;
  const id = scheduled ? resetAnnouncementId(scheduled) : completed ? `completed:${completed.id}` : resetWatchId(watch!);
  if (dismissed.includes(id)) return null;
  const scheduledDate = scheduled?.scheduledFor;
  const isBankedReset = (scheduled?.resetType ?? completed?.resetType) === "banked";

  return (
    <div key={id} ref={notice} className="codex-reset-notice" aria-label="Codex reset outlook" data-kind={completed ? "completed" : watch ? "possible" : "scheduled"}>
      <span className="codex-reset-mark">{isBankedReset ? <BankedResetsIcon size={17} /> : <RefreshIcon size={17} />}</span>
      <div className="codex-reset-copy">
        <div className="codex-reset-head">
          <strong>{completed ? "Reset confirmed" : watch ? "Possible reset" : scheduledDate ? resetCountdown(scheduledDate, now) : "Reset announced"}</strong>
          {watch && chance != null ? <span className="codex-reset-chance">{chance}% chance</span> : null}
        </div>
        <div className="codex-reset-meta">
          {completed ? <time dateTime={completed.announcedAt}>Confirmed at {resetLocalTime(completed.announcedAt, timeFormat)}</time>
            : watch ? <time dateTime={watch.expiresAt}>{resetForecastTiming(watch.expiresAt, now, timeFormat)}</time>
            : scheduledDate ? <time dateTime={scheduledDate}>At {resetLocalTime(scheduledDate, timeFormat)}</time> : "Time not announced"}
        </div>
        {isBankedReset ? <p className="codex-reset-description">Extra reset credit; current usage may stay unchanged.</p> : null}
      </div>
      <Button size="icon-sm" variant="ghost" className="codex-reset-close home-icon-button" aria-label={completed ? "Dismiss confirmed reset" : watch ? "Dismiss possible reset" : "Dismiss upcoming reset"}
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
