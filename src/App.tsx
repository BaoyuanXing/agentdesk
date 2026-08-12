import { FormEvent, useEffect, useMemo, useState } from "react";

type RunStatus = "queued" | "running" | "completed" | "failed";

type AgentRun = {
  id: string;
  objective: string;
  runner: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  artifactId?: string;
  events: Array<{ at: string; message: string }>;
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

type TerminalLine = {
  kind: "system" | "user" | "agent" | "error";
  text: string;
};

const emptyState: AppState = { runs: [], artifacts: [] };

export function App() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [appState, setAppState] = useState<AppState>(emptyState);
  const [apiError, setApiError] = useState("");
  const [command, setCommand] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [manualLines, setManualLines] = useState<TerminalLine[]>([
    { kind: "system", text: "AgentDesk resident agent online." },
    { kind: "system", text: "Try: /audit, /typecheck, or /codex review this repository." }
  ]);

  const latestRun = appState.runs[0];
  const activeRuns = appState.runs.filter((run) => run.status === "queued" || run.status === "running");
  const terminalLines = useMemo(() => {
    const runLines = appState.runs.slice(0, 5).flatMap<TerminalLine>((run) => [
      { kind: "agent", text: `${run.runner} ${run.status}: ${run.objective}` },
      ...run.events.slice(-2).map<TerminalLine>((event) => ({ kind: "system", text: `  ${event.message}` }))
    ]);

    return [...manualLines, ...runLines].slice(-18);
  }, [appState.runs, manualLines]);

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

  async function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseCommand(command);

    if (!parsed.objective) {
      return;
    }

    setManualLines((lines) => [...lines, { kind: "user", text: `> ${command}` }]);
    setCommand("");
    setIsSending(true);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed)
      });

      if (!response.ok) {
        throw new Error(`runtime returned ${response.status}`);
      }

      const run = (await response.json()) as AgentRun;
      setAppState((current) => ({ ...current, runs: [run, ...current.runs] }));
    } catch (error) {
      setManualLines((lines) => [
        ...lines,
        { kind: "error", text: error instanceof Error ? error.message : "could not start run" }
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="desktop-shell">
      <div className="desktop-field" />

      {!isExpanded && (
        <button className="agent-orb" type="button" onClick={() => setIsExpanded(true)} aria-label="Open AgentDesk">
          <span className="orb-core">AD</span>
          <span className={`orb-status ${apiError ? "offline" : "online"}`} />
        </button>
      )}

      {isExpanded && (
        <section className="agent-console" aria-label="AgentDesk terminal">
          <header className="console-titlebar">
            <button className="agent-badge" type="button" onClick={() => setIsExpanded(false)} aria-label="Collapse AgentDesk">
              AD
            </button>
            <div>
              <h1>AgentDesk</h1>
              <p>{apiError ? "runtime offline" : `${activeRuns.length} active runs`}</p>
            </div>
            <button className="collapse-button" type="button" onClick={() => setIsExpanded(false)}>
              _
            </button>
          </header>

          <div className="console-body">
            <div className="terminal-output" aria-live="polite">
              {terminalLines.map((line, index) => (
                <div className={`terminal-line ${line.kind}`} key={`${line.kind}-${index}-${line.text}`}>
                  <span>{line.kind === "user" ? "$" : line.kind === "error" ? "!" : ">"}</span>
                  <p>{line.text}</p>
                </div>
              ))}
            </div>

            <form className="terminal-input" onSubmit={submitCommand}>
              <span>$</span>
              <input
                autoFocus
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="/codex explain the project"
              />
              <button type="submit" disabled={isSending || Boolean(apiError)}>
                Run
              </button>
            </form>
          </div>

          <footer className="console-footer">
            <span>{appState.capabilities?.workspaceRoot ?? "start with pnpm run dev:real"}</span>
            {latestRun?.artifactId && <a href={appState.artifacts.find((artifact) => artifact.id === latestRun.artifactId)?.path}>latest artifact</a>}
          </footer>
        </section>
      )}
    </main>
  );
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
