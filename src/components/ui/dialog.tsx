import type { ComponentProps } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  overlayClassName,
  layer = 0,
  input,
  style,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { overlayClassName?: string; layer?: number; input?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="dialog-overlay"
        data-input={input}
        className={cn("ak-backdrop", overlayClassName)}
        style={{ zIndex: 200 + layer * 2 }}
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-input={input}
        className={cn("ak-dialog", className)}
        {...props}
        style={{ ...style, zIndex: 201 + layer * 2 }}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("ak-heading", className)}
      {...props}
    />
  );
}

export { Dialog, DialogClose, DialogContent, DialogTitle };
