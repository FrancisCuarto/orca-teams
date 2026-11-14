# Orca Teams — Auditoría de Arquitectura y Estado del Repositorio (Fase 0)

**Fecha:** 14 de Noviembre de 2026  
**Autor:** Antigravity (Tech Lead & Orchestrator)  
**Estado:** Fase 0 Completada — Pendiente de Aprobación para Configuración de Ramas y Fase 1  
**Repositorio:** `https://github.com/FrancisCuarto/orca.git` (Fork de `stablyai/orca`)

---

## 1. Resumen Ejecutivo

Orca es un entorno de desarrollo integrado (IDE) basado en **Electron + React + TypeScript + Vite**, optimizado para el desarrollo agéntico en paralelo.
El objetivo de **Orca Teams** es transformar Orca en un espacio de trabajo colaborativo que integre:

1. **Kanban Colaborativo**: Gestión visual de tareas asignables a humanos y agentes de IA.
2. **Whiteboard**: Pizarra y diagramas colaborativos en tiempo real.
3. **Notes**: Documentación compartida y sincronizada en tiempo real.
4. **AI Workspace**: Despacho, ejecución, streaming y trazabilidad de agentes autónomos asignados a tareas.

Esta auditoría técnica evalúa la arquitectura actual de Orca, cataloga los componentes reutilizables, analiza los mecanismos de ejecución agéntica existentes, formula la propuesta de backend/sincronización y define la estrategia de repositorio y ramas requerida antes de comenzar la implementación.

---

## 2. Mapa de la Arquitectura Actual de Orca

Orca está estructurado como un monorepo administrado por **pnpm** con tres capas principales:

```
+-----------------------------------------------------------------------------------+
|                                  ORCA MONOREPO                                    |
+-----------------------------------------------------------------------------------+
|  1. APLICACIÓN DE ESCRITORIO (Electron)                                           |
|     ├── src/main/          Procesos del sistema, Electron lifecycle, SQLite,       |
|     |                      gestión de PTYs, git nativo, credenciales y agentes.   |
|     ├── src/preload/       Puente de seguridad contextBridge (window.api).        |
|     ├── src/renderer/      UI en React 19 + Tailwind CSS + Lucide + Radix UI       |
|     |                      Store global con Zustand (slices).                     |
|     └── src/shared/        Contratos RPC, tipos de dominio, interfaces agénticas.  |
|                                                                                   |
|  2. BACKEND & SERVICIOS CLOUD (cloud/)                                            |
|     ├── cloud/apps/relay   Servidor WebSocket (Fastify) para emparejamiento móvil|
|     ├── cloud/apps/push    Pasarela de notificaciones push (APNs / FCM)           |
|     ├── cloud/packages/    postgres-schema, cloud-database, relay-contract        |
|                                                                                   |
|  3. RUNTIME AGÉNTICO Y CLI                                                        |
|     ├── src/main/acp/      Protocolo ACP (Agent Client Protocol)                  |
|     ├── src/main/claude/   Integración Claude Agent SDK / subagentes              |
|     ├── src/main/codex/    Integración OpenAI Codex                               |
|     ├── src/shared/orchestration/  Buzón (mailbox), flota, tareas y aprobaciones  |
|     └── src/cli/           CLI de orca (automatización y control por terminal)    |
+-----------------------------------------------------------------------------------+
```

---

## 3. Módulos Existentes Reutilizables

Para evitar duplicación y respetar el principio de mínima intervención (**Ponytail 5**):

| Módulo Existente                  | Ubicación                                                       | Capacidad Reutilizable para Orca Teams                                                                                                              |
| --------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Design System & Primitivas UI** | `src/renderer/src/components/ui/`                               | Botones, diálogos modales, avatares, menús desplegables, badges, inputs accesibles (IME-safe), pestañas y tooltips.                                 |
| **Store Central (Zustand)**       | `src/renderer/src/store/`                                       | Arquitectura de slices (`ui-slice`, `view-actions`, etc.) lista para extender con `team-slice`.                                                     |
| **Contratos RPC Type-Safe**       | `src/shared/rpc-contract/`                                      | Definición de canales bidireccionales y validaciones entre el proceso Main y Renderer.                                                              |
| **Motor de Orquestación**         | `src/shared/orchestration/` y `src/main/runtime/orchestration/` | Colas de despacho, seguimiento de ejecuciones, solicitudes de aprobación humana (`approvals`), buzón de mensajes (`mailbox`) y persistencia SQLite. |
| **Ejecución y Trust de Agentes**  | `src/main/agent-launch/trust/`                                  | Control de límites de permisos en el espacio de trabajo, deadlines de escritura y contención de ejecuciones.                                        |
| **Sistema de Archivos y Git**     | `window.api.fs` y `src/shared/git/`                             | Acceso transaccional al sistema de archivos local y worktrees de Git.                                                                               |
| **Servidor Relay y WebSockets**   | `cloud/apps/relay` & `packages/relay-contract`                  | Infraestructura de sockets autenticados con Fastify y X25519 lista para extender hacia salas de proyectos y colaboración remota.                    |

