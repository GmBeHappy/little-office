import { strict as assert } from "node:assert";
import { chromium } from "playwright";
import { Office } from "../../server/office";
import { Command } from "../../shared/protocol";

const build = await Bun.build({
  entrypoints: ["tests/fixtures/movement-page.tsx"],
  target: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
});
assert.ok(build.success, String(build.logs));
const script = await build.outputs[0].text();
const office = new Office();
let movementCommands = 0;
let lastMovement = { dx: 0, dy: 0 };
const pending = new Set<ReturnType<typeof setTimeout>>();
function delayed(run: () => void) {
  const timer = setTimeout(() => {
    pending.delete(timer);
    run();
  }, 150);
  pending.add(timer);
}
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request, server) {
    const path = new URL(request.url).pathname;
    if (path === "/office" && server.upgrade(request)) return;
    if (path === "/app.js")
      return new Response(script, {
        headers: { "content-type": "text/javascript" },
      });
    return new Response(
      '<!doctype html><html><head><style>html,body,#root,.pixel-map{margin:0;width:100%;height:100%;position:relative}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      { headers: { "content-type": "text/html" } },
    );
  },
  websocket: {
    open(ws) {
      office.add(
        { id: "self", name: "Test", role: "member" },
        "fixture",
        Date.now() + 3600000,
        (event) =>
          delayed(() => {
            if (ws.readyState === 1) ws.send(JSON.stringify(event));
          }),
        () => {},
      );
    },
    message(_ws, raw) {
      const command = Command.parse(JSON.parse(String(raw)));
      if (command.type === "move") {
        movementCommands++;
        lastMovement = command;
      }
      delayed(() => office.handle("self", command));
    },
    close() {},
  },
});
const tick = setInterval(() => office.tick(0.05), 50);
const broadcast = setInterval(() => {
  if (office.dirty) office.broadcast();
}, 100);
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1120, height: 720 },
  });
  await page.goto(`http://127.0.0.1:${server.port}`);
  await page.waitForFunction(() => !!Reflect.get(window, "movementProbe")?.());
  const read = () =>
    page.evaluate(() => Reflect.get(window, "movementProbe")());
  await page.waitForTimeout(200);
  assert.equal(
    movementCommands,
    0,
    "Idle frames must not flood the socket with zero movement",
  );
  const start = await read();
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(100);
  const early = await read();
  console.log(
    JSON.stringify({
      phase: "before-server-reply",
      renderedDistance: early.y - start.y,
      authoritativeDistance: early.server.y - start.server.y,
      simulatedRoundTripMs: 300,
    }),
  );
  assert.ok(
    early.y > start.y + 5,
    "Local avatar should respond before a delayed server reply",
  );
  await page.waitForTimeout(500);
  await page.keyboard.up("ArrowDown");
  await page.waitForTimeout(40);
  const stopped = await read();
  await page.waitForTimeout(120);
  const later = await read();
  console.log(
    JSON.stringify({ phase: "key-release", drift: later.y - stopped.y }),
  );
  assert.ok(
    Math.abs(later.y - stopped.y) < 5,
    "Releasing movement should stop locally before the server reply",
  );
  await page.waitForTimeout(600);
  const settled = await read();
  assert.ok(
    Math.hypot(settled.x - settled.server.x, settled.y - settled.server.y) < 4,
    "Prediction must settle back to the authoritative position",
  );
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(100);
  assert.equal(lastMovement.dy, 1);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(40);
  assert.equal(
    lastMovement.dy,
    0,
    "Blur must send a stop before a suspended animation frame",
  );
} finally {
  await browser.close();
  clearInterval(tick);
  clearInterval(broadcast);
  for (const timer of pending) clearTimeout(timer);
  await server.stop(true);
}
