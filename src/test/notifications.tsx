import { beforeEach, afterEach } from "vitest";
import { toast } from "sonner";
import { render as renderComponent, waitFor, type RenderOptions } from "@testing-library/react";
import type { ReactNode } from "react";
import { Toast } from "../components/Toast";

beforeEach(() => { toast.dismiss(); });
afterEach(() => { toast.dismiss(); });

/** Exercise component errors through the same Sonner host as the app. */
export function render(ui: ReactNode, options?: RenderOptions) {
  renderComponent(<Toast />);
  return renderComponent(ui, options);
}
export function queryErrorToast() {
  return document.querySelector<HTMLElement>('[data-sonner-toast][data-type="error"]:not([data-removed="true"])');
}
export function getErrorToast() {
  const toast = queryErrorToast();
  if (!toast) throw new Error("Expected a Sonner error notification");
  return toast;
}
export function findErrorToast(message?: string | RegExp) {
  return waitFor(() => {
    const notices = [...document.querySelectorAll<HTMLElement>('[data-sonner-toast][data-type="error"]:not([data-removed="true"])')];
    const notice = message ? notices.find(item => typeof message === "string" ? item.textContent?.includes(message) : message.test(item.textContent ?? "")) : notices[0];
    if (!notice) throw new Error(`Expected Sonner error: ${message ?? "any"}`);
    return notice;
  });
}
