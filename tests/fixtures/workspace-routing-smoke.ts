import { strict as assert } from "node:assert";
const id = "00000000-0000-4000-8000-000000000001";
const api = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    return request.headers.get("host") === "gmtech.littleoffice.app"
      ? Response.json({
          workspace: { id, slug: "gmtech" },
          portal: "https://app.littleoffice.app",
        })
      : new Response("Unknown", { status: 404 });
  },
});
const reservation = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () => new Response(),
});
const webPort = reservation.port!;
reservation.stop(true);
const web = Bun.spawn(
  [
    process.execPath,
    "--bun",
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(webPort),
  ],
  {
    env: {
      ...process.env,
      APP_URL: "https://app.littleoffice.app",
      WORKSPACE_BASE_DOMAIN: "littleoffice.app",
      API_INTERNAL_URL: `http://127.0.0.1:${api.port}`,
    },
    stdout: "ignore",
    stderr: "ignore",
  },
);
async function request(path: string, host = "gmtech.littleoffice.app") {
  return fetch(`http://127.0.0.1:${webPort}${path}`, {
    headers: { host },
    redirect: "manual",
  });
}
try {
  for (let i = 0; i < 50; i++) {
    try {
      await request("/", "app.littleoffice.app");
      break;
    } catch {
      await Bun.sleep(100);
    }
  }
  const root = await request("/");
  const html = await root.text();
  assert.equal(root.status, 200);
  assert.ok(html.includes(id));
  assert.equal((await request("/", "unknown.littleoffice.app")).status, 404);
  assert.equal((await request("/", "evil.invalid")).status, 404);
  const login = await request("/login");
  assert.equal(
    login.headers.get("location"),
    "https://gmtech.littleoffice.app/api/workspace-login/start",
  );
  assert.equal(
    (await request("/workspaces")).headers.get("location"),
    "https://app.littleoffice.app/workspaces",
  );
  assert.equal(
    (await request("/native/authorize?challenge=abc&state=def")).headers.get(
      "location",
    ),
    "https://app.littleoffice.app/native/authorize?challenge=abc&state=def",
  );
  assert.equal(
    (await request(`/profile?workspace=${id}`)).headers.get("location"),
    `https://app.littleoffice.app/profile?workspace=${id}`,
  );
  assert.equal(
    (await request("/w/00000000-0000-4000-8000-000000000002/office")).status,
    404,
  );
  console.log("Production Next routing smoke passed.");
} finally {
  web.kill();
  await web.exited;
  api.stop(true);
}
