import type { TeamKanbanBoard, TeamNotesCollection, TeamWhiteboard } from './team-kanban-types'

export function createDefaultTeamKanbanBoard(
  boardId = 'default-sprint',
  projectId = 'default-project'
): TeamKanbanBoard {
  const now = Date.now()

  return {
    id: boardId,
    projectId,
    title: 'Sprint 1 - Team & Agent Collaboration',
    description: 'Tablero principal del equipo con tareas para humanos y agentes de IA.',
    sprintGoal: 'Entregar flujo multi-agente estable con trazabilidad Git y QA automatizado.',
    createdAt: now,
    updatedAt: now,
    columns: [
      {
        id: 'col-backlog',
        title: 'Backlog',
        color: '#64748b',
        cardIds: ['card-1', 'card-2']
      },
      {
        id: 'col-todo',
        title: 'Por Hacer',
        color: '#3b82f6',
        cardIds: ['card-3']
      },
      {
        id: 'col-in-progress',
        title: 'En Progreso',
        color: '#f59e0b',
        wipLimit: 3,
        cardIds: ['card-4']
      },
      {
        id: 'col-review',
        title: 'En Revisión',
        color: '#8b5cf6',
        wipLimit: 2,
        cardIds: ['card-5']
      },
      {
        id: 'col-done',
        title: 'Completado',
        color: '#10b981',
        cardIds: ['card-6']
      }
    ],
    cards: {
      'card-1': {
        id: 'card-1',
        title: 'Diseñar arquitectura de autenticación OAuth2 y roles',
        description:
          'Documentar el flujo de autenticación, refresh tokens y permisos RBAC en la base de datos.',
        columnId: 'col-backlog',
        priority: 'high',
        estimatePoints: 5,
        branchOrWorktree: 'feat/oauth2-rbac',
        assignee: { type: 'human', name: 'Francis (Lead)' },
        labels: ['Backend', 'Security', 'RFC'],
        checklist: [
          { id: 'c1-1', text: 'Diagrama de secuencia del login', done: false },
          { id: 'c1-2', text: 'Especificación OpenAPI para auth endpoints', done: false }
        ],
        createdAt: now - 3600000 * 24,
        updatedAt: now - 3600000 * 24
      },
      'card-2': {
        id: 'card-2',
        title: 'Optimizar bundling y reducción de dependencias pesadas',
        description: 'Auditar librerías con bundle-analyzer y remover paquetes redundantes.',
        columnId: 'col-backlog',
        priority: 'medium',
        estimatePoints: 3,
        branchOrWorktree: 'perf/bundle-audit',
        assignee: {
          type: 'agent',
          name: 'OpenCode',
          agentType: 'opencode',
          model: 'opencode-go/glm-5.3',
          skills: ['ponytail-5', 'ctx7']
        },
        labels: ['Performance', 'Build'],
        checklist: [
          { id: 'c2-1', text: 'Ejecutar análisis de tamaño de chunks', done: false },
          { id: 'c2-2', text: 'Tree-shaking de utilidades no usadas', done: false }
        ],
        createdAt: now - 3600000 * 20,
        updatedAt: now - 3600000 * 20
      },
      'card-3': {
        id: 'card-3',
        title: 'Implementar endpoints REST de gestión de equipos y perfiles',
        description: 'Crear controladores, modelos y validadores para /api/teams y /api/members.',
        columnId: 'col-todo',
        priority: 'urgent',
        estimatePoints: 8,
        branchOrWorktree: 'feat/teams-api',
        assignee: {
          type: 'agent',
          name: 'Codex AI',
          agentType: 'codex',
          model: 'GPT-5.6',
          skills: ['ponytail-5', 'ctx7', 'security-audit']
        },
        labels: ['Backend', 'API'],
        checklist: [
          { id: 'c3-1', text: 'Esquema de base de datos y migración', done: true },
          { id: 'c3-2', text: 'Controlador con validación Zod', done: false },
          { id: 'c3-3', text: 'Tests unitarios de servicio', done: false }
        ],
        createdAt: now - 3600000 * 16,
        updatedAt: now - 3600000 * 16
      },
      'card-4': {
        id: 'card-4',
        title: 'Desarrollar componentes UI de Kanban y Drag-and-Drop',
        description:
          'Integrar @dnd-kit para reordenar tarjetas entre columnas con límites WIP y métricas.',
        columnId: 'col-in-progress',
        priority: 'high',
        estimatePoints: 5,
        branchOrWorktree: 'feat/kanban-dnd',
        assignee: { type: 'human', name: 'Dev Frontend' },
        labels: ['Frontend', 'UI/UX'],
        checklist: [
          { id: 'c4-1', text: 'Contenedor de tablero con scroll horizontal', done: true },
          { id: 'c4-2', text: 'Columnas receptáculo droppable', done: true },
          { id: 'c4-3', text: 'Métricas de sprint y WIP limits', done: false }
        ],
        createdAt: now - 3600000 * 12,
        updatedAt: now - 3600000 * 2
      },
      'card-5': {
        id: 'card-5',
        title: 'Generar pruebas end-to-end con Playwright para flujos críticos',
        description: 'Comprobar el flujo completo de creación de tareas y asignación a agentes.',
        columnId: 'col-review',
        priority: 'medium',
        estimatePoints: 3,
        branchOrWorktree: 'test/kanban-e2e',
        assignee: {
          type: 'agent',
          name: 'QA Playtest',
          agentType: 'qa',
          model: 'Gemini 4 Hydrogen',
          skills: ['ponytail-5', 'tdd-strict']
        },
        labels: ['Testing', 'E2E'],
        checklist: [
          { id: 'c5-1', text: 'Test de arrastre de tarjeta', done: true },
          { id: 'c5-2', text: 'Test de creación de nueva tarjeta', done: true },
          { id: 'c5-3', text: 'Validación en modo oscuro', done: true }
        ],
        createdAt: now - 3600000 * 8,
        updatedAt: now - 3600000 * 1
      },
      'card-6': {
        id: 'card-6',
        title: 'Configurar estructura inicial de almacenamiento Git-backed',
        description:
          'Definir el directorio .orca/team/boards/ para persistir datos en formato JSON legible.',
        columnId: 'col-done',
        priority: 'high',
        estimatePoints: 2,
        branchOrWorktree: 'chore/git-backed-storage',
        assignee: {
          type: 'agent',
          name: 'Antigravity',
          agentType: 'antigravity',
          model: 'Orchestrator (Argon)',
          skills: ['ponytail-5', 'ctx7']
        },
        labels: ['Architecture', 'Git'],
        checklist: [
          { id: 'c6-1', text: 'Definir tipos TypeScript para Kanban', done: true },
          { id: 'c6-2', text: 'Lógica de carga y guardado local', done: true }
        ],
        createdAt: now - 3600000 * 30,
        updatedAt: now - 3600000 * 4
      }
    }
  }
}

