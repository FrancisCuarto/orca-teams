import React from 'react'
import type {
  TeamWhiteboard,
  TeamWhiteboardItem
} from '../../../../../shared/teamwork/team-kanban-types'
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
  onCreateTask?: (item: TeamWhiteboardItem) => void
  onConvertToKanban?: (items: readonly TeamWhiteboardItem[]) => void
}

export function TeamWhiteboardConnectedView({
  whiteboardId,
  projectId,
  initialWhiteboard,
  currentUser,
  relayUrl,
  syncToken,
  onPersist,
  onCreateTask,
  onConvertToKanban
}: Props): React.JSX.Element {
  const { whiteboard, remoteCursors, syncWhiteboard, broadcastCursor } = useTeamWhiteboardSync({
    whiteboardId,
    projectId,
    initialWhiteboard,
    currentUser,
    relayUrl,
    syncToken,
    onPersist
  })

  return (
    <TeamWhiteboardView
      whiteboard={whiteboard ?? initialWhiteboard}
      remoteCursors={remoteCursors}
      onCursorMove={broadcastCursor}
      onChange={(updated) => {
        syncWhiteboard(updated)
      }}
      onCreateTask={onCreateTask}
      onConvertToKanban={onConvertToKanban}
    />
  )
}
