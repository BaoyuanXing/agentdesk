import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const viteBin = resolve(root, "node_modules", ".bin", isWindows ? "vite.cmd" : "vite");

const processes = [
  spawn(process.execPath, [resolve(root, "server", "agentdesk-server.mjs")], {
    cwd: root,
    stdio: "inherit"
  }),
  spawn(viteBin, ["--host", "127.0.0.1"], {
    cwd: root,
    stdio: "inherit",
    shell: isWindows
  })
];

function shutdown() {
  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

for (const child of processes) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown();
      process.exit(code);
    }
  });
}

