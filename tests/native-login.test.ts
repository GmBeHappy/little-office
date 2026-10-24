import { expect, test } from "bun:test";
import { loginReturnTarget, nativeAuthorization } from "../lib/native-login";
const native = `/native/authorize?challenge=${"c".repeat(43)}&state=${"s".repeat(32)}`;
const workspace = `/workspace-connect?workspace=gmtech&state=${"n".repeat(43)}`;
const profile = "/profile?workspace=00000000-0000-4000-8000-000000000001";

test("native authorization preserves a validated workspace in the sign-in link and PKCE return", () => {
  expect(nativeAuthorization(native)?.loginPath).toBe("/login");
  const request = nativeAuthorization(native + "&workspace=gmtech");
  expect(request).toEqual({
    path: native + "&workspace=gmtech",
    challenge: "c".repeat(43),
    state: "s".repeat(32),
    workspace: "gmtech",
    loginPath: "/login?workspace=gmtech",
  });
});

test("native return takes priority over browser workspace handoff and profile return", () => {
  const pending = {
    "native-return": native,
    "workspace-return": workspace,
    "profile-return": profile,
  };
  expect(loginReturnTarget(pending)).toEqual({
    key: "native-return",
    path: native,
  });
  expect(loginReturnTarget({ ...pending, "native-return": null })).toEqual({
    key: "workspace-return",
    path: workspace,
  });
  expect(
    loginReturnTarget({
      ...pending,
      "native-return": "/native/authorize?stale=1",
      "workspace-return": null,
    }),
  ).toEqual({ key: "profile-return", path: profile });
});

test("malformed, foreign and ambiguous pending native returns cannot capture sign-in", () => {
  for (const invalid of [
    "https://evil.test" + native,
    "//evil.test" + native,
    "/native/authorize/../other?challenge=x",
    native + "#fragment",
    native + "\\evil",
    native + "\n",
    native + "&workspace=app",
    native + "&workspace=unknown.team",
    native + "&workspace=",
    native + "&state=duplicate",
    native + "&workspace=gmtech&workspace=other",
    native + "&redirect=https://evil.test",
    native.replace("c".repeat(43), "short"),
    native.replace("s".repeat(32), "short"),
  ]) {
    expect(nativeAuthorization(invalid)).toBeNull();
    expect(
      loginReturnTarget({
        "native-return": invalid,
        "workspace-return": workspace,
        "profile-return": null,
      }),
    ).toEqual({ key: "workspace-return", path: workspace });
  }
  expect(
    loginReturnTarget({
      "native-return": null,
      "workspace-return": "//evil.test/workspace-connect?workspace=gmtech",
      "profile-return": "https://evil.test" + profile,
    }),
  ).toBeNull();
});
