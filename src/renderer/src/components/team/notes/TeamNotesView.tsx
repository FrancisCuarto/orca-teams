import React, { useState, useMemo } from 'react'
import { FileText, Zap } from 'lucide-react'
import { toast } from 'sonner'
import type {
  TeamNote,
  TeamNoteCategory,
  TeamNotesCollection
} from '../../../../../shared/teamwork/team-kanban-types'
import { getTeamNoteTemplate } from './team-note-templates'
import { TeamNotesSidebar } from './TeamNotesSidebar'
import { TeamNoteEditor } from './TeamNoteEditor'

type Props = {
  notesCollection: TeamNotesCollection
  activeNoteId?: string | null
  onSelectNoteId?: (id: string | null) => void
  onChange: (updated: TeamNotesCollection) => void
  onExtractTasksToKanban?: (noteTitle: string, content: string) => void
}

export function TeamNotesView({
  notesCollection,
  activeNoteId: controlledNoteId,
  onSelectNoteId,
  onChange,
  onExtractTasksToKanban
}: Props): React.JSX.Element {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    notesCollection.notes[0]?.id ?? null
  )
  const selectedNoteId = controlledNoteId !== undefined ? controlledNoteId : internalSelectedId

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [newTagInput, setNewTagInput] = useState('')

  const handleSelectNote = (id: string | null) => {
    if (onSelectNoteId) {
      onSelectNoteId(id)
    } else {
      setInternalSelectedId(id)
    }
  }

  const activeNote = useMemo(() => {
    return (
      notesCollection.notes.find((n) => n.id === selectedNoteId) ?? notesCollection.notes[0] ?? null
    )
  }, [notesCollection.notes, selectedNoteId])

  const filteredNotes = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return notesCollection.notes.filter((note) => {
      const matchesSearch =
        q === '' ||
        note.title.toLowerCase().includes(q) ||
        note.content.toLowerCase().includes(q) ||
        note.tags.some((t) => t.toLowerCase().includes(q))

      const matchesCategory = selectedCategory === 'all' || note.category === selectedCategory
      return matchesSearch && matchesCategory
    })
  }, [notesCollection.notes, searchQuery, selectedCategory])

  const handleCreateNote = (category: TeamNoteCategory = 'general') => {
    const now = Date.now()
    const { title, content } = getTeamNoteTemplate(category)
    const newNote: TeamNote = {
      id: `note-${now}`,
      title,
      content,
      category,
      tags: [category.toUpperCase()],
      createdAt: now,
      updatedAt: now
    }

    onChange({ ...notesCollection, notes: [newNote, ...notesCollection.notes], updatedAt: now })
    handleSelectNote(newNote.id)
    setViewMode('edit')
    toast.success('Nueva nota creada')
  }

  const handleUpdateActiveNote = (updates: Partial<TeamNote>) => {
    if (!activeNote) {
      return
    }
    onChange({
      ...notesCollection,
      notes: notesCollection.notes.map((n) =>
        n.id === activeNote.id ? { ...n, ...updates, updatedAt: Date.now() } : n
      ),
      updatedAt: Date.now()
    })
  }

  const handleDeleteNote = (id: string) => {
    const updated = notesCollection.notes.filter((n) => n.id !== id)
    onChange({ ...notesCollection, notes: updated, updatedAt: Date.now() })
    if (selectedNoteId === id) {
      handleSelectNote(updated[0]?.id ?? null)
    }
    toast.success('Nota eliminada')
  }

  const handleSendToAgentContext = () => {
    if (!activeNote) {
      return
    }
    const contextPayload = `[CONTEXTO DE EQUIPO Y ARQUITECTURA: ${activeNote.title}]\nCategoría: ${activeNote.category.toUpperCase()}\nEtiquetas: ${activeNote.tags.join(', ')}\n\n${activeNote.content}`

    void navigator.clipboard.writeText(contextPayload)
    toast.success('Nota copiada al portapapeles con formato de contexto para Agente', {
      description: 'Pégala en tu chat de agente activo para guiar su implementación.',
      icon: <Zap className="size-4 text-git-graph-lane-1" />
    })
  }

  const handleAddTag = () => {
    if (!newTagInput.trim() || !activeNote) {
      return
    }
    const trimmed = newTagInput.trim()
    if (!activeNote.tags.includes(trimmed)) {
      handleUpdateActiveNote({ tags: [...activeNote.tags, trimmed] })
    }
    setNewTagInput('')
  }

  const handleRemoveTag = (tagToRemove: string) => {
    if (!activeNote) {
      return
    }
    handleUpdateActiveNote({
      tags: activeNote.tags.filter((t) => t !== tagToRemove)
    })
  }

  const handleToggleChecklistLine = (lineIndex: number) => {
    if (!activeNote) {
      return
    }
    const lines = activeNote.content.split('\n')
    const line = lines[lineIndex]
    if (line === undefined || (!line.startsWith('- [ ] ') && !line.startsWith('- [x] '))) {
      return
    }
    lines[lineIndex] = line.startsWith('- [ ] ')
      ? line.replace('- [ ] ', '- [x] ')
      : line.replace('- [x] ', '- [ ] ')
    handleUpdateActiveNote({ content: lines.join('\n') })
  }

  const hasExtractableTasks = activeNote
    ? activeNote.content.split('\n').some((line) => line.trim().startsWith('- [ ] '))
    : false

  return (
    <div className="flex flex-1 w-full h-full min-h-0 overflow-hidden bg-background">
      <TeamNotesSidebar
        notes={filteredNotes}
        activeNoteId={activeNote?.id ?? null}
        searchQuery={searchQuery}
        selectedCategory={selectedCategory}
        onSearchChange={setSearchQuery}
        onSelectCategory={setSelectedCategory}
        onSelectNote={handleSelectNote}
        onCreateNote={handleCreateNote}
      />

      {activeNote ? (
        <TeamNoteEditor
          note={activeNote}
          viewMode={viewMode}
          newTagInput={newTagInput}
          hasExtractableTasks={hasExtractableTasks}
          onViewModeChange={setViewMode}
          onNewTagInputChange={setNewTagInput}
          onUpdateNote={handleUpdateActiveNote}
          onDeleteNote={() => handleDeleteNote(activeNote.id)}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          onToggleChecklistLine={handleToggleChecklistLine}
          onSendToAgentContext={handleSendToAgentContext}
          onExtractTasksToKanban={
            onExtractTasksToKanban
              ? () => onExtractTasksToKanban(activeNote.title, activeNote.content)
              : undefined
          }
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-xs">
          <FileText className="size-4 mr-2" />
          Selecciona o crea una nota para comenzar a documentar
        </div>
      )}
    </div>
  )
}
