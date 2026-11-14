import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  TeamKanbanBoard,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  computeBoardSprintMetrics,
  extractActionItemsFromMarkdownToBoard,
  moveKanbanCardAcrossColumns,
  toggleKanbanCardChecklistItem,
  upsertKanbanCard
} from './team-kanban-board-mutations'

// Frozen clock so Date.now()-derived ids and timestamps stay deterministic.
const FROZEN_NOW = 1_767_225_600_000

const CARD_1: TeamKanbanCard = {
  id: 'card-1',
  title: 'Diseñar API de notas',
  description: 'Definir endpoints',
  columnId: 'col-backlog',
  priority: 'high',
  labels: ['api'],
  checklist: [],
  estimatePoints: 3,
  assignee: { type: 'agent', name: 'Orca' },
  createdAt: 1_000,
  updatedAt: 1_000
}

const CARD_2: TeamKanbanCard = {
  id: 'card-2',
  title: 'Corregir bug de scroll',
  description: '',
  columnId: 'col-backlog',
  priority: 'urgent',
  labels: [],
  checklist: [],
  estimatePoints: 2,
  blockedReason: 'Esperando CI',
  assignee: { type: 'human', name: 'Francis' },
  createdAt: 1_000,
  updatedAt: 1_000
}

const CARD_3: TeamKanbanCard = {
  id: 'card-3',
  title: 'Refactor del store',
  description: '',
  columnId: 'col-doing',
  priority: 'medium',
  labels: [],
  checklist: [
    { id: 'chk-1', text: 'Paso A', done: false },
    { id: 'chk-2', text: 'Paso B', done: true }
  ],
  estimatePoints: 5,
  assignee: { type: 'agent', name: 'Orca' },
  createdAt: 1_000,
  updatedAt: 1_000
}

const CARD_4: TeamKanbanCard = {
  id: 'card-4',
  title: 'Migrar a Vite',
  description: '',
  columnId: 'col-done',
  priority: 'low',
  labels: [],
  checklist: [],
  estimatePoints: 8,
  assignee: { type: 'human', name: 'Laura' },
  createdAt: 1_000,
  updatedAt: 1_000
}

