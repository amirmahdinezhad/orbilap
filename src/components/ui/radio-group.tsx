import { useId, type ComponentProps } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "../../lib/utils";

export const RadioGroup = RadioGroupPrimitive.Root;

export function RadioGroupItem({ className, children, ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item {...props} className={cn("ui-radio", className)} data-slot="radio">
      {children ?? <RadioGroupPrimitive.Indicator className="ui-radio-indicator" />}
    </RadioGroupPrimitive.Item>
  );
}

export function RadioOption({ label, description, className, ...props }: Omit<ComponentProps<typeof RadioGroupItem>, "children"> & {
  label: string;
  description?: string;
}) {
  const id = useId();
  return <RadioGroupItem {...props} className={cn("ui-radio-option", className)}
    aria-labelledby={`${id}-label`} aria-describedby={description ? `${id}-description` : undefined}>
    <span className="ui-radio-option-mark" aria-hidden="true"><RadioGroupPrimitive.Indicator className="ui-radio-option-dot" /></span>
    <span className="ui-radio-option-text">
      <span id={`${id}-label`} className="setting-name">{label}</span>
      {description ? <span id={`${id}-description`} className="ui-radio-option-description">{description}</span> : null}
    </span>
  </RadioGroupItem>;
}
