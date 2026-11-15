import React from 'react'
import type { TeamWhiteboard } from '../../../../../shared/teamwork/team-kanban-types'
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
  relayUrl?: string | null
  syncToken?: string
  onPersist?: (wb: TeamWhiteboard) => void
  onPeersChange?: (peers: CollaboratorPresence[]) => void
  onCreateTask?: (item: TeamWhiteboard['items'][number]) => void
}

export function TeamWhiteboardConnectedView({
  whiteboardId,
  projectId,
  initialWhiteboard,
  currentUser,
  relayUrl,
  syncToken,
  onPersist,
  onPeersChange,
  onCreateTask
}: Props): React.JSX.Element {
  const { whiteboard, peers, remoteCursors, syncWhiteboard, broadcastCursor } =
    useTeamWhiteboardSync({
      whiteboardId,
      projectId,
      initialWhiteboard,
      currentUser,
      relayUrl,
      syncToken,
      onPersist,
      onPeersChange
    })

  return (
    <TeamWhiteboardView
      whiteboard={whiteboard ?? initialWhiteboard}
      peers={peers}
      remoteCursors={remoteCursors}
      onCursorMove={broadcastCursor}
      onChange={(updated) => {
        syncWhiteboard(updated)
      }}
      onCreateTask={onCreateTask}
    />
  )
}
