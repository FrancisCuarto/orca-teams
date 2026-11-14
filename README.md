<h1 align="center">
  <img src="resources/build/icon.png" alt="Orca Teams Logo" width="84" style="border-radius: 18px;" /><br/>
  Orca Teams
</h1>

<p align="center">
  <a href="https://github.com/FrancisCuarto/orca-teams/stargazers"><img src="https://img.shields.io/github/stars/FrancisCuarto/orca-teams?style=flat&label=%E2%98%85&color=08C" alt="GitHub stars" /></a>
  <a href="https://github.com/FrancisCuarto/orca-teams/releases"><img src="https://img.shields.io/badge/release-v1.0.0--teams-0ea5e9?style=flat" alt="Release v1.0.0-teams" /></a>
  <img src="https://img.shields.io/badge/tests-98%2F98%20passing-10b981?style=flat" alt="98/98 unit tests passing" />
  <img src="https://img.shields.io/badge/license-MIT-08C?style=flat" alt="License: MIT" />
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-4493F8?style=flat-square" alt="Supported platforms: macOS, Windows, and Linux" />
</p>

<p align="center">
  <strong>Collaborative AI Workspace &amp; Multi-Agent Orchestration IDE.</strong><br/>
  Real-time collaborative Kanban, Whiteboard, Living Notes &amp; ADRs powered by <strong>Yjs CRDTs</strong>, combined with autonomous multi-agent execution (Claude Code, Codex, Antigravity &amp; ACP) in isolated Git worktrees.
</p>

---

## What is Orca Teams?

