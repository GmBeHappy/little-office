"use client";
// Adapted from shadcn/ui; portals stay inside the office for browser fullscreen.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;
type ContentProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  container?: HTMLElement | null;
  closeLabel?: string;
  showClose?: boolean;
  overlayClassName?: string;
};
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  ContentProps
>(
  (
    {
      className,
      children,
      container,
      closeLabel = "Close",
      showClose = true,
      overlayClassName,
      ...props
    },
    ref,
  ) => (
    <DialogPrimitive.Portal
      container={
        container ??
        (typeof document === "undefined"
          ? undefined
          : document.querySelector<HTMLElement>(".app-shell"))
      }
    >
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-[100] bg-[#283525]/25 backdrop-blur-[3px]",
          overlayClassName,
        )}
      />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        ref={ref}
        aria-describedby={undefined}
        className={cn(
          "fixed left-1/2 top-1/2 z-[101] max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-[500px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-[24px] border border-border bg-background p-5 text-foreground shadow-2xl outline-none sm:p-[34px]",
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              className="modal-close icon-button absolute top-4 right-4"
              aria-label={closeLabel}
            >
              <X size={19} />
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
);
DialogContent.displayName = "DialogContent";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
};
