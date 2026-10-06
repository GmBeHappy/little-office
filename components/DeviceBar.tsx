"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n";

type DeviceKind = "audio" | "camera";
export function DeviceBar({
  connected,
  onOpen,
  audio,
  camera,
  children,
}: {
  connected: boolean;
  onOpen: () => void;
  audio: ReactNode;
  camera: ReactNode;
  children: (controls: {
    active: DeviceKind | null;
    panelId: string;
    show: (kind: DeviceKind) => void;
    toggle: (kind: DeviceKind) => void;
  }) => ReactNode;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<DeviceKind>("audio");
  const [open, setOpen] = useState(false);
  const active = open ? kind : null;
  const panelId = useId();
  const bar = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  const show = (kind: DeviceKind, force = false) => {
    cancelClose();
    if (
      !force &&
      (document.querySelector('[role="listbox"]') ||
        bar.current
          ?.querySelector(".device-bar-panel")
          ?.contains(document.activeElement))
    )
      return;
    if (active !== kind) onOpen();
    setKind(kind);
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      if (
        !bar.current?.matches(":hover") &&
        !bar.current?.contains(document.activeElement) &&
        !document.querySelector('[role="listbox"]')
      )
        setOpen(false);
    }, 180);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!active) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !bar.current?.contains(target) &&
        !target.closest('[role="listbox"]')
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [active]);
  return (
    <footer
      ref={bar}
      className="controlbar"
      data-media-connected={connected}
      data-device-panel={active || undefined}
      onPointerEnter={cancelClose}
      onPointerLeave={scheduleClose}
      onBlur={scheduleClose}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !document.querySelector('[role="listbox"]')
        ) {
          event.preventDefault();
          bar.current
            ?.querySelector<HTMLButtonElement>(
              '[data-device-trigger][aria-expanded="true"]',
            )
            ?.focus();
          setOpen(false);
        }
      }}
    >
      <div className="device-bar-expand" inert={!open} aria-hidden={!open}>
        <div
          id={panelId}
          className="device-bar-panel"
          role="group"
          aria-label={t(kind === "audio" ? "Audio devices" : "Camera devices")}
        >
          {kind === "audio" ? audio : camera}
        </div>
      </div>
      {children({
        active,
        panelId,
        show,
        toggle: (kind) => {
          if (active === kind) {
            cancelClose();
            setOpen(false);
          } else show(kind, true);
        },
      })}
    </footer>
  );
}
