import { FormEvent, PointerEvent, useEffect, useState } from "react";

type RunStatus = "queued" | "running" | "completed" | "failed";
type AgentMode = "small" | "expanded";
type LineKind = "system" | "user" | "agent" | "error";

type AgentRun = {
  id: string;
  objective: string;
  runner: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  artifactId?: string;
  events: Array<{ at: string; message: string }>;
  output?: string[];
};

type Artifact = {
  id: string;
  runId: string;
  name: string;
  kind: string;
  path: string;
  createdAt: string;
};

type AppState = {
  runs: AgentRun[];
  artifacts: Artifact[];
  capabilities?: {
    workspaceRoot: string;
    artifactDir: string;
    runners: string[];
  };
};

type AgentBox = {
  id: string;
  name: string;
  role: string;
  mode: AgentMode;
  x: number;
  y: number;
  contextId?: string;
  command: string;
  sending: boolean;
  activeRunId?: string;
  lines: Array<{ kind: LineKind; text: string }>;
};

type DragState = {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

const emptyState: AppState = { runs: [], artifacts: [] };

const initialAgents: AgentBox[] = [
  {
    id: "agent-a",
    name: "Agent A",
    role: "planner",
    mode: "small",
    x: 56,
    y: 94,
    command: "",
    sending: false,
    lines: [
      { kind: "system", text: "Small box mode. Drag me around." },
      { kind: "system", text: "Expand to use the agent CLI." }
    ]
  },
  {
    id: "agent-b",
    name: "Agent B",
    role: "builder",
    mode: "small",
    x: 230,
    y: 94,
    command: "",
    sending: false,
    lines: [
      { kind: "system", text: "Connect me with another box." },
      { kind: "system", text: "Connected boxes share context." }
    ]
  }
];

export function App() {
  const [agents, setAgents] = useState<AgentBox[]>(initialAgents);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [appState, setAppState] = useState<AppState>(emptyState);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    let shouldContinue = true;

    async function refreshState() {
      try {
        const response = await fetch("/api/state");
        if (!response.ok) {
          throw new Error(`Runtime returned ${response.status}`);
        }
        const nextState = (await response.json()) as AppState;
        if (shouldContinue) {
          setAppState(nextState);
          setApiError("");
        }
      } catch {
        if (shouldContinue) {
          setApiError("runtime offline");
        }
      }
    }

    void refreshState();
    const timer = window.setInterval(refreshState, 1500);
    return () => {
      shouldContinue = false;
      window.clearInterval(timer);
    };
  }, []);

  function addAgent() {
    const index = agents.length + 1;
    setAgents((items) => [
      ...items,
      {
        id: `agent-${Date.now()}`,
        name: `Agent ${index}`,
        role: "worker",
        mode: "small",
        x: 56 + (index - 1) * 174,
        y: 244,
        command: "",
        sending: false,
        lines: [{ kind: "system", text: "Ready. Expand to run commands." }]
      }
    ]);
  }

  function connectSelected() {
    if (selectedIds.length < 2) {
      return;
    }

    const contextId = `ctx-${Date.now().toString(36)}`;
    setAgents((items) =>
      items.map((agent) =>
        selectedIds.includes(agent.id)
          ? {
              ...agent,
              contextId,
              lines: [...agent.lines, { kind: "system", text: `Connected to ${selectedIds.length - 1} agent(s). Context ${contextId}.` }]
            }
          : agent
      )
    );
  }

  async function clearHistory() {
    try {
      const response = await fetch("/api/history/clear", { method: "POST" });
      if (!response.ok) {
        throw new Error(`runtime returned ${response.status}`);
      }
      const nextState = (await response.json()) as AppState;
      setAppState(nextState);
      setAgents((items) =>
        items.map((agent) => ({
          ...agent,
          lines: [...agent.lines, { kind: "system", text: "Run history cleared." }]
        }))
      );
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "could not clear history");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
  }

  function setMode(id: string, mode: AgentMode) {
    setAgents((items) => items.map((agent) => (agent.id === id ? { ...agent, mode } : agent)));
  }

  function activeRunFor(agent: AgentBox) {
    return appState.runs.find((run) => run.id === agent.activeRunId);
  }

  function updateCommand(id: string, command: string) {
    setAgents((items) => items.map((agent) => (agent.id === id ? { ...agent, command } : agent)));
  }

  function startDrag(event: PointerEvent<HTMLElement>, agent: AgentBox) {
    if ((event.target as HTMLElement).closest("button, input, a, form")) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      id: agent.id,
      pointerId: event.pointerId,
      offsetX: event.clientX - agent.x,
      offsetY: event.clientY - agent.y
    });
  }

  function updateDrag(event: PointerEvent<HTMLElement>) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    setAgents((items) =>
      items.map((agent) =>
        agent.id === dragState.id
          ? { ...agent, x: Math.max(16, event.clientX - dragState.offsetX), y: Math.max(16, event.clientY - dragState.offsetY) }
          : agent
      )
    );
  }

  function stopDrag(event: PointerEvent<HTMLElement>) {
    if (dragState && event.pointerId === dragState.pointerId) {
      setDragState(null);
    }
  }

  async function submitAgentCommand(event: FormEvent<HTMLFormElement>, agent: AgentBox) {
    event.preventDefault();
    const parsed = parseCommand(agent.command);
    if (!parsed.objective) {
      return;
    }

    const sharedContext = getSharedContext(agent, agents);
    const objective = sharedContext ? `${parsed.objective}\n\nShared context:\n${sharedContext}` : parsed.objective;

    setAgents((items) =>
      items.map((item) =>
        item.id === agent.id
          ? {
              ...item,
              command: "",
              sending: true,
              lines: [...item.lines, { kind: "user", text: `$ ${agent.command}` }, { kind: "agent", text: `starting ${parsed.runner}` }]
            }
          : item
      )
    );

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runner: parsed.runner, objective })
      });

      if (!response.ok) {
        throw new Error(`runtime returned ${response.status}`);
      }

      const run = (await response.json()) as AgentRun;
      setAppState((current) => ({ ...current, runs: [run, ...current.runs] }));
      setAgents((items) =>
        items.map((item) =>
          item.id === agent.id
            ? {
                ...item,
                activeRunId: run.id,
                sending: false,
                lines: [...item.lines, { kind: "system", text: `task accepted: ${run.id}` }]
              }
            : item
        )
      );
    } catch (error) {
      setAgents((items) =>
        items.map((item) =>
          item.id === agent.id
            ? {
                ...item,
                sending: false,
                lines: [...item.lines, { kind: "error", text: error instanceof Error ? error.message : "could not start run" }]
              }
            : item
        )
      );
    }
  }

  return (
    <main className="desktop-shell" onPointerMove={updateDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <div className="desktop-field" />

      <header className="desk-toolbar">
        <div>
          <strong>AgentDesk</strong>
          <span>{apiError || legacyFailureNotice(appState) || "small agent boxes, expandable CLI windows"}</span>
        </div>
        <button type="button" onClick={addAgent}>
          New Agent
        </button>
        <button type="button" onClick={connectSelected} disabled={selectedIds.length < 2}>
          Connect {selectedIds.length || ""}
        </button>
        <button type="button" onClick={clearHistory} disabled={appState.runs.length === 0 && appState.artifacts.length === 0}>
          Clear History
        </button>
      </header>

      {agents.map((agent) =>
        agent.mode === "small" ? (
          <article
            className={`agent-box ${selectedIds.includes(agent.id) ? "is-selected" : ""}`}
            key={agent.id}
            style={{ left: agent.x, top: agent.y }}
          >
            <div
              className="agent-drag-zone"
              onClick={() => toggleSelected(agent.id)}
              onDoubleClick={() => setMode(agent.id, "expanded")}
              onPointerDown={(event) => startDrag(event, agent)}
            >
              <span className="agent-mark">{agent.name.replace("Agent ", "A")}</span>
              <span className="agent-meta">
                <strong>{agent.name}</strong>
                <em>{agent.contextId ? `connected ${agent.contextId}` : agent.role}</em>
              </span>
              <span className={`agent-dot ${apiError ? "offline" : activeRunFor(agent)?.status === "running" ? "busy" : "online"}`} />
            </div>
            <span className="box-actions">
              <button type="button" onClick={() => toggleSelected(agent.id)}>
                {selectedIds.includes(agent.id) ? "Selected" : "Select"}
              </button>
              <button type="button" onClick={() => setMode(agent.id, "expanded")}>
                Expand
              </button>
            </span>
          </article>
        ) : (
          <section
            className={`agent-terminal ${selectedIds.includes(agent.id) ? "is-selected" : ""}`}
            key={agent.id}
            style={{ left: agent.x, top: agent.y }}
          >
            <header className="terminal-titlebar" onPointerDown={(event) => startDrag(event, agent)}>
              <span className="agent-mark">{agent.name.replace("Agent ", "A")}</span>
              <div>
                <h1>{agent.name}</h1>
                <p>{agent.contextId ? `shared context ${agent.contextId}` : agent.role}</p>
              </div>
              <button type="button" onClick={() => toggleSelected(agent.id)}>
                {selectedIds.includes(agent.id) ? "Selected" : "Select"}
              </button>
              <button type="button" onClick={() => setMode(agent.id, "small")}>
                Collapse
              </button>
            </header>

            <div className="terminal-output">
              {agent.lines.slice(-12).map((line, index) => (
                <div className={`terminal-line ${line.kind}`} key={`${agent.id}-${index}-${line.text}`}>
                  <span>{line.kind === "user" ? "$" : line.kind === "error" ? "!" : ">"}</span>
                  <p>{line.text}</p>
                </div>
              ))}
              <RunOutput run={activeRunFor(agent)} />
            </div>

            <form className="terminal-input" onSubmit={(event) => submitAgentCommand(event, agent)}>
              <span>$</span>
              <input
                value={agent.command}
                onChange={(event) => updateCommand(agent.id, event.target.value)}
                placeholder="/codex review this file"
              />
              <button type="submit" disabled={agent.sending || Boolean(apiError)}>
                Run
              </button>
            </form>

            <footer className="terminal-footer">
              <span>{appState.capabilities?.workspaceRoot ?? "start with pnpm run dev:real"}</span>
              {appState.artifacts[0] && <a href={appState.artifacts[0].path}>latest artifact</a>}
            </footer>
          </section>
        )
      )}
    </main>
  );
}

