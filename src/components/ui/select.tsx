import { useLayoutEffect, useRef, useState, type ReactNode, type ComponentProps } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { CheckIcon, DownIcon } from "../../icons";
import { cn } from "../../lib/utils";

interface SelectProps extends ComponentProps<typeof SelectPrimitive.Root> {
  "aria-label": string;
  className?: string;
  contentClassName?: string;
  smoothMotion?: boolean;
  contentAlign?: "start" | "center" | "end";
  leading?: ReactNode;
  optionDetail?: (value: string) => ReactNode;
  options: readonly { value: string; label: string }[];
}

/** An in-webview picker with keyboard navigation and viewport collision handling. */
export function Select({ className, contentClassName, contentAlign, smoothMotion = false, leading, optionDetail, options, "aria-label": label, ...props }: SelectProps) {
  const [input, setInput] = useState<"pointer" | "keyboard">("pointer");
  const [internalOpen, setInternalOpen] = useState(props.defaultOpen ?? false);
  const open = props.open ?? internalOpen;
  const [present, setPresent] = useState(open);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const seen = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!smoothMotion || !node) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const fresh = seen.current !== node;
    seen.current = node;
    const style = getComputedStyle(node);
    const end = { opacity: open ? "1" : "0", transform: open || reduce ? "none" : "translateY(-3px) scale(.98)" };
    if (input === "keyboard" || typeof node.animate !== "function") {
      Object.assign(node.style, end);
      if (!open) setPresent(false);
      return;
    }
    const start = fresh && open ? { opacity: "0", transform: reduce ? "none" : "translateY(-3px) scale(.98)" }
      : { opacity: style.opacity, transform: style.transform };
    const animation = node.animate([start, end], {
      duration: reduce ? 100 : 180,
      easing: style.getPropertyValue(open ? "--ease-out" : "--ease-in-out").trim() || (open ? "cubic-bezier(0.23, 1, 0.32, 1)" : "cubic-bezier(0.77, 0, 0.175, 1)"),
      fill: "both",
    });
    let cancelled = false;
    void animation.finished.then(() => {
      if (cancelled) return;
      Object.assign(node.style, end);
      if (!open) setPresent(false);
    }).catch(() => {});
    return () => {
      cancelled = true;
      const current = getComputedStyle(node);
      node.style.opacity = current.opacity;
      node.style.transform = current.transform;
      animation.cancel();
    };
  }, [smoothMotion, node, open, input]);
  return (
    <SelectPrimitive.Root {...props} open={open} onOpenChange={next => {
      if (next) setPresent(true);
      setInternalOpen(next);
      props.onOpenChange?.(next);
    }}>
      <SelectPrimitive.Trigger aria-label={label} className={cn("ui-select-trigger", className)} data-slot="select-trigger" data-input={input} onPointerEnter={() => setInput("pointer")} onPointerDown={() => setInput("pointer")} onKeyDown={() => setInput("keyboard")}>
        {leading}
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon className="ui-select-chevron">
          <DownIcon size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content ref={smoothMotion ? setNode : undefined} forceMount={smoothMotion && present ? true : undefined}
          style={smoothMotion ? { animation: "none", ...(!open ? { pointerEvents: "none" as const } : {}) } : undefined}
          aria-hidden={smoothMotion && !open || undefined} align={contentAlign} position="popper" sideOffset={5} collisionPadding={10} className={cn("ui-select-content", contentClassName)} data-slot="select-content" data-input={input} onPointerMove={() => setInput("pointer")} onKeyDown={() => setInput("keyboard")}>
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item key={option.value} value={option.value} className="ui-select-item" textValue={option.label} aria-label={option.label}>
                {optionDetail ? optionDetail(option.value) : null}
                <SelectPrimitive.ItemText className="ui-select-item-text">{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="ui-select-check">
                  <CheckIcon size={16} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
