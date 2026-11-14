# Orca Teams — Registro de Cambios (Changelog)

Todos los cambios notables en este proyecto serán documentados en este archivo.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

## [Unreleased]

### Added

- **Fase 0 — Auditoría de Arquitectura del Repositorio**:
  - Evaluación integral del monorepo Orca (`src/main`, `src/renderer`, `src/shared`, `cloud/`).
  - Verificación de la suite de pruebas unitarias existentes para Kanban (`14/14 tests` pasando en `team-kanban-board-mutations.test.ts`).
  - Definición de la estrategia de ramas (`main`, `staging`, `develop`) y modelo de integración continua multiagente.
  - Documento de auditoría técnica generado en `ORCA_TEAMS_ARCHITECTURE_AUDIT.md`.
- **Fase 1 — Modelos de Datos y Contratos Compartidos (Issue #1 / PR #5)**:
  - Definición de tipos TypeScript y esquemas Zod para `UserIdentity`, `Team`, `TeamMember`, `Project`, `ProjectMember`, `TeamInvitation` y `AgentExecutionRecord`.
  - Función de jerarquía y autorización `hasTeamPermission` (`owner > admin > member > viewer`).
  - Suite de 13 pruebas unitarias completas pasando con éxito en `src/shared/teamwork/team-workspace-types.test.ts`.
  - Workflow de integración continua dedicado `orca-teams-ci.yml`.
