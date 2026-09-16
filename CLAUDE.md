# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (frontend + server)
npm run setup

# Run frontend dev server (port 5173) + backend concurrently
npm run start

# Run only frontend (Vite, port 5173)
npm run dev

# Run only backend (Express + WebSocket, port 3001)
npm run server

# Type-check + production build
npm run build

# Backend only (from /server)
cd server && npm run dev   # tsx --watch (hot reload)
cd server && npm run start # production run
```

There are no test commands configured. Type checking is done via `tsc` as part of `npm run build`.

## Architecture

This is **Nexus**, a collaborative multi-agent task execution platform. Users submit tasks; Claude spawns specialized agents, coordinates their execution, and synthesizes results. Supports **simulation mode** (offline demo with hardcoded scenarios) and **live mode** (real Claude API + file/shell/web tools).

### Communication Layer

Frontend ↔ Backend communicate over **WebSocket** (`ws://localhost:3001`). The frontend sends `task`, `approve`, `deny`, `cancel`, `save_config`, and `get_config` messages. The backend emits `agent_spawned`, `agent_update`, `approval_required`, `insight`, `task_report`, `task_complete`, and others in real-time. Types are defined in `/src/types/backend.ts` (client-side) and `/server/src/types.ts` (server-side).

### Execution Pipeline (Live Mode)

`RealOrchestrator` (`/server/src/orchestrator.ts`) runs five sequential phases:

1. **Orchestration** — Claude (Haiku model by default) receives the task and returns a JSON agent plan with `AgentPlan[]` objects (name, specialty, tools, `depends_on`).
2. **Spawning** — Agents are color-coded and broadcast to the frontend.
3. **Execution** — Agents run in parallel levels determined by `depends_on` DAG. Each agent runs a multi-turn Claude (Sonnet) loop with tool calls.
4. **Peer Evaluation** — Agents critique each other's work and assign scores.
5. **Synthesis** — Claude generates a structured `TaskReport` with executive summary, action items, follow-up questions, and `Insight[]` objects.

Sensitive tool calls (shell, delete, launch) pause execution and emit `approval_required`; the orchestrator awaits `approve`/`deny` from the user before proceeding.

### Frontend State Management

`App.tsx` is the root (~655 lines). It holds all UI state and routes between modes:
- **Simulation mode**: delegates to `/src/simulation/orchestrator.ts`
- **Live mode**: delegates to `useBackend` hook (`/src/hooks/useBackend.ts`, ~603 lines), which owns the WebSocket connection and syncs all agent/orchestrator state to React

`useIntelligence` (`/src/intelligence/useIntelligence.ts`) maintains a persistent "user passport" (task count, domain knowledge, collaboration patterns) in `localStorage`. Demo modes (`day1`, `week1`, `month1`) use simulated data from `/src/intelligence/simulator.ts`.

### Tools (Backend)

All tools live in `/server/src/tools/`:
- `filesystem.ts` — file/directory CRUD, sandbox path validation (restricted to approved dirs)
- `shell.ts` — `run_command` with approval gate
- `web.ts` — `web_search` (Brave API if configured) + `fetch_url`
- `launch.ts` — `open_url` / app launcher
- `safety.ts` — risk level assessment helpers

### Configuration & Persistence

- User config stored at `~/.agentic-os/config.json` via `/server/src/store.ts`
- Default agent model: `claude-sonnet-4-6`; default orchestration model: `claude-haiku-4-5-20251001`
- Frontend task history persisted to `localStorage` via `useTaskHistory`
- Intelligence passport persisted to `localStorage` via `/src/intelligence/storage.ts`

### Multi-Task Concurrency

The backend supports multiple concurrent task groups. Each group gets a unique ID and its own `RealOrchestrator` instance. Task relationships are computed via keyword cosine similarity in `/server/src/index.ts`; groups with similarity > 0.30 are merged into the same cluster in the frontend's agent canvas.
