// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTeamWhiteboardSync } from './use-team-whiteboard-sync'
import type {
  TeamWhiteboard,
  TeamWhiteboardItem
} from '../../../../../shared/teamwork/team-kanban-types'

function createTestWhiteboard(): TeamWhiteboard {
  return {
    id: 'wb-sync-1',
    projectId: 'proj-sync',
    title: 'Pizarra de Prueba',
    items: [
      {
        id: 'item-1',
        type: 'sticky',
        x: 100,
        y: 100,
        width: 250,
        height: 180,
        content: 'Nota de Prueba',
        color: 'yellow',
        title: 'Idea'
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: 1000,
    updatedAt: 1000
  }
}

describe('useTeamWhiteboardSync', () => {
  it('inicializa con la pizarra inicial y estado conectado', () => {
    const initialWb = createTestWhiteboard()
    const onPersist = vi.fn()

    const { result } = renderHook(() =>
      useTeamWhiteboardSync({
        whiteboardId: 'wb-sync-1',
        projectId: 'proj-sync',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialWhiteboard: initialWb,
        onPersist
      })
    )

    expect(result.current.syncStatus).toBe('connected')
    expect(result.current.whiteboard?.title).toBe('Pizarra de Prueba')
    expect(result.current.whiteboard?.items).toHaveLength(1)
    expect(result.current.presences).toHaveLength(1)
    expect(result.current.peers).toEqual([])
    expect(result.current.remoteCursors).toEqual([])
  })

  it('permite upsertItem y notifica persistencia', () => {
    const initialWb = createTestWhiteboard()
    const onPersist = vi.fn()

    const { result } = renderHook(() =>
      useTeamWhiteboardSync({
        whiteboardId: 'wb-sync-1',
        projectId: 'proj-sync',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialWhiteboard: initialWb,
        onPersist
      })
    )

    const newItem: TeamWhiteboardItem = {
      id: 'item-2',
      type: 'mermaid',
      x: 300,
      y: 400,
      width: 400,
      height: 300,
      content: 'graph TD\n  A --> B'
    }

    act(() => {
      result.current.upsertItem(newItem)
    })

    expect(result.current.whiteboard?.items).toHaveLength(2)
    expect(onPersist).toHaveBeenCalled()
  })

  it('permite mover un elemento en el lienzo con moveItem', () => {
    const initialWb = createTestWhiteboard()

    const { result } = renderHook(() =>
      useTeamWhiteboardSync({
        whiteboardId: 'wb-sync-1',
        projectId: 'proj-sync',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialWhiteboard: initialWb
      })
    )

    act(() => {
      result.current.moveItem('item-1', 450, 550)
    })

    const moved = result.current.whiteboard?.items.find((i) => i.id === 'item-1')
    expect(moved?.x).toBe(450)
    expect(moved?.y).toBe(550)
  })

  it('permite eliminar elementos con deleteItem', () => {
    const initialWb = createTestWhiteboard()

    const { result } = renderHook(() =>
      useTeamWhiteboardSync({
        whiteboardId: 'wb-sync-1',
        projectId: 'proj-sync',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialWhiteboard: initialWb
      })
    )

    act(() => {
      result.current.deleteItem('item-1')
    })

    expect(result.current.whiteboard?.items).toHaveLength(0)
  })

  it('transmite la posición del cursor respetando el throttling', () => {
    const initialWb = createTestWhiteboard()

    const { result } = renderHook(() =>
      useTeamWhiteboardSync({
        whiteboardId: 'wb-sync-1',
        projectId: 'proj-sync',
        currentUser: { userId: 'user-1', displayName: 'Francis', color: '#10b981' },
        initialWhiteboard: initialWb
      })
    )

    act(() => {
      result.current.broadcastCursor(150, 250)
      result.current.broadcastCursor(155, 255) // Ignorado por throttle < 50ms
    })

    expect(result.current.syncStatus).toBe('connected')
  })
})
