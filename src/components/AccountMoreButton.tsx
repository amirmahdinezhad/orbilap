import { MoreIcon } from "../icons";
import { Button } from "./ui/button";

export function AccountMoreButton({ name, disabled, onOpen }: {
  name: string;
  disabled?: boolean;
  onOpen: () => void;
}) {
  return <Button size="icon-sm" variant="ghost" className="home-icon-button"
    aria-label={`More options for ${name}`} aria-haspopup="dialog" title="More options" disabled={disabled}
    onClick={(event) => {
      // WebKit does not focus buttons on pointer clicks. Preserve the dialog's return target.
      event.currentTarget.focus({ preventScroll: true });
      onOpen();
    }}>
    <MoreIcon size={17} />
  </Button>;
}
