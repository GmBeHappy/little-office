// FCM sends a data-only Web Push message. A single worker displays it in
// both foreground and background, including when there are no open tabs.
const consentCache = "little-office-fcm-v1";
const workspacePattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const consent = async (id) => {
  const response = await (
    await caches.open(consentCache)
  ).match("/.little-office-push/" + id);
  return response && response.json();
};
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data?.json()?.data;
  } catch {
    return;
  }
  if (
    data?.type !== "office-notification" ||
    !workspacePattern.test(data.workspaceId) ||
    !/^[1-9]\d{0,9}$/.test(data.notificationId) ||
    !["nudge", "summon", "call", "wave"].includes(data.kind) ||
    typeof data.title !== "string" ||
    typeof data.body !== "string"
  )
    return;
  event.waitUntil(
    (async () => {
      const entry = await consent(data.workspaceId);
      if (
        !entry ||
        entry.userId !== data.recipientId ||
        entry.installationId !== data.installationId
      )
        return;
      await self.registration.showNotification(
        data.title.slice(0, 100) || "Little Office",
        {
          body: data.body.slice(0, 240),
          icon: "/office-icon-256.png",
          tag: "office-" + data.workspaceId + "-" + data.notificationId,
          data: {
            workspaceId: data.workspaceId,
            notificationId: data.notificationId,
            recipientId: data.recipientId,
            installationId: data.installationId,
          },
        },
      );
    })(),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const id = event.notification.data?.workspaceId;
  if (!workspacePattern.test(id)) return;
  event.waitUntil(
    (async () => {
      const entry = await consent(id);
      if (
        !entry ||
        entry.userId !== event.notification.data.recipientId ||
        entry.installationId !== event.notification.data.installationId
      )
        return;
      const path = "/w/" + encodeURIComponent(id) + "/office";
      const url = new URL(path, self.location.origin);
      url.searchParams.set("inbox", "1");
      const tabs = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const tab of tabs) {
        const here = new URL(tab.url);
        if (
          here.origin !== url.origin ||
          !(
            here.pathname === path ||
            (here.pathname === entry.path &&
              ["/", "/office"].includes(here.pathname))
          )
        )
          continue;
        // Navigate to an authenticated workspace route even after a tab was suspended.
        const office = await tab.navigate(url.href);
        if (office) {
          await office.focus();
          return;
        }
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((tabs) => {
        for (const tab of tabs)
          tab.postMessage({ type: "office-push-refresh" });
      }),
  );
});
