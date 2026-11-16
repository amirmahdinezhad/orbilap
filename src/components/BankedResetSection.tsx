import { ErrorToast } from "./Toast";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { codexBankedResets, prepareCodexReset, consumeCodexReset, prettyError, type BankedResetInventory, type BankedResetReview, type BankedResetCredit } from "../api";
import { Button, buttonVariants } from "./ui/button";
import { Select } from "./ui/select";
import { LoadingRing } from "./ui/loading-ring";
import { BankedResetsIcon, CheckIcon, RefreshIcon } from "../icons";
import { Skeleton, SkeletonText } from "./ui/skeleton";
import { bankedResetExpiry } from "../bankedResets";

/** Reserve space while loading reset credits. */
function UsageLoading() {
  return <div className="banked-reset-card" role="status" aria-label="Loading resets">
    <div className="banked-reset-card-copy" aria-hidden="true">
      <strong className="banked-reset-title"><SkeletonText width="13ch" /></strong>
      <span className="banked-reset-expiry"><SkeletonText width="11ch" /></span>
    </div>
    <Skeleton className={`banked-reset-use ${buttonVariants({ size: "sm", variant: "secondary" })}`} />
  </div>;
}

export interface BankedResetSectionProps {
  accountId: string;
  refreshKey: number;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  onUsed: () => void;
  onApplied?: () => void;
}

