import * as Y from 'yjs'
import type {
  TeamNote,
  TeamNoteCategory,
  TeamNoteStatus,
  TeamNotesCollection
} from '../team-kanban-types'
import type { ITeamNotesCRDT } from './team-crdt-types'

export class TeamNotesCRDT implements ITeamNotesCRDT {
  public readonly doc: Y.Doc
  private readonly notesMap: Y.Map<TeamNote>
  private readonly metadataMap: Y.Map<unknown>
  private readonly changeListeners = new Set<(collection: TeamNotesCollection) => void>()
  private readonly observer: () => void

  constructor(
    public readonly docId: string,
    existingDoc?: Y.Doc
  ) {
    this.doc = existingDoc ?? new Y.Doc()
    this.notesMap = this.doc.getMap<TeamNote>('notes')
    this.metadataMap = this.doc.getMap<unknown>('metadata')

    this.observer = (): void => {
      const collection = this.getNotesCollection()
      for (const listener of this.changeListeners) {
        listener(collection)
      }
    }

    this.doc.on('afterTransaction', this.observer)
  }

  getNotesCollection(): TeamNotesCollection {
    const rawNotes = this.notesMap.toJSON() as Record<string, TeamNote>
    const notes = Object.values(rawNotes).sort((a, b) => b.updatedAt - a.updatedAt)
    const metadata = this.metadataMap.toJSON()

    const projectId = typeof metadata.projectId === 'string' ? metadata.projectId : this.docId
    const updatedAt = typeof metadata.updatedAt === 'number' ? metadata.updatedAt : Date.now()

    return {
      projectId,
      notes,
      updatedAt
    }
  }

  initializeFromCollection(collection: TeamNotesCollection): void {
    if (this.notesMap.size > 0) {
      return
    }

    this.doc.transact(() => {
      this.metadataMap.set('projectId', collection.projectId)
      this.metadataMap.set('updatedAt', collection.updatedAt)

      for (const note of collection.notes) {
        this.notesMap.set(note.id, note)
      }
    })
  }

  upsertNote(note: TeamNote): void {
    this.doc.transact(() => {
      const updatedNote: TeamNote = {
        ...note,
        updatedAt: Date.now()
      }
      this.notesMap.set(note.id, updatedNote)
      this.metadataMap.set('updatedAt', Date.now())
    })
  }

  deleteNote(noteId: string): void {
    this.doc.transact(() => {
      this.notesMap.delete(noteId)
      this.metadataMap.set('updatedAt', Date.now())
    })
  }

  updateNoteStatus(noteId: string, status?: TeamNoteStatus): void {
    this.doc.transact(() => {
      const existing = this.notesMap.get(noteId)
      if (existing) {
        this.notesMap.set(noteId, {
          ...existing,
          status,
          updatedAt: Date.now()
        })
        this.metadataMap.set('updatedAt', Date.now())
      }
    })
  }

  updateNoteCategory(noteId: string, category: TeamNoteCategory): void {
    this.doc.transact(() => {
      const existing = this.notesMap.get(noteId)
      if (existing) {
        this.notesMap.set(noteId, {
          ...existing,
          category,
          updatedAt: Date.now()
        })
        this.metadataMap.set('updatedAt', Date.now())
      }
    })
  }

  syncFromCollection(collection: TeamNotesCollection): void {
    this.doc.transact(() => {
      this.metadataMap.set('projectId', collection.projectId)
      this.metadataMap.set('updatedAt', collection.updatedAt || Date.now())
      const nextIds = new Set(collection.notes.map((n) => n.id))
      for (const existingId of Array.from(this.notesMap.keys())) {
        if (!nextIds.has(existingId)) {
          this.notesMap.delete(existingId)
        }
      }
      for (const note of collection.notes) {
        const current = this.notesMap.get(note.id)
        if (!current || JSON.stringify(current) !== JSON.stringify(note)) {
          this.notesMap.set(note.id, note)
        }
      }
    })
  }

  subscribe(listener: (collection: TeamNotesCollection) => void): () => void {
    this.changeListeners.add(listener)
    return () => {
      this.changeListeners.delete(listener)
    }
  }

  encodeStateAsUpdate(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc)
  }

  applyUpdate(update: Uint8Array, origin?: unknown): void {
    Y.applyUpdate(this.doc, update, origin)
  }

  destroy(): void {
    this.changeListeners.clear()
    this.doc.off('afterTransaction', this.observer)
    this.doc.destroy()
  }
}
