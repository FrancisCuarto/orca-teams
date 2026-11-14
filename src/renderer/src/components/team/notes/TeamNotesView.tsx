import React, { useState, useMemo } from 'react'
import { BookOpen, FileText, KanbanSquare, Plus, Search, Tag, Trash2, Zap } from 'lucide-react'
import { toast } from 'sonner'
import type {
  TeamNote,
  TeamNoteCategory,
  TeamNotesCollection
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  isTeamNoteCategory,
  isTeamNoteStatus
} from '../../../../../shared/teamwork/team-kanban-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getIntlLocale } from '@/i18n/i18n'
import { TeamNotePreview } from './TeamNotePreview'
import { NOTE_CATEGORY_META, getTeamNoteTemplate } from './team-note-templates'

type Props = {
  notesCollection: TeamNotesCollection
  onChange: (updated: TeamNotesCollection) => void
  onExtractTasksToKanban?: (noteTitle: string, content: string) => void
}

export function TeamNotesView({
  notesCollection,
  onChange,
  onExtractTasksToKanban
}: Props): React.JSX.Element {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    notesCollection.notes[0]?.id ?? null
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [newTagInput, setNewTagInput] = useState('')

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
    setSelectedNoteId(newNote.id)
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
      setSelectedNoteId(updated[0]?.id ?? null)
    }
    toast.success('Nota eliminada')
  }

  const handleSendToAgentContext = () => {
    if (!activeNote) {
      return
    }
    const contextPayload = `[CONTEXTO DE EQUIPO Y ARQUITECTURA: ${activeNote.title}]
Categoría: ${activeNote.category.toUpperCase()}
Etiquetas: ${activeNote.tags.join(', ')}

${activeNote.content}`

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
      {/* Left Sidebar: Notes List */}
      <aside className="flex flex-col w-72 shrink-0 border-r border-border bg-card/40">
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <BookOpen className="size-3.5 text-primary" />
              Documentación Viva
            </span>
            <div className="flex items-center gap-1">
              <Button size="xs" variant="outline" onClick={() => handleCreateNote('adr')}>
                + ADR
              </Button>
              <Button
                size="icon-xs"
                variant="outline"
                onClick={() => handleCreateNote('general')}
                title="Crear Nota en Blanco"
              >
                <Plus />
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar notas o tags..."
              className="w-full bg-muted/60 pl-8 pr-3 py-1.5 text-xs text-foreground rounded-md border border-border focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-2xs">
            {['all', 'adr', 'spec', 'meeting', 'general'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2 py-0.5 rounded-full capitalize whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'bg-muted/80 text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat === 'all' ? 'Todas' : cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-sleek p-2 space-y-1">
          {filteredNotes.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              No se encontraron notas
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isSelected = activeNote?.id === note.id
              const catMeta = NOTE_CATEGORY_META[note.category] ?? NOTE_CATEGORY_META.general

              return (
                <div
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  data-current={isSelected ? 'true' : undefined}
                  className={`group relative flex flex-col gap-1 p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-accent border-ring/40 shadow-xs'
                      : 'border-transparent hover:bg-accent/50 hover:border-border'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-3xs px-1.5 py-0.5 rounded border font-medium ${catMeta.bg} ${catMeta.className}`}
                    >
                      {catMeta.label}
                    </span>
                    <span className="text-3xs text-muted-foreground">
                      {new Date(note.updatedAt).toLocaleDateString(getIntlLocale(), {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>

                  <h3 className="text-xs font-semibold text-foreground line-clamp-1">
                    {note.title || 'Sin título'}
                  </h3>

                  <p className="text-2xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {note.content.replace(/^#+\s+/gm, '') || 'Contenido vacío...'}
                  </p>

                  {note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {note.tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="text-3xs px-1 bg-secondary text-secondary-foreground rounded"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* Right Column: Note Editor & Preview */}
      <main className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-background">
        {activeNote ? (
          <>
            <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-border bg-card/30">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <select
                  value={activeNote.category}
                  onChange={(e) => {
                    if (isTeamNoteCategory(e.target.value)) {
                      handleUpdateActiveNote({ category: e.target.value })
                    }
                  }}
                  className="bg-muted text-xs font-semibold text-foreground px-2 py-1 rounded border border-border focus:outline-hidden"
                >
                  <option value="adr">ADR (Decisión)</option>
                  <option value="spec">Especificación</option>
                  <option value="meeting">Reunión</option>
                  <option value="general">General</option>
                </select>

                <input
                  type="text"
                  value={activeNote.title}
                  onChange={(e) => handleUpdateActiveNote({ title: e.target.value })}
                  placeholder="Título de la nota..."
                  className="text-sm font-bold text-foreground bg-transparent focus:outline-hidden flex-1 min-w-0"
                />
              </div>

              <div className="flex items-center gap-2">
                {onExtractTasksToKanban && (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!hasExtractableTasks}
                    onClick={() => onExtractTasksToKanban(activeNote.title, activeNote.content)}
                    title="Extraer las tareas '- [ ] ' de esta nota al tablero Kanban"
                  >
                    <KanbanSquare className="text-primary" />
                    Extraer al Kanban
                  </Button>
                )}

                <Button size="xs" variant="outline" onClick={handleSendToAgentContext}>
                  <Zap className="text-git-graph-lane-1" />
                  Enviar a Agente
                </Button>

                <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border">
                  <Button
                    size="xs"
                    variant={viewMode === 'edit' ? 'secondary' : 'ghost'}
                    onClick={() => setViewMode('edit')}
                  >
                    Editar
                  </Button>
                  <Button
                    size="xs"
                    variant={viewMode === 'preview' ? 'secondary' : 'ghost'}
                    onClick={() => setViewMode('preview')}
                  >
                    Vista Previa
                  </Button>
                </div>

                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => handleDeleteNote(activeNote.id)}
                  title="Eliminar esta nota"
                >
                  <Trash2 />
                </Button>
              </div>
            </header>

            {/* Tags & Metadata Bar */}
            <div className="flex flex-wrap items-center gap-1.5 px-6 py-2 border-b border-border bg-card/10 text-xs">
              <Tag className="size-3 text-muted-foreground" />
              {activeNote.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 bg-secondary text-secondary-foreground rounded-md border border-border"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-muted-foreground hover:text-foreground text-3xs"
                  >
                    ×
                  </button>
                </span>
              ))}

              <Input
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddTag()
                  }
                }}
                placeholder="+ tag"
                density="compact"
                className="w-20 h-6 px-2 text-2xs bg-transparent"
              />

              <div className="flex items-center gap-1.5 ml-auto pl-2 border-l border-border">
                <select
                  value={activeNote.status ?? 'draft'}
                  onChange={(e) => {
                    if (isTeamNoteStatus(e.target.value)) {
                      handleUpdateActiveNote({ status: e.target.value })
                    }
                  }}
                  className="bg-muted text-2xs font-semibold text-foreground px-1.5 py-0.5 rounded border border-border focus:outline-hidden"
                >
                  <option value="draft">Borrador</option>
                  <option value="proposed">Propuesta</option>
                  <option value="accepted">Aceptada</option>
                  <option value="deprecated">Obsoleta</option>
                </select>

                <Input
                  value={activeNote.author ?? ''}
                  onChange={(e) => handleUpdateActiveNote({ author: e.target.value })}
                  placeholder="Autor..."
                  density="compact"
                  className="w-28 h-6 px-2 text-2xs bg-transparent"
                />
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto scrollbar-sleek p-6">
              {viewMode === 'edit' ? (
                <textarea
                  value={activeNote.content}
                  onChange={(e) => handleUpdateActiveNote({ content: e.target.value })}
                  placeholder="Escribe el contenido en formato Markdown..."
                  className="w-full h-full min-h-[500px] bg-transparent text-sm font-mono leading-relaxed text-foreground resize-none focus:outline-hidden"
                />
              ) : (
                <TeamNotePreview
                  content={activeNote.content}
                  onToggleChecklistLine={handleToggleChecklistLine}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col flex-1 items-center justify-center p-8 text-center text-muted-foreground">
            <FileText className="size-10 mb-2 opacity-40" />
            <p className="text-sm">Selecciona una nota de la izquierda o crea una nueva.</p>
          </div>
        )}
      </main>
    </div>
  )
}
