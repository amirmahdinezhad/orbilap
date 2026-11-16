import { act, cleanup, render as renderBase, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountIdentity, accountInitials } from "./AccountIdentity";
import { DisplayPrefsContext } from "../displayPrefsContext";
import type { ReactNode } from "react";
const datePrefs = { deadlineDisplay: "date" as const, timeFormat: "12h" as const };
const render = (ui: ReactNode) => renderBase(ui, { wrapper: ({ children }) => <DisplayPrefsContext.Provider value={datePrefs}>{children}</DisplayPrefsContext.Provider> });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("defaults to a live countdown and switches presentation immediately without showing payment copy or card years", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
  const identity = <AccountIdentity name="Emma" subscriptions={[{ id:"chatgpt", service:"ChatGPT", billing:{ paymentRequired:true, gracePeriodEndsAt:"2026-11-14T13:05:00Z", checkedAt:"2026-11-14T12:00:00Z" } }]}><span>Plus</span></AccountIdentity>;
  const view = renderBase(identity);
  expect(view.container.querySelector("time")).toHaveTextContent("1h 5m left");
  expect(screen.queryByText("Update payment")).not.toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(view.container.querySelector("time")).toHaveTextContent("1h 4m left");
  view.rerender(<DisplayPrefsContext.Provider value={{ deadlineDisplay:"date", timeFormat:"24h" }}>{identity}</DisplayPrefsContext.Provider>);
  expect(view.container.querySelector("time")).toHaveTextContent("Access until · Nov 14, 13:05");
  expect(view.container.querySelector("time")?.textContent).not.toMatch(/2026|AM|PM/);
  view.rerender(<DisplayPrefsContext.Provider value={{ deadlineDisplay:"date", timeFormat:"12h" }}>{identity}</DisplayPrefsContext.Provider>);
  expect(view.container.querySelector("time")).toHaveTextContent("Access until · Nov 14, 01:05 PM");
  act(() => { vi.setSystemTime(new Date("2026-11-14T14:10:00Z")); window.dispatchEvent(new Event("focus")); });
  view.rerender(identity);
  expect(view.container.querySelector("time")).toHaveTextContent("1h 5m past deadline");
  expect(view.container.querySelector("time")).toHaveClass("requires-payment");
});
it("keeps the billing date accessible without truncating the account identity", () => {
  const expiresAt = "2099-11-30T12:00:00Z";
  const { container } = render(<AccountIdentity name="Emma" email="emma@example.com" subscriptions={[{ id: "chatgpt", service: "ChatGPT", expiresAt }]}><span>Plus</span></AccountIdentity>);
  const time = container.querySelector("time");
  expect(time).toHaveAttribute("datetime", expiresAt);
  expect(time).toHaveTextContent(new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(Date.parse(expiresAt)));
  expect(time).toHaveTextContent(/^Exp\. /);
  expect(time).toHaveAccessibleName(/Subscription expires/);
  expect(time?.parentElement).toHaveTextContent("emma@example.com");
  expect(time?.parentElement).toHaveClass("account-secondary-meta");
});

it("updates a billing date at its deadline while keeping the account card and identity", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T11:59:59Z"));
  const expiresAt = "2026-11-14T12:00:00Z";
  const { container } = render(<AccountIdentity name="Emma" email="emma@example.com" subscriptions={[{ id: "chatgpt", service: "ChatGPT", expiresAt }]}><span>Plus</span></AccountIdentity>);
  const time = container.querySelector("time");
  expect(time).toHaveTextContent("Exp. Nov 14, 12:00 PM");
  expect(time).not.toHaveClass("is-past");
  act(() => { vi.advanceTimersByTime(1000); });
  expect(time).toHaveTextContent("Expiry date passed · Nov 14, 12:00 PM");
  expect(time).toHaveClass("is-past");
  expect(time).toHaveAccessibleName(/Subscription expiry date passed on .*Access may still be available\./);
  expect(time).toHaveAttribute("datetime", expiresAt);
  expect(screen.getByText("Emma")).toBeVisible();
  expect(screen.getByText("emma@example.com")).toBeVisible();
  expect(screen.getByText("Plus")).toBeVisible();
});

it("identifies each service in past-date tooltips and refreshes renewed billing dates", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
  const subscriptions = [
    { id: "chatgpt", service: "ChatGPT", expiresAt: "2026-11-13T12:00:00Z" },
    { id: "claude", service: "Claude", expiresAt: "2026-12-13T12:00:00Z" },
  ];
  const { container, rerender } = render(<AccountIdentity name="Emma" subscriptions={subscriptions}><span>Plus</span></AccountIdentity>);
  expect(container.querySelectorAll("time")[0]).toHaveAccessibleName(/ChatGPT subscription expiry date passed on/);
  expect(container.querySelectorAll("time")[1]).toHaveAccessibleName(/Claude subscription expires/);
  rerender(<AccountIdentity name="Emma" subscriptions={[{ ...subscriptions[0], expiresAt: "2026-12-14T12:00:00Z" }]}><span>Plus</span></AccountIdentity>);
  expect(container.querySelector("time")).toHaveTextContent("Exp. Dec 14, 12:00 PM");
  expect(container.querySelector("time")).not.toHaveClass("is-past");
  expect(screen.queryByText(/Expiry date passed/)).not.toBeInTheDocument();
});

