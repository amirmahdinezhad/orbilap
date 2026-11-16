import { Tooltip } from "./ui/tooltip";
import { subscriptionDeadline, type Subscription } from "../subscriptions";
import { useAccountClock } from "../useAccountClock";
import { useTimeDisplay } from "../displayPrefsContext";
import { deadlineRemaining, formatDateTime } from "../timeDisplay";

/** Payment warnings override plan dates, which can advance during unpaid renewal. */
export function SubscriptionExpiry({ subscription, showService = false }: { subscription: Subscription; showService?: boolean }) {
  const { deadlineDisplay, timeFormat } = useTimeDisplay();
  const deadline = subscriptionDeadline(subscription);
  const now = useAccountClock([deadline]);
  const subject = showService ? `${subscription.service} subscription` : "Subscription";
  const fullDate = (date: number) => formatDateTime(date, timeFormat, true);
  if (subscription.billing?.paymentRequired) {
    const billing = subscription.billing;
    const due = Date.parse(billing.paymentDueAt ?? "");
    const grace = deadline ? Date.parse(deadline) : NaN;
    const checked = Date.parse(billing.checkedAt);
    const label = [
      `${subject} payment required${Number.isFinite(due) ? ` since ${fullDate(due)}` : ""}.`,
      Number.isFinite(grace)
        ? grace > now ? `Access may continue until ${fullDate(grace)}.` : `The reported payment grace period ended on ${fullDate(grace)}. Check your subscription.`
        : "The provider has not reported when access will end.",
      Number.isFinite(checked) ? `Payment status last checked ${fullDate(checked)}.` : "",
    ].filter(Boolean).join(" ");
    return <Tooltip content={label}>{deadline
      ? <time className="account-subscription-expiry requires-payment" dateTime={deadline} aria-label={label}>
        {deadlineDisplay === "remaining" ? deadlineRemaining(grace, now)
          : `${grace > now ? "Access until" : "Access deadline passed"} · ${formatDateTime(grace, timeFormat)}`}
      </time>
      : <span className="account-subscription-expiry requires-payment" aria-label={label}>Access deadline unavailable</span>}
    </Tooltip>;
  }
  if (!deadline) return null;
  const timestamp = Date.parse(deadline);
  const passed = timestamp <= now;
  const label = passed
    ? `${subject} expiry date passed on ${fullDate(timestamp)}. Access may still be available.`
    : `${subject} expires ${fullDate(timestamp)}`;
  return <Tooltip content={label}><time className={`account-subscription-expiry${passed ? " is-past" : ""}`} dateTime={deadline} aria-label={label}>
    {deadlineDisplay === "remaining" ? deadlineRemaining(timestamp, now)
      : `${passed ? "Expiry date passed · " : "Exp. "}${formatDateTime(timestamp, timeFormat)}`}
  </time></Tooltip>;
}
