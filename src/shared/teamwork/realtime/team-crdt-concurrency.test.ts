import { describe, expect, it } from 'vitest'
import { TeamBoardCRDT } from './team-crdt-board'
import type { TeamKanbanBoard, TeamKanbanCard } from '../team-kanban-types'

function createSampleBoard(): TeamKanbanBoard {
  const now = Date.now()
  return {
    id: 'board-partition-test',
    projectId: 'proj-recon',
    title: 'Sprint Concurrente',
    columns: [
      { id: 'col-todo', title: 'Por Hacer', cardIds: ['card-1'] },
      { id: 'col-in-prog', title: 'En Progreso', cardIds: [] },
      { id: 'col-done', title: 'Completado', cardIds: [] }
    ],
    cards: {
      'card-1': {
        id: 'card-1',
        title: 'Tarea Base',
        description: 'Descripción base',
        columnId: 'col-todo',
        priority: 'medium',
        labels: ['base'],
        checklist: [
          { id: 'item-1', text: 'Item 1', done: false },
          { id: 'item-2', text: 'Item 2', done: false }
        ],
        createdAt: now,
        updatedAt: now
      }
    },
    updatedAt: now
  }
}

describe('Reconciliación Concurrente y Resistencia a Particiones (CRDT)', () => {
  it('resuelve partición de 3 clientes concurrentes sin pérdida de datos', () => {
    const seed = createSampleBoard()

    // 1. Inicialización sincronizada
    const clientA = new TeamBoardCRDT('board-test')
    clientA.initializeFromBoard(seed)

    const initialUpdate = clientA.encodeStateAsUpdate()
    const clientB = new TeamBoardCRDT('board-test')
    clientB.applyUpdate(initialUpdate)

    const clientC = new TeamBoardCRDT('board-test')
    clientC.applyUpdate(initialUpdate)

    // 2. Partición desconectada (modificaciones aisladas)

    // Cliente A: Modifica título y mueve a "En Progreso"
    clientA.upsertCard({
      ...seed.cards['card-1'],
      title: 'Tarea Base Modificada por A',
      columnId: 'col-in-prog'
    })

    // Cliente B: Agrega Card 2 en "Por Hacer"
    const cardB: TeamKanbanCard = {
      id: 'card-2',
      title: 'Tarea Agregada por B',
      description: 'Desc B',
      columnId: 'col-todo',
      priority: 'high',
      labels: ['b'],
      checklist: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    clientB.upsertCard(cardB)

    // Cliente C: Marca checklist en Card 1 y crea Card 3 en "Completado"
    clientC.upsertCard({
      ...seed.cards['card-1'],
      checklist: [
        { id: 'item-1', text: 'Item 1', done: true },
        { id: 'item-2', text: 'Item 2', done: true }
      ]
    })
    const cardC: TeamKanbanCard = {
      id: 'card-3',
      title: 'Tarea Agregada por C',
      description: 'Desc C',
      columnId: 'col-done',
      priority: 'low',
      labels: ['c'],
      checklist: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    clientC.upsertCard(cardC)

    // 3. Reconexión: Intercambio cruzado de deltas binarios
    const deltaA = clientA.encodeStateAsUpdate()
    const deltaB = clientB.encodeStateAsUpdate()
    const deltaC = clientC.encodeStateAsUpdate()

    // Aplicar a Client A
    clientA.applyUpdate(deltaB)
    clientA.applyUpdate(deltaC)

    // Aplicar a Client B en orden inverso
    clientB.applyUpdate(deltaC)
    clientB.applyUpdate(deltaA)

    // Aplicar a Client C
    clientC.applyUpdate(deltaA)
    clientC.applyUpdate(deltaB)

    // 4. Verificación de convergencia absoluta
    const boardA = clientA.getBoard()
    const boardB = clientB.getBoard()
    const boardC = clientC.getBoard()

    // Todos tienen las 3 tarjetas
    expect(Object.keys(boardA.cards)).toHaveLength(3)
    expect(Object.keys(boardB.cards)).toHaveLength(3)
    expect(Object.keys(boardC.cards)).toHaveLength(3)

    // Card 2 y Card 3 existen en todos los clientes
    expect(boardA.cards['card-2']).toBeDefined()
    expect(boardB.cards['card-2']).toBeDefined()
    expect(boardC.cards['card-2']).toBeDefined()

    expect(boardA.cards['card-3']).toBeDefined()
    expect(boardB.cards['card-3']).toBeDefined()
    expect(boardC.cards['card-3']).toBeDefined()

    // Las columnas contienen exactamente las tarjetas esperadas
    expect(boardA.columns).toEqual(boardB.columns)
    expect(boardB.columns).toEqual(boardC.columns)

    clientA.destroy()
    clientB.destroy()
    clientC.destroy()
  })

  it('mantiene la idempotencia al re-aplicar deltas ya procesados', () => {
    const seed = createSampleBoard()
    const client = new TeamBoardCRDT('board-idempotency')
    client.initializeFromBoard(seed)

    const update1 = client.encodeStateAsUpdate()
    // Re-aplicar el mismo update múltiples veces
    client.applyUpdate(update1)
    client.applyUpdate(update1)

    const board = client.getBoard()
    expect(board.title).toBe(seed.title)
    expect(board.columns).toHaveLength(seed.columns.length)
    expect(Object.keys(board.cards)).toEqual(Object.keys(seed.cards))

    client.destroy()
  })
})
