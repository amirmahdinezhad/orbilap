import type { ComponentProps } from "react";
import { NextIcon } from "../../icons";

export function DisclosureSummary({ children, ...props }: ComponentProps<"summary">) {
  return <summary {...props}>
    <NextIcon className="summary-chevron" size={14} />
    {children}
  </summary>;
}
