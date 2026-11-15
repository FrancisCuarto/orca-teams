// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTeamNotesSync } from './use-team-notes-sync'
import type {
  TeamNote,
  TeamNotesCollection
} from '../../../../../shared/teamwork/team-kanban-types'

function createTestCollection(): TeamNotesCollection {
  return {
    projectId: 'proj-sync-notes',
    notes: [
      {
        id: 'note-1',
        title: 'ADR 001',
        content: '# Contenido 1',
        category: 'adr',
        status: 'accepted',
        author: 'Francis',
        tags: ['adr'],
        createdAt: 1000,
        updatedAt: 1000
      }
    ],
    updatedAt: 1000
  }
}

describe('useTeamNotesSync', () => {
  it('inicializa con la colección inicial y estado conectado', () => {
    const initialNotes = createTestCollection()
    const onPersist = vi.fn()

    const { result } = renderHook(() =>
      useTeamNotesSync({
        projectId: 'proj-sync-notes',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialNotes,
        onPersist
      })
    )

    expect(result.current.syncStatus).toBe('connected')
    expect(result.current.notesCollection?.notes).toHaveLength(1)
    expect(result.current.notesCollection?.notes[0]?.title).toBe('ADR 001')
    expect(result.current.presences).toHaveLength(1)
    expect(result.current.presences[0]?.userId).toBe('user-1')
    expect(result.current.peers).toEqual([])
  })

  it('permite añadir notas con upsertNote y llama a onPersist', () => {
    const initialNotes = createTestCollection()
    const onPersist = vi.fn()

    const { result } = renderHook(() =>
      useTeamNotesSync({
        projectId: 'proj-sync-notes',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialNotes,
        onPersist
      })
    )

    const newNote: TeamNote = {
      id: 'note-2',
      title: 'Minuta de Planificación',
      content: 'Temas tratados.',
      category: 'meeting',
      status: 'draft',
      tags: [],
      createdAt: 2000,
      updatedAt: 2000
    }

    act(() => {
      result.current.upsertNote(newNote)
    })

    expect(result.current.notesCollection?.notes).toHaveLength(2)
    expect(onPersist).toHaveBeenCalled()
  })

  it('permite actualizar el estado y categoría de una nota', () => {
    const initialNotes = createTestCollection()

    const { result } = renderHook(() =>
      useTeamNotesSync({
        projectId: 'proj-sync-notes',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialNotes
      })
    )

    act(() => {
      result.current.updateNoteStatus('note-1', 'deprecated')
      result.current.updateNoteCategory('note-1', 'spec')
    })

    const note = result.current.notesCollection?.notes.find((n) => n.id === 'note-1')
    expect(note?.status).toBe('deprecated')
    expect(note?.category).toBe('spec')
  })

  it('permite actualizar activeNoteId y propaga la presencia', () => {
    const initialNotes = createTestCollection()

    const { result } = renderHook(() =>
      useTeamNotesSync({
        projectId: 'proj-sync-notes',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialNotes
      })
    )

    act(() => {
      result.current.setActiveNoteId('note-1')
    })

    expect(result.current.activeNoteId).toBe('note-1')
  })

  it('permite eliminar una nota con deleteNote', () => {
    const initialNotes = createTestCollection()

    const { result } = renderHook(() =>
      useTeamNotesSync({
        projectId: 'proj-sync-notes',
        currentUser: { userId: 'user-1', displayName: 'Francis' },
        initialNotes
      })
    )

    act(() => {
      result.current.deleteNote('note-1')
    })

    expect(result.current.notesCollection?.notes).toHaveLength(0)
  })
})
