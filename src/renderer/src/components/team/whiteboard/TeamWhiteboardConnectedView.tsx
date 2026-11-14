import React from 'react'
import type { TeamWhiteboard } from '../../../../../shared/teamwork/team-kanban-types'
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
  onPersist?: (wb: TeamWhiteboard) => void
}

export function TeamWhiteboardConnectedView({
  whiteboardId,
  projectId,
  initialWhiteboard,
  currentUser,
  onPersist
}: Props): React.JSX.Element {
  const { whiteboard, remoteCursors, broadcastCursor } = useTeamWhiteboardSync({
    whiteboardId,
    projectId,
    initialWhiteboard,
    currentUser,
    onPersist
  })

  return (
    <TeamWhiteboardView
      whiteboard={whiteboard ?? initialWhiteboard}
      remoteCursors={remoteCursors}
      onCursorMove={broadcastCursor}
      onChange={(updated) => {
        onPersist?.(updated)
      }}
    />
  )
}
