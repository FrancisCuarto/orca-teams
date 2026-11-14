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
  onPersist?: (notes: TeamNotesCollection) => void
  onExtractTasksToKanban?: (noteTitle: string, content: string) => void
}

export function TeamNotesConnectedView({
  projectId,
  initialNotes,
  currentUser,
  onPersist,
  onExtractTasksToKanban
}: Props): React.JSX.Element {
  const { notesCollection, activeNoteId, setActiveNoteId } = useTeamNotesSync({
    projectId,
    currentUser,
    initialNotes,
    onPersist
  })

  return (
    <TeamNotesView
      notesCollection={notesCollection ?? initialNotes}
      activeNoteId={activeNoteId}
      onSelectNoteId={setActiveNoteId}
      onChange={(updated) => {
        onPersist?.(updated)
      }}
      onExtractTasksToKanban={onExtractTasksToKanban}
    />
  )
}
