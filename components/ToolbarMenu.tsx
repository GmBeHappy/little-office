"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronUp, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

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
  return (
    <>
      <button
        className={icon ? "control" : "device-menu-trigger"}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          onOpen?.();
          setOpen(true);
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
      </button>
      {open && (
        <ToolbarDialog label={label} close={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </ToolbarDialog>
      )}
    </>
  );
}
function ToolbarDialog({
  label,
  close,
  children,
}: {
  label: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="toolbar-menu"
      aria-label={label}
      onKeyDownCapture={(e) => {
        if (
          e.key === "Escape" &&
          !e.currentTarget.querySelector('[role="listbox"]')
        ) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
      onCancel={close}
      onClose={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            close();
        }
      }}
    >
      <div className="toolbar-menu-heading">
        <strong>{label}</strong>
        <button
          className="icon-button"
          aria-label={t("Close menu")}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
