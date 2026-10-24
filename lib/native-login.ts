import { workspaceSlug } from "../shared/workspace-domains";

function localURL(value: string | null, path: string) {
  if (!value?.startsWith(path + "?") || /[\\\r\n\t#]/.test(value)) return null;
  try {
    const url = new URL(value, "https://return.invalid");
    return url.origin === "https://return.invalid" && url.pathname === path
      ? url
      : null;
  } catch {
    return null;
  }
}
export function nativeAuthorization(value: string | null) {
  const url = localURL(value, "/native/authorize");
  if (!url) return null;
  const params = url.searchParams;
  if (
    [...params.keys()].some(
      (key) => !["challenge", "state", "workspace"].includes(key),
    )
  )
    return null;
  if (
    params.getAll("challenge").length !== 1 ||
    params.getAll("state").length !== 1 ||
    params.getAll("workspace").length > 1
  )
    return null;
  const challenge = params.get("challenge")!,
    state = params.get("state")!;
  const workspace = params.get("workspace");
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(state) ||
    (workspace !== null && !workspaceSlug(workspace))
  )
    return null;
  return {
    path: url.pathname + url.search,
    challenge,
    state,
    workspace,
    loginPath: workspace
      ? `/login?workspace=${encodeURIComponent(workspace)}`
      : "/login",
  };
}
export function loginReturnTarget(pending: {
  "native-return": string | null;
  "workspace-return": string | null;
  "profile-return": string | null;
}) {
  const native = nativeAuthorization(pending["native-return"]);
  if (native) return { key: "native-return", path: native.path };
  const workspace = localURL(pending["workspace-return"], "/workspace-connect");
  if (
    workspace &&
    workspaceSlug(workspace.searchParams.get("workspace") || "") &&
    /^[A-Za-z0-9_-]{43}$/.test(workspace.searchParams.get("state") || "")
  )
    return {
      key: "workspace-return",
      path: workspace.pathname + workspace.search,
    };
  const profile = localURL(pending["profile-return"], "/profile");
  if (
    profile &&
    /^[a-f0-9-]{36}$/i.test(profile.searchParams.get("workspace") || "")
  )
    return { key: "profile-return", path: profile.pathname + profile.search };
  return null;
}
