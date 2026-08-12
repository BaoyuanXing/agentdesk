import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";

type WindowId = "control" | "launcher" | "runs" | "artifacts";
type RunStatus = "queued" | "running" | "completed" | "failed";

type DeskWindow = {
  id: WindowId;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  accent: string;
};

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

type DragState =
  | { kind: "move"; id: WindowId; pointerId: number; offsetX: number; offsetY: number }
  | {
      kind: "resize";
      id: WindowId;
      pointerId: number;
      startX: number;
      startY: number;
      startWidth: number;
      startHeight: number;
    };

const initialWindows: DeskWindow[] = [
  {
    id: "control",
    title: "Mission Control",
    subtitle: "Live runtime state",
    x: 36,
    y: 32,
    width: 420,
    height: 315,
    minWidth: 340,
    minHeight: 280,
    accent: "#45c4b0"
  },
  {
    id: "launcher",
    title: "Run Launcher",
    subtitle: "Start real workspace jobs",
    x: 488,
    y: 46,
    width: 455,
    height: 350,
    minWidth: 360,
    minHeight: 315,
    accent: "#7c9cff"
  },
  {
    id: "runs",
    title: "Run Monitor",
    subtitle: "Queued, running, completed",
    x: 72,
    y: 384,
    width: 560,
    height: 345,
    minWidth: 420,
    minHeight: 305,
    accent: "#f8b84e"
  },
  {
    id: "artifacts",
    title: "Artifact Shelf",
    subtitle: "Files created by runs",
    x: 668,
    y: 430,
    width: 430,
    height: 294,
    minWidth: 350,
    minHeight: 255,
    accent: "#e875a0"
  }
];

const emptyState: AppState = { runs: [], artifacts: [] };

export function App() {
  const [windows, setWindows] = useState(initialWindows);
  const [activeId, setActiveId] = useState<WindowId>("launcher");
  const [minimized, setMinimized] = useState<WindowId[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [appState, setAppState] = useState<AppState>(emptyState);
  const [objective, setObjective] = useState("Audit this workspace and create a useful run report");
  const [runner, setRunner] = useState("workspace-audit");
  const [isCreating, setIsCreating] = useState(false);
  const [apiError, setApiError] = useState("");

  const activeWindow = useMemo(
    () => windows.find((windowItem) => windowItem.id === activeId),
    [activeId, windows]
  );

  const runningCount = appState.runs.filter((run) => run.status === "running" || run.status === "queued").length;
  const completedCount = appState.runs.filter((run) => run.status === "completed").length;

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
          setApiError("Runtime offline. Start it with `pnpm run dev:real`.");
        }
      }
    }

    void refreshState();
    const timer = window.setInterval(refreshState, 1600);
    return () => {
      shouldContinue = false;
      window.clearInterval(timer);
    };
  }, []);

  async function createRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);

    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective, runner })
      });

      if (!response.ok) {
        throw new Error(`Runtime returned ${response.status}`);
      }

      const run = (await response.json()) as AgentRun;
      setAppState((current) => ({ ...current, runs: [run, ...current.runs] }));
      setActiveId("runs");
      setMinimized((items) => items.filter((item) => item !== "runs"));
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not create run");
    } finally {
      setIsCreating(false);
    }
  }

  function focusWindow(id: WindowId) {
    setActiveId(id);
    setMinimized((items) => items.filter((item) => item !== id));
  }

  function minimizeWindow(id: WindowId) {
    setMinimized((items) => (items.includes(id) ? items : [...items, id]));
  }

  function startMove(event: PointerEvent<HTMLDivElement>, windowItem: DeskWindow) {
    if ((event.target as HTMLElement).closest("button, input, textarea, select, a")) {
      return;
    }

    focusWindow(windowItem.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      kind: "move",
      id: windowItem.id,
      pointerId: event.pointerId,
      offsetX: event.clientX - windowItem.x,
      offsetY: event.clientY - windowItem.y
    });
  }

  function startResize(event: PointerEvent<HTMLDivElement>, windowItem: DeskWindow) {
    event.stopPropagation();
    focusWindow(windowItem.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      kind: "resize",
      id: windowItem.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: windowItem.width,
      startHeight: windowItem.height
    });
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    setWindows((items) =>
      items.map((windowItem) => {
        if (windowItem.id !== dragState.id) {
          return windowItem;
        }

        if (dragState.kind === "move") {
          return { ...windowItem, x: Math.max(12, event.clientX - dragState.offsetX), y: Math.max(12, event.clientY - dragState.offsetY) };
        }

        return {
          ...windowItem,
          width: Math.max(windowItem.minWidth, dragState.startWidth + event.clientX - dragState.startX),
          height: Math.max(windowItem.minHeight, dragState.startHeight + event.clientY - dragState.startY)
        };
      })
    );
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragState && event.pointerId === dragState.pointerId) {
      setDragState(null);
    }
  }

  return (
    <main className="desktop" onPointerMove={updateDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <section className="desktop-backdrop" aria-label="AgentDesk workspace">
        <div className="brand-lockup">
          <span className="brand-mark">AD</span>
          <div>
            <h1>AgentDesk</h1>
            <p>Local runtime for agentic workflows</p>
          </div>
        </div>
        <div className="desktop-grid" />

        {windows.map((windowItem, index) => {
          const isActive = activeId === windowItem.id;
          const isMinimized = minimized.includes(windowItem.id);

          return (
            <article
              className={`desk-window ${isActive ? "is-active" : ""} ${isMinimized ? "is-minimized" : ""}`}
              key={windowItem.id}
              style={{
                left: windowItem.x,
                top: windowItem.y,
                width: windowItem.width,
                height: windowItem.height,
                zIndex: isActive ? 20 : 5 + index,
                "--accent": windowItem.accent
              } as CSSProperties}
              onPointerDown={() => focusWindow(windowItem.id)}
            >
              <div className="window-titlebar" onPointerDown={(event) => startMove(event, windowItem)}>
                <div>
                  <h2>{windowItem.title}</h2>
                  <p>{windowItem.subtitle}</p>
                </div>
                <div className="window-actions" aria-label={`${windowItem.title} actions`}>
                  <button type="button" aria-label="Minimize" onClick={() => minimizeWindow(windowItem.id)}>
                    _
                  </button>
                  <button type="button" aria-label="Focus" onClick={() => focusWindow(windowItem.id)}>
                    +
                  </button>
                </div>
              </div>
              <div className="window-content">
                {windowItem.id === "control" && (
                  <MissionControl
                    apiError={apiError}
                    workspaceRoot={appState.capabilities?.workspaceRoot}
                    runs={appState.runs.length}
                    running={runningCount}
                    completed={completedCount}
                    artifacts={appState.artifacts.length}
                  />
                )}
                {windowItem.id === "launcher" && (
                  <RunLauncher
                    objective={objective}
                    runner={runner}
                    runners={appState.capabilities?.runners ?? ["workspace-audit", "typecheck"]}
                    isCreating={isCreating}
                    onObjectiveChange={setObjective}
                    onRunnerChange={setRunner}
                    onSubmit={createRun}
                  />
                )}
                {windowItem.id === "runs" && <RunMonitor runs={appState.runs} />}
                {windowItem.id === "artifacts" && <ArtifactShelf artifacts={appState.artifacts} />}
              </div>
              <div
                className="resize-handle"
                role="separator"
                aria-label={`Resize ${windowItem.title}`}
                onPointerDown={(event) => startResize(event, windowItem)}
              />
            </article>
          );
        })}
      </section>

      <nav className="taskbar" aria-label="Workspace apps">
        <button className="start-button" type="button" onClick={() => focusWindow("control")}>
          <span>AD</span>
          Start
        </button>
        <div className="taskbar-apps">
          {windows.map((windowItem) => (
            <button
              className={activeId === windowItem.id ? "is-selected" : ""}
              key={windowItem.id}
              type="button"
              onClick={() => focusWindow(windowItem.id)}
            >
              <span style={{ background: windowItem.accent }} />
              {windowItem.title}
            </button>
          ))}
        </div>
        <div className="status-pill">
          <span />
          {activeWindow ? `${activeWindow.title} active` : "Ready"}
        </div>
      </nav>
    </main>
  );
}

