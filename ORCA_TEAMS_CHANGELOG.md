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
- **Fase 1 — Persistencia Relacional y Autorización (Issue #2 / PR #6)**:
  - Definición del esquema DDL dual dialect (PostgreSQL / SQLite) en `src/shared/teamwork/team-schema.ts`.
  - Implementación de `TeamDatabaseService` con reglas estrictas de autorización, membresía, aislamiento de proyectos privados e idempotencia en despacho de agentes.
  - Suite de 9 pruebas unitarias de persistencia y aislamiento pasando al 100% en `src/shared/teamwork/team-database-service.test.ts`.
- **Fase 1 — UI: Selector y Gestión de Equipos y Proyectos (Issue #3 / PR #7)**:
  - Componentes modulares `TeamProjectSelector`, `TeamCreateModal`, `ProjectCreateModal` y `TeamMembersModal`.
  - Hook reactivo `useTeamWorkspaceData` integrando proyectos, roles de usuario e invitaciones seguras.
  - Refactorización de `TeamPage.tsx` para reducir complejidad y mantener líneas de código por debajo del límite arquitectónico (<220 líneas).
- **Fase 1 — Flujo de Invitaciones y Enlaces Seguros (Issue #4 / PR #8)**:
  - Métodos `getInvitationByToken` y `revokeInvitation` con autorización RBAC (solo admins/owners pueden revocar).
  - Componente modal `AcceptInvitationDialog` para aceptación fluida de invitaciones respetando tokens de diseño de Orca y Shadcn.
  - Suite de 4 pruebas unitarias para ciclo de vida de invitaciones en `src/shared/teamwork/team-invitation-service.test.ts`.
  - Modularización de persistencia extrayendo `TeamProjectService` y `team-row-mappers.ts`.
