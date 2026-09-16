# Nexus — Agentic OS

A collaborative multi-agent task execution platform. Submit a task; Claude spawns specialized agents, coordinates their execution in parallel, and synthesizes results into a structured report.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript) ![Express](https://img.shields.io/badge/Express-4-000000?logo=express) ![Anthropic](https://img.shields.io/badge/Claude-API-D97706)

## Features

- **Multi-agent orchestration** — Claude (Haiku) decomposes tasks into a DAG of specialized agents that run in parallel levels
- **Live mode** — real Claude API calls with file, shell, and web tools per agent
- **Simulation mode** — offline demo with hardcoded scenarios, no API key needed
- **Approval gates** — sensitive tool calls (shell, delete, launch) pause for user approval before executing
- **Peer evaluation** — agents critique each other's work and assign scores
- **Intelligence passport** — persistent user profile tracking task history and domain knowledge patterns
- **Real-time UI** — WebSocket-driven agent canvas with live status, logs, and insights

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 18, TypeScript, Vite, Framer Motion |
| Backend | Node.js, Express, WebSocket (`ws`) |
| AI | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Protocol | MCP (`@modelcontextprotocol/sdk`) |

## Getting Started

### Prerequisites

- Node.js 18+
- An Anthropic API key (for live mode)

### Install

```bash
git clone https://github.com/HoseinHashemi/agentic-os.git
cd agentic-os
npm run setup
```

### Configure

```bash
# Set your API key (or enter it in the Settings modal at runtime)
export ANTHROPIC_API_KEY=sk-ant-...
```

Optionally set `BRAVE_API_KEY` to enable real web search in live mode.

### Run

```bash
# Start frontend (port 5173) + backend (port 3001) together
npm run start

# Or separately
npm run dev      # frontend only
npm run server   # backend only
```

Open [http://localhost:5173](http://localhost:5173).

## Project Structure

```
agentic-os/
├── src/
│   ├── App.tsx                   # Root component, all UI state
│   ├── components/               # UI components (canvas, modals, panels)
│   ├── hooks/
│   │   ├── useBackend.ts         # WebSocket connection + live state sync
│   │   ├── useTaskHistory.ts     # localStorage task history
│   │   └── useVoice.ts           # Voice input
│   ├── intelligence/             # User passport (localStorage)
│   ├── simulation/               # Offline demo orchestrator + scenarios
│   └── types/                    # Shared TypeScript types (client-side)
└── server/
    └── src/
        ├── index.ts              # Express + WebSocket server, task routing
        ├── orchestrator.ts       # RealOrchestrator — 5-phase execution pipeline
        ├── store.ts              # Config persistence (~/.agentic-os/config.json)
        ├── types.ts              # Server-side types
        └── tools/
            ├── filesystem.ts     # File CRUD with sandbox path validation
            ├── shell.ts          # run_command with approval gate
            ├── web.ts            # web_search + fetch_url
            ├── launch.ts         # open_url / app launcher
            └── safety.ts         # Risk level assessment
```

## Execution Pipeline (Live Mode)

1. **Orchestration** — Claude Haiku receives the task and returns an agent plan (name, specialty, tools, dependencies)
2. **Spawning** — Agents are color-coded and broadcast to the frontend
3. **Execution** — Agents run in parallel dependency levels; each runs a multi-turn Claude Sonnet loop with tool calls
4. **Peer Evaluation** — Agents score each other's outputs
5. **Synthesis** — Claude generates a `TaskReport` with executive summary, action items, and follow-up questions

## Configuration

Config is stored at `~/.agentic-os/config.json`. Key fields:

| Key | Default | Description |
|---|---|---|
| `agentModel` | `claude-sonnet-4-6` | Model used for agent execution |
| `orchestratorModel` | `claude-haiku-4-5-20251001` | Model used for task decomposition |
| `anthropicApiKey` | — | API key (can also be set via env var) |
| `braveApiKey` | — | Optional Brave Search API key |

## License

MIT
