import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("a push tap opens only its consented workspace on the worker origin", async () => {
  const workspaceId = "00000000-0000-4000-8000-000000000001";
  const userId = "member-1",
    installationId = crypto.randomUUID(),
    origin = "https://gmtech.littleoffice.app";
  const opened: string[] = [];
  let click!: (event: {
    notification: { data: unknown; close(): void };
    waitUntil(task: Promise<void>): void;
  }) => void;
  const self = {
    location: { origin },
    addEventListener: (name: string, handler: typeof click) => {
      if (name === "notificationclick") click = handler;
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
  };
  const caches = {
    open: async () => ({
      match: async (path: string) =>
        path === "/.little-office-push/" + workspaceId
          ? Response.json({ userId, installationId, path: "/" })
          : undefined,
    }),
  };
  runInNewContext(
    readFileSync(
      new URL("../public/firebase-messaging-sw.js", import.meta.url),
      "utf8",
    ),
    { self, caches, URL, Response },
  );
  const tap = async (data: unknown) => {
    let done: Promise<void> | undefined;
    click({
      notification: { data, close() {} },
      waitUntil(task) {
        done = task;
      },
    });
    await done;
  };
  const data = {
    recipientId: userId,
    workspaceId,
    installationId,
    notificationId: "42",
    url: "https://somewhere.invalid/",
  };
  await tap({ ...data, recipientId: "old-account" });
  await tap({ ...data, installationId: "stale-installation" });
  await tap({ ...data, workspaceId: "../../somewhere" });
  await tap(data);
  expect(opened).toEqual([origin + "/w/" + workspaceId + "/office?inbox=1"]);
});
