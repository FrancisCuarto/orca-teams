import { useState, useEffect, useRef, useCallback } from 'react'
import type {
  TeamWhiteboard,
  TeamWhiteboardItem
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamWhiteboardCRDT } from '../../../../../shared/teamwork/realtime/team-crdt-whiteboard'
import { TeamRoomProvider } from '../../../../../shared/teamwork/realtime/team-room-provider'
import type { SyncStatus } from './use-team-kanban-sync'
import type { WhiteboardCursorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'

export type UseTeamWhiteboardSyncOptions = {
  whiteboardId: string
  projectId: string
  currentUser: {
    userId: string
    displayName: string
    avatarUrl?: string
    color?: string
  }
  initialWhiteboard?: TeamWhiteboard | null
  onPersist?: (whiteboard: TeamWhiteboard) => void
}

export type UseTeamWhiteboardSyncReturn = {
  whiteboard: TeamWhiteboard | null
  syncStatus: SyncStatus
  remoteCursors: WhiteboardCursorPresence[]
  upsertItem: (item: TeamWhiteboardItem) => void
  moveItem: (itemId: string, x: number, y: number) => void
  updateItemContent: (itemId: string, content: string) => void
  deleteItem: (itemId: string) => void
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void
  broadcastCursor: (x: number, y: number) => void
}

const CURSOR_BROADCAST_THROTTLE_MS = 50

export function useTeamWhiteboardSync({
  whiteboardId,
  projectId,
  currentUser,
  initialWhiteboard,
  onPersist
}: UseTeamWhiteboardSyncOptions): UseTeamWhiteboardSyncReturn {
  const [whiteboard, setWhiteboard] = useState<TeamWhiteboard | null>(initialWhiteboard ?? null)
  const [remoteCursors, setRemoteCursors] = useState<WhiteboardCursorPresence[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')

  const crdtRef = useRef<TeamWhiteboardCRDT | null>(null)
  const roomProviderRef = useRef<TeamRoomProvider | null>(null)
  const lastCursorBroadcastRef = useRef<number>(0)
  const onPersistRef = useRef(onPersist)
  onPersistRef.current = onPersist

  useEffect(() => {
    const roomId = `project:${projectId}:whiteboard:${whiteboardId}`
    const crdt = new TeamWhiteboardCRDT(whiteboardId)
    // TeamRoomProvider espera ITeamBoardCRDT pero solo requiere encodeStateAsUpdate y applyUpdate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const room = new TeamRoomProvider(roomId, crdt as any, currentUser.userId)

    crdtRef.current = crdt
    roomProviderRef.current = room

    if (initialWhiteboard) {
      crdt.initializeFromWhiteboard(initialWhiteboard)
    }

    setWhiteboard(crdt.getWhiteboard())
    setSyncStatus('connected')

    room.updatePresence({
      userId: currentUser.userId,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl,
      color: currentUser.color ?? '#10b981'
    })

    const unsubscribeBoard = crdt.subscribe((updated) => {
      setWhiteboard(updated)
      if (onPersistRef.current) {
        onPersistRef.current(updated)
      }
    })

    const unsubscribePresence = room.onPresenceChange((activePresences) => {
      const others = activePresences
        .filter((p) => p.userId !== currentUser.userId && p.cursor !== undefined)
        .map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
          color: p.color,
          x: p.cursor?.x ?? 0,
          y: p.cursor?.y ?? 0,
          lastSeen: p.lastSeen
        }))
      setRemoteCursors(others)
    })

    const presenceInterval = setInterval(() => {
      room.cleanStalePresences()
    }, 15000)

    return () => {
      clearInterval(presenceInterval)
      unsubscribeBoard()
      unsubscribePresence()
      room.destroy()
      crdt.destroy()
      crdtRef.current = null
      roomProviderRef.current = null
    }
  }, [
    whiteboardId,
    projectId,
    currentUser.userId,
    currentUser.displayName,
    currentUser.avatarUrl,
    currentUser.color,
    initialWhiteboard
  ])

  const upsertItem = useCallback((item: TeamWhiteboardItem) => {
    if (crdtRef.current) {
      crdtRef.current.upsertItem(item)
    }
  }, [])

  const moveItem = useCallback((itemId: string, x: number, y: number) => {
    if (crdtRef.current) {
      crdtRef.current.moveItem(itemId, x, y)
    }
  }, [])

  const updateItemContent = useCallback((itemId: string, content: string) => {
    if (crdtRef.current) {
      crdtRef.current.updateItemContent(itemId, content)
    }
  }, [])

  const deleteItem = useCallback((itemId: string) => {
    if (crdtRef.current) {
      crdtRef.current.deleteItem(itemId)
    }
  }, [])

  const setViewport = useCallback((viewport: { x: number; y: number; zoom: number }) => {
    if (crdtRef.current) {
      crdtRef.current.setViewport(viewport)
    }
  }, [])

  const broadcastCursor = useCallback(
    (x: number, y: number) => {
      const now = Date.now()
      if (now - lastCursorBroadcastRef.current < CURSOR_BROADCAST_THROTTLE_MS) {
        return
      }
      lastCursorBroadcastRef.current = now

      if (roomProviderRef.current) {
        roomProviderRef.current.updatePresence({
          userId: currentUser.userId,
          displayName: currentUser.displayName,
          avatarUrl: currentUser.avatarUrl,
          color: currentUser.color ?? '#10b981',
          cursor: { x, y }
        })
      }
    },
    [currentUser.userId, currentUser.displayName, currentUser.avatarUrl, currentUser.color]
  )

  return {
    whiteboard,
    syncStatus,
    remoteCursors,
    upsertItem,
    moveItem,
    updateItemContent,
    deleteItem,
    setViewport,
    broadcastCursor
  }
}
