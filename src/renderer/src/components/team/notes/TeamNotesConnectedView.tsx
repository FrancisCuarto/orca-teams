import React from 'react'
import type { TeamNotesCollection } from '../../../../../shared/teamwork/team-kanban-types'
import {
  getTeamPermissions,
  type TeamPermissions
} from '../../../../../shared/teamwork/team-rbac-policy'
import type { TeamRole } from '../../../../../shared/teamwork/team-workspace-types'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'
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
  selectedNoteId?: string | null
  onSelectNoteId?: (noteId: string | null) => void
  onPersist?: (notes: TeamNotesCollection) => void
  onPeersChange?: (peers: CollaboratorPresence[]) => void
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
  selectedNoteId,
  onSelectNoteId,
  onPersist,
  onPeersChange,
  onExtractTasksToKanban
}: Props): React.JSX.Element {
  const resolvedPermissions = permissions ?? getTeamPermissions(userRole)
  const { notesCollection, peers, activeNoteId, setActiveNoteId, syncNotesCollection } =
    useTeamNotesSync({
      projectId,
      currentUser,
      relayUrl,
      syncToken,
      initialNotes,
      onPersist: resolvedPermissions.canEditNotes ? onPersist : undefined,
      onPeersChange
    })

  return (
    <TeamNotesView
      notesCollection={notesCollection ?? initialNotes}
      peers={peers}
      activeNoteId={selectedNoteId !== undefined ? selectedNoteId : activeNoteId}
      readOnly={!resolvedPermissions.canEditNotes}
      canExtractToKanban={resolvedPermissions.canEditBoard}
      onSelectNoteId={(id) => {
        setActiveNoteId(id)
        onSelectNoteId?.(id)
      }}
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
