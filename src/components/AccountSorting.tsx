import { AccountSortingContext as Sorting, useAccountSorting } from "../accountSortingContext";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ACCOUNT_SORT_OPTIONS, defaultSortDirection, isAccountSortMode, loadAccountSort, saveAccountSort, type AccountSortPreference } from "../accountSort";
import { Select } from "./ui/select";
import { Button } from "./ui/button";
import { CalendarIcon, BankedResetsIcon, ClockIcon, CapacityIcon, SortDirectionIcon, TickIcon, AlphabetIcon } from "../icons";

const SORT_DETAILS = {
  active: { icon: TickIcon, hint: "Keep your current account on top" },
  expiry: { icon: CalendarIcon, hint: "Use subscriptions before they end" },
  resets: { icon: BankedResetsIcon, hint: "Find accounts with saved resets" },
  ready: { icon: ClockIcon, hint: "See which account is ready next" },
  capacity: { icon: CapacityIcon, hint: "Start with the most room to work" },
  name: { icon: AlphabetIcon, hint: "Find an account alphabetically" },
};

/** Workspace-local view preference; sorting never changes membership or active credentials. */
export function AccountSortProvider({ workspaceId, children, showControl = true }: { workspaceId: string; children: ReactNode; showControl?: boolean }) {
  const [preference, setPreference] = useState(() => loadAccountSort(workspaceId));
  const [motion, setMotion] = useState({ revision: 0, animate: false });
  const captures = useRef(new Set<() => void>());
  const pointer = useRef(false);
  const [sortUsed, setSortUsed] = useState(false);
  const register = useCallback((capture: () => void) => { captures.current.add(capture); return () => { captures.current.delete(capture); }; }, []);
  const change = (next: AccountSortPreference) => {
    if (next.mode === preference.mode && next.descending === preference.descending) return;
    captures.current.forEach(capture => capture());
    setMotion(previous => ({ revision: previous.revision + 1, animate: pointer.current }));
    setPreference(next); setSortUsed(true); saveAccountSort(workspaceId, next);
  };
  const value = useMemo(() => ({ preference, ...motion, register }), [preference, motion, register]);
  const direction = preference.mode === "expiry" || preference.mode === "ready" ? (preference.descending ? "Latest first" : "Soonest first")
    : preference.mode === "name" ? (preference.descending ? "Z to A" : "A to Z") : (preference.descending ? "Highest first" : "Lowest first");
  const CurrentIcon = SORT_DETAILS[preference.mode].icon;
  return <Sorting.Provider value={value}><div className="account-sort-region">
    {showControl ? <div className="account-sort-toolbar" onPointerDownCapture={() => { pointer.current = true; }} onKeyDownCapture={() => { pointer.current = false; }}>

      <Select aria-label="Sort accounts" className="account-sort-select" contentClassName="account-sort-menu" contentAlign="end" smoothMotion
        leading={<CurrentIcon size={14} />}
        optionDetail={mode => {
          if (!isAccountSortMode(mode)) return null;
          const { icon: Icon, hint } = SORT_DETAILS[mode];
          return <><span className="sort-option-symbol" aria-hidden="true"><Icon size={16} /></span><span className="sort-option-hint" aria-hidden="true">{hint}</span></>;
        }} value={preference.mode} options={ACCOUNT_SORT_OPTIONS} onValueChange={mode => {
        if (isAccountSortMode(mode)) change({ mode, descending: defaultSortDirection(mode) });
      }} />
      <Button size="icon-sm" variant="ghost" className="account-sort-direction home-icon-button" data-direction={preference.descending ? "descending" : "ascending"} data-motion={motion.animate ? "pointer" : "keyboard"} aria-label={`Reverse sort order, ${direction.toLowerCase()}`} title={direction} disabled={preference.mode === "active"}
        onClick={event => { pointer.current = event.detail > 0; change({ ...preference, descending: !preference.descending }); }}>
        <SortDirectionIcon className="sort-direction-glyph" size={14} />
      </Button>
      <span className="sr-only" role="status">{sortUsed ? preference.mode === "active" ? "Active account first" : `Accounts sorted by ${ACCOUNT_SORT_OPTIONS.find(option => option.value === preference.mode)?.label.toLowerCase()}, ${direction.toLowerCase()}. Unknown values last.` : ""}</span>
    </div> : null}
    <div className="account-sort-groups">{children}</div>
  </div></Sorting.Provider>;
}

/** FLIP from the current painted positions; a rapid second sort interrupts without snapping. */
export function AnimatedAccountList({ children, className }: { children: ReactNode; className: string }) {
  const { revision, animate, register } = useAccountSorting();
  const root = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const animations = useRef(new Map<HTMLElement, Animation>());
  useLayoutEffect(() => register(() => {
    const node = root.current;
    if (!node) return;
    const top = node.getBoundingClientRect().top;
    positions.current = new Map(Array.from(node.querySelectorAll<HTMLElement>(":scope > [data-account-id]")).map(card => [card.dataset.accountId!, card.getBoundingClientRect().top - top]));
  }), [register]);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    animations.current.forEach(animation => animation.cancel()); animations.current.clear();
    if (!animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { positions.current.clear(); return; }
    const top = node.getBoundingClientRect().top;
    const style = getComputedStyle(node);
    for (const card of node.querySelectorAll<HTMLElement>(":scope > [data-account-id]")) {
      const before = positions.current.get(card.dataset.accountId!);
      const offset = before == null ? 0 : before - (card.getBoundingClientRect().top - top);
      if (Math.abs(offset) < 1 || typeof card.animate !== "function") continue;
      const animation = card.animate([{ transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }], {
        duration: Number.parseFloat(style.getPropertyValue("--home-motion-sort")) || 240,
        easing: style.getPropertyValue("--ease-in-out").trim() || "cubic-bezier(0.77, 0, 0.175, 1)",
      });
      animations.current.set(card, animation);
      void animation.finished.then(() => { if (animations.current.get(card) === animation) animations.current.delete(card); }).catch(() => {});
    }
    positions.current.clear();
  }, [revision, animate]);
  useLayoutEffect(() => () => { animations.current.forEach(animation => animation.cancel()); }, []);
  return <div ref={root} className={className}>{children}</div>;
}
