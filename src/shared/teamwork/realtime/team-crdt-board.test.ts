import { describe, expect, it } from 'vitest'
import { TeamBoardCRDT } from './team-crdt-board'
import { TeamRoomProvider } from './team-room-provider'
import type { TeamKanbanBoard, TeamKanbanCard } from '../team-kanban-types'

function createSampleBoard(): TeamKanbanBoard {
  const now = Date.now()
  return {
    id: 'board-alpha',
    projectId: 'proj-1',
    title: 'Sprint Alfa',
    columns: [
      { id: 'col-todo', title: 'Por Hacer', cardIds: ['card-1'] },
      { id: 'col-in-progress', title: 'En Progreso', cardIds: [] },
      { id: 'col-done', title: 'Completado', cardIds: [] }
    ],
    cards: {
      'card-1': {
        id: 'card-1',
        title: 'Diseñar arquitectura CRDT',
        description: 'Usar Yjs para sincronizar estados de tableros',
        columnId: 'col-todo',
        priority: 'high',
        labels: ['core', 'crdt'],
        checklist: [
          { id: 'item-1', text: 'Definir Y.Doc', done: false },
          { id: 'item-2', text: 'Crear proveedor de sala', done: false }
        ],
        createdAt: now,
        updatedAt: now
      }
    },
    createdAt: now,
    updatedAt: now
  }
}

