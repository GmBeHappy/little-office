"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronUp, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "./ui/dialog";
export function ToolbarMenu({
  label,
  icon,
  onOpen,
  mode = "dialog",
  openOnHover = false,
  children,
}: {
  label: string;
  icon?: ReactNode;
  onOpen?: () => void;
  mode?: "dialog" | "popover";
  openOnHover?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearCloseTimer = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    clearCloseTimer();
    if (!open) onOpen?.();
    setOpen(true);
  };
  const hide = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  useEffect(() => {
    if (mode !== "popover" || !open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[role="listbox"], [data-radix-select-content]'))
        return;
      if (!root.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [mode, open]);
  useEffect(() => () => clearCloseTimer(), []);
  if (mode === "popover")
    return (
      <div
        ref={root}
        className="toolbar-popover-root"
        onMouseEnter={openOnHover ? show : undefined}
        onMouseLeave={
          openOnHover
            ? (event) => {
                const target = event.relatedTarget as HTMLElement | null;
                if (target?.closest('[role="listbox"]')) return;
                hide();
              }
            : undefined
        }
      >
        <Button
          variant="plain"
          className={icon ? "control" : "device-menu-trigger"}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            if (open) setOpen(false);
            else show();
          }}
        >
          {icon ? (
            <>
              <span>{icon}</span>
              <small>{label}</small>
            </>
          ) : (
            <ChevronUp size={14} />
          )}
        </Button>
        {open && (
          <div className="toolbar-popover" role="dialog" aria-label={label}>
            <div className="toolbar-menu-heading">
              <strong>{label}</strong>
              <Button
                variant="ghost"
                size="icon"
                className="icon-button"
                aria-label={t("Close menu")}
                onClick={() => setOpen(false)}
              >
                <X size={16} />
              </Button>
            </div>
            {children(() => setOpen(false))}
          </div>
        )}
      </div>
    );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="plain"
          className={icon ? "control" : "device-menu-trigger"}
          aria-label={label}
          onClick={onOpen}
        >
          {icon ? (
            <>
              <span>{icon}</span>
              <small>{label}</small>
            </>
          ) : (
            <ChevronUp size={14} />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="toolbar-menu top-auto bottom-[max(108px,calc(env(safe-area-inset-bottom)+100px))] max-h-[calc(100dvh-150px)] w-[360px] max-w-[calc(100vw-24px)] translate-y-0 rounded-[18px] bg-[#fafbf4] p-4 sm:p-4 max-[700px]:bottom-[max(92px,calc(env(safe-area-inset-bottom)+84px))] max-[700px]:p-3 [@media(max-height:500px)]:bottom-4 [@media(max-height:500px)]:max-h-[calc(100dvh-32px)]"
        overlayClassName="bg-[#24352a]/5 backdrop-blur-none"
        showClose={false}
      >
        <div className="toolbar-menu-heading">
          <DialogTitle className="m-0 text-sm font-semibold tracking-normal">
            {label}
          </DialogTitle>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="icon-button"
              aria-label={t("Close menu")}
            >
              <X size={18} />
            </Button>
          </DialogClose>
        </div>
        {children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  );
}
