import { NextRequest } from "next/server";
export function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("workspace");
  const start =
    id && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
      ? "/w/" + id + "/office"
      : "/office";
  return new Response(
    JSON.stringify({
      id: start,
      name: "Little Office",
      short_name: "Little Office",
      start_url: start,
      scope: "/",
      display: "standalone",
      background_color: "#faf7e9",
      theme_color: "#657b5d",
      icons: [256, 512].map((size) => ({
        src: "/office-icon-" + size + ".png",
        sizes: size + "x" + size,
        type: "image/png",
      })),
    }),
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
