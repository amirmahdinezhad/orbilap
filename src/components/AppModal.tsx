import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { AddIcon, BackIcon, CloseIcon, FolderIcon, TrashIcon } from "../icons";
import { ProviderLogo } from "../logos";

const ModalLayer = createContext(0);
interface ModalPageHeaderProps {
  title: string;
  provider?: string;
  symbol?: "add" | "workspace";
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  preserveDraftOnBack?: boolean;
  focusTitle?: boolean;
}
interface PageHeader extends ModalPageHeaderProps {
  owner: symbol;
  backLabel: string;
  backDisabled: boolean;
  preserveDraftOnBack: boolean;
  focusTitle: boolean;
}
const PageHeaderContext = createContext<Dispatch<SetStateAction<PageHeader | null>> | null>(null);

/** A step owns the sheet's single header instead of adding another heading in its body. */
export function ModalPageHeader({ title, provider, symbol, onBack, backLabel = "Back", backDisabled = false, preserveDraftOnBack = true, focusTitle = true }: ModalPageHeaderProps) {
  const register = useContext(PageHeaderContext);
  const owner = useRef(Symbol("modal-page"));
  const backAction = useRef(onBack);
  backAction.current = onBack;
  const back = useCallback(() => backAction.current?.(), []);
  const canBack = !!onBack;
  useLayoutEffect(() => {
    if (!register) return;
    const id = owner.current;
    register({ owner: id, title, provider, symbol, onBack: canBack ? back : undefined, backLabel, backDisabled, preserveDraftOnBack, focusTitle });
    return () => register(current => current?.owner === id ? null : current);
  }, [register, title, provider, symbol, canBack, back, backLabel, backDisabled, preserveDraftOnBack, focusTitle]);
  return register ? null : <header className="page-header">
    {onBack ? <Button variant="ghost" size="icon" className="page-back" aria-label={backLabel} disabled={backDisabled} onClick={onBack}><BackIcon size={18} /></Button> : null}
    {provider ? <ProviderLogo provider={provider} /> : symbol ? <span className="modal-page-symbol">{symbol === "add" ? <AddIcon size={20} /> : <FolderIcon size={20} />}</span> : null}<h2>{title}</h2>
  </header>;
}

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
  title: string;
  /** Centered header inside the body: which key/account this is about. */
  detail?: ReactNode;
  /** Fixed controls between the header and the scrollable body. */
  navigation?: ReactNode;
  cardClass?: string;
  overlayClass?: string;
  bodyId?: string;
  /** When set, a back chevron renders top-left in the header row. */
  onBack?: () => void;
  backLabel?: string;
  /** Wizard back navigation retains the draft in the mounted parent. */
  preserveDraftOnBack?: boolean;
  hasUnsavedChanges?: boolean;
  busy?: boolean;
  busyMessage?: string;
  /** Stable origin when the opening control belongs to a closing popup. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  role?: "dialog" | "alertdialog";
  descriptionId?: string;
  children: ReactNode;
}

/** Shadcn dialog with fixed navigation and a scrollable panel body. */
export function AppModal({
  open,
  onClose,
  onExited,
  title,
  detail,
  navigation,
  cardClass,
  overlayClass,
  bodyId,
  onBack,
  backLabel = "Back",
  preserveDraftOnBack = false,
  hasUnsavedChanges = false,
  busy = false,
  busyMessage = "Saving changes…",
  children,
  returnFocusRef,
  initialFocusRef,
  role = "dialog",
  descriptionId,
}: AppModalProps) {
  const layer = useContext(ModalLayer);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [pageHeader, setPageHeader] = useState<PageHeader | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!open || !pageHeader?.focusTitle) return;
    let active = true;
    queueMicrotask(() => { if (active) heading.current?.focus({ preventScroll: true }); });
    return () => { active = false; };
  }, [open, pageHeader?.title, pageHeader?.provider, pageHeader?.backLabel, pageHeader?.focusTitle]);
  const headerBack = pageHeader ? pageHeader.onBack : onBack;
  const discardDescription = useId();
  useEffect(() => { if (!open) setPendingAction(null); }, [open]);
  const requestLeave = (action: () => void) => {
    if (busy) return;
    if (hasUnsavedChanges) setPendingAction(() => action);
    else action();
  };
  return (
    <ModalLayer.Provider value={layer + 1}><PageHeaderContext.Provider value={setPageHeader}><Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) requestLeave(onClose);
      }}
    >
      <DialogContent
        layer={layer}
        className={`card${cardClass ? ` ${cardClass}` : ""}`}
        overlayClassName={overlayClass}
        role={role}
        aria-describedby={descriptionId}
        onOpenAutoFocus={(event) => {
          returnFocus.current = returnFocusRef?.current ?? (
            document.activeElement instanceof HTMLElement ? document.activeElement : null
          );
          if (initialFocusRef?.current) {
            event.preventDefault();
            initialFocusRef.current.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (returnFocusRef?.current ?? returnFocus.current)?.focus({ preventScroll: true });
          onExited?.();
        }}
      >
        <div className="modal-head">
          {headerBack ? (
            <Button
              variant="ghost"
              size="icon"
              className="modal-back"
              onClick={() => (pageHeader?.preserveDraftOnBack ?? preserveDraftOnBack) ? headerBack() : requestLeave(headerBack)}
              disabled={pageHeader ? pageHeader.backDisabled : busy}
              aria-label={pageHeader?.backLabel ?? backLabel}
            >
              <BackIcon size={18} />
            </Button>
          ) : null}
          {pageHeader?.provider ? <span className="modal-provider-mark"><ProviderLogo provider={pageHeader.provider} /></span> : pageHeader?.symbol ? <span className="modal-page-symbol">{pageHeader.symbol === "add" ? <AddIcon size={20} /> : <FolderIcon size={20} />}</span> : null}
          <DialogTitle ref={heading} tabIndex={-1}>{pageHeader?.title ?? title}</DialogTitle>
          <DialogClose asChild>
            <Button size="icon-sm" variant="ghost" className="icon popup-close" aria-label="Close" disabled={busy}>
              <CloseIcon size={20} />
            </Button>
          </DialogClose>
        </div>
        {navigation}
        <div id={bodyId} className="app-modal-body">
          {detail ? <div className="modal-detail">{detail}</div> : null}
          {children}
        </div>
        {busy ? <span className="sr-only" role="status">{busyMessage}</span> : null}
      </DialogContent>
      <Dialog open={open && !!pendingAction} onOpenChange={(next) => { if (!next) setPendingAction(null); }}>
        <DialogContent layer={layer + 1} overlayClassName="discard-confirm-overlay" className="card discard-confirm" role="alertdialog" aria-describedby={discardDescription}>
          <span className="confirmation-symbol" aria-hidden="true"><TrashIcon size={24} /></span>
          <DialogTitle>Discard changes?</DialogTitle>
          <p id={discardDescription}>Your changes haven’t been saved.</p>
          <div className="discard-actions action-row">
            <Button variant="secondary" onClick={() => setPendingAction(null)}>Keep editing</Button>
            <Button variant="destructive" onClick={() => { const leave = pendingAction; setPendingAction(null); leave?.(); }}><TrashIcon size={16} />Discard changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog></PageHeaderContext.Provider></ModalLayer.Provider>
  );
}

/** Keep a dialog and its last content mounted while Radix runs its exit. */
export function ModalTarget<T>({ target, children }: {
  target: T | null | undefined;
  children: (target: T, presence: { open: boolean; onExited: () => void }) => ReactNode;
}) {
  const [last, setLast] = useState(target);
  const open = target != null;
  const isOpen = useRef(open);
  isOpen.current = open;
  if (open && last !== target) setLast(target);
  const visible = target ?? last;
  return visible == null ? null : children(visible, {
    open,
    onExited: () => { if (!isOpen.current) setLast(null); },
  });
}
