import React, { useMemo } from 'react'
import type {
  ExtendedTeamMember,
  TeamKanbanBoard
} from '../../../../../shared/teamwork/team-kanban-types'
import { useTeamKanbanSync } from '../hooks/use-team-kanban-sync'
import { TeamBoardPresenceBar } from './TeamBoardPresenceBar'
import { TeamKanbanBoardView } from './TeamKanbanBoardView'

type Props = {
  projectId: string
  projectPath?: string | null
  initialBoard: TeamKanbanBoard
  currentUser: {
    userId: string
    displayName: string
    avatarUrl?: string
    color?: string
  }
  humanMembers?: ExtendedTeamMember[]
  relayUrl?: string | null
  syncToken?: string
  onPersist?: (updatedBoard: TeamKanbanBoard) => void
}

export function TeamKanbanConnectedView({
  projectId,
  projectPath,
  initialBoard,
  currentUser,
  humanMembers,
  relayUrl,
  syncToken,
  onPersist
}: Props): React.JSX.Element {
  const { board, presences, syncStatus, syncBoard } = useTeamKanbanSync({
    boardId: initialBoard.id,
    projectId,
    currentUser,
    relayUrl,
    syncToken,
    initialBoard,
    onPersist
  })

  const activeBoard = board ?? initialBoard
  const activeCardsCount = useMemo(() => {
    const ids = new Set<string>()
    for (const p of presences) {
      if (p.activeCardId) {
        ids.add(p.activeCardId)
      }
    }
    return ids.size
  }, [presences])

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <TeamBoardPresenceBar
        presences={presences}
        syncStatus={syncStatus}
        activeCardsCount={activeCardsCount}
      />
      <TeamKanbanBoardView
        board={activeBoard}
        projectId={projectId}
        projectPath={projectPath}
        currentUserId={currentUser.userId}
        currentUserName={currentUser.displayName}
        humanMembers={humanMembers}
        onChange={syncBoard}
      />
    </div>
  )
}
