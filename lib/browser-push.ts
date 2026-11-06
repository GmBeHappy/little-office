import { api } from "./api";
import type { FirebaseOptions } from "@firebase/app";

const consentCache = "little-office-fcm-v1";
const ownerKey = "office-push-owner";
const installKey = "office-push-installation";
const script = "/firebase-messaging-sw.js";

export type BrowserPushConfig = {
  enabled: boolean;
  firebase: FirebaseOptions | null;
  vapidKey: string | null;
};
export function supportedBrowser() {
  return (
    window.isSecureContext &&
    "caches" in window &&
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator
  );
}
export function needsHomeScreen() {
  return (
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
    !window.matchMedia("(display-mode: standalone)").matches &&
    !(navigator as Navigator & { standalone?: boolean }).standalone
  );
}
const base = (workspace: string) =>
  "/api/workspaces/" + encodeURIComponent(workspace);
const consentPath = (workspace: string) => "/.little-office-push/" + workspace;

export function browserPushConfig(workspace: string) {
  return api<BrowserPushConfig>(
    "/notifications/push-config?platform=web",
    undefined,
    "GET",
    base(workspace),
  );
}

// Serialize consent changes between tabs on the same origin. An old refresh
// must not silently opt the browser back in after an explicit opt-out.
let previous: Promise<unknown> = Promise.resolve();
function locked<T>(action: () => Promise<T>): Promise<T> {
  if (navigator.locks)
    return navigator.locks.request("little-office-system-push", action);
  const next = previous.then(action, action);
  previous = next.catch(() => {});
  return next;
}

export const clearBrowserPush = () => locked(clearSubscription);
async function clearSubscription() {
  try {
    localStorage.removeItem(ownerKey);
  } catch {
    /* Storage may be blocked. */
  }
  if ("caches" in window) await caches.delete(consentCache);
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg?.active || new URL(reg.active.scriptURL).pathname !== script) return;
  for (const notice of await reg.getNotifications()) notice.close();
  // Invalidate this browser endpoint even when a previously queued message is in flight.
  await (await reg.pushManager.getSubscription())?.unsubscribe();
}

// A registration may survive closing the tab. Only restore a preference created
// by this account on this origin; changing accounts starts with a fresh endpoint.
export function existingConsent(workspace: string, userId: string) {
  return locked(async () => {
    if (!supportedBrowser()) return false;
    const priorOwner = localStorage.getItem(ownerKey);
    if (priorOwner && priorOwner !== userId) {
      const { user } = await api<{ user: { id: string } | null }>(
        "/me",
        undefined,
        "GET",
        base(workspace),
      );
      if (user?.id !== userId) throw Error("account changed");
      await clearSubscription();
    }
    localStorage.setItem(ownerKey, userId);
    const stored = await (
      await caches.open(consentCache)
    ).match(consentPath(workspace));
    return stored ? (await stored.json()).userId === userId : false;
  });
}

export async function enableBrowserPush(
  workspace: string,
  userId: string,
  locale: string,
  config: BrowserPushConfig,
  signal: AbortSignal,
  restoring = false,
) {
  return locked(async () => {
    signal.throwIfAborted();
    const prefs = await caches.open(consentCache);
    if (restoring && !(await prefs.match(consentPath(workspace)))) return false;
    if (!config.enabled || !config.firebase || !config.vapidKey)
      throw Error("unconfigured");
    if (Notification.permission !== "granted") throw Error("permission");
    const [
      { getApps, initializeApp },
      { getMessaging, getToken, isSupported },
    ] = await Promise.all([
      import("@firebase/app"),
      import("@firebase/messaging"),
    ]);
    if (!(await isSupported())) throw Error("unsupported");
    const { user } = await api<{ user: { id: string } | null }>(
      "/me",
      undefined,
      "GET",
      base(workspace),
    );
    if (user?.id !== userId || localStorage.getItem(ownerKey) !== userId)
      throw Error("account changed");
    const name = "office-push-" + config.firebase.appId;
    const app =
      getApps().find((app) => app.name === name) ??
      initializeApp(config.firebase, name);
    await navigator.serviceWorker.register(script, {
      scope: "/",
      updateViaCache: "none",
    });
    const registration = await navigator.serviceWorker.ready;
    if (
      !registration.active ||
      new URL(registration.active.scriptURL).pathname !== script
    )
      throw Error("worker");
    const token = await getToken(getMessaging(app), {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: registration,
    });
    signal.throwIfAborted();
    if (!token || localStorage.getItem(ownerKey) !== userId)
      throw Error("account changed");
    let installationId = localStorage.getItem(installKey);
    if (!installationId) {
      installationId = crypto.randomUUID();
      localStorage.setItem(installKey, installationId);
    }
    await api(
      "/notifications/push-device",
      {
        installationId,
        token,
        platform: "web",
        locale: locale === "th" ? "th" : "en",
      },
      "PUT",
      base(workspace),
    );
    signal.throwIfAborted();
    if (localStorage.getItem(ownerKey) === userId) {
      await (
        await caches.open(consentCache)
      ).put(
        consentPath(workspace),
        new Response(
          JSON.stringify({ userId, installationId, path: location.pathname }),
        ),
      );
    }
    return true;
  });
}

export async function disableBrowserPush(workspace: string, userId: string) {
  return locked(async () => {
    const installationId = localStorage.getItem(installKey);
    if (installationId && localStorage.getItem(ownerKey) === userId) {
      await api(
        "/notifications/push-device",
        { installationId },
        "DELETE",
        base(workspace),
      );
    }
    const prefs = await caches.open(consentCache);
    await prefs.delete(consentPath(workspace));
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (
      !registration?.active ||
      new URL(registration.active.scriptURL).pathname !== script
    )
      return;
    for (const notice of await registration.getNotifications()) {
      if (notice.data?.workspaceId === workspace) notice.close();
    }
    if (!(await prefs.keys()).length)
      await (await registration.pushManager.getSubscription())?.unsubscribe();
  });
}
