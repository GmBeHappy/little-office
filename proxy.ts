import { NextRequest, NextResponse } from "next/server";
import { classifyHost } from "./shared/workspace-domains";

export async function proxy(request: NextRequest) {
  const domain = process.env.WORKSPACE_BASE_DOMAIN || "";
  if (!domain) return NextResponse.next();
  const portal = process.env.APP_URL!;
  const host = request.headers.get("host") || "";
  const kind = classifyHost(host, portal, domain);
  if (kind.kind === "invalid")
    return new NextResponse("Workspace not found.", { status: 404 });
  if (kind.kind === "portal") return NextResponse.next();
  let workspace: { id: string };
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL || "http://127.0.0.1:3001"}/api/workspace-host`,
      { headers: { host }, cache: "no-store" },
    );
    if (!response.ok)
      return new NextResponse("Workspace unavailable.", {
        status: response.status === 404 ? 404 : 503,
      });
    workspace = (await response.json()).workspace;
    if (!workspace)
      return new NextResponse("Workspace not found.", { status: 404 });
  } catch {
    return new NextResponse("Workspace unavailable.", { status: 503 });
  }
  const path = request.nextUrl.pathname;
  if (path === "/login")
    return NextResponse.redirect(`https://${host}/api/workspace-login/start`);
  if (
    [
      "/workspaces",
      "/workspace-connect",
      "/native/authorize",
      "/profile",
    ].includes(path)
  )
    return NextResponse.redirect(
      new URL(path + request.nextUrl.search, portal),
    );
  if (path.startsWith("/w/") && !path.startsWith(`/w/${workspace.id}/`))
    return new NextResponse("Workspace not found.", { status: 404 });
  if (path === "/" || path === "/office") {
    const url = new URL(request.url);
    url.pathname = `/w/${workspace.id}/office`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}
export const config = {
  matcher: [
    "/",
    "/office",
    "/login",
    "/workspaces",
    "/profile",
    "/workspace-connect",
    "/native/authorize",
    "/w/:path*",
  ],
};
