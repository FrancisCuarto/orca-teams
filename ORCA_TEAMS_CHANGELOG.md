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
- **Fase 3 — Servicio de Despacho y Ciclo de Vida de Agentes (Issue #17 / PR #20)**:
  - Implementación de `TeamAgentDispatchService` con construcción inteligente de prompt a partir de tarjetas y columnas (`buildAgentExecutionPrompt`).
  - Idempotencia nativa (`idempotencyKey`), ciclo de vida (`queued` -> `running` -> `completed` / `failed` / `cancelled`) y soporte de cancelación asíncrona.
  - Streaming de logs de ejecución y persistencia de registros de agentes (`AgentExecutionRecord`).
  - Suite de 7 pruebas unitarias en `src/shared/teamwork/team-agent-dispatch-service.test.ts`.
- **Fase 3 — Monitoreo de Ejecución y Streaming de Logs (Issue #18 / PR #21)**:
  - Componente modal `TeamAgentExecutionModal` con terminal de streaming en tiempo real respetando `scrollbar-sleek` y tokens de diseño.
  - Indicadores visuales de estado (`Loader2` animado para ejecución, `CheckCircle2` para éxito, `AlertCircle` para errores) y botón de abortar tarea.
  - Suite de 4 pruebas unitarias en `src/renderer/src/components/team/kanban/TeamAgentExecutionModal.test.tsx`.
- **Fase 3 — Integración de Despacho e Insignias en Tarjetas Kanban (Issue #19 / PR #22)**:
  - Componente `TeamKanbanCardAgentBadge` con indicador de estado animado (`running` con pulso), badge distinguido para agentes y acción rápida de ejecución.
  - Integración en `TeamKanbanCardItem` y `TeamKanbanColumnView` con propagación de eventos `onViewExecution` y `onDispatchAgent`.
  - Suite de 5 pruebas unitarias en `src/renderer/src/components/team/kanban/team-kanban-agent-integration.test.tsx` (68/68 tests unitarios pasando).
- **Fase 4 — Motor CRDT y Modelo de Sincronización para Whiteboard (Issue #24 / PR #27)**:
  - Motor colaborativo `TeamWhiteboardCRDT` basado en Yjs con operaciones atómicas (`upsertItem`, `moveItem`, `updateItemContent`, `deleteItem`, `setViewport`).
  - Observador atómico por transacción (`afterTransaction`) e interfaces `ITeamWhiteboardCRDT` y `WhiteboardCursorPresence`.
  - Suite de 7 pruebas unitarias en `src/shared/teamwork/realtime/team-crdt-whiteboard.test.ts`.
- **Fase 4 — Hook Reactivo useTeamWhiteboardSync y Presencia de Cursores Remotos (Issue #25 / PR #28)**:
  - Hook reactivo `useTeamWhiteboardSync` conectando el canvas visual con `TeamRoomProvider` y `TeamWhiteboardCRDT`.
  - Transmisión en tiempo real de posición del cursor del usuario con throttling inteligente (50ms) y seguimiento de cursores remotos.
  - Suite de 5 pruebas unitarias en `src/renderer/src/components/team/hooks/use-team-whiteboard-sync.test.ts`.
- **Fase 4 — Renderizado de Cursores en Vivo e Integración del Whiteboard Colaborativo (Issue #26 / PR #29)**:
  - Componente de renderizado de cursor en tiempo real `TeamWhiteboardCursor` con puntero SVG reactivo y píldora con nombre de colaborador.
  - Modularización arquitectónica del Whiteboard (<300 líneas por archivo: `TeamWhiteboardToolbar`, `TeamWhiteboardCardItem`, `TeamWhiteboardView`, `TeamWhiteboardConnectedView`).
  - Integración en `TeamPage.tsx` con soporte multiusuario en tiempo real.
  - Suite de 2 pruebas unitarias en `src/renderer/src/components/team/whiteboard/TeamWhiteboardCursor.test.tsx` (82/82 tests unitarios pasando).
- **Fase 5 — Motor CRDT para Notas y Documentación Colaborativa (Issue #31 / PR #34)**:
  - Motor colaborativo `TeamNotesCRDT` basado en Yjs para notas enriquecidas, ADRs, RFCs y actas de reunión.
  - Soporte de transacciones atómicas (`createNote`, `updateNote`, `deleteNote`, `extractTaskToKanban`) con notificación a observadores vía `doc.on('update')`.
  - Suite de 7 pruebas unitarias en `src/shared/teamwork/realtime/team-crdt-notes.test.ts`.
- **Fase 5 — Hook Reactivo useTeamNotesSync y Tiempo Real (Issue #32 / PR #35)**:
  - Hook reactivo `useTeamNotesSync` con integración bidireccional entre Yjs CRDT y React State.
  - Heartbeat y presencia de colaboradores en notas activas con limpieza al desmontar.
  - Extracción directa de tareas de notas Markdown hacia el tablero Kanban.
  - Suite de 5 pruebas unitarias en `src/renderer/src/components/team/hooks/use-team-notes-sync.test.ts`.
- **Fase 5 — Editor Colaborativo, Sidebar y Extracción a Kanban (Issue #33 / PR #36)**:
  - Modularización arquitectónica con `TeamNotesSidebar` (<140 líneas) y `TeamNoteEditor` (<205 líneas) respetando el sistema de diseño Orca.
  - Soporte de IME composition safety en inputs y tags mediante `isImeOwnedKeyboardEvent`.
  - Componente conectado `TeamNotesConnectedView` integrado en `TeamPage.tsx`.
  - Suite de 4 pruebas unitarias en `src/renderer/src/components/team/notes/TeamNotesView.test.tsx` (98/98 tests unitarios pasando).
- **Fase 6 — Integración Global, Typecheck y Empaquetado Desktop (Issue #38 / PR #39)**:
  - Verificación integral de tipado TypeScript (`typecheck:web`, `typecheck:node`, `typecheck:cli`, `typecheck`) al 100% en verde.
  - Resolución de tipos de snapshot (`createdAt`), tipados nulos en diálogos de invitación y ejecución de agentes, y mapeo de tokens visuales de categoría en sidebar de notas.
  - Verificación de la navegación global desde la barra lateral (`SidebarNav`) y App Workspace Shell hacia `TeamPage`.
  - Suite completa de 16 archivos de pruebas unitarias (**98/98 tests**) pasando con 0 errores y 0 advertencias.