describe('TeamBoardCRDT', () => {
  it('inicializa un Y.Doc a partir de un tablero base', () => {
    const seed = createSampleBoard()
    const crdt = new TeamBoardCRDT('board-alpha')
    crdt.initializeFromBoard(seed)

    const board = crdt.getBoard()
    expect(board.id).toBe('board-alpha')
    expect(board.title).toBe('Sprint Alfa')
    expect(board.columns).toHaveLength(3)
    expect(board.cards['card-1'].title).toBe('Diseñar arquitectura CRDT')
    expect(board.columns[0].cardIds).toEqual(['card-1'])
  })

  it('agrega y actualiza tarjetas reflejando cambios en columnas', () => {
    const seed = createSampleBoard()
    const crdt = new TeamBoardCRDT('board-alpha')
    crdt.initializeFromBoard(seed)

    const newCard: TeamKanbanCard = {
      id: 'card-2',
      title: 'Implementar Room Provider',
      description: 'Sincronizar peers en tiempo real',
      columnId: 'col-in-progress',
      priority: 'urgent',
      labels: ['realtime'],
      checklist: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    crdt.upsertCard(newCard)
    let board = crdt.getBoard()
    expect(board.cards['card-2']).toBeDefined()
    expect(board.columns[1].cardIds).toContain('card-2')

    // Mover tarjeta a otra columna
    crdt.moveCard('card-2', 'col-done')
    board = crdt.getBoard()
    expect(board.cards['card-2'].columnId).toBe('col-done')
    expect(board.columns[1].cardIds).not.toContain('card-2')
    expect(board.columns[2].cardIds).toContain('card-2')
  })

  it('elimina tarjetas limpiando referencias en columnas', () => {
    const seed = createSampleBoard()
    const crdt = new TeamBoardCRDT('board-alpha')
    crdt.initializeFromBoard(seed)

    crdt.deleteCard('card-1')
    const board = crdt.getBoard()
    expect(board.cards['card-1']).toBeUndefined()
    expect(board.columns[0].cardIds).toHaveLength(0)
  })

  it('sincroniza deltas binarios entre dos instancias independientes sin pérdida', () => {
    const seed = createSampleBoard()
    const clientA = new TeamBoardCRDT('board-alpha')
    clientA.initializeFromBoard(seed)

    const clientB = new TeamBoardCRDT('board-alpha')
    // Sincronizar estado inicial de A a B
    const initialSync = clientA.encodeStateAsUpdate()
    clientB.applyUpdate(initialSync)

    expect(clientB.getBoard().cards['card-1'].title).toBe('Diseñar arquitectura CRDT')

    // Modificación en Cliente A
    clientA.upsertCard({
      ...seed.cards['card-1'],
      title: 'Arquitectura CRDT Validada'
    })

    // Modificación concurrente en Cliente B (cambiar checklist)
    clientB.upsertCard({
      ...seed.cards['card-1'],
      checklist: [
        { id: 'item-1', text: 'Definir Y.Doc', done: true },
        { id: 'item-2', text: 'Crear proveedor de sala', done: true }
      ]
    })

    // Intercambiar deltas
    const updateFromA = clientA.encodeStateAsUpdate()
    const updateFromB = clientB.encodeStateAsUpdate()

    clientB.applyUpdate(updateFromA)
    clientA.applyUpdate(updateFromB)

    // Ambos clientes deben converger
    const boardA = clientA.getBoard()
    const boardB = clientB.getBoard()

    expect(boardA.cards['card-1'].id).toBe(boardB.cards['card-1'].id)
    expect(boardA.columns).toEqual(boardB.columns)
  })

  it('preserva y sincroniza externalIssueRef entre instancias CRDT', () => {
    const seed = createSampleBoard()
    const clientA = new TeamBoardCRDT('board-alpha')
    clientA.initializeFromBoard(seed)

    const importedCard: TeamKanbanCard = {
      id: 'card-gh-42',
      title: 'Corregir autenticación SSO',
      description: 'Importado desde GitHub',
      columnId: 'col-todo',
      priority: 'high',
      labels: ['auth', 'bug'],
      checklist: [],
      externalIssueRef: {
        provider: 'github',
        id: '42',
        key: '#42',
        url: 'https://github.com/orca/teams/issues/42'
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    clientA.upsertCard(importedCard)
    clientA.moveCard('card-gh-42', 'col-in-progress')

    const clientB = new TeamBoardCRDT('board-alpha')
    clientB.applyUpdate(clientA.encodeStateAsUpdate())

    const syncedCard = clientB.getBoard().cards['card-gh-42']
    expect(syncedCard?.externalIssueRef).toEqual({
      provider: 'github',
      id: '42',
      key: '#42',
      url: 'https://github.com/orca/teams/issues/42'
    })

    // Actualizar título manteniendo externalIssueRef
    clientB.upsertCard({
      ...importedCard,
      externalIssueRef: undefined,
      title: 'Corregir SSO en login'
    })
    expect(clientB.getBoard().cards['card-gh-42']?.externalIssueRef).toEqual({
      provider: 'github',
      id: '42',
      key: '#42',
      url: 'https://github.com/orca/teams/issues/42'
    })
  })
})

describe('TeamRoomProvider', () => {
  it('conecta dos peers y propaga deltas y presencias en vivo', () => {
    const seed = createSampleBoard()
    const crdtA = new TeamBoardCRDT('board-alpha')
    crdtA.initializeFromBoard(seed)

    const crdtB = new TeamBoardCRDT('board-alpha')

    const roomA = new TeamRoomProvider('room-1', crdtA, 'user-a')
    const roomB = new TeamRoomProvider('room-1', crdtB, 'user-b')

    const disconnect = roomA.connectPeer(roomB)

    // Verificar convergencia inicial
    expect(crdtB.getBoard().title).toBe('Sprint Alfa')

    // Actualizar presencia en A
    roomA.updatePresence({
      userId: 'user-a',
      displayName: 'Francis',
      color: '#3b82f6',
      activeCardId: 'card-1'
    })

    // B debe recibir la presencia de A
    const presencesInB = roomB.getPresences()
    const foundA = presencesInB.find((p) => p.userId === 'user-a')
    expect(foundA).toBeDefined()
    expect(foundA?.displayName).toBe('Francis')

    // Modificación en B debe replicarse a A automáticamente
    crdtB.moveCard('card-1', 'col-done')
    expect(crdtA.getBoard().cards['card-1'].columnId).toBe('col-done')

    disconnect()
    roomA.destroy()
    roomB.destroy()
  })
})
