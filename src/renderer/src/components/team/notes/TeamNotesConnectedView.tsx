import React from 'react'
import type { TeamNotesCollection } from '../../../../../shared/teamwork/team-kanban-types'
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
  onExtractTasksToKanban?: (noteTitle: string, content: string) => void
}

export function TeamNotesConnectedView({
  projectId,
  initialNotes,
  currentUser,
  relayUrl,
  syncToken,
  onPersist,
  onExtractTasksToKanban
}: Props): React.JSX.Element {
  const { notesCollection, activeNoteId, setActiveNoteId, syncNotesCollection } = useTeamNotesSync({
    projectId,
    currentUser,
    relayUrl,
    syncToken,
    initialNotes,
    onPersist
  })

  return (
    <TeamNotesView
      notesCollection={notesCollection ?? initialNotes}
      activeNoteId={activeNoteId}
      onSelectNoteId={setActiveNoteId}
      onChange={(updated) => {
        syncNotesCollection(updated)
      }}
      onExtractTasksToKanban={onExtractTasksToKanban}
    />
  )
}
