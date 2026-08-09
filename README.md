# AgentDesk

AgentDesk is a Windows-like web workspace for agentic workflows. The first version is a React + TypeScript prototype with draggable, resizable app windows, a taskbar, and example panes for agents, workflow tasks, and generated artifacts.

The app is intentionally web-first so it can move quickly, while keeping a shape that can later be wrapped with Tauri for local files, shell tools, notifications, and OS-level integrations.

## What is here

- Desktop-style workspace with floating windows and a bottom taskbar.
- Example agent console, workflow board, mission control, and artifact shelf.
- Vite + React + TypeScript developer setup.
- Browser-only implementation today, with room for a future `src-tauri` shell.

## Getting started

```bash
npm install
npm run dev
```

Then open the local URL Vite prints, usually `http://localhost:5173`.

## Scripts

```bash
npm run dev        # start the development server
npm run build      # type-check and build production assets
npm run preview    # preview the production build
npm run typecheck  # run TypeScript only
```

## Product direction

AgentDesk should become a place where a human can launch, organize, observe, and steer multiple agentic workflows at once. The desktop metaphor gives each workflow, tool, artifact, and agent a physical home instead of forcing everything into one long chat.

Likely next steps:

- Persist window layouts and workspace state.
- Add real workflow run data behind the sample panes.
- Introduce an app registry for agent tools such as browser, files, terminal, docs, and review.
- Add a Tauri shell when local capabilities are needed.
- Model artifacts as first-class files that can be opened, compared, exported, and handed between agents.

## Tauri path

The current project can stay as the frontend package. A future Tauri integration can add:

```text
src-tauri/
  Cargo.toml
  tauri.conf.json
  src/
```

The frontend can continue to run through Vite, while Tauri provides secure local capabilities through explicit commands.

