import React from 'react'
import { Copy, KanbanSquare, Tag, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import type { TeamNote } from '../../../../../shared/teamwork/team-kanban-types'
import {
  isTeamNoteCategory,
  isTeamNoteStatus
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamNotePreview } from './TeamNotePreview'

type Props = {
  note: TeamNote
  viewMode: 'edit' | 'preview'
  newTagInput: string
  hasExtractableTasks: boolean
  readOnly?: boolean
  canExtractToKanban?: boolean
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
  viewMode,
  newTagInput,
  hasExtractableTasks,
  readOnly = false,
  canExtractToKanban = true,
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
            readOnly={readOnly}
            disabled={readOnly}
            onChange={(e) => {
              if (!readOnly) {
                onUpdateNote({ title: e.target.value })
              }
            }}
            className="text-base font-semibold bg-transparent border-transparent hover:border-border focus:border-primary px-2 h-9"
            placeholder="Título del Documento o ADR..."
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Category Select */}
          <select
            value={note.category}
            disabled={readOnly}
            onChange={(e) => {
              if (!readOnly && isTeamNoteCategory(e.target.value)) {
                onUpdateNote({ category: e.target.value })
              }
            }}
            className="bg-muted text-xs text-foreground rounded border border-border px-2 py-1 focus:outline-hidden disabled:opacity-60"
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
              disabled={readOnly}
              onChange={(e) => {
                if (!readOnly && isTeamNoteStatus(e.target.value)) {
                  onUpdateNote({ status: e.target.value })
                }
              }}
              className="bg-muted text-xs text-foreground rounded border border-border px-2 py-1 focus:outline-hidden uppercase font-mono disabled:opacity-60"
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
              {readOnly ? 'Markdown' : 'Editar'}
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
          {onExtractTasksToKanban && hasExtractableTasks && canExtractToKanban && (
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
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={readOnly}
            onClick={() => {
              if (!readOnly) {
                onDeleteNote()
              }
            }}
            title={readOnly ? 'Solo lectura: no puedes eliminar notas' : 'Eliminar Documento'}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Tags Ribbon */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border/50 bg-muted/20 text-xs overflow-x-auto">
        <Tag className="size-3 text-muted-foreground shrink-0" />
        {note.tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-accent-foreground text-3xs font-medium border border-border"
          >
            {tag}
            {!readOnly ? (
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                className="text-muted-foreground hover:text-foreground ml-0.5"
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
        {!readOnly ? (
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
        ) : null}
      </div>

      {/* Editor Body or Preview */}
      <div className="flex-1 overflow-y-auto scrollbar-sleek p-6">
        {viewMode === 'edit' ? (
          <textarea
            value={note.content}
            readOnly={readOnly}
            onChange={(e) => {
              if (!readOnly) {
                onUpdateNote({ content: e.target.value })
              }
            }}
            className="w-full h-full min-h-[400px] bg-transparent text-xs font-mono leading-relaxed text-foreground resize-none focus:outline-hidden"
            placeholder="Escribe en formato Markdown..."
          />
        ) : (
          <TeamNotePreview
            content={note.content}
            onToggleChecklistLine={readOnly ? undefined : onToggleChecklistLine}
          />
        )}
      </div>
    </div>
  )
}