function MissionControl({
  apiError,
  workspaceRoot,
  runs,
  running,
  completed,
  artifacts
}: {
  apiError: string;
  workspaceRoot?: string;
  runs: number;
  running: number;
  completed: number;
  artifacts: number;
}) {
  return (
    <div className="control-panel">
      <div className="metric-row">
        <Metric label="Runs" value={String(runs)} detail={`${running} active`} />
        <Metric label="Done" value={String(completed)} detail="completed" />
        <Metric label="Files" value={String(artifacts)} detail="artifacts" />
      </div>
      <div className={`runtime-card ${apiError ? "is-offline" : "is-online"}`}>
        <span>{apiError ? "Runtime offline" : "Runtime online"}</span>
        <p>{apiError || "Local AgentDesk server is accepting jobs and writing artifacts."}</p>
      </div>
      <div className="prompt-box">
        <span>Workspace</span>
        <p>{workspaceRoot ?? "Waiting for runtime..."}</p>
      </div>
    </div>
  );
}

function RunLauncher({
  objective,
  runner,
  runners,
  isCreating,
  onObjectiveChange,
  onRunnerChange,
  onSubmit
}: {
  objective: string;
  runner: string;
  runners: string[];
  isCreating: boolean;
  onObjectiveChange: (value: string) => void;
  onRunnerChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="run-form" onSubmit={onSubmit}>
      <label>
        Objective
        <textarea value={objective} onChange={(event) => onObjectiveChange(event.target.value)} rows={5} />
      </label>
      <label>
        Runner
        <select value={runner} onChange={(event) => onRunnerChange(event.target.value)}>
          {runners.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={isCreating}>
        {isCreating ? "Launching..." : "Launch Run"}
      </button>
      <p className="fine-print">Runs persist under `.agentdesk/` and produce real markdown artifacts.</p>
    </form>
  );
}

function RunMonitor({ runs }: { runs: AgentRun[] }) {
  if (runs.length === 0) {
    return <EmptyState title="No runs yet" body="Launch a workspace audit to create the first real run." />;
  }

  return (
    <div className="run-list">
      {runs.map((run) => (
        <div className="run-card" key={run.id}>
          <div className="run-card-header">
            <span className={`task-status ${run.status}`}>{run.status}</span>
            <em>{run.runner}</em>
          </div>
          <strong>{run.objective}</strong>
          <div className="timeline">
            {run.events.slice(-4).map((event) => (
              <span key={`${run.id}-${event.at}-${event.message}`}>{event.message}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ArtifactShelf({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) {
    return <EmptyState title="No artifacts yet" body="Completed runs will place files here." />;
  }

  return (
    <div className="artifact-list">
      {artifacts.map((artifact) => (
        <a className="artifact-row" href={artifact.path} key={artifact.id} target="_blank" rel="noreferrer">
          <span>{artifact.kind}</span>
          <strong>{artifact.name}</strong>
          <em>{new Date(artifact.createdAt).toLocaleTimeString()}</em>
        </a>
      ))}
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