---

## 4. Estado Actual del Módulo de Equipo (Trabajo Previo Detectado)

El repositorio ya cuenta con una versión preliminar funcional del módulo de equipo:

- **Vista Principal (`TeamPage.tsx`)**: Pestañas de navegación (`Kanban`, `Whiteboard`, `Notes`, `Workspace`).
- **Kanban (`TeamKanbanBoardView.tsx`)**:
  - Drag & Drop de tareas y columnas implementado con `@dnd-kit`.
  - Tarjetas con checklist, etiquetas, prioridades, puntos de historia y responsables.
  - Asignación de miembros (humanos y agentes).
  - Pruebas unitarias al 100% pasando (`14/14 tests` en `team-kanban-board-mutations.test.ts`).
- **Whiteboard (`TeamWhiteboardView.tsx`)**: Lienzo con herramientas básicas, figuras y notas adhesivas.
- **Notes (`TeamNotesView.tsx`)**: Editor de notas con plantillas y extracción de action-items hacia el Kanban.

### Limitaciones Críticas Actuales del Prototipo:

1. **Persistencia Local Simulada**: La persistencia actual reside en `.orca/team/` en el disco local y en `localStorage`. No existe sincronización remota ni backend multiusuario real.
2. **Despacho de Agentes Incompleto**: Al despachar una tarea a un agente en el tablero, la UI actualmente solo copia el prompt al portapapeles y abre un modal genérico, en lugar de invocar el motor de ejecución agéntica de Orca.
3. **Ausencia de CRDT / Colaboración Concurrente**: Dos usuarios editando la misma pizarra o nota sobreescriben cambios si no hay resolución de conflictos.

---

## 5. Estado Actual del Runtime de Agentes en Orca

Orca no es un simple chat con LLMs; posee un motor maduro de agentes con múltiples runtimes integrados:

1. **ACP (Agent Client Protocol)**: Soporta agentes externos e internos bajo un protocolo estructurado de eventos JSON-RPC (utilizado por Antigravity y OpenCode).
2. **Claude Agent SDK**: Capacidad de instanciar subagentes con herramientas locales, permisos restringidos y journal de actividad.
3. **Codex Runtime**: Ejecución en background con seguimiento de tareas estructuradas.
4. **Orquestación y Fleet**: Módulo `src/main/runtime/orchestration/` con soporte para workers federados, asignación de tareas, seguimiento de estados (`queued`, `running`, `completed`, `failed`) y registro de logs.

**Punto de Conexión para Teams:**
Al asignar una tarjeta del Kanban a un agente, el backend de Orca Teams debe emitir un comando de orquestación que registre una `TaskExecution`, provisione el contexto (título, descripción, checklist y repositorio objetivo) e inicie el proceso mediante el adaptador ACP/Orchestrator sin requerir intervención manual del usuario.

---

## 6. Propuesta de Backend y Sincronización Remota

Para cumplir con el requerimiento de que la colaboración funcione entre usuarios en distintas redes, computadoras y ubicaciones geográficas:

### Arquitectura Seleccionada: **Orca Relay + Yjs (CRDT) + PostgreSQL**

```
 [Cliente Desktop Orca A]               [Cliente Desktop Orca B]
        |                                      |
        +------------ (WebSocket E2EE) --------+
                           |
                           v
            +-----------------------------+
            |      ORCA CLOUD RELAY       |
            |   (Node.js / Fastify / WS)  |
            +-----------------------------+
              |                         |
              v                         v
     [ y-websocket Room ]        [ REST / Auth API ]
              |                         |
              v                         v
       [ Y.Doc Storage ]        [ PostgreSQL DB ]
   (Persistencia de estado      (Equipos, Proyectos,
    Kanban, Pizarra y Notas)     Permisos, Ejecuciones)
```

1. **Gestión de Identidad y Acceso**:
   - Autenticación por correo y enlace mágico / tokens seguros.
   - Roles a nivel de equipo y proyecto (`Owner`, `Admin`, `Member`, `Viewer`).
2. **Capa en Tiempo Real (Sincronización)**:
   - Uso de **Yjs** para Kanban, Whiteboard y Notes. Los cambios se sincronizan como deltas binarios ultra-ligeros.
   - Sincronización libre de conflictos (CRDTs). Soporte offline con resolución automática al reconectar.