/** Consume an account-scoped reset after inline confirmation. */
export function BankedResetSection({ accountId, refreshKey, disabled, onBusyChange, onUsed, onApplied }: BankedResetSectionProps) {
  const headingId = useId();
  const unavailableId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [data, setData] = useState<BankedResetInventory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ creditId: string; pointer: boolean } | null>(null);
  const review = useRef<BankedResetReview | null>(null);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const generation = useRef(0);
  const mounted = useRef(true);
  const actionRunning = useRef(false);
  const reload = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true); setError(null); setActionError(null); setConfirmation(null);
    try {
      const fresh = await codexBankedResets(accountId);
      if (!mounted.current || ticket !== generation.current) return;
      setData(fresh);
      setSelectedId((old) => fresh.credits.some((c) => c.id === old) ? old : fresh.credits[0]?.id ?? null);
    } catch (e) {
      if (mounted.current && ticket === generation.current) { setError(prettyError(e)); setData(null); }
    } finally { if (mounted.current && ticket === generation.current) setLoading(false); }
  }, [accountId]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  useEffect(() => { if (!actionRunning.current && !review.current) void reload(); }, [reload, refreshKey]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);

  const apply = async (credit: BankedResetCredit, pointer: boolean) => {
    if (disabled || actionRunning.current || applied) return;
    actionRunning.current = true; setBusy(true); onBusyChange(true); setActionError(null); setResult(null);
    setConfirmation(null);
    generation.current++;
    try {
      // Retain the prepared token if the provider response is ambiguous.
      const fresh = review.current ?? await prepareCodexReset(accountId, credit.id);
      if (!mounted.current) return;
      review.current = fresh;
      const outcome = await consumeCodexReset(accountId, fresh.token);
      if (!mounted.current) return;
      review.current = null;
      const success = outcome.code === "reset" || outcome.code === "already_redeemed";
      if (success) setApplied(true);
      else setResult(outcome.code === "nothing_to_reset"
        ? "There’s no usage to reset. No reset was used."
        : "This reset is no longer available. No new reset was used.");
      onUsed();
      if (success && onApplied) {
        // Briefly acknowledge pointer actions; keyboard/reduced motion stay immediate.
        if (pointer && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          await new Promise(resolve => window.setTimeout(resolve, 450));
        }
        if (mounted.current) onApplied();
      } else {
        heading.current?.focus({ preventScroll: true });
        await reload();
        setApplied(false);
      }
    } catch (e) { if (mounted.current) setActionError(prettyError(e)); }
    finally {
      actionRunning.current = false;
      if (mounted.current) { setBusy(false); onBusyChange(false); setLoading(false); }
    }
  };
  const selected = data?.credits.find((c) => c.id === selectedId);
  const confirming = !!selected && confirmation?.creditId === selected.id;
  const expired = selected?.expiresAt != null && Date.parse(selected.expiresAt) <= now;
  const actionLabel = applied ? "Done" : busy ? "Applying…" : review.current ? "Retry" : confirming ? "Confirm" : "Use";

  const count = data?.availableCount ?? 0;
  if (!review.current && !loading && !error && !actionError && !result && !count && !data?.pendingCredit) return null;

  return <section className="banked-resets" aria-labelledby={headingId}>
    <div className="banked-reset-heading">
      <h3 id={headingId} ref={heading} tabIndex={-1}>Banked resets</h3>
      {count > 0 ? <span className="banked-reset-count" aria-label={`${count} available`}>{count}</span>
        : loading ? <Skeleton className="banked-reset-count" /> : null}
    </div>
      {result ? <p className="banked-reset-result" role="status">{result}</p> : null}
      {loading ? <UsageLoading /> : <>
        {error ? <div><ErrorToast message={error} /><Button size="sm" disabled={disabled} onClick={() => void reload()}><RefreshIcon size={16} />Retry</Button></div> : data ? <>
          {data.pendingCredit ? <div className="banked-reset-pending"><p>A previous reset result is unknown. Check it before using another reset.</p><Button disabled={disabled} aria-disabled={busy || undefined} onClick={event => void apply(data.pendingCredit!, event.detail > 0)}><RefreshIcon size={16} />{busy ? "Checking…" : "Check previous attempt"}</Button></div> : null}
          {data.availableCount > 0 && data.credits.length > 1 ? <Select aria-label="Choose reset" disabled={busy || disabled || !!data.pendingCredit || !!review.current} value={selectedId ?? undefined} onValueChange={id => { setSelectedId(id); setConfirmation(null); }}
            options={data.credits.map((c) => ({ value: c.id, label: `${c.title} · ${bankedResetExpiry(c.expiresAt, now)}` }))} /> : null}
          {data.availableCount > 0 && selected ? <div className="banked-reset-card">
            <div className="banked-reset-card-copy"><strong className="banked-reset-title">{selected.title}</strong><span className="banked-reset-expiry">{bankedResetExpiry(selected.expiresAt, now)}</span></div>
            <Button className="banked-reset-use" variant={actionLabel === "Use" ? "secondary" : "default"} size="sm"
              aria-describedby={selected.unavailableReason ? unavailableId : undefined}
              aria-disabled={busy || undefined}
              disabled={disabled || applied || !!data.pendingCredit || (!review.current && (!selected.canUse || expired))}
              data-state={applied ? "applied" : confirming ? "confirming" : undefined}
              data-confirm-motion={confirming && confirmation?.pointer ? "pointer" : undefined}
              onMouseDown={event => {
                // WebKit can blur even an already-focused button on mouse down.
                // Preserve focus until click so blur cancellation cannot disarm Confirm.
                if (event.button === 0) event.preventDefault();
              }}
              onBlur={() => setConfirmation(null)}
              onKeyDown={event => {
                if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
              }}
              onClick={event => {
                if (disabled || actionRunning.current || applied || event.detail > 1) return;
                if (confirming || review.current) void apply(selected, event.detail > 0);
                else {
                  // Safari does not focus buttons on pointer click by default.
                  event.currentTarget.focus({ preventScroll: true });
                  setConfirmation({ creditId: selected.id, pointer: event.detail > 0 });
                }
              }}>
              <span className="banked-reset-button-content">
                {applied || confirming ? <CheckIcon size={16} /> : busy && !data.pendingCredit ? <LoadingRing size={16} /> : review.current ? <RefreshIcon size={16} /> : <BankedResetsIcon size={16} />}
                {actionLabel}
              </span>
            </Button>
            <span className="sr-only" role="status">{confirming ? "Confirm to apply this reset." : ""}</span>
          </div> : data.availableCount > 0 ? <div><p className="banked-reset-note">Reset details are unavailable.</p><Button size="sm" disabled={disabled} onClick={() => void reload()}><RefreshIcon size={16} />Retry</Button></div> : null}
          {selected?.unavailableReason ? <p id={unavailableId} className="banked-reset-note">{selected.unavailableReason}</p> : null}
        </> : null}
        {actionError ? <ErrorToast message={actionError} /> : null}
      </>}
  </section>;
}
