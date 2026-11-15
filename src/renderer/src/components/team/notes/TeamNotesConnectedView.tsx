import React from 'react'
import type { TeamNotesCollection } from '../../../../../shared/teamwork/team-kanban-types'
import {
  getTeamPermissions,
  type TeamPermissions
} from '../../../../../shared/teamwork/team-rbac-policy'
import type { TeamRole } from '../../../../../shared/teamwork/team-workspace-types'
import { useTeamNotesSync } from '../hooks/use-team-notes-sync'
import { TeamNotesView } from './TeamNotesView'

type Props = {
  projectId: string
  initialNotes: TeamNotesCollection
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
  onPersist?: (notes: TeamNotesCollection) => void
  onExtractTasksToKanban?: (noteTitle: string, content: string) => void
}

export function TeamNotesConnectedView({
  projectId,
  initialNotes,
  currentUser,
  userRole = 'owner',
  permissions,
  relayUrl,
  syncToken,
  onPersist,
  onExtractTasksToKanban
}: Props): React.JSX.Element {
  const resolvedPermissions = permissions ?? getTeamPermissions(userRole)
  const { notesCollection, activeNoteId, setActiveNoteId, syncNotesCollection } = useTeamNotesSync({
    projectId,
    currentUser,
    relayUrl,
    syncToken,
    initialNotes,
    onPersist: resolvedPermissions.canEditNotes ? onPersist : undefined
  })

  return (
    <TeamNotesView
      notesCollection={notesCollection ?? initialNotes}
      activeNoteId={activeNoteId}
      readOnly={!resolvedPermissions.canEditNotes}
      canExtractToKanban={resolvedPermissions.canEditBoard}
      onSelectNoteId={setActiveNoteId}
      onChange={(updated) => {
        if (resolvedPermissions.canEditNotes) {
          syncNotesCollection(updated)
        }
      }}
      onExtractTasksToKanban={
        resolvedPermissions.canEditBoard ? onExtractTasksToKanban : undefined
      }
    />
  )
}
