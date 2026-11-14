// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTeamKanbanSync } from './use-team-kanban-sync'
import type {
  TeamKanbanBoard,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'

function createTestBoard(): TeamKanbanBoard {
  return {
    id: 'board-sync-1',
    projectId: 'proj-sync',
    title: 'Tablero Sincronizado',
    columns: [
      { id: 'col-todo', title: 'Por Hacer', cardIds: ['card-1'] },
      { id: 'col-done', title: 'Hecho', cardIds: [] }
    ],
    cards: {
      'card-1': {
        id: 'card-1',
        title: 'Tarea 1',
        description: 'Descripción 1',
        columnId: 'col-todo',
        priority: 'medium',
        labels: [],
        checklist: [],
        createdAt: 1000,
        updatedAt: 1000
      }
    },
    createdAt: 1000,
    updatedAt: 1000
  }
}

describe('useTeamKanbanSync', () => {
  it('inicializa con el tablero inicial y estado conectado', () => {
    const initialBoard = createTestBoard()
    const onPersist = vi.fn()

    const { result } = renderHook(() =>
      useTeamKanbanSync({
        boardId: 'board-sync-1',
        projectId: 'proj-sync',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialBoard,
        onPersist
      })
    )

    expect(result.current.syncStatus).toBe('connected')
    expect(result.current.board?.title).toBe('Tablero Sincronizado')
    expect(result.current.board?.columns[0].cardIds).toEqual(['card-1'])
    expect(result.current.presences).toHaveLength(1)
    expect(result.current.presences[0].userId).toBe('user-1')
  })

  it('permite upsertCard y notifica persistencia', () => {
    const initialBoard = createTestBoard()
    const onPersist = vi.fn()

    const { result } = renderHook(() =>
      useTeamKanbanSync({
        boardId: 'board-sync-1',
        projectId: 'proj-sync',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialBoard,
        onPersist
      })
    )

    const newCard: TeamKanbanCard = {
      id: 'card-2',
      title: 'Nueva Tarea',
      description: 'Desc 2',
      columnId: 'col-todo',
      priority: 'high',
      labels: [],
      checklist: [],
      createdAt: 2000,
      updatedAt: 2000
    }

    act(() => {
      result.current.upsertCard(newCard)
    })

    expect(result.current.board?.cards['card-2']).toBeDefined()
    expect(result.current.board?.columns[0].cardIds).toContain('card-2')
    expect(onPersist).toHaveBeenCalled()
  })

  it('mueve tarjetas entre columnas', () => {
    const initialBoard = createTestBoard()

    const { result } = renderHook(() =>
      useTeamKanbanSync({
        boardId: 'board-sync-1',
        projectId: 'proj-sync',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialBoard
      })
    )

    act(() => {
      result.current.moveCard('card-1', 'col-done')
    })

    expect(result.current.board?.cards['card-1'].columnId).toBe('col-done')
    expect(result.current.board?.columns[0].cardIds).not.toContain('card-1')
    expect(result.current.board?.columns[1].cardIds).toContain('card-1')
  })

  it('elimina tarjetas del tablero', () => {
    const initialBoard = createTestBoard()

    const { result } = renderHook(() =>
      useTeamKanbanSync({
        boardId: 'board-sync-1',
        projectId: 'proj-sync',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialBoard
      })
    )

    act(() => {
      result.current.deleteCard('card-1')
    })

    expect(result.current.board?.cards['card-1']).toBeUndefined()
    expect(result.current.board?.columns[0].cardIds).toEqual([])
  })

  it('actualiza la presencia activa de la tarjeta', () => {
    const initialBoard = createTestBoard()

    const { result } = renderHook(() =>
      useTeamKanbanSync({
        boardId: 'board-sync-1',
        projectId: 'proj-sync',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialBoard
      })
    )

    act(() => {
      result.current.updateActiveCard('card-1')
    })

    expect(result.current.presences[0].activeCardId).toBe('card-1')
  })
})
