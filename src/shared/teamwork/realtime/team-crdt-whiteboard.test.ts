import { describe, expect, it, vi } from 'vitest'
import { TeamWhiteboardCRDT } from './team-crdt-whiteboard'
import type { TeamWhiteboard, TeamWhiteboardItem } from '../team-kanban-types'

function createSampleWhiteboard(): TeamWhiteboard {
  return {
    id: 'wb-1',
    projectId: 'proj-1',
    title: 'Arquitectura de Equipos',
    items: [
      {
        id: 'item-1',
        type: 'sticky',
        x: 100,
        y: 150,
        width: 250,
        height: 180,
        content: 'Idea principal',
        color: 'yellow',
        title: 'Diseño'
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: 1000,
    updatedAt: 1000
  }
}

describe('TeamWhiteboardCRDT', () => {
  it('inicializa correctamente a partir de un objeto TeamWhiteboard', () => {
    const crdt = new TeamWhiteboardCRDT('wb-1')
    const sample = createSampleWhiteboard()

    crdt.initializeFromWhiteboard(sample)
    const wb = crdt.getWhiteboard()

    expect(wb.id).toBe('wb-1')
    expect(wb.title).toBe('Arquitectura de Equipos')
    expect(wb.items).toHaveLength(1)
    expect(wb.items[0]?.title).toBe('Diseño')
    expect(wb.viewport).toEqual({ x: 0, y: 0, zoom: 1 })
    crdt.destroy()
  })

  it('permite añadir y actualizar elementos con upsertItem', () => {
    const crdt = new TeamWhiteboardCRDT('wb-1')
    crdt.initializeFromWhiteboard(createSampleWhiteboard())

    const newItem: TeamWhiteboardItem = {
      id: 'item-2',
      type: 'mermaid',
      x: 300,
      y: 200,
      width: 480,
      height: 340,
      content: 'graph TD\n  A --> B',
      title: 'Flujo'
    }

    crdt.upsertItem(newItem)
    const wb = crdt.getWhiteboard()

    expect(wb.items).toHaveLength(2)
    const mermaid = wb.items.find((i) => i.id === 'item-2')
    expect(mermaid?.content).toBe('graph TD\n  A --> B')
    crdt.destroy()
  })

  it('actualiza las coordenadas al mover un elemento con moveItem', () => {
    const crdt = new TeamWhiteboardCRDT('wb-1')
    crdt.initializeFromWhiteboard(createSampleWhiteboard())

    crdt.moveItem('item-1', 450, 600)
    const wb = crdt.getWhiteboard()
    const moved = wb.items.find((i) => i.id === 'item-1')

    expect(moved?.x).toBe(450)
    expect(moved?.y).toBe(600)
    crdt.destroy()
  })

  it('actualiza el contenido de un elemento con updateItemContent', () => {
    const crdt = new TeamWhiteboardCRDT('wb-1')
    crdt.initializeFromWhiteboard(createSampleWhiteboard())

    crdt.updateItemContent('item-1', 'Contenido actualizado colaborativamente')
    const wb = crdt.getWhiteboard()
    const item = wb.items.find((i) => i.id === 'item-1')

    expect(item?.content).toBe('Contenido actualizado colaborativamente')
    crdt.destroy()
  })

  it('elimina un elemento con deleteItem', () => {
    const crdt = new TeamWhiteboardCRDT('wb-1')
    crdt.initializeFromWhiteboard(createSampleWhiteboard())

    crdt.deleteItem('item-1')
    const wb = crdt.getWhiteboard()

    expect(wb.items).toHaveLength(0)
    crdt.destroy()
  })

  it('notifica a los suscriptores cuando se produce una mutación', () => {
    const crdt = new TeamWhiteboardCRDT('wb-1')
    crdt.initializeFromWhiteboard(createSampleWhiteboard())

    const listener = vi.fn()
    const unsubscribe = crdt.subscribe(listener)

    crdt.moveItem('item-1', 200, 300)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    crdt.moveItem('item-1', 250, 350)
    expect(listener).toHaveBeenCalledTimes(1)
    crdt.destroy()
  })

  it('sincroniza en tiempo real de forma determinista entre dos clientes independientes', () => {
    const clientA = new TeamWhiteboardCRDT('wb-1')
    const clientB = new TeamWhiteboardCRDT('wb-1')

    clientA.initializeFromWhiteboard(createSampleWhiteboard())

    // Enviar estado de A a B
    const updateFromA = clientA.encodeStateAsUpdate()
    clientB.applyUpdate(updateFromA)

    expect(clientB.getWhiteboard().items).toHaveLength(1)

    // B agrega un spec
    clientB.upsertItem({
      id: 'spec-b',
      type: 'text',
      x: 50,
      y: 80,
      width: 300,
      height: 200,
      content: 'Especificación B',
      title: 'Spec'
    })

    // A mueve el item-1
    clientA.moveItem('item-1', 999, 888)

    // Intercambiar deltas
    const updateBtoA = clientB.encodeStateAsUpdate()
    const updateAtoB = clientA.encodeStateAsUpdate()

    clientA.applyUpdate(updateBtoA)
    clientB.applyUpdate(updateAtoB)

    // Ambos clientes deben converger exactamente en el mismo estado
    const stateA = clientA.getWhiteboard()
    const stateB = clientB.getWhiteboard()

    expect(stateA.items).toHaveLength(2)
    expect(stateB.items).toHaveLength(2)
    expect(stateA.items).toEqual(stateB.items)

    clientA.destroy()
    clientB.destroy()
  })
})
