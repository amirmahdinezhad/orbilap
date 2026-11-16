import { Toaster, toast } from "sonner";
import { useEffect, type CSSProperties } from "react";
import { CloseIcon, ErrorIcon, InfoCircleIcon, SpinnerIcon, TickIcon, WarningIcon } from "../icons";

export type ToastKind = "" | "ok" | "err";

/** Preserve distinct feedback and deduplicate repeated native/StrictMode errors. */
export function showToast(message: string, kind: ToastKind = "") {
  const options = { id: `orbilap:${kind}:${message}`, duration: kind === "err" ? 6000 : 3200 };
  if (kind === "err") return toast.error(message, options);
  if (kind === "ok") return toast.success(message, options);
  return toast(message, options);
}

const errorOwners = new Map<string, number>();

/** Bridge async error state to the single notification surface without inline boxes. */
export function ErrorToast({ message }: { message?: string | null }) {
  useEffect(() => {
    if (!message) return;
    errorOwners.set(message, (errorOwners.get(message) ?? 0) + 1);
    const id = showToast(message, "err");
    return () => {
      const remaining = (errorOwners.get(message) ?? 1) - 1;
      if (remaining) errorOwners.set(message, remaining);
      else { errorOwners.delete(message); toast.dismiss(id); }
    };
  }, [message]);
  return null;
}

/** One notification surface; Sonner owns pausing, dismissal, stacking and motion. */
export function Toast({ theme = "dark" }: { theme?: "dark" | "light" | "system" }) {
  return <Toaster theme={theme} position="top-center" className="home-notifications" closeButton visibleToasts={2}
    icons={{
      success: <TickIcon size={16} />,
      error: <ErrorIcon size={16} />,
      info: <InfoCircleIcon size={16} />,
      warning: <WarningIcon size={16} />,
      loading: <SpinnerIcon />,
      close: <CloseIcon size={12} />,
    }}
    offset={16} mobileOffset={16} style={{ "--width": "min(440px, calc(100vw - 32px))" } as CSSProperties}
    toastOptions={{ className: "home-notification", style: {
      "--normal-bg": "var(--home-picker)", "--normal-border": "var(--home-border)",
      "--normal-text": "var(--home-text)", fontFamily: 'var(--font)',
    } as CSSProperties }} />;
}
