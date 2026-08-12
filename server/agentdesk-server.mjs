import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = resolve(root, ".agentdesk");
const artifactDir = join(dataDir, "artifacts");
const stateFile = join(dataDir, "state.json");
const port = Number(process.env.AGENTDESK_PORT ?? 8787);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

let state = await loadState();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/state") {
      return sendJson(response, await currentState());
    }

    if (request.method === "POST" && url.pathname === "/api/runs") {
      const body = await readJson(request);
      const run = await createRun(body);
      void executeRun(run.id);
      return sendJson(response, run, 201);
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/artifacts/")) {
      return sendArtifact(response, decodeURIComponent(url.pathname.replace("/api/artifacts/", "")));
    }

    return sendStatic(response, url.pathname);
  } catch (error) {
    return sendJson(response, { error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AgentDesk runtime listening on http://127.0.0.1:${port}`);
});

async function loadState() {
  await mkdir(artifactDir, { recursive: true });

  if (!existsSync(stateFile)) {
    const initialState = { runs: [], artifacts: [] };
    await writeFile(stateFile, JSON.stringify(initialState, null, 2));
    return initialState;
  }

  return JSON.parse(await readFile(stateFile, "utf8"));
}

async function saveState() {
  await writeFile(stateFile, JSON.stringify(state, null, 2));
}

async function currentState() {
  return {
    ...state,
    capabilities: {
      workspaceRoot: root,
      artifactDir,
      runners: ["workspace-audit", "typecheck", "codex"]
    }
  };
}

async function createRun(body) {
  const objective = String(body?.objective ?? "").trim();
  const runner = String(body?.runner ?? "workspace-audit");

  if (!objective) {
    throw new Error("A run needs an objective.");
  }

  if (!["workspace-audit", "typecheck", "codex"].includes(runner)) {
    throw new Error(`Unsupported runner: ${runner}`);
  }

  const run = {
    id: `run-${Date.now()}`,
    objective,
    runner,
    status: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [{ at: new Date().toISOString(), message: "Queued run" }]
  };

  state.runs.unshift(run);
  await saveState();
  return run;
}

async function executeRun(runId) {
  const run = state.runs.find((item) => item.id === runId);
  if (!run) {
    return;
  }

  run.status = "running";
  addEvent(run, `Started ${run.runner}`);
  await saveState();

  try {
    const sections = [`# ${run.objective}`, "", `Runner: ${run.runner}`, `Started: ${run.createdAt}`, ""];

    sections.push("## Workspace");
    sections.push(await runCommand("git", ["status", "--short", "--branch"]));

    sections.push("## Files");
    sections.push(await listWorkspaceFiles());

    if (run.runner === "typecheck") {
      sections.push("## Typecheck");
      sections.push(await runPnpm(["run", "typecheck"]));
    }

    if (run.runner === "codex") {
      sections.push("## Codex");
      sections.push(await runCommand(resolveCodexCommand(), ["exec", run.objective]));
    }

    sections.push("## Suggested next actions");
    sections.push("- Turn repeated actions into named runners.");
    sections.push("- Add an approval queue before runners that modify files.");
    sections.push("- Promote useful commands into one-click agent shortcuts.");

    const filename = `${run.id}-${slugify(run.objective)}.md`;
    await writeFile(join(artifactDir, filename), sections.join("\n"), "utf8");

    const artifact = {
      id: `artifact-${Date.now()}`,
      runId: run.id,
      name: filename,
      kind: "Run report",
      path: `/api/artifacts/${encodeURIComponent(filename)}`,
      createdAt: new Date().toISOString()
    };

    state.artifacts.unshift(artifact);
    run.status = "completed";
    run.artifactId = artifact.id;
    addEvent(run, `Saved artifact ${filename}`);
  } catch (error) {
    run.status = "failed";
    addEvent(run, error instanceof Error ? error.message : "Run failed");
  } finally {
    run.updatedAt = new Date().toISOString();
    await saveState();
  }
}

function resolveCodexCommand() {
  return process.platform === "win32" ? "codex.cmd" : "codex";
}

async function runPnpm(args) {
  const isWindows = process.platform === "win32";
  const localPnpm = resolve(root, "node_modules", ".bin", isWindows ? "pnpm.cmd" : "pnpm");
  return runCommand(existsSync(localPnpm) ? localPnpm : "pnpm", args);
}

async function runCommand(command, args) {
  return new Promise((resolveOutput) => {
    let output = `$ ${command} ${args.join(" ")}\n`;
    let child;

    try {
      child = spawn(command, args, { cwd: root, shell: false, env: process.env });
    } catch (error) {
      resolveOutput(`${output}\nCommand failed to start: ${error instanceof Error ? error.message : "Unknown error"}`);
      return;
    }

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.on("error", (error) => {
      resolveOutput(`${output}\nCommand failed to start: ${error.message}`);
    });

    child.on("close", (code) => {
      resolveOutput(`${output}\nExit code: ${code}`);
    });
  });
}

async function listWorkspaceFiles() {
  const ignored = new Set([".git", "node_modules", "dist", ".agentdesk"]);
  const files = [];

  async function walk(dir, prefix = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) {
        continue;
      }

      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath, relative);
      } else {
        const info = await stat(fullPath);
        files.push(`- ${relative} (${info.size} bytes)`);
      }
    }
  }

  await walk(root);
  return files.join("\n");
}

function addEvent(run, message) {
  run.events.push({ at: new Date().toISOString(), message });
  run.updatedAt = new Date().toISOString();
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "run";
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, value, status = 200) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value, null, 2));
}

async function sendArtifact(response, filename) {
  const target = resolve(artifactDir, filename);
  if (!target.startsWith(artifactDir) || !existsSync(target)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": mimeTypes[extname(target)] ?? "application/octet-stream" });
  createReadStream(target).pipe(response);
}

async function sendStatic(response, pathname) {
  const distDir = join(root, "dist");
  const requested = pathname === "/" ? "/index.html" : pathname;
  const target = resolve(distDir, `.${requested}`);

  if (!target.startsWith(distDir) || !existsSync(target)) {
    response.writeHead(404);
    response.end("Run `pnpm run dev:real` for the Vite UI, or `pnpm run build` before using this static server.");
    return;
  }

  response.writeHead(200, { "content-type": mimeTypes[extname(target)] ?? "application/octet-stream" });
  createReadStream(target).pipe(response);
}
