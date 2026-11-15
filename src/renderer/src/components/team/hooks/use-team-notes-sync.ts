import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type {
  TeamNote,
  TeamNoteCategory,
  TeamNoteStatus,
  TeamNotesCollection
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamNotesCRDT } from '../../../../../shared/teamwork/realtime/team-crdt-notes'
import { TeamRoomProvider } from '../../../../../shared/teamwork/realtime/team-room-provider'
import { TeamWebSocketTransport } from '../../../../../shared/teamwork/realtime/team-ws-transport'
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
  relayUrl?: string | null
  syncToken?: string
  initialNotes?: TeamNotesCollection | null
  onPersist?: (collection: TeamNotesCollection) => void
  onPeersChange?: (peers: CollaboratorPresence[]) => void
}

export type UseTeamNotesSyncReturn = {
  notesCollection: TeamNotesCollection | null
  syncStatus: SyncStatus
  presences: CollaboratorPresence[]
  peers: CollaboratorPresence[]
  activeNoteId: string | null
  setActiveNoteId: (noteId: string | null) => void
  upsertNote: (note: TeamNote) => void
  deleteNote: (noteId: string) => void
  updateNoteStatus: (noteId: string, status?: TeamNoteStatus) => void
  updateNoteCategory: (noteId: string, category: TeamNoteCategory) => void
  syncNotesCollection: (collection: TeamNotesCollection) => void
}

export function useTeamNotesSync({
  projectId,
  currentUser,
  relayUrl,
  syncToken,
  initialNotes,
  onPersist,
  onPeersChange
}: UseTeamNotesSyncOptions): UseTeamNotesSyncReturn {
  const initialFirstNoteId = initialNotes?.notes[0]?.id ?? null
  const [notesCollection, setNotesCollection] = useState<TeamNotesCollection | null>(
    initialNotes ?? null
  )
  const [presences, setPresences] = useState<CollaboratorPresence[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')
  const [activeNoteId, setActiveNoteIdState] = useState<string | null>(initialFirstNoteId)

  const crdtRef = useRef<TeamNotesCRDT | null>(null)
  const roomProviderRef = useRef<TeamRoomProvider | null>(null)
  const activeNoteIdRef = useRef<string | null>(initialFirstNoteId)
  const initialNotesRef = useRef(initialNotes)
  initialNotesRef.current = initialNotes
  const onPersistRef = useRef(onPersist)
  onPersistRef.current = onPersist
  const onPeersChangeRef = useRef(onPeersChange)
  onPeersChangeRef.current = onPeersChange

  useEffect(() => {
    const roomId = `project:${projectId}:notes:collection`
    const crdt = new TeamNotesCRDT(projectId)
    const transport = relayUrl?.trim()
      ? new TeamWebSocketTransport({
          url: relayUrl.trim(),
          roomId,
          userId: currentUser.userId,
          token: syncToken
        })
      : undefined
    const room = new TeamRoomProvider(roomId, crdt, currentUser.userId, transport)

    crdtRef.current = crdt
    roomProviderRef.current = room

    if (initialNotesRef.current) {
      crdt.initializeFromCollection(initialNotesRef.current)
    }

    setNotesCollection(crdt.getNotesCollection())

    const unsubscribeStatus = room.onStatusChange((nextStatus) => {
      setSyncStatus(nextStatus)
    })

    room.updatePresence({
      userId: currentUser.userId,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl,
      color: currentUser.color ?? '#8b5cf6',
      activeNoteId: activeNoteIdRef.current ?? undefined
    })

    const unsubscribeNotes = crdt.subscribe((updated) => {
      setNotesCollection(updated)
      if (onPersistRef.current) {
        onPersistRef.current(updated)
      }
    })

    const unsubscribePresence = room.onPresenceChange((activePresences) => {
      setPresences(activePresences)
      if (onPeersChangeRef.current) {
        onPeersChangeRef.current(
          activePresences.filter((p) => p.userId !== currentUser.userId)
        )
      }
    })

    const presenceInterval = setInterval(() => {
      room.cleanStalePresences()
      room.updatePresence({
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
        color: currentUser.color ?? '#8b5cf6',
        activeNoteId: activeNoteIdRef.current ?? undefined
      })
    }, 15000)

    return () => {
      clearInterval(presenceInterval)
      unsubscribeStatus()
      unsubscribeNotes()
      unsubscribePresence()
      onPeersChangeRef.current?.([])
      room.destroy()
      crdt.destroy()
      crdtRef.current = null
      roomProviderRef.current = null
    }
  }, [
    projectId,
    relayUrl,
    syncToken,
    currentUser.userId,
    currentUser.displayName,
    currentUser.avatarUrl,
    currentUser.color
  ])

  const peers = useMemo(
    () => presences.filter((p) => p.userId !== currentUser.userId),
    [presences, currentUser.userId]
  )

  const setActiveNoteId = useCallback(
    (noteId: string | null) => {
      activeNoteIdRef.current = noteId
      setActiveNoteIdState(noteId)
      roomProviderRef.current?.updatePresence({
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
        color: currentUser.color ?? '#8b5cf6',
        activeNoteId: noteId ?? undefined
      })
    },
    [currentUser.userId, currentUser.displayName, currentUser.avatarUrl, currentUser.color]
  )

  const upsertNote = useCallback((note: TeamNote) => {
    crdtRef.current?.upsertNote(note)
  }, [])

  const deleteNote = useCallback((noteId: string) => {
    crdtRef.current?.deleteNote(noteId)
  }, [])

  const updateNoteStatus = useCallback((noteId: string, status?: TeamNoteStatus) => {
    crdtRef.current?.updateNoteStatus(noteId, status)
  }, [])

  const updateNoteCategory = useCallback((noteId: string, category: TeamNoteCategory) => {
    crdtRef.current?.updateNoteCategory(noteId, category)
  }, [])

  const syncNotesCollection = useCallback((collection: TeamNotesCollection) => {
    crdtRef.current?.syncFromCollection(collection)
  }, [])

  return {
    notesCollection,
    syncStatus,
    presences,
    peers,
    activeNoteId,
    setActiveNoteId,
    upsertNote,
    deleteNote,
    updateNoteStatus,
    updateNoteCategory,
    syncNotesCollection
  }
}