**Orca Teams** extends [Orca](https://github.com/stablyai/orca) into a full multiplayer, multi-agent engineering workspace designed for both human teams and autonomous AI agents working together in real time.

### Core Collaborative Modules

<table>
<tr>
<td width="50%" valign="top">

### 1. Workspaces, Teams &amp; RBAC

- Hierarchical team &amp; project management (`Owner`, `Admin`, `Member`, `Viewer`).
- Dual-dialect relational persistence (**PostgreSQL / SQLite**) via [`TeamDatabaseService`](src/shared/teamwork/team-database-service.ts).
- Secure invitation tokens with role assignment, acceptance dialog, and admin revocation.
- Strict multitenant project isolation (`private` vs `team` visibility).

</td>
<td width="50%" valign="top">

### 2. Realtime Collaborative Kanban (Yjs CRDT)

- Conflict-free multiplayer Kanban boards backed by [`TeamBoardCRDT`](src/shared/teamwork/realtime/team-crdt-board.ts) (`Y.Doc`, `Y.Map`, `Y.Array`).
- Zero-conflict concurrent card creation, drag-and-drop column transitions, checklists, story points, and priorities.
- Live collaborator presence bar ([`TeamBoardPresenceBar`](src/renderer/src/components/team/kanban/TeamBoardPresenceBar.tsx)) showing active users and focused cards.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 3. Autonomous Agent Dispatch &amp; Live Logs

- Assign any Kanban card to a human teammate or an AI coding agent (**Claude**, **Codex**, **OpenCode**, **ACP**).
- Idempotent execution lifecycle (`queued` → `running` → `completed` / `failed` / `cancelled`) via [`TeamAgentDispatchService`](src/shared/teamwork/team-agent-dispatch-service.ts).
- Built-in real-time log streaming modal ([`TeamAgentExecutionModal`](src/renderer/src/components/team/kanban/TeamAgentExecutionModal.tsx)) and animated status badges on cards.

</td>
<td width="50%" valign="top">

### 4. Realtime Whiteboard &amp; Live Cursors

- Multiplayer canvas powered by [`TeamWhiteboardCRDT`](src/shared/teamwork/realtime/team-crdt-whiteboard.ts) supporting sticky notes, text blocks, and Mermaid diagrams.
- Throttled 50ms remote cursor broadcasting via [`useTeamWhiteboardSync`](src/renderer/src/components/team/hooks/use-team-whiteboard-sync.ts).
- Live SVG collaborator cursors with user name pills ([`TeamWhiteboardCursor`](src/renderer/src/components/team/whiteboard/TeamWhiteboardCursor.tsx)).

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 5. Living Notes, ADRs &amp; Kanban Extraction

- Collaborative Markdown documentation &amp; Architecture Decision Records (ADRs) synced via [`TeamNotesCRDT`](src/shared/teamwork/realtime/team-crdt-notes.ts).
- Smart templates for ADRs, Specs, and Meeting Minutes with IME-safe tag editing.
- One-click **Extract tasks to Kanban** from Markdown checklists and **Send to Agent Context**.

</td>
<td width="50%" valign="top">

### 6. Parallel Agentic IDE Core

- Isolated Git worktrees for parallel agent execution without branch collisions.
- Integrated Chat UI, raw CLI terminal, diffs, code review annotations, and embedded browser.
- Automated verification pipeline with **98/98 unit tests** and full TypeScript typechecking.

</td>
</tr>
</table>

---

## Architecture &amp; Documentation

- **Architecture Audit:** [ORCA_TEAMS_ARCHITECTURE_AUDIT.md](ORCA_TEAMS_ARCHITECTURE_AUDIT.md)
- **Implementation Plan &amp; Phase Tracking:** [ORCA_TEAMS_IMPLEMENTATION_PLAN.md](ORCA_TEAMS_IMPLEMENTATION_PLAN.md)
- **Changelog:** [ORCA_TEAMS_CHANGELOG.md](ORCA_TEAMS_CHANGELOG.md)
- **CI Workflow:** [.github/workflows/orca-teams-ci.yml](.github/workflows/orca-teams-ci.yml)

---

## Quick Start &amp; Desktop Installation (Linux)

### 1. Clone &amp; Install Dependencies

```bash
git clone https://github.com/FrancisCuarto/orca-teams.git
cd orca-teams
pnpm install
```

### 2. Run Development Mode or Verification

```bash
# Run Orca Teams unit test suite (16 suites / 98 tests)
pnpm run test \
  src/renderer/src/components/team/kanban/team-kanban-board-mutations.test.ts \
  src/shared/teamwork/team-workspace-types.test.ts \
  src/shared/teamwork/team-database-service.test.ts \
  src/shared/teamwork/team-invitation-service.test.ts \
  src/shared/teamwork/realtime/team-crdt-board.test.ts \
  src/renderer/src/components/team/hooks/use-team-kanban-sync.test.ts \
  src/shared/teamwork/realtime/team-crdt-concurrency.test.ts \
  src/shared/teamwork/team-agent-dispatch-service.test.ts \
  src/renderer/src/components/team/kanban/TeamAgentExecutionModal.test.tsx \
  src/renderer/src/components/team/kanban/team-kanban-agent-integration.test.tsx \
  src/shared/teamwork/realtime/team-crdt-whiteboard.test.ts \
  src/renderer/src/components/team/hooks/use-team-whiteboard-sync.test.ts \
  src/renderer/src/components/team/whiteboard/TeamWhiteboardCursor.test.tsx \
  src/shared/teamwork/realtime/team-crdt-notes.test.ts \
  src/renderer/src/components/team/hooks/use-team-notes-sync.test.ts \
  src/renderer/src/components/team/notes/TeamNotesView.test.tsx

# Typecheck all packages
pnpm run typecheck
```

### 3. Build &amp; Install Standalone Desktop App (Linux)

Build and install **Orca Teams** directly into your system application menu (`~/.local/share/orca-teams` &amp; `orca-teams` CLI launcher):

```bash
./install-orca-teams.sh
```

Then launch from your desktop application menu (**Orca Teams**) or run `orca-teams` from any terminal.

---

## Supported Agents

Works with **any CLI or ACP coding agent**: Claude Code, OpenAI Codex, Antigravity, OpenCode, Cursor CLI, GitHub Copilot CLI, Gemini, Goose, Cline, Amp, and custom agents.

---

## License

Orca Teams is open source under the [MIT License](LICENSE). Built upon the [Orca](https://github.com/stablyai/orca) architecture.
