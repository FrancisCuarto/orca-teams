import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type {
  TeamKanbanBoard,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamBoardCRDT } from '../../../../../shared/teamwork/realtime/team-crdt-board'
import { TeamRoomProvider } from '../../../../../shared/teamwork/realtime/team-room-provider'
import { TeamWebSocketTransport } from '../../../../../shared/teamwork/realtime/team-ws-transport'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'

export type SyncStatus = 'connected' | 'syncing' | 'offline'

export type UseTeamKanbanSyncOptions = {
  boardId: string
  projectId: string
  currentUser: {
    userId: string
    displayName: string
    avatarUrl?: string
    color?: string
  }
  relayUrl?: string | null
  syncToken?: string
  initialBoard?: TeamKanbanBoard | null
  onPersist?: (board: TeamKanbanBoard) => void
  onPeersChange?: (peers: CollaboratorPresence[]) => void
}

export type UseTeamKanbanSyncReturn = {
  board: TeamKanbanBoard | null
  presences: CollaboratorPresence[]
  peers: CollaboratorPresence[]
  syncStatus: SyncStatus
  upsertCard: (card: TeamKanbanCard) => void
  moveCard: (cardId: string, targetColId: string, newPosition?: number) => void
  deleteCard: (cardId: string) => void
  syncBoard: (board: TeamKanbanBoard) => void
  updateActiveCard: (cardId?: string) => void
}

export function useTeamKanbanSync({
  boardId,
  projectId,
  currentUser,
  relayUrl,
  syncToken,
  initialBoard,
  onPersist,
  onPeersChange
}: UseTeamKanbanSyncOptions): UseTeamKanbanSyncReturn {
  const [board, setBoard] = useState<TeamKanbanBoard | null>(initialBoard ?? null)
  const [presences, setPresences] = useState<CollaboratorPresence[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')

  const crdtRef = useRef<TeamBoardCRDT | null>(null)
  const roomProviderRef = useRef<TeamRoomProvider | null>(null)
  const activeCardIdRef = useRef<string | undefined>(undefined)
  const initialBoardRef = useRef(initialBoard)
  initialBoardRef.current = initialBoard
  const onPersistRef = useRef(onPersist)
  onPersistRef.current = onPersist
  const onPeersChangeRef = useRef(onPeersChange)
  onPeersChangeRef.current = onPeersChange

  useEffect(() => {
    const roomId = `project:${projectId}:board:${boardId}`
    const crdt = new TeamBoardCRDT(boardId)
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

    if (initialBoardRef.current) {
      crdt.initializeFromBoard(initialBoardRef.current)
    }

    setBoard(crdt.getBoard())

    const unsubscribeStatus = room.onStatusChange((nextStatus) => {
      setSyncStatus(nextStatus)
    })

    room.updatePresence({
      userId: currentUser.userId,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl,
      color: currentUser.color ?? '#3b82f6',
      activeCardId: activeCardIdRef.current
    })

    const unsubscribeBoard = crdt.subscribe((updatedBoard) => {
      setBoard(updatedBoard)
      if (onPersistRef.current) {
        onPersistRef.current(updatedBoard)
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
        color: currentUser.color ?? '#3b82f6',
        activeCardId: activeCardIdRef.current
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
    boardId,
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

  const upsertCard = useCallback((card: TeamKanbanCard) => {
    crdtRef.current?.upsertCard(card)
  }, [])

  const moveCard = useCallback((cardId: string, targetColId: string, newPosition?: number) => {
    crdtRef.current?.moveCard(cardId, targetColId, newPosition)
  }, [])

  const deleteCard = useCallback((cardId: string) => {
    crdtRef.current?.deleteCard(cardId)
  }, [])

  const syncBoard = useCallback((nextBoard: TeamKanbanBoard) => {
    crdtRef.current?.syncFromBoard(nextBoard)
  }, [])

  const updateActiveCard = useCallback(
    (cardId?: string) => {
      activeCardIdRef.current = cardId
      roomProviderRef.current?.updatePresence({
        userId: currentUser.userId,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
        color: currentUser.color ?? '#3b82f6',
        activeCardId: cardId
      })
    },
    [currentUser.userId, currentUser.displayName, currentUser.avatarUrl, currentUser.color]
  )

  return {
    board,
    presences,
    peers,
    syncStatus,
    upsertCard,
    moveCard,
    deleteCard,
    syncBoard,
    updateActiveCard
  }
}
