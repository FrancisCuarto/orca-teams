import { useState, useEffect, useRef, useCallback } from 'react'
import type {
  TeamNote,
  TeamNoteCategory,
  TeamNoteStatus,
  TeamNotesCollection
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamNotesCRDT } from '../../../../../shared/teamwork/realtime/team-crdt-notes'
import { TeamRoomProvider } from '../../../../../shared/teamwork/realtime/team-room-provider'
import type { SyncStatus } from './use-team-kanban-sync'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'

export type UseTeamNotesSyncOptions = {
  projectId: string
  currentUser: {
    userId: string
    displayName: string
    avatarUrl?: string
    color?: string
  }
  initialNotes?: TeamNotesCollection | null
  onPersist?: (collection: TeamNotesCollection) => void
}

export type UseTeamNotesSyncReturn = {
  notesCollection: TeamNotesCollection | null
  syncStatus: SyncStatus
  presences: CollaboratorPresence[]
  activeNoteId: string | null
  setActiveNoteId: (noteId: string | null) => void
  upsertNote: (note: TeamNote) => void
  deleteNote: (noteId: string) => void
  updateNoteStatus: (noteId: string, status?: TeamNoteStatus) => void
  updateNoteCategory: (noteId: string, category: TeamNoteCategory) => void
}

export function useTeamNotesSync({
  projectId,
  currentUser,
  initialNotes,
  onPersist
}: UseTeamNotesSyncOptions): UseTeamNotesSyncReturn {
  const [notesCollection, setNotesCollection] = useState<TeamNotesCollection | null>(
    initialNotes ?? null
  )
  const [presences, setPresences] = useState<CollaboratorPresence[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')
  const [activeNoteId, setActiveNoteIdState] = useState<string | null>(null)

  const crdtRef = useRef<TeamNotesCRDT | null>(null)
  const roomProviderRef = useRef<TeamRoomProvider | null>(null)
  const onPersistRef = useRef(onPersist)
  onPersistRef.current = onPersist

  useEffect(() => {
    const roomId = `project:${projectId}:notes:collection`
    const crdt = new TeamNotesCRDT(projectId)
    // TeamRoomProvider soporta cualquier CRDT con encodeStateAsUpdate y applyUpdate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const room = new TeamRoomProvider(roomId, crdt as any, currentUser.userId)

    crdtRef.current = crdt
    roomProviderRef.current = room

    if (initialNotes) {
      crdt.initializeFromCollection(initialNotes)
    }

    setNotesCollection(crdt.getNotesCollection())
    setSyncStatus('connected')

    room.updatePresence({
      userId: currentUser.userId,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl,
      color: currentUser.color ?? '#8b5cf6'
    })

    const unsubscribeNotes = crdt.subscribe((updated) => {
      setNotesCollection(updated)
      if (onPersistRef.current) {
        onPersistRef.current(updated)
      }
    })

    const unsubscribePresence = room.onPresenceChange((activePresences) => {
      setPresences(activePresences)
    })

    const presenceInterval = setInterval(() => {
      room.cleanStalePresences()
    }, 15000)

    return () => {
      clearInterval(presenceInterval)
      unsubscribeNotes()
      unsubscribePresence()
      room.destroy()
      crdt.destroy()
      crdtRef.current = null
      roomProviderRef.current = null
    }
  }, [
    projectId,
    currentUser.userId,
    currentUser.displayName,
    currentUser.avatarUrl,
    currentUser.color,
    initialNotes
  ])

  const setActiveNoteId = useCallback(
    (noteId: string | null) => {
      setActiveNoteIdState(noteId)
      if (roomProviderRef.current) {
        roomProviderRef.current.updatePresence({
          userId: currentUser.userId,
          displayName: currentUser.displayName,
          avatarUrl: currentUser.avatarUrl,
          color: currentUser.color ?? '#8b5cf6',
          activeNoteId: noteId ?? undefined
        })
      }
    },
    [currentUser.userId, currentUser.displayName, currentUser.avatarUrl, currentUser.color]
  )

  const upsertNote = useCallback((note: TeamNote) => {
    if (crdtRef.current) {
      crdtRef.current.upsertNote(note)
    }
  }, [])

  const deleteNote = useCallback((noteId: string) => {
    if (crdtRef.current) {
      crdtRef.current.deleteNote(noteId)
    }
  }, [])

  const updateNoteStatus = useCallback((noteId: string, status?: TeamNoteStatus) => {
    if (crdtRef.current) {
      crdtRef.current.updateNoteStatus(noteId, status)
    }
  }, [])

  const updateNoteCategory = useCallback((noteId: string, category: TeamNoteCategory) => {
    if (crdtRef.current) {
      crdtRef.current.updateNoteCategory(noteId, category)
    }
  }, [])

  return {
    notesCollection,
    syncStatus,
    presences,
    activeNoteId,
    setActiveNoteId,
    upsertNote,
    deleteNote,
    updateNoteStatus,
    updateNoteCategory
  }
}
