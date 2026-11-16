import { Tooltip } from "./ui/tooltip";
import type { ReactNode } from "react";
import type { Subscription } from "../subscriptions";
import { SubscriptionExpiry } from "./SubscriptionExpiry";

export function ActiveAccountBadge() {
  return <span className="account-active-label">Active</span>;
}

/** Use first/last initials, or two letters for a single name; skip emoji and UTF-16 fragments. */
export function accountInitials(name: string): string {
  const words = name.trim().split(/\s+/).map(word => word.match(/[\p{L}\p{N}]/gu) ?? []).filter(letters => letters.length > 0);
  if (!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2).join("")).toLocaleUpperCase();
}

/** One identity layout for saved accounts; the monogram never replaces the full name. */
export function AccountIdentity({ name, email, detail, active, subscriptions, children }: {
  name: string; email?: string | null; detail?: string | null; active?: boolean; subscriptions?: readonly Subscription[]; children: ReactNode;
}) {
  return <div className="workspace-account-info account-identity">
    <span className="account-monogram" aria-hidden="true">{accountInitials(name)}</span>
    <div className="account-identity-copy">
      <Tooltip content={email}><div className="workspace-account-title">
        <span className="row-title" dir="auto">{name}</span>
        {children}
        {active ? <ActiveAccountBadge /> : null}
      </div></Tooltip>
      {detail ? <p className="workspace-account-email" dir="auto">{detail}</p> : null}
      <div className="account-secondary-meta">
        {subscriptions?.map(subscription => <SubscriptionExpiry key={subscription.id} subscription={subscription} showService={subscriptions.length > 1} />)}
        {email ? <Tooltip content={email}><p className="workspace-account-email" dir="auto">{email}</p></Tooltip> : null}
      </div>
    </div>
  </div>;
}
