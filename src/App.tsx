import { useMemo, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";

type WindowId = "control" | "agents" | "tasks" | "artifacts";

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

type DragState =
  | {
      kind: "move";
      id: WindowId;
      pointerId: number;
      offsetX: number;
      offsetY: number;
    }
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
    subtitle: "Workspace overview",
    x: 36,
    y: 32,
    width: 390,
    height: 300,
    minWidth: 320,
    minHeight: 260,
    accent: "#45c4b0"
  },
  {
    id: "agents",
    title: "Agent Console",
    subtitle: "Active operators",
    x: 456,
    y: 46,
    width: 430,
    height: 346,
    minWidth: 340,
    minHeight: 300,
    accent: "#7c9cff"
  },
  {
    id: "tasks",
    title: "Workflow Board",
    subtitle: "Queued and running tasks",
    x: 92,
    y: 368,
    width: 490,
    height: 330,
    minWidth: 380,
    minHeight: 290,
    accent: "#f8b84e"
  },
  {
    id: "artifacts",
    title: "Artifact Shelf",
    subtitle: "Generated outputs",
    x: 620,
    y: 414,
    width: 420,
    height: 286,
    minWidth: 340,
    minHeight: 250,
    accent: "#e875a0"
  }
];

const agents = [
  { name: "Planner", state: "mapping dependencies", load: 72, tone: "#7c9cff" },
  { name: "Builder", state: "drafting a React shell", load: 56, tone: "#45c4b0" },
  { name: "Reviewer", state: "watching risk surfaces", load: 31, tone: "#f8b84e" }
];

const tasks = [
  { label: "Design desktop workspace model", status: "Done", owner: "Planner" },
  { label: "Create shell for agent windows", status: "Running", owner: "Builder" },
  { label: "Prepare Tauri integration notes", status: "Queued", owner: "Reviewer" }
];

const artifacts = [
  { name: "workspace-map.md", kind: "Spec", size: "4.2 KB" },
  { name: "agent-run.json", kind: "Trace", size: "18 KB" },
  { name: "preview-capture.png", kind: "Image", size: "812 KB" }
];

export function App() {
  const [windows, setWindows] = useState(initialWindows);
  const [activeId, setActiveId] = useState<WindowId>("agents");
  const [minimized, setMinimized] = useState<WindowId[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const activeWindow = useMemo(
    () => windows.find((windowItem) => windowItem.id === activeId),
    [activeId, windows]
  );

  function focusWindow(id: WindowId) {
    setActiveId(id);
    setMinimized((items) => items.filter((item) => item !== id));
  }

  function minimizeWindow(id: WindowId) {
    setMinimized((items) => (items.includes(id) ? items : [...items, id]));
  }

  function startMove(event: PointerEvent<HTMLDivElement>, windowItem: DeskWindow) {
    if ((event.target as HTMLElement).closest("button")) {
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
          return {
            ...windowItem,
            x: Math.max(12, event.clientX - dragState.offsetX),
            y: Math.max(12, event.clientY - dragState.offsetY)
          };
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
            <p>Windowed workspace for agentic workflows</p>
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
              <div className="window-content">{renderWindow(windowItem.id)}</div>
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

function renderWindow(id: WindowId) {
  switch (id) {
    case "control":
      return <MissionControl />;
    case "agents":
      return <AgentConsole />;
    case "tasks":
      return <WorkflowBoard />;
    case "artifacts":
      return <ArtifactShelf />;
  }
}

function MissionControl() {
  return (
    <div className="control-panel">
      <div className="metric-row">
        <Metric label="Agents" value="3" detail="2 active" />
        <Metric label="Runs" value="8" detail="today" />
        <Metric label="Artifacts" value="14" detail="tracked" />
      </div>
      <div className="prompt-box">
        <span>Next command</span>
        <p>Launch a research agent, hand findings to a builder, then ask reviewer to check the generated artifact.</p>
      </div>
      <div className="timeline">
        <span>08:40 Planner created task graph</span>
        <span>08:44 Builder opened workspace shell</span>
        <span>08:51 Reviewer subscribed to artifacts</span>
      </div>
    </div>
  );
}

function AgentConsole() {
  return (
    <div className="agent-list">
      {agents.map((agent) => (
        <div className="agent-card" key={agent.name}>
          <div className="agent-heading">
            <span style={{ background: agent.tone }} />
            <div>
              <strong>{agent.name}</strong>
              <p>{agent.state}</p>
            </div>
          </div>
          <div className="load-bar" aria-label={`${agent.name} load ${agent.load}%`}>
            <span style={{ width: `${agent.load}%`, background: agent.tone }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkflowBoard() {
  return (
    <div className="workflow-board">
      {tasks.map((task) => (
        <div className="task-card" key={task.label}>
          <span className={`task-status ${task.status.toLowerCase()}`}>{task.status}</span>
          <strong>{task.label}</strong>
          <p>{task.owner}</p>
        </div>
      ))}
    </div>
  );
}

function ArtifactShelf() {
  return (
    <div className="artifact-list">
      {artifacts.map((artifact) => (
        <button className="artifact-row" key={artifact.name} type="button">
          <span>{artifact.kind}</span>
          <strong>{artifact.name}</strong>
          <em>{artifact.size}</em>
        </button>
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
