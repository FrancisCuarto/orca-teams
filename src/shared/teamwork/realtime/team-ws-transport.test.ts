import { describe, expect, it } from 'vitest'
import { TeamBoardCRDT } from './team-crdt-board'
import { TeamRoomProvider } from './team-room-provider'
import { TeamWebSocketTransport, type TeamWebSocketLike } from './team-ws-transport'
import type { TeamKanbanBoard } from '../team-kanban-types'

class MockHubSocket implements TeamWebSocketLike {
  readyState = 0
  onopen: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null

  constructor(private readonly hub: Set<MockHubSocket>) {
    hub.add(this)
  }

  open(): void {
    this.readyState = 1
    this.onopen?.({})
  }

  send(data: string): void {
    for (const peer of this.hub) {
      if (peer !== this && peer.readyState === 1) {
        peer.onmessage?.({ data })
      }
    }
  }

  close(): void {
    this.readyState = 3
    this.hub.delete(this)
    this.onclose?.({})
  }
}

function makeBoard(id: string): TeamKanbanBoard {
  return {
    id,
    projectId: 'proj-1',
    title: 'Sprint Sync',
    columns: [
      { id: 'col-todo', title: 'Por Hacer', cardIds: [] },
      { id: 'col-done', title: 'Hecho', cardIds: [] }
    ],
    cards: {},
    createdAt: 1000,
    updatedAt: 1000
  }
}

describe('TeamWebSocketTransport + TeamRoomProvider', () => {
  it('replays buffered CRDT updates on connect and syncs presences across peers', () => {
    const hub = new Set<MockHubSocket>()
    const socketA = new MockHubSocket(hub)
    const socketB = new MockHubSocket(hub)

    const crdtA = new TeamBoardCRDT('board-ws')
    crdtA.initializeFromBoard(makeBoard('board-ws'))
    const crdtB = new TeamBoardCRDT('board-ws')
    crdtB.initializeFromBoard(makeBoard('board-ws'))

    const roomA = new TeamRoomProvider(
      'room-1',
      crdtA,
      'user-a',
      new TeamWebSocketTransport({
        url: 'ws://localhost:4789',
        roomId: 'room-1',
        userId: 'user-a',
        createSocket: () => socketA
      })
    )

    const roomB = new TeamRoomProvider(
      'room-1',
      crdtB,
      'user-b',
      new TeamWebSocketTransport({
        url: 'ws://localhost:4789',
        roomId: 'room-1',
        userId: 'user-b',
        createSocket: () => socketB
      })
    )

    socketB.open()

    // Mutate A while A is still offline; update must buffer and flush once socketA opens.
    crdtA.upsertCard({
      id: 'card-offline-1',
      title: 'Creada offline',
      description: '',
      columnId: 'col-todo',
      priority: 'high',
      labels: [],
      checklist: [],
      createdAt: 10,
      updatedAt: 10
    })

    expect(crdtB.getBoard().cards['card-offline-1']).toBeUndefined()

    socketA.open()
    roomA.updatePresence({
      userId: 'user-a',
      displayName: 'Alice',
      color: '#3b82f6',
      activeCardId: 'card-offline-1'
    })

    expect(crdtB.getBoard().cards['card-offline-1']?.title).toBe('Creada offline')
    expect(
      roomB.getPresences().some((p) => p.userId === 'user-a' && p.activeCardId === 'card-offline-1')
    ).toBe(true)

    roomA.destroy()
    roomB.destroy()
    crdtA.destroy()
    crdtB.destroy()
  })
})
