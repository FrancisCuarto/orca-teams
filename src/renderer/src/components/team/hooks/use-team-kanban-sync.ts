import { useState, useEffect, useRef, useCallback } from 'react'
import type {
  TeamKanbanBoard,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamBoardCRDT } from '../../../../../shared/teamwork/realtime/team-crdt-board'
import { TeamRoomProvider } from '../../../../../shared/teamwork/realtime/team-room-provider'
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
  initialBoard?: TeamKanbanBoard | null
  onPersist?: (board: TeamKanbanBoard) => void
}

export type UseTeamKanbanSyncReturn = {
  board: TeamKanbanBoard | null
  presences: CollaboratorPresence[]
  syncStatus: SyncStatus
  upsertCard: (card: TeamKanbanCard) => void
  moveCard: (cardId: string, targetColId: string, newPosition?: number) => void
  deleteCard: (cardId: string) => void
  updateActiveCard: (cardId?: string) => void
}

export function useTeamKanbanSync({
  boardId,
  projectId,
  currentUser,
  initialBoard,
  onPersist
}: UseTeamKanbanSyncOptions): UseTeamKanbanSyncReturn {
  const [board, setBoard] = useState<TeamKanbanBoard | null>(initialBoard ?? null)
  const [presences, setPresences] = useState<CollaboratorPresence[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('syncing')

  const crdtRef = useRef<TeamBoardCRDT | null>(null)
  const roomProviderRef = useRef<TeamRoomProvider | null>(null)
  const onPersistRef = useRef(onPersist)
  onPersistRef.current = onPersist

  useEffect(() => {
    const roomId = `project:${projectId}:board:${boardId}`
    const crdt = new TeamBoardCRDT(boardId)
    const room = new TeamRoomProvider(roomId, crdt, currentUser.userId)

    crdtRef.current = crdt
    roomProviderRef.current = room

    if (initialBoard) {
      crdt.initializeFromBoard(initialBoard)
    }

    setBoard(crdt.getBoard())
    setSyncStatus('connected')

    room.updatePresence({
      userId: currentUser.userId,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl,
      color: currentUser.color ?? '#3b82f6'
    })

    const unsubscribeBoard = crdt.subscribe((updatedBoard) => {
      setBoard(updatedBoard)
      if (onPersistRef.current) {
        onPersistRef.current(updatedBoard)
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
      unsubscribeBoard()
      unsubscribePresence()
      room.destroy()
      crdt.destroy()
      crdtRef.current = null
      roomProviderRef.current = null
    }
  }, [
    boardId,
    projectId,
    currentUser.userId,
    currentUser.displayName,
    currentUser.avatarUrl,
    currentUser.color,
    initialBoard
  ])

  const upsertCard = useCallback((card: TeamKanbanCard) => {
    if (crdtRef.current) {
      crdtRef.current.upsertCard(card)
    }
  }, [])

  const moveCard = useCallback((cardId: string, targetColId: string, newPosition?: number) => {
    if (crdtRef.current) {
      crdtRef.current.moveCard(cardId, targetColId, newPosition)
    }
  }, [])

  const deleteCard = useCallback((cardId: string) => {
    if (crdtRef.current) {
      crdtRef.current.deleteCard(cardId)
    }
  }, [])

  const updateActiveCard = useCallback(
    (cardId?: string) => {
      if (roomProviderRef.current) {
        roomProviderRef.current.updatePresence({
          userId: currentUser.userId,
          displayName: currentUser.displayName,
          avatarUrl: currentUser.avatarUrl,
          color: currentUser.color ?? '#3b82f6',
          activeCardId: cardId
        })
      }
    },
    [currentUser.userId, currentUser.displayName, currentUser.avatarUrl, currentUser.color]
  )

  return {
    board,
    presences,
    syncStatus,
    upsertCard,
    moveCard,
    deleteCard,
    updateActiveCard
  }
}
