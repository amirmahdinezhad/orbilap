import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

function Skeleton({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="skeleton"
      className={cn("ui-skeleton", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

function SkeletonText({ width }: { width: string }) {
  return <Skeleton className="ui-skeleton-text" style={{ width }} />;
}

export { Skeleton, SkeletonText };
