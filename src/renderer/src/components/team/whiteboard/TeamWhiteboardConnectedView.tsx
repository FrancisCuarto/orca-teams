import React from 'react'
import type {
  TeamWhiteboard,
  TeamWhiteboardItem
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  getTeamPermissions,
  type TeamPermissions
} from '../../../../../shared/teamwork/team-rbac-policy'
import type { TeamRole } from '../../../../../shared/teamwork/team-workspace-types'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'
import { useTeamWhiteboardSync } from '../hooks/use-team-whiteboard-sync'
import { TeamWhiteboardView } from './TeamWhiteboardView'

type Props = {
  whiteboardId: string
  projectId: string
  initialWhiteboard: TeamWhiteboard
  currentUser: {
    userId: string
    displayName: string
    avatarUrl?: string
    color?: string
  }
  userRole?: TeamRole
  permissions?: TeamPermissions
  relayUrl?: string | null
  syncToken?: string
  onPersist?: (wb: TeamWhiteboard) => void
  onPeersChange?: (peers: CollaboratorPresence[]) => void
  onCreateTask?: (item: TeamWhiteboardItem) => void
  onConvertToKanban?: (items: readonly TeamWhiteboardItem[]) => void
}

export function TeamWhiteboardConnectedView({
  whiteboardId,
  projectId,
  initialWhiteboard,
  currentUser,
  userRole = 'owner',
  permissions,
  relayUrl,
  syncToken,
  onPersist,
  onPeersChange,
  onCreateTask,
  onConvertToKanban
}: Props): React.JSX.Element {
  const resolvedPermissions = permissions ?? getTeamPermissions(userRole)
  const { whiteboard, peers, remoteCursors, syncWhiteboard, broadcastCursor } =
    useTeamWhiteboardSync({
      whiteboardId,
      projectId,
      initialWhiteboard,
      currentUser,
      relayUrl,
      syncToken,
      onPersist: resolvedPermissions.canEditWhiteboard ? onPersist : undefined,
      onPeersChange
    })

  return (
    <TeamWhiteboardView
      whiteboard={whiteboard ?? initialWhiteboard}
      peers={peers}
      remoteCursors={remoteCursors}
      readOnly={!resolvedPermissions.canEditWhiteboard}
      canCreateTask={resolvedPermissions.canEditBoard}
      onCursorMove={broadcastCursor}
      onChange={(updated) => {
        if (resolvedPermissions.canEditWhiteboard) {
          syncWhiteboard(updated)
        }
      }}
      onCreateTask={resolvedPermissions.canEditBoard ? onCreateTask : undefined}
      onConvertToKanban={resolvedPermissions.canEditBoard ? onConvertToKanban : undefined}
    />
  )
}