function legacyFailureNotice(appState: AppState) {
  const hasLegacySpawnFailure = appState.runs.some(
    (run) => run.status === "failed" && !run.output?.length && run.events.some((event) => event.message === "spawn EPERM")
  );

  return hasLegacySpawnFailure ? "old failed runs found; click Clear History after restarting dev:real" : "";
}

function parseCommand(value: string): { objective: string; runner: string } {
  const trimmed = value.trim();

  if (trimmed.startsWith("/typecheck")) {
    return { runner: "typecheck", objective: trimmed.replace("/typecheck", "").trim() || "Run the project typecheck" };
  }

  if (trimmed.startsWith("/codex")) {
    return { runner: "codex", objective: trimmed.replace("/codex", "").trim() || "Review this repository and suggest next steps" };
  }

  if (trimmed.startsWith("/audit")) {
    return { runner: "workspace-audit", objective: trimmed.replace("/audit", "").trim() || "Audit this workspace" };
  }

  return { runner: "workspace-audit", objective: trimmed };
}

function RunOutput({ run }: { run?: AgentRun }) {
  if (!run) {
    return null;
  }

  return (
    <>
      <div className="terminal-line agent">
        <span>&gt;</span>
        <p>{`${run.runner} ${run.status}`}</p>
      </div>
      {(run.output ?? []).slice(-30).map((chunk, index) => (
        <div className="terminal-line output" key={`${run.id}-output-${index}`}>
          <span>|</span>
          <pre>{chunk}</pre>
        </div>
      ))}
      {run.artifactId && (
        <div className="terminal-line system">
          <span>&gt;</span>
          <p>artifact ready</p>
        </div>
      )}
    </>
  );
}

function getSharedContext(agent: AgentBox, agents: AgentBox[]) {
  if (!agent.contextId) {
    return "";
  }

  return agents
    .filter((item) => item.contextId === agent.contextId && item.id !== agent.id)
    .map((item) => {
      const recent = item.lines.slice(-4).map((line) => `${line.kind}: ${line.text}`).join("\n");
      return `${item.name} (${item.role})\n${recent}`;
    })
    .join("\n\n");
}