3. **Persistencia Cloud**:
   - PostgreSQL (aprovechando los esquemas base de `cloud/packages/postgres-schema`).
   - Almacenamiento periódico de snapshots de Yjs y tablas relacionales para usuarios, proyectos, miembros y estados de ejecución.

---

## 7. Modelo de Datos Inicial (Fase 1)

```ts
// Identidad y Pertenencia
interface User {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  createdAt: string
}

interface Team {
  id: string
  name: string
  slug: string
  ownerId: string
  createdAt: string
}

interface TeamMember {
  teamId: string
  userId: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  joinedAt: string
}

interface Project {
  id: string
  teamId: string
  name: string
  description?: string
  visibility: 'private' | 'team'
  createdAt: string
}

// Kanban y Asignación
type Assignee =
  | { type: 'human'; userId: string; displayName: string }
  | { type: 'agent'; agentId: string; model: string; role: string }

interface TaskCard {
  id: string
  projectId: string
  boardId: string
  columnId: string
  title: string
  description?: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  storyPoints?: number
  assignee?: Assignee
  checklist: Array<{ id: string; text: string; done: boolean }>
  labels: string[]
  position: number
  updatedAt: number
}

// Ejecución Agéntica
interface AgentExecution {
  id: string
  taskId: string
  projectId: string
  agentId: string
  status: 'queued' | 'running' | 'waiting_for_input' | 'completed' | 'failed' | 'cancelled'
  prompt: string
  branchOrWorktree?: string
  logs: Array<{ timestamp: number; level: 'info' | 'warn' | 'error'; message: string }>
  outputSummary?: string
  startedAt?: number
  completedAt?: number
  error?: string
}
```

---

## 8. Riesgos Técnicos y de Seguridad

1. **Aislamiento Multitenant**: Evitar filtraciones de proyectos privados entre equipos. Las consultas a base de datos deben aplicar filtrado estricto por `teamId` y validación de membresía del usuario invocador.
2. **Seguridad en Ejecución de Agentes**:
   - Nunca inyectar credenciales o tokens del backend en el prompt del agente.
   - Limitar el ámbito de modificación del agente a un worktree o rama dedicada.
   - Exigir confirmación humana para acciones de alta criticidad (merge a ramas principales, eliminación de recursos).
3. **Idempotencia de Despacho**: Prevenir que reconexiones de red o clics repetidos generen múltiples ejecuciones en paralelo para la misma tarea.
4. **Resiliencia de Red**: Desconexiones frecuentes deben entrar en modo degrado local sin bloquear la interfaz ni perder el trabajo del usuario.

---

## 9. Plan de Implementación por Fases y Complejidad

| Fase       | Alcance Principal                                      | Criterio de Salida                                                           | Complejidad |
| ---------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- | :---------: |
| **Fase 0** | Auditoría y establecimiento de ramas / CI              | Auditoría aprobada y flujo de ramas configurado                              |  **Baja**   |
| **Fase 1** | Equipos, Proyectos, Autenticación y Persistencia Cloud | Dos usuarios acceden al mismo proyecto en computadoras distintas             |  **Media**  |
| **Fase 2** | Kanban Colaborativo en Tiempo Real (Yjs)               | Movimientos de tarjetas sincronizados instantáneamente sin pérdida           |  **Media**  |
| **Fase 3** | Despacho y Ejecución Autónoma de Agentes               | Asignar a un agente inicia ejecución con logs en vivo y resultado en tarjeta |  **Alta**   |
| **Fase 4** | Whiteboard Colaborativa Multiusuario                   | Lienzo compartido con punteros y figuras en tiempo real                      |  **Media**  |
| **Fase 5** | Notes Colaborativas y Vínculos de Proyecto             | Notas con guardado automático y generación de tarjetas Kanban                |  **Baja**   |
| **Fase 6** | Integración Global, CI/CD y Empaquetado Desktop        | Suite completa de pruebas verdes y binario instalable (`orca-teams`)         |  **Media**  |

---

## 10. Propuesta de Ramas y Flujo Git

Siguiendo el punto 11 del documento de planificación:

- **`main`**: Rama de producción protegida. Solo recibe versiones publicadas y probadas.
- **`staging`**: Rama de pre-producción protegida para validación integral de fin de fase.
- **`develop`**: Rama base de integración continua. Todo trabajo de agentes se integra aquí mediante Pull Request.
- **Ramas de trabajo de agentes**: `feat/teams-fase1-auth`, `feat/teams-fase1-api`, etc.

**Próximo paso requerido:** Confirmación del usuario para crear las ramas `develop` y `staging` en `origin` (`FrancisCuarto/orca`) e iniciar las subtareas de la Fase 1.
