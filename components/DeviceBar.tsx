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
  const [active, setActive] = useState<DeviceKind | null>(null);
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
    setActive(kind);
  };
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      if (
        !bar.current?.matches(":hover") &&
        !bar.current?.contains(document.activeElement) &&
        !document.querySelector('[role="listbox"]')
      )
        setActive(null);
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
        setActive(null);
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
          setActive(null);
        }
      }}
    >
      {active && (
        <div
          id={panelId}
          className="device-bar-panel"
          role="group"
          aria-label={t(
            active === "audio" ? "Audio devices" : "Camera devices",
          )}
        >
          {active === "audio" ? audio : camera}
        </div>
      )}
      {children({
        active,
        panelId,
        show,
        toggle: (kind) => {
          if (active === kind) {
            cancelClose();
            setActive(null);
          } else show(kind, true);
        },
      })}
    </footer>
  );
}
