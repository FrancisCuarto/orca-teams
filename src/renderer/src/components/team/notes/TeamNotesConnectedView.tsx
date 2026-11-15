import React from 'react'
import type { TeamNotesCollection } from '../../../../../shared/teamwork/team-kanban-types'
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
  relayUrl?: string | null
  syncToken?: string
  onPersist?: (notes: TeamNotesCollection) => void
  onPeersChange?: (peers: CollaboratorPresence[]) => void
  onExtractTasksToKanban?: (noteTitle: string, content: string) => void
}

export function TeamNotesConnectedView({
  projectId,
  initialNotes,
  currentUser,
  relayUrl,
  syncToken,
  onPersist,
  onPeersChange,
  onExtractTasksToKanban
}: Props): React.JSX.Element {
  const { notesCollection, peers, activeNoteId, setActiveNoteId, syncNotesCollection } =
    useTeamNotesSync({
      projectId,
      currentUser,
      relayUrl,
      syncToken,
      initialNotes,
      onPersist,
      onPeersChange
    })

  return (
    <TeamNotesView
      notesCollection={notesCollection ?? initialNotes}
      peers={peers}
      activeNoteId={activeNoteId}
      onSelectNoteId={setActiveNoteId}
      onChange={(updated) => {
        syncNotesCollection(updated)
      }}
      onExtractTasksToKanban={onExtractTasksToKanban}
    />
  )
}
