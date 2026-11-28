import { useId, type ComponentProps, type ReactNode } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "../../lib/utils";

export const RadioGroup = RadioGroupPrimitive.Root;

function RadioIndicator() {
  return <RadioGroupPrimitive.Indicator forceMount className="ui-radio-indicator" />;
}

export function RadioGroupItem({ className, children, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item {...props} className={cn("ui-radio", children == null && "ui-radio-mark", className)} data-slot="radio">
      {children ?? <RadioIndicator />}
    </RadioGroupPrimitive.Item>
  );
}

export function RadioOption({ label, description, preview, className, ...props }: Omit<ComponentProps<typeof RadioGroupItem>, "children"> & {
  label: string;
  description?: string;
  preview?: ReactNode;
}) {
  const id = useId();
  const text = <span className="ui-radio-option-text">
    <span id={`${id}-label`} className="setting-name">{label}</span>
    {description ? <span id={`${id}-description`} className="ui-radio-option-description">{description}</span> : null}
  </span>;
  return <RadioGroupItem {...props} className={cn("ui-radio-option", className)}
    data-preview={preview ? "true" : undefined}
    aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-description` : undefined}>
    <span className="ui-radio-mark" aria-hidden="true"><RadioIndicator /></span>
    {preview ? <span className="ui-radio-option-body">{text}<span className="ui-radio-option-preview" aria-hidden="true">{preview}</span></span> : text}
  </RadioGroupItem>;
}
