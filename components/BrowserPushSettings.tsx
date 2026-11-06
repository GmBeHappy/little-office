"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  browserPushConfig,
  disableBrowserPush,
  enableBrowserPush,
  existingConsent,
  needsHomeScreen,
  supportedBrowser,
  type BrowserPushConfig,
} from "@/lib/browser-push";
import { Button } from "./ui/button";

type State =
  | "checking"
  | "on"
  | "off"
  | "blocked"
  | "home-screen"
  | "unsupported"
  | "unconfigured"
  | "error";

// Mount this alongside the bell so an enrolled browser refreshes its FCM binding
// on return, even when the inbox is closed. Permission is requested only on click.
export function useBrowserPush(
  workspace: string,
  userId: string,
  open: boolean,
) {
  const { locale } = useI18n();
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const config = useRef<BrowserPushConfig | null>(null);
  const active = useRef<AbortController | null>(null);
  const editing = useRef(false);
  useEffect(() => {
    const lifetime = new AbortController();
    active.current = lifetime;
    return () => lifetime.abort();
  }, [workspace, userId]);
  useEffect(() => {
    const controller = new AbortController();
    let syncing = false;
    let lastSync = 0;
    async function sync(force = false) {
      if (syncing || editing.current || controller.signal.aborted) return;
      if (!force && Date.now() - lastSync < 60_000) return;
      syncing = true;
      lastSync = Date.now();
      const update = (value: State) => {
        if (!controller.signal.aborted) setState(value);
      };
      try {
        if (needsHomeScreen()) return update("home-screen");
        if (!supportedBrowser()) return update("unsupported");
        const optedIn = await existingConsent(workspace, userId);
        if (!open && !optedIn) return;
        const settings = await browserPushConfig(workspace);
        if (controller.signal.aborted) return;
        config.current = settings;
        if (Notification.permission !== "granted" && optedIn)
          await disableBrowserPush(workspace, userId);
        if (Notification.permission === "denied") return update("blocked");
        if (!settings.enabled || !settings.firebase || !settings.vapidKey)
          return update("unconfigured");
        if (optedIn && Notification.permission === "granted") {
          const bound = await enableBrowserPush(
            workspace,
            userId,
            locale,
            settings,
            controller.signal,
            true,
          );
          update(bound ? "on" : "off");
        } else update("off");
      } catch {
        update("error");
      } finally {
        syncing = false;
      }
    }
    void sync(true);
    const visible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "office-push-refresh") void sync(true);
    };
    document.addEventListener("visibilitychange", visible);
    navigator.serviceWorker?.addEventListener("message", message);
    const interval = window.setInterval(() => void sync(), 24 * 60 * 60 * 1000);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", visible);
      navigator.serviceWorker?.removeEventListener("message", message);
      clearInterval(interval);
    };
  }, [workspace, userId, locale, open, retry]);

  const toggle = useCallback(async () => {
    const controller = active.current;
    if (editing.current || !controller || controller.signal.aborted) return;
    editing.current = true;
    setBusy(true);
    setError("");
    try {
      if (state === "on") {
        await disableBrowserPush(workspace, userId);
        if (!controller.signal.aborted) setState("off");
      } else if (state === "off" && config.current) {
        // WebKit requires this call in the user interaction, before any await.
        const permission =
          Notification.permission === "granted"
            ? "granted"
            : await Notification.requestPermission();
        if (permission === "denied") {
          if (!controller.signal.aborted) setState("blocked");
          return;
        }
        if (permission !== "granted") return;
        await enableBrowserPush(
          workspace,
          userId,
          locale,
          config.current,
          controller.signal,
        );
        if (!controller.signal.aborted) setState("on");
      } else if (state === "error") {
        setRetry((v) => v + 1);
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        if (e instanceof Error && e.message === "unsupported")
          setState("unsupported");
        else setError("Couldn’t change system notifications. Try again.");
      }
    } finally {
      editing.current = false;
      setBusy(false);
    }
  }, [workspace, userId, locale, state]);
  return { state, busy, error, toggle };
}

export function BrowserPushSettings({
  push,
}: {
  push: ReturnType<typeof useBrowserPush>;
}) {
  const { t } = useI18n();
  const copy: Partial<Record<State, string>> = {
    blocked: "Allow notifications in your browser settings.",
    unsupported: "This browser does not support system notifications.",
    "home-screen":
      "On iPhone or iPad, add this workspace to your Home Screen and open it there.",
    unconfigured: "System notifications are unavailable on this server.",
    error: "Couldn’t load system notification settings.",
  };
  return (
    <div className="border-b border-border px-5 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{t("System notifications")}</span>
        {(push.state === "on" ||
          push.state === "off" ||
          push.state === "error") && (
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={push.busy}
            onClick={() => void push.toggle()}
          >
            {t(
              push.state === "on"
                ? "Turn off"
                : push.state === "off"
                  ? "Turn on"
                  : "Retry",
            )}
          </Button>
        )}
      </div>
      {copy[push.state] && (
        <p className="text-xs text-muted-foreground">{t(copy[push.state]!)}</p>
      )}
      {push.error && (
        <p role="alert" className="text-xs text-destructive">
          {t(push.error)}
        </p>
      )}
    </div>
  );
}
