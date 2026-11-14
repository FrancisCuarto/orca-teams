import { describe, expect, it, vi } from 'vitest'
import { TeamNotesCRDT } from './team-crdt-notes'
import type { TeamNote, TeamNotesCollection } from '../team-kanban-types'

function createSampleCollection(): TeamNotesCollection {
  return {
    projectId: 'proj-notes-1',
    notes: [
      {
        id: 'note-1',
        title: 'ADR 001: Arquitectura CRDT',
        content: '# ADR 001\nDecisión de usar Yjs.',
        category: 'adr',
        status: 'accepted',
        author: 'Francis',
        tags: ['architecture', 'crdt'],
        createdAt: 1000,
        updatedAt: 1000
      }
    ],
    updatedAt: 1000
  }
}

describe('TeamNotesCRDT', () => {
  it('inicializa correctamente a partir de una colección', () => {
    const crdt = new TeamNotesCRDT('notes-1')
    crdt.initializeFromCollection(createSampleCollection())

    const col = crdt.getNotesCollection()
    expect(col.projectId).toBe('proj-notes-1')
    expect(col.notes).toHaveLength(1)
    expect(col.notes[0]?.title).toBe('ADR 001: Arquitectura CRDT')
    expect(col.notes[0]?.status).toBe('accepted')
    crdt.destroy()
  })

  it('permite añadir y actualizar notas con upsertNote', () => {
    const crdt = new TeamNotesCRDT('notes-1')
    crdt.initializeFromCollection(createSampleCollection())

    const newNote: TeamNote = {
      id: 'note-2',
      title: 'Spec: Protocolo de Sala',
      content: 'Detalles del protocolo WebRTC/WebSocket',
      category: 'spec',
      status: 'proposed',
      author: 'Antigravity',
      tags: ['spec', 'network'],
      createdAt: 2000,
      updatedAt: 2000
    }

    crdt.upsertNote(newNote)
    const col = crdt.getNotesCollection()

    expect(col.notes).toHaveLength(2)
    const found = col.notes.find((n) => n.id === 'note-2')
    expect(found?.title).toBe('Spec: Protocolo de Sala')
    crdt.destroy()
  })

  it('actualiza el estado de una nota con updateNoteStatus', () => {
    const crdt = new TeamNotesCRDT('notes-1')
    crdt.initializeFromCollection(createSampleCollection())

    crdt.updateNoteStatus('note-1', 'deprecated')
    const col = crdt.getNotesCollection()
    const note = col.notes.find((n) => n.id === 'note-1')

    expect(note?.status).toBe('deprecated')
    crdt.destroy()
  })

  it('actualiza la categoría de una nota con updateNoteCategory', () => {
    const crdt = new TeamNotesCRDT('notes-1')
    crdt.initializeFromCollection(createSampleCollection())

    crdt.updateNoteCategory('note-1', 'general')
    const col = crdt.getNotesCollection()
    const note = col.notes.find((n) => n.id === 'note-1')

    expect(note?.category).toBe('general')
    crdt.destroy()
  })

  it('elimina notas con deleteNote', () => {
    const crdt = new TeamNotesCRDT('notes-1')
    crdt.initializeFromCollection(createSampleCollection())

    crdt.deleteNote('note-1')
    const col = crdt.getNotesCollection()

    expect(col.notes).toHaveLength(0)
    crdt.destroy()
  })

  it('notifica a los suscriptores exactamente una vez por transacción', () => {
    const crdt = new TeamNotesCRDT('notes-1')
    crdt.initializeFromCollection(createSampleCollection())

    const listener = vi.fn()
    const unsubscribe = crdt.subscribe(listener)

    crdt.updateNoteStatus('note-1', 'proposed')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    crdt.updateNoteStatus('note-1', 'accepted')
    expect(listener).toHaveBeenCalledTimes(1)
    crdt.destroy()
  })

  it('sincroniza en tiempo real de forma determinista entre dos clientes independientes', () => {
    const clientA = new TeamNotesCRDT('notes-1')
    const clientB = new TeamNotesCRDT('notes-1')

    clientA.initializeFromCollection(createSampleCollection())

    // Enviar estado de A a B
    const updateFromA = clientA.encodeStateAsUpdate()
    clientB.applyUpdate(updateFromA)

    expect(clientB.getNotesCollection().notes).toHaveLength(1)

    // B añade una nota
    clientB.upsertNote({
      id: 'note-b',
      title: 'Minuta de Reunión',
      content: 'Puntos clave acordados.',
      category: 'meeting',
      status: 'draft',
      tags: ['meeting'],
      createdAt: 3000,
      updatedAt: 3000
    })

    // A actualiza note-1
    clientA.updateNoteStatus('note-1', 'accepted')

    // Intercambiar deltas
    const updateBtoA = clientB.encodeStateAsUpdate()
    const updateAtoB = clientA.encodeStateAsUpdate()

    clientA.applyUpdate(updateBtoA)
    clientB.applyUpdate(updateAtoB)

    // Ambos clientes deben converger
    const notesA = clientA.getNotesCollection().notes
    const notesB = clientB.getNotesCollection().notes

    expect(notesA).toHaveLength(2)
    expect(notesB).toHaveLength(2)
    expect(notesA).toEqual(notesB)

    clientA.destroy()
    clientB.destroy()
  })
})