it("shows overdue payment in red despite a future plan date and clears it after confirmed renewal", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
  const subscription = { id: "chatgpt", service: "ChatGPT", expiresAt: "2026-12-13T05:37:18Z", billing: {
    paymentRequired: true, paymentDueAt: "2026-11-13T06:37:59Z", gracePeriodEndsAt: "2026-11-20T06:37:59Z", checkedAt: "2026-11-14T11:00:00Z",
  } };
  const { container, rerender } = render(<AccountIdentity name="Emma" subscriptions={[subscription]}><span>Plus</span></AccountIdentity>);
  expect(screen.queryByText("Update payment")).not.toBeInTheDocument();
  expect(container.querySelector(".requires-payment")).toBeInTheDocument();
  expect(container.querySelector("time")).toHaveTextContent("Access until · Nov 20, 06:37 AM");
  expect(container.querySelector("time")).toHaveAttribute("datetime", subscription.billing.gracePeriodEndsAt);
  expect(container.querySelector("time")).toHaveAccessibleName(/payment required since .*Access may continue until .*November 20.*Payment status last checked/);
  expect(screen.queryByText("Exp. Dec 13")).not.toBeInTheDocument();
  expect(screen.getByText("Emma")).toBeVisible();
  act(() => { vi.setSystemTime(new Date("2026-11-20T06:37:59Z")); window.dispatchEvent(new Event("focus")); });
  expect(container.querySelector("time")).toHaveTextContent("Access deadline passed · Nov 20, 06:37 AM");
  expect(container.querySelector("time")).toHaveAccessibleName(/payment grace period ended/);
  expect(screen.getByText("Emma")).toBeVisible();
  rerender(<AccountIdentity name="Emma" subscriptions={[{ ...subscription, billing: { ...subscription.billing, paymentRequired: false } }]}><span>Plus</span></AccountIdentity>);
  expect(container.querySelector("time")).toHaveTextContent("Exp. Dec 13, 05:37 AM");
  expect(container.querySelector("time")).not.toHaveClass("requires-payment");
});

it("keeps a confirmed payment warning when billing dates are missing without inventing a grace deadline", () => {
  const { container } = render(<AccountIdentity name="Emma" subscriptions={[{ id:"chatgpt", service:"ChatGPT", billing:{ paymentRequired:true, checkedAt:"2026-11-14T11:00:00Z" } }]}><span>Plus</span></AccountIdentity>);
  const warning = screen.getByText("Access deadline unavailable");
  expect(warning).toHaveClass("requires-payment");
  expect(warning).toHaveAccessibleName(/provider has not reported when access will end/);
  expect(screen.getByText("Access deadline unavailable")).toBeVisible();
  expect(container.querySelector("time")).toBeNull();
});

it("omits missing or malformed billing dates without adding metadata rows", () => {
  render(<AccountIdentity name="Emma" subscriptions={[
    { id: "chatgpt", service: "ChatGPT", expiresAt: "invalid" },
    { id: "claude", service: "Claude" },
  ]}><span>Plus</span></AccountIdentity>);
  expect(screen.queryByText(/Expiry unavailable|until /)).not.toBeInTheDocument();
  expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
});

it("uses complete Unicode letters and skips emoji prefixes in account initials", () => {
  expect(accountInitials("Emma Brooks")).toBe("EB");
  expect(accountInitials("👨‍💻 علی رضایی")).toBe("عر");
  expect(accountInitials("Ólafur Darri Ólafsson")).toBe("ÓÓ");
  expect(accountInitials("Jo")).toBe("JO");
  expect(accountInitials("Emma")).toBe("EM");
  expect(accountInitials("  👨‍💻 علی  ")).toBe("عل");
  expect(accountInitials("🚀QZR")).toBe("QZ");
  expect(accountInitials("𐐨𐐩")).toBe("𐐀𐐁");
  expect(accountInitials("J")).toBe("J");
  expect(accountInitials("👨‍💻")).toBe("?");
  expect(accountInitials("  ")).toBe("?");
});
it("keeps the full identity readable while the monogram is decorative", () => {
  const { container } = render(<AccountIdentity name="Aleksandra Wiśniewska-Kowalczyk" email="aleksandra@example.com"><span>Plus</span></AccountIdentity>);
  expect(screen.getByText("Aleksandra Wiśniewska-Kowalczyk")).toHaveAttribute("dir", "auto");
  expect(screen.getByText("aleksandra@example.com")).toBeVisible();
  expect(container.querySelector('.account-monogram')).toHaveAttribute("aria-hidden", "true");
});

it("shows the active status beside the account name only when active", () => {
  const { rerender } = render(<AccountIdentity name="Emma Brooks" active><span>Plus</span></AccountIdentity>);
  expect(screen.getByText("Active")).toBeVisible();

  rerender(<AccountIdentity name="Emma Brooks"><span>Plus</span></AccountIdentity>);
  expect(screen.queryByText("Active")).not.toBeInTheDocument();
});
