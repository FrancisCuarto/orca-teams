import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type {
  TeamWhiteboard,
  TeamWhiteboardItem
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamWhiteboardCRDT } from '../../../../../shared/teamwork/realtime/team-crdt-whiteboard'
import { TeamRoomProvider } from '../../../../../shared/teamwork/realtime/team-room-provider'
import { TeamWebSocketTransport } from '../../../../../shared/teamwork/realtime/team-ws-transport'
import type { SyncStatus } from './use-team-kanban-sync'
import type {
  CollaboratorPresence,
  WhiteboardCursorPresence
} from '../../../../../shared/teamwork/realtime/team-crdt-types'

export type UseTeamWhiteboardSyncOptions = {
  whiteboardId: string
  projectId: string
  currentUser: {
    userId: string
    displayName: string
    avatarUrl?: string
    color?: string
  }
  relayUrl?: string | null
  syncToken?: string
  initialWhiteboard?: TeamWhiteboard | null
  onPersist?: (whiteboard: TeamWhiteboard) => void
  onPeersChange?: (peers: CollaboratorPresence[]) => void
}

export type UseTeamWhiteboardSyncReturn = {
  whiteboard: TeamWhiteboard | null
  syncStatus: SyncStatus
  presences: CollaboratorPresence[]
  peers: CollaboratorPresence[]
  remoteCursors: WhiteboardCursorPresence[]
  upsertItem: (item: TeamWhiteboardItem) => void
  moveItem: (itemId: string, x: number, y: number) => void
  updateItemContent: (itemId: string, content: string) => void
  deleteItem: (itemId: string) => void
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void
  syncWhiteboard: (whiteboard: TeamWhiteboard) => void
  broadcastCursor: (x: number, y: number) => void
}

const CURSOR_BROADCAST_THROTTLE_MS = 50

export function useTeamWhiteboardSync({
  whiteboardId,
  projectId,
  currentUser,
  relayUrl,
  syncToken,
  initialWhiteboard,
  onPersist,
  onPeersChange
}: UseTeamWhiteboardSyncOptions): UseTeamWhiteboardSyncReturn {
  const [whiteboard, setWhiteboard] = useState<TeamWhiteboard | null>(initialWhiteboard ?? null)
  const [presences, setPresences] = useState<CollaboratorPresence[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')

  const crdtRef = useRef<TeamWhiteboardCRDT | null>(null)
  const roomProviderRef = useRef<TeamRoomProvider | null>(null)
  const lastCursorBroadcastRef = useRef<number>(0)
  const lastCursorRef = useRef<{ x: number; y: number } | undefined>(undefined)
  const initialWhiteboardRef = useRef(initialWhiteboard)
  initialWhiteboardRef.current = initialWhiteboard
  const onPersistRef = useRef(onPersist)
  onPersistRef.current = onPersist
  const onPeersChangeRef = useRef(onPeersChange)
  onPeersChangeRef.current = onPeersChange

  useEffect(() => {
    const roomId = `project:${projectId}:whiteboard:${whiteboardId}`
    const crdt = new TeamWhiteboardCRDT(whiteboardId)
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

    if (initialWhiteboardRef.current) {
      crdt.initializeFromWhiteboard(initialWhiteboardRef.current)
    }

    setWhiteboard(crdt.getWhiteboard())

    const unsubscribeStatus = room.onStatusChange((nextStatus) => {
      setSyncStatus(nextStatus)
    })

    room.updatePresence({
      userId: currentUser.userId,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl,
      color: currentUser.color ?? '#10b981',
      cursor: lastCursorRef.current
    })

    const unsubscribeBoard = crdt.subscribe((updated) => {
      setWhiteboard(updated)
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
        color: currentUser.color ?? '#10b981',
        cursor: lastCursorRef.current
      })
    }, 15000)

    return () => {
      clearInterval(presenceInterval)
      unsubscribeStatus()
      unsubscribeBoard()
      unsubscribePresence()
      onPeersChangeRef.current?.([])
      room.destroy()
      crdt.destroy()
      crdtRef.current = null
      roomProviderRef.current = null
    }
  }, [
    whiteboardId,
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

  const remoteCursors = useMemo<WhiteboardCursorPresence[]>(() => {
    const result: WhiteboardCursorPresence[] = []
    for (const peer of peers) {
      if (peer.cursor) {
        result.push({
          userId: peer.userId,
          displayName: peer.displayName,
          color: peer.color,
          x: peer.cursor.x,
          y: peer.cursor.y,
          lastSeen: peer.lastSeen
        })
      }
    }
    return result
  }, [peers])

  const upsertItem = useCallback((item: TeamWhiteboardItem) => {
    crdtRef.current?.upsertItem(item)
  }, [])

  const moveItem = useCallback((itemId: string, x: number, y: number) => {
    crdtRef.current?.moveItem(itemId, x, y)
  }, [])

  const updateItemContent = useCallback((itemId: string, content: string) => {
    crdtRef.current?.updateItemContent(itemId, content)
  }, [])

  const deleteItem = useCallback((itemId: string) => {
    crdtRef.current?.deleteItem(itemId)
  }, [])

  const setViewport = useCallback((viewport: { x: number; y: number; zoom: number }) => {
    crdtRef.current?.setViewport(viewport)
  }, [])

  const syncWhiteboard = useCallback((nextWhiteboard: TeamWhiteboard) => {
    crdtRef.current?.syncFromWhiteboard(nextWhiteboard)
  }, [])

  const broadcastCursor = useCallback(
    (x: number, y: number) => {
      const now = Date.now()
      if (now - lastCursorBroadcastRef.current < CURSOR_BROADCAST_THROTTLE_MS) {
        return
      }
      lastCursorBroadcastRef.current = now
      lastCursorRef.current = { x, y }

      roomProviderRef.current?.updatePresence({
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
        color: currentUser.color ?? '#10b981',
        cursor: { x, y }
      })
    },
    [currentUser.userId, currentUser.displayName, currentUser.avatarUrl, currentUser.color]
  )

  return {
    whiteboard,
    syncStatus,
    presences,
    peers,
    remoteCursors,
    upsertItem,
    moveItem,
    updateItemContent,
    deleteItem,
    setViewport,
    syncWhiteboard,
    broadcastCursor
  }
}