export function createDefaultTeamWhiteboard(projectId = 'default-project'): TeamWhiteboard {
  const now = Date.now()

  return {
    id: `wb-${projectId}`,
    projectId,
    title: 'Pizarra de Arquitectura y Diseño',
    createdAt: now,
    updatedAt: now,
    viewport: { x: 0, y: 0, zoom: 1 },
    items: [
      {
        id: 'item-note-1',
        type: 'sticky',
        title: 'Arquitectura General',
        content:
          'Desacoplar componentes de UI mediante eventos y RPC. Persistencia en disco git-backed.',
        color: 'yellow',
        x: 80,
        y: 80,
        width: 260,
        height: 180
      },
      {
        id: 'item-mermaid-1',
        type: 'mermaid',
        title: 'Flujo de Colaboración Multi-Agente',
        content: `graph TD
  User[Tech Lead] -->|Planifica & Asigna| Kanban[Tablero Kanban]
  Kanban -->|Ponytail 5 + ctx7| Antigravity[Antigravity Orchestrator]
  Kanban -->|Refactor / Tests| OpenCode[OpenCode GLM-5.3]
  Antigravity --> Git[Rama / Worktree Git]
  OpenCode --> Git
  Git -->|Quality Gate| Review[Columna En Revisión]`,
        x: 380,
        y: 80,
        width: 460,
        height: 330
      },
      {
        id: 'item-note-2',
        type: 'sticky',
        title: 'Criterios de Calidad',
        content:
          '1. Aplicar Ponytail 5 (cambio mínimo completo)\n2. Verificar APIs con ctx7\n3. Pasar check:code-quality:changed',
        color: 'green',
        x: 80,
        y: 290,
        width: 260,
        height: 180
      }
    ]
  }
}

export function createDefaultTeamNotes(projectId = 'default-project'): TeamNotesCollection {
  const now = Date.now()

  return {
    projectId,
    updatedAt: now,
    notes: [
      {
        id: 'note-adr-001',
        title: 'ADR-001: Almacenamiento Git-Backed por Proyecto',
        category: 'adr',
        status: 'accepted',
        author: 'Francis (Lead)',
        tags: ['Arquitectura', 'Git', 'Persistencia'],
        createdAt: now - 3600000 * 48,
        updatedAt: now - 3600000 * 48,
        content: `# ADR-001: Almacenamiento Git-Backed por Proyecto (.orca/team/)

## Contexto
Cada proyecto o repositorio de software necesita mantener su propio contexto de equipo, backlog, diagramas y decisiones de diseño sin depender de servicios en la nube externos.

## Decisión
Persistir los datos de colaboración dentro de la carpeta del proyecto en \`.orca/team/\`:
- \`.orca/team/boards/default-sprint.json\`: Estado de las columnas y tarjetas Kanban.
- \`.orca/team/whiteboard/whiteboard.json\`: Elementos visuales, notas adhesivas y diagramas.
- \`.orca/team/notes/notes.json\`: Base de conocimiento viva y actas de decisión.

## Consecuencias
- Cada rama y worktree de Git puede versionar sus propias notas y tareas.
- Los agentes de IA pueden leer directamente estos archivos como contexto.`
      },
      {
        id: 'note-spec-001',
        title: 'Especificación del Flujo Multi-Agente (Ponytail 5 + ctx7)',
        category: 'spec',
        status: 'accepted',
        author: 'Antigravity',
        tags: ['Agentes', 'Ponytail-5', 'ctx7'],
        createdAt: now - 3600000 * 24,
        updatedAt: now - 3600000 * 24,
        content: `# Flujo de Trabajo con Agentes Autónomos

1. **Definición de Tarea**: El líder de equipo crea una tarjeta en el Kanban con estimación, rama Git y checklist de criterios de aceptación.
2. **Despacho Rápido (⚡ Quick Dispatch)**: Se genera un prompt con reglas de **Ponytail 5** y **ctx7** para el agente/modelo elegido (Antigravity u OpenCode).
3. **Ejecución y Verificación**: El agente ejecuta la tarea en su worktree y pasa el Quality Gate antes de pasar a Revisión.

## Acciones Pendientes
- [ ] Revisar límites WIP de columnas En Progreso y En Revisión
- [ ] Validar prompts de despacho con OpenCode y Antigravity`
      }
    ]
  }
}
