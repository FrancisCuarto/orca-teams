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
- **Fase 2 — Infraestructura y Provider CRDT (Issue #10 / PR #13)**:
  - Motor de sincronización colaborativa `TeamBoardCRDT` basado en Yjs (`Y.Doc`, `Y.Map`, `Y.Array`) con transacciones atómicas para mutaciones de tarjetas y columnas.
  - Capa de sala `TeamRoomProvider` para intercambio de presencias de colaboradores y propagación de deltas binarios sin servidor centralizado obligatorio.
  - Suite de 5 pruebas unitarias en `src/shared/teamwork/realtime/team-crdt-board.test.ts` validando convergencia de estado y resolución sin conflictos.
- **Fase 2 — Hook Reactivo y Sincronización del Tablero Kanban (Issue #11 / PR #14)**:
  - Hook `useTeamKanbanSync` conectando el estado reactivo de React con el motor CRDT y presencias del Room Provider.
  - Operaciones atómicas (`upsertCard`, `moveCard`, `deleteCard`, `updateActiveCard`) con limpieza automática de heartbeat y recursos en desmontaje.
  - Suite de 5 pruebas unitarias en `src/renderer/src/components/team/hooks/use-team-kanban-sync.test.ts` con `@testing-library/react` y `happy-dom`.
- **Fase 2 — Indicadores de Presencia en Vivo y Reconciliación (Issue #12 / PR #15)**:
  - Componente `TeamBoardPresenceBar` para visualización en tiempo real de colaboradores conectados, tarjetas activas y estado de sincronización cumpliendo el sistema de diseño de Orca.
  - Suite de 2 pruebas de concurrencia y particiones de red en `src/shared/teamwork/realtime/team-crdt-concurrency.test.ts` demostrando convergencia determinista entre 3 clientes aislados (52/52 tests unitarios pasando).
