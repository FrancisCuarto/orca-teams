import React from 'react'
import { BookOpen, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getIntlLocale } from '@/i18n/i18n'
import type { TeamNote, TeamNoteCategory } from '../../../../../shared/teamwork/team-kanban-types'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'
import { NOTE_CATEGORY_META } from './team-note-templates'

type Props = {
  notes: TeamNote[]
  peers?: CollaboratorPresence[]
  activeNoteId: string | null
  searchQuery: string
  selectedCategory: string
  onSearchChange: (q: string) => void
  onSelectCategory: (cat: string) => void
  onSelectNote: (id: string) => void
  onCreateNote: (category: TeamNoteCategory) => void
}

export function TeamNotesSidebar({
  notes,
  peers,
  activeNoteId,
  searchQuery,
  selectedCategory,
  onSearchChange,
  onSelectCategory,
  onSelectNote,
  onCreateNote
}: Props): React.JSX.Element {
  return (
    <aside className="flex flex-col w-72 shrink-0 border-r border-border bg-card/40">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <BookOpen className="size-3.5 text-primary" />
            Documentación Viva
          </span>
          <div className="flex items-center gap-1">
            <Button size="xs" variant="outline" onClick={() => onCreateNote('adr')}>
              + ADR
            </Button>
            <Button
              size="icon-xs"
              variant="outline"
              onClick={() => onCreateNote('general')}
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
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar notas o tags..."
            className="w-full bg-muted/60 pl-8 pr-3 py-1.5 text-xs text-foreground rounded-md border border-border focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-2xs">
          {['all', 'adr', 'spec', 'meeting', 'general'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onSelectCategory(cat)}
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
        {notes.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No se encontraron notas
          </div>
        ) : (
          notes.map((note) => {
            const isSelected = activeNoteId === note.id
            const catMeta = NOTE_CATEGORY_META[note.category] ?? NOTE_CATEGORY_META.general
            const notePeers = (peers ?? []).filter((p) => p.activeNoteId === note.id)

            return (
              <div
                key={note.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectNote(note.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelectNote(note.id)
                  }
                }}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-accent/80 border-primary/40 shadow-xs'
                    : 'bg-card/60 border-border/60 hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span
                    className={`text-3xs uppercase font-semibold px-1.5 py-0.2 rounded border ${catMeta.className} ${catMeta.bg}`}
                  >
                    {catMeta.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {notePeers.length > 0 ? (
                      <div
                        data-testid={`note-sidebar-editors-${note.id}`}
                        className="flex items-center -space-x-1"
                        title={`${notePeers.map((p) => p.displayName).join(', ')} editando`}
                      >
                        {notePeers.slice(0, 3).map((peer) => (
                          <span
                            key={peer.userId}
                            className="inline-flex items-center justify-center size-4 rounded-full border border-background text-[8px] font-bold text-white"
                            style={{ backgroundColor: peer.color }}
                          >
                            {peer.displayName.slice(0, 1).toUpperCase()}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {note.status && (
                      <span className="text-3xs uppercase px-1 rounded bg-muted text-muted-foreground font-mono">
                        {note.status}
                      </span>
                    )}
                  </div>
                </div>
                <h4 className="text-xs font-medium text-foreground truncate">{note.title}</h4>
                <div className="flex items-center justify-between text-3xs text-muted-foreground mt-1.5">
                  <span className="truncate max-w-[120px]">{note.tags.join(', ')}</span>
                  <span>
                    {new Date(note.updatedAt).toLocaleDateString(getIntlLocale(), {
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
