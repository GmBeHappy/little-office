const api = Bun.spawn(["bun", "--watch", "server/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
});
const web = Bun.spawn(
  ["bun", "--bun", "next", "dev", "--hostname", "0.0.0.0"],
  { stdout: "inherit", stderr: "inherit" },
);
function stop() {
  api.kill();
  web.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await Promise.race([api.exited, web.exited]);
stop();
export {};
