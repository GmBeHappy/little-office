import { expect, test } from "bun:test";
import {
  diagnosticRecord,
  diagnosticRef,
  errorKind,
} from "../shared/diagnostics";

test("diagnostics drop credentials, raw errors, URLs, names and unexpected fields", () => {
  const secret = "super-secret-access-token";
  const input = {
    roomRef: diagnosticRef("random-room-uuid"),
    clientRef: diagnosticRef("random-client-uuid"),
    token: secret,
    headers: { authorization: `Bearer ${secret}` },
    url: `wss://example.test/rtc?access_token=${secret}`,
    message: secret,
    user: { name: "Private Name", email: "private@example.test" },
    error: new Error(secret),
    errorKind: secret,
    requestRef: secret,
    code: Number.NaN,
    ageMs: Infinity,
    online: true,
    status: 503,
  };
  const record = diagnosticRecord("server", "media.failed", input, "error");
  expect(record).toEqual({
    schema: 1,
    at: expect.any(String),
    source: "server",
    level: "error",
    event: "media.failed",
    roomRef: diagnosticRef("random-room-uuid"),
    clientRef: diagnosticRef("random-client-uuid"),
    online: true,
    status: 503,
  });
  expect(JSON.stringify(record)).not.toContain(secret);
  expect(errorKind(new Error(secret))).toBe("Error");
  expect(errorKind({ name: secret, message: secret })).toBe("unknown");
});

test("both sides can correlate opaque room/client/request references without logging raw IDs", () => {
  const room = crypto.randomUUID();
  expect(diagnosticRef(room)).toMatch(/^[a-f0-9]{8}$/);
  expect(diagnosticRef(room)).toBe(diagnosticRef(room));
  expect(diagnosticRef(undefined)).toBeUndefined();
  const fields = {
    reason: "heartbeat_timeout" as const,
    ageMs: 35001,
    code: 1006,
  };
  expect(diagnosticRecord("server", "office.removed", fields)).toMatchObject(
    fields,
  );
});