function makeBoard(): TeamKanbanBoard {
  return {
    id: 'board-1',
    title: 'Sprint Orca',
    columns: [
      { id: 'col-backlog', title: 'Backlog', cardIds: ['card-1', 'card-2'] },
      { id: 'col-doing', title: 'En Progreso', cardIds: ['card-3'] },
      { id: 'col-done', title: 'Hecho', cardIds: ['card-4'] }
    ],
    cards: {
      [CARD_1.id]: CARD_1,
      [CARD_2.id]: CARD_2,
      [CARD_3.id]: CARD_3,
      [CARD_4.id]: CARD_4
    },
    createdAt: 1_000,
    updatedAt: 1_000
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('upsertKanbanCard', () => {
  it('creates a card and appends it to its column', () => {
    const savedCard: TeamKanbanCard = {
      id: 'card-9',
      title: 'Documentar pipeline de despliegue',
      description: 'Runbook con pasos y rollback',
      columnId: 'col-backlog',
      priority: 'medium',
      labels: ['docs'],
      checklist: [],
      estimatePoints: 2,
      createdAt: FROZEN_NOW,
      updatedAt: FROZEN_NOW
    }

    const { nextBoard, isNew } = upsertKanbanCard(makeBoard(), savedCard)

    expect(isNew).toBe(true)
    expect(nextBoard.cards['card-9']).toBe(savedCard)
    expect(nextBoard.columns.map((col) => col.cardIds)).toEqual([
      ['card-1', 'card-2', 'card-9'],
      ['card-3'],
      ['card-4']
    ])
    expect(nextBoard.updatedAt).toBe(FROZEN_NOW)
  })

  it('moves an existing card to another column without duplicating ids', () => {
    const { nextBoard, isNew } = upsertKanbanCard(makeBoard(), {
      ...CARD_1,
      columnId: 'col-done'
    })

    expect(isNew).toBe(false)
    expect(nextBoard.columns.map((col) => col.cardIds)).toEqual([
      ['card-2'],
      ['card-3'],
      ['card-4', 'card-1']
    ])
    expect(nextBoard.cards['card-1'].columnId).toBe('col-done')
  })

  it('keeps columns untouched when the card stays in its column', () => {
    const { nextBoard, isNew } = upsertKanbanCard(makeBoard(), {
      ...CARD_1,
      title: 'Diseñar API de notas v2'
    })

    expect(isNew).toBe(false)
    expect(nextBoard.columns.map((col) => col.cardIds)).toEqual([
      ['card-1', 'card-2'],
      ['card-3'],
      ['card-4']
    ])
    expect(nextBoard.cards['card-1'].title).toBe('Diseñar API de notas v2')
  })
})

describe('moveKanbanCardAcrossColumns', () => {
  it('moves a card dropped over a target column', () => {
    const next = moveKanbanCardAcrossColumns(makeBoard(), 'card-1', 'col-doing')

    expect(next?.columns.map((col) => col.cardIds)).toEqual([
      ['card-2'],
      ['card-3', 'card-1'],
      ['card-4']
    ])
    expect(next?.cards['card-1'].columnId).toBe('col-doing')
    expect(next?.cards['card-1'].updatedAt).toBe(FROZEN_NOW)
  })

  it('resolves the target column when dropped over one of its cards', () => {
    const next = moveKanbanCardAcrossColumns(makeBoard(), 'card-3', 'card-4')

    expect(next?.columns.map((col) => col.cardIds)).toEqual([
      ['card-1', 'card-2'],
      [],
      ['card-4', 'card-3']
    ])
    expect(next?.cards['card-3'].columnId).toBe('col-done')
  })

  it('rejects unknown cards, same-column drops and unknown targets', () => {
    const board = makeBoard()

    expect(moveKanbanCardAcrossColumns(board, 'card-404', 'col-doing')).toBeNull()
    expect(moveKanbanCardAcrossColumns(board, 'card-3', 'col-doing')).toBeNull()
    expect(moveKanbanCardAcrossColumns(board, 'card-1', 'col-404')).toBeNull()
  })
})

describe('toggleKanbanCardChecklistItem', () => {
  it('flips only the matching checklist item', () => {
    const next = toggleKanbanCardChecklistItem(makeBoard(), 'card-3', 'chk-1')

    expect(next?.cards['card-3'].checklist).toEqual([
      { id: 'chk-1', text: 'Paso A', done: true },
      { id: 'chk-2', text: 'Paso B', done: true }
    ])
    expect(next?.cards['card-3'].updatedAt).toBe(FROZEN_NOW)
    expect(next?.updatedAt).toBe(FROZEN_NOW)
  })

  it('returns null for unknown cards or checklist items', () => {
    const board = makeBoard()

    expect(toggleKanbanCardChecklistItem(board, 'card-404', 'chk-1')).toBeNull()
    expect(toggleKanbanCardChecklistItem(board, 'card-3', 'chk-404')).toBeNull()
  })
})

describe('extractActionItemsFromMarkdownToBoard', () => {
  it('creates cards only for pending checklist lines not already on the board', () => {
    const markdown = `# Minuta de Reunión

- [ ] diseñar api de notas
- [x] Migrar a Vite
Texto sin checkbox
- [ ] Añadir métricas de sprint
- [ ] Poda de logs`

    const { nextBoard, createdCount } = extractActionItemsFromMarkdownToBoard(
      makeBoard(),
      'Minuta de Reunión',
      markdown
    )

    expect(createdCount).toBe(2)
    expect(nextBoard.columns[0]?.cardIds).toEqual([
      'card-1',
      'card-2',
      `card-note-${FROZEN_NOW}-1`,
      `card-note-${FROZEN_NOW}-2`
    ])
    expect(nextBoard.cards[`card-note-${FROZEN_NOW}-1`]).toEqual({
      id: `card-note-${FROZEN_NOW}-1`,
      title: 'Añadir métricas de sprint',
      description: 'Extraída desde la nota "Minuta de Reunión".',
      columnId: 'col-backlog',
      priority: 'medium',
      labels: ['Desde Nota'],
      checklist: [],
      createdAt: FROZEN_NOW + 1,
      updatedAt: FROZEN_NOW + 1
    })
    expect(nextBoard.cards[`card-note-${FROZEN_NOW}-2`]?.title).toBe('Poda de logs')
  })

  it('deduplicates repeated titles within the same note', () => {
    const markdown = `- [ ] Desplegar staging
- [ ] desplegar staging
- [ ] Desplegar producción`

    const { nextBoard, createdCount } = extractActionItemsFromMarkdownToBoard(
      makeBoard(),
      'Plan de lanzamiento',
      markdown
    )

    expect(createdCount).toBe(2)
    expect(Object.values(nextBoard.cards).map((card) => card.title)).toContain(
      'Desplegar producción'
    )
    expect(nextBoard.columns[0]?.cardIds).toEqual([
      'card-1',
      'card-2',
      `card-note-${FROZEN_NOW}-0`,
      `card-note-${FROZEN_NOW}-2`
    ])
  })

  it('honors a valid target column and falls back to the first one otherwise', () => {
    const markdown = '- [ ] Preparar retro de sprint'

    const toDoing = extractActionItemsFromMarkdownToBoard(
      makeBoard(),
      'Minuta',
      markdown,
      'col-doing'
    )
    expect(toDoing.createdCount).toBe(1)
    expect(toDoing.nextBoard.columns[1]?.cardIds).toEqual(['card-3', `card-note-${FROZEN_NOW}-0`])

    const fallback = extractActionItemsFromMarkdownToBoard(
      makeBoard(),
      'Minuta',
      markdown,
      'col-inexistente'
    )
    expect(fallback.createdCount).toBe(1)
    expect(fallback.nextBoard.columns[0]?.cardIds).toEqual([
      'card-1',
      'card-2',
      `card-note-${FROZEN_NOW}-0`
    ])
  })

  it('creates nothing from markdown without pending checklist lines', () => {
    const { nextBoard, createdCount } = extractActionItemsFromMarkdownToBoard(
      makeBoard(),
      'Minuta',
      'Solo texto.\n- [x] Ya resuelto'
    )

    expect(createdCount).toBe(0)
    expect(Object.keys(nextBoard.cards)).toHaveLength(4)
  })
})

describe('computeBoardSprintMetrics', () => {
  it('computes totals, completion, blockers, points and workload', () => {
    expect(computeBoardSprintMetrics(makeBoard())).toEqual({
      totalCards: 4,
      completedCards: 1,
      blockedCards: 1,
      totalPoints: 18,
      completedPoints: 8,
      agentCards: 2,
      humanCards: 2,
      workloadByAssignee: {
        Orca: { count: 2, points: 8 },
        Francis: { count: 1, points: 2 }
      }
    })
  })

  it('treats the last column as done when no col-done exists', () => {
    const board: TeamKanbanBoard = {
      id: 'board-2',
      title: 'Tablero sin done',
      columns: [
        { id: 'col-todo', title: 'Por Hacer', cardIds: ['c1'] },
        { id: 'col-last', title: 'Revisión', cardIds: ['c2'] }
      ],
      cards: {
        c1: {
          id: 'c1',
          title: 'Tarea pendiente',
          description: '',
          columnId: 'col-todo',
          priority: 'low',
          labels: [],
          checklist: [],
          estimatePoints: 1,
          createdAt: 1_000,
          updatedAt: 1_000
        },
        c2: {
          id: 'c2',
          title: 'Tarea revisada',
          description: '',
          columnId: 'col-last',
          priority: 'low',
          labels: [],
          checklist: [],
          estimatePoints: 2,
          createdAt: 1_000,
          updatedAt: 1_000
        }
      },
      createdAt: 1_000,
      updatedAt: 1_000
    }

    expect(computeBoardSprintMetrics(board)).toEqual({
      totalCards: 2,
      completedCards: 1,
      blockedCards: 0,
      totalPoints: 3,
      completedPoints: 2,
      agentCards: 0,
      humanCards: 0,
      workloadByAssignee: {}
    })
  })
})
