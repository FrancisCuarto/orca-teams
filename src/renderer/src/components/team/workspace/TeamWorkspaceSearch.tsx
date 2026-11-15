import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Kanban, Search, X } from 'lucide-react'
import type {
  TeamKanbanBoard,
  TeamKanbanCard,
  TeamNote,
  TeamNotesCollection
} from '../../../../../shared/teamwork/team-kanban-types'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { searchTeamWorkspace } from '../kanban/team-kanban-filters'

type Props = {
  board: TeamKanbanBoard | null
  notes: TeamNotesCollection | null
  onSelectCard: (card: TeamKanbanCard) => void
  onSelectNote: (note: TeamNote) => void
}

const PRIORITY_LABELS: Record<TeamKanbanCard['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente'
}

export function TeamWorkspaceSearch({
  board,
  notes,
  onSelectCard,
  onSelectNote
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => searchTeamWorkspace(board, notes, query), [board, notes, query])
  const showResults = isOpen && query.trim().length > 0

  useEffect(() => {
    if (!showResults) {
      return
    }
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [showResults])

  const handleChooseCard = (card: TeamKanbanCard): void => {
    setIsOpen(false)
    onSelectCard(card)
  }

  const handleChooseNote = (note: TeamNote): void => {
    setIsOpen(false)
    onSelectNote(note)
  }

  return (
    <div ref={containerRef} className="relative w-64 max-w-full">
      <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
      <Input
        aria-label="Búsqueda global en tablero y notas"
        value={query}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !isImeOwnedKeyboardEvent(e)) {
            setIsOpen(false)
          } else if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e) && showResults) {
            const firstCard = results.cards[0]
            if (firstCard) {
              e.preventDefault()
              handleChooseCard(firstCard.card)
              return
            }
            const firstNote = results.notes[0]
            if (firstNote) {
              e.preventDefault()
              handleChooseNote(firstNote.note)
            }
          }
        }}
        placeholder="Buscar tarjetas, notas, ADRs..."
        className="h-7 pl-8 pr-7 text-xs"
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery('')
            setIsOpen(false)
          }}
          aria-label="Limpiar búsqueda global"
          className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : null}

      {showResults ? (
        <div
          role="listbox"
          aria-label="Resultados de búsqueda del equipo"
          className="absolute right-0 top-full mt-1.5 z-50 w-[380px] max-w-[90vw] max-h-96 overflow-y-auto scrollbar-sleek rounded-lg border border-border bg-popover text-popover-foreground shadow-floating"
        >
          {results.totalCount === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              Sin resultados para &ldquo;{query.trim()}&rdquo; en tarjetas ni notas.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {results.cards.length > 0 ? (
                <div className="p-1.5 space-y-0.5">
                  <div className="px-2 py-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Tarjetas Kanban</span>
                    <span className="font-mono">{results.cards.length}</span>
                  </div>
                  {results.cards.map((match) => (
                    <button
                      key={match.card.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => handleChooseCard(match.card)}
                      className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                    >
                      <Kanban className="size-3.5 text-primary shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-foreground truncate">
                            {match.card.title}
                          </span>
                          <Badge variant="outline" className="text-3xs h-4 px-1.5 shrink-0">
                            {match.columnTitle}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-3xs text-muted-foreground">
                          <span>{PRIORITY_LABELS[match.card.priority]}</span>
                          {match.card.assignee ? (
                            <span>· {match.card.assignee.name}</span>
                          ) : null}
                        </div>
                        {match.snippet ? (
                          <p className="text-3xs text-muted-foreground truncate">{match.snippet}</p>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              {results.notes.length > 0 ? (
                <div className="p-1.5 space-y-0.5">
                  <div className="px-2 py-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Notas & ADRs</span>
                    <span className="font-mono">{results.notes.length}</span>
                  </div>
                  {results.notes.map((match) => (
                    <button
                      key={match.note.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => handleChooseNote(match.note)}
                      className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                    >
                      <FileText className="size-3.5 text-primary shrink-0 mt-0.5" />
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-foreground truncate">
                            {match.note.title}
                          </span>
                          <Badge variant="outline" className="text-3xs h-4 px-1.5 uppercase shrink-0">
                            {match.note.category}
                          </Badge>
                        </div>
                        {match.snippet ? (
                          <p className="text-3xs text-muted-foreground truncate">{match.snippet}</p>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
