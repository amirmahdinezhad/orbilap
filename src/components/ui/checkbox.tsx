import { CheckIcon } from "../../icons";
import type { ComponentProps } from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { cn } from "../../lib/utils";

export function Checkbox({ className, persistIndicator = true, ...props }: ComponentProps<typeof CheckboxPrimitive.Root> & {
  /** Keep selection layers mounted when the surface supplies reversible transitions. */
  persistIndicator?: boolean;
}) {
  return (
    <CheckboxPrimitive.Root {...props} className={cn("ui-checkbox", className)} data-slot="checkbox">
      <CheckboxPrimitive.Indicator forceMount={persistIndicator || undefined} className="ui-checkbox-indicator">
        <CheckIcon size={16} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
