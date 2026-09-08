"use client";
import { useState, type ReactNode } from "react";
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
  children,
}: {
  label: string;
  icon?: ReactNode;
  onOpen?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
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
