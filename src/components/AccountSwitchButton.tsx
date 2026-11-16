import { AccountSwitchIcon } from "../icons";
import { Button } from "./ui/button";
import { LoadingRing } from "./ui/loading-ring";

export function AccountSwitchButton({ name, active, pending, disabled, onActivate }: {
  name: string;
  active: boolean;
  pending: boolean;
  disabled: boolean;
  onActivate: () => void;
}) {
  if (active) return null;
  return <Button
    size="icon-sm"
    variant="ghost"
    className="account-switch-action"
    aria-label={`Switch to ${name}`}
    aria-busy={pending}
    aria-disabled={pending || undefined}
    title={pending ? "Switch in progress" : `Switch to ${name}`}
    disabled={disabled && !pending}
    onClick={() => { if (!pending && !disabled) onActivate(); }}
  >
    {pending ? <LoadingRing size={17} /> : <AccountSwitchIcon size={17} />}
  </Button>;
}
