import React from 'react'
import { Copy, KanbanSquare, Tag, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import type { TeamNote } from '../../../../../shared/teamwork/team-kanban-types'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'
import {
  isTeamNoteCategory,
  isTeamNoteStatus
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamNotePreview } from './TeamNotePreview'

type Props = {
  note: TeamNote
  activeEditors?: CollaboratorPresence[]
  viewMode: 'edit' | 'preview'
  newTagInput: string
  hasExtractableTasks: boolean
  onEditorFocus?: () => void
  onViewModeChange: (mode: 'edit' | 'preview') => void
  onNewTagInputChange: (val: string) => void
  onUpdateNote: (updates: Partial<TeamNote>) => void
  onDeleteNote: () => void
  onAddTag: () => void
  onRemoveTag: (tag: string) => void
  onToggleChecklistLine: (index: number) => void
  onCopyMarkdown: () => void
  onSendToAgentContext: () => void
  onExtractTasksToKanban?: () => void
}

export function TeamNoteEditor({
  note,
  activeEditors,
  viewMode,
  newTagInput,
  hasExtractableTasks,
  onEditorFocus,
  onViewModeChange,
  onNewTagInputChange,
  onUpdateNote,
  onDeleteNote,
  onAddTag,
  onRemoveTag,
  onToggleChecklistLine,
  onCopyMarkdown,
  onSendToAgentContext,
  onExtractTasksToKanban
}: Props): React.JSX.Element {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full bg-background overflow-hidden">
      {/* Note Header & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border bg-card/20">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <Input
            value={note.title}
            onFocus={onEditorFocus}
            onChange={(e) => onUpdateNote({ title: e.target.value })}
            className="text-base font-semibold bg-transparent border-transparent hover:border-border focus:border-primary px-2 h-9"
            placeholder="Título del Documento o ADR..."
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Category Select */}
          <select
            value={note.category}
            onChange={(e) => {
              if (isTeamNoteCategory(e.target.value)) {
                onUpdateNote({ category: e.target.value })
              }
            }}
            className="bg-muted text-xs text-foreground rounded border border-border px-2 py-1 focus:outline-hidden"
          >
            <option value="adr">ADR (Decisión)</option>
            <option value="spec">Spec (Especificación)</option>
            <option value="meeting">Minuta de Reunión</option>
            <option value="general">Nota General</option>
          </select>

          {/* Status Select */}
          {note.category === 'adr' && (
            <select
              value={note.status ?? 'proposed'}
              onChange={(e) => {
                if (isTeamNoteStatus(e.target.value)) {
                  onUpdateNote({ status: e.target.value })
                }
              }}
              className="bg-muted text-xs text-foreground rounded border border-border px-2 py-1 focus:outline-hidden uppercase font-mono"
            >
              <option value="draft">Draft</option>
              <option value="proposed">Proposed</option>
              <option value="accepted">Accepted</option>
              <option value="deprecated">Deprecated</option>
            </select>
          )}

          {/* Toggle Edit/Preview */}
          <div className="flex items-center bg-muted rounded p-0.5 border border-border">
            <Button
              size="xs"
              variant={viewMode === 'edit' ? 'secondary' : 'ghost'}
              onClick={() => onViewModeChange('edit')}
            >
              Editar
            </Button>
            <Button
              size="xs"
              variant={viewMode === 'preview' ? 'secondary' : 'ghost'}
              onClick={() => onViewModeChange('preview')}
            >
              Vista Previa
            </Button>
          </div>

          {/* Extract to Kanban Button */}
          {onExtractTasksToKanban && hasExtractableTasks && (
            <Button
              size="xs"
              variant="outline"
              onClick={onExtractTasksToKanban}
              title="Extraer tareas no marcadas de esta nota al tablero Kanban"
            >
              <KanbanSquare className="size-3 text-git-graph-lane-2 mr-1" />
              Extraer al Kanban
            </Button>
          )}

          {/* Copy Markdown Button */}
          <Button
            size="xs"
            variant="outline"
            onClick={onCopyMarkdown}
            title="Copiar nota en formato Markdown"
          >
            <Copy className="size-3 text-git-graph-lane-2 mr-1" />
            Copiar MD
          </Button>

          {/* Send to Agent Context Button */}
          <Button
            size="xs"
            variant="outline"
            onClick={onSendToAgentContext}
            title="Copiar nota formateada para guiar al Agente de IA"
          >
            <Zap className="size-3 text-git-graph-lane-1 mr-1" />
            Copiar para Agente
          </Button>

          {/* Delete Note */}
          <Button size="icon-xs" variant="ghost" onClick={onDeleteNote} title="Eliminar Documento">
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Tags Ribbon & Live Active Editors */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-border/50 bg-muted/20 text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Tag className="size-3 text-muted-foreground shrink-0" />
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-3xs font-medium border border-border"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                className="text-muted-foreground hover:text-foreground ml-0.5"
              >
                ×
              </button>
            </span>
          ))}
          <div className="flex items-center gap-1 ml-1">
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => onNewTagInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
                  e.preventDefault()
                  onAddTag()
                }
              }}
              placeholder="+ tag..."
              className="bg-transparent text-3xs text-foreground focus:outline-hidden w-16"
            />
          </div>
        </div>

        {activeEditors && activeEditors.length > 0 ? (
          <div
            data-testid="note-active-editors"
            className="flex items-center gap-1.5 shrink-0"
          >
            {activeEditors.map((peer) => (
              <span
                key={peer.userId}
                data-testid={`note-active-editor-${peer.userId}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/90 px-2 py-0.5 text-3xs font-medium text-foreground shadow-xs"
                style={{ borderColor: peer.color }}
                title={`${peer.displayName} está editando esta nota`}
              >
                <span
                  className="size-1.5 rounded-full animate-pulse shrink-0"
                  style={{ backgroundColor: peer.color }}
                />
                <span>{peer.displayName} editando</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Editor Body or Preview */}
      <div className="flex-1 overflow-y-auto scrollbar-sleek p-6">
        {viewMode === 'edit' ? (
          <textarea
            value={note.content}
            onFocus={onEditorFocus}
            onChange={(e) => onUpdateNote({ content: e.target.value })}
            className="w-full h-full min-h-[400px] bg-transparent text-xs font-mono leading-relaxed text-foreground resize-none focus:outline-hidden"
            placeholder="Escribe en formato Markdown..."
          />
        ) : (
          <TeamNotePreview content={note.content} onToggleChecklistLine={onToggleChecklistLine} />
        )}
      </div>
    </div>
  )
}
