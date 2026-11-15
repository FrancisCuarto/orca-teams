import React, { useMemo } from 'react'
import type {
  ExtendedTeamMember,
  TeamKanbanBoard,
  TeamNote
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  getTeamPermissions,
  type TeamPermissions
} from '../../../../../shared/teamwork/team-rbac-policy'
import type { TeamRole } from '../../../../../shared/teamwork/team-workspace-types'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'
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
  userRole?: TeamRole
  permissions?: TeamPermissions
  humanMembers?: ExtendedTeamMember[]
  availableNotes?: TeamNote[]
  relayUrl?: string | null
  syncToken?: string
  onPersist?: (updatedBoard: TeamKanbanBoard) => void
  onPeersChange?: (peers: CollaboratorPresence[]) => void
}

export function TeamKanbanConnectedView({
  projectId,
  projectPath,
  initialBoard,
  currentUser,
  userRole = 'owner',
  permissions,
  humanMembers,
  availableNotes,
  relayUrl,
  syncToken,
  onPersist,
  onPeersChange
}: Props): React.JSX.Element {
  const resolvedPermissions = permissions ?? getTeamPermissions(userRole)
  const {
    board,
    presences,
    peers,
    syncStatus,
    syncBoard,
    updateActiveCard,
    addCardComment,
    deleteCardComment
  } = useTeamKanbanSync({
    boardId: initialBoard.id,
    projectId,
    currentUser,
    relayUrl,
    syncToken,
    initialBoard,
    onPersist: resolvedPermissions.canEditBoard ? onPersist : undefined,
    onPeersChange
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
        userRole={userRole}
        permissions={resolvedPermissions}
        humanMembers={humanMembers}
        peers={peers}
        availableNotes={availableNotes}
        onActiveCardChange={updateActiveCard}
        onAddCardComment={addCardComment}
        onDeleteCardComment={deleteCardComment}
        onChange={(updatedBoard) => {
          if (resolvedPermissions.canEditBoard) {
            syncBoard(updatedBoard)
          }
        }}
      />
    </div>
  )
}
