import type { ComponentProps } from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "../../lib/utils";

function Progress({
  className,
  value,
  indicatorClassName,
  inline = false,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
  inline?: boolean;
}) {
  const indicator = <ProgressPrimitive.Indicator
    asChild={inline}
    data-slot="progress-indicator"
    className={cn("ui-progress-indicator", indicatorClassName)}
    style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
  >{inline ? <span /> : undefined}</ProgressPrimitive.Indicator>;
  return (
    <ProgressPrimitive.Root
      asChild={inline}
      data-slot="progress"
      className={cn("ui-progress", className)}
      value={value}
      {...props}
    >
      {inline ? <span>{indicator}</span> : indicator}
    </ProgressPrimitive.Root>
  );
}

export { Progress };
