import React from 'react'
import { AlertTriangle, FileText, GitBranch, ShieldCheck, X } from 'lucide-react'
import {
  isTeamKanbanPriority,
  type TeamKanbanColumn,
  type TeamKanbanPriority,
  type TeamNote
} from '../../../../../shared/teamwork/team-kanban-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const STORY_POINT_PRESETS: number[] = [1, 2, 3, 5, 8, 13]
const EMPTY_NOTES: TeamNote[] = []
const EMPTY_NOTE_IDS: string[] = []

type Props = {
  columns: TeamKanbanColumn[]
  columnId: string
  priority: TeamKanbanPriority
  estimatePoints: number | undefined
  branchOrWorktree: string
  isolateWorktree: boolean
  requiresApproval: boolean
  blockedReason: string
  labelsText: string
  description: string
  availableNotes?: TeamNote[]
  linkedNoteIds?: string[]
  onColumnChange: (value: string) => void
  onPriorityChange: (value: TeamKanbanPriority) => void
  onEstimatePointsChange: (value: number | undefined) => void
  onBranchChange: (value: string) => void
  onIsolateWorktreeChange: (value: boolean) => void
  onRequiresApprovalChange: (value: boolean) => void
  onBlockedReasonChange: (value: string) => void
  onLabelsTextChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onAttachNote?: (noteId: string) => void
  onDetachNote?: (noteId: string) => void
}

export function TeamKanbanCardDetailsFields({
  columns,
  columnId,
  priority,
  estimatePoints,
  branchOrWorktree,
  isolateWorktree,
  requiresApproval,
  blockedReason,
  labelsText,
  description,
  availableNotes = EMPTY_NOTES,
  linkedNoteIds = EMPTY_NOTE_IDS,
  onColumnChange,
  onPriorityChange,
  onEstimatePointsChange,
  onBranchChange,
  onIsolateWorktreeChange,
  onRequiresApprovalChange,
  onBlockedReasonChange,
  onLabelsTextChange,
  onDescriptionChange,
  onAttachNote,
  onDetachNote
}: Props): React.JSX.Element {
  const notesById = new Map(availableNotes.map((note) => [note.id, note]))
  const unlinkedNotes = availableNotes.filter((note) => !linkedNoteIds.includes(note.id))

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground">Columna</label>
          <select
            value={columnId}
            onChange={(e) => onColumnChange(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {columns.map((col) => (
              <option key={col.id} value={col.id}>
                {col.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground">Prioridad</label>
          <select
            value={priority}
            onChange={(e) => {
              if (isTeamKanbanPriority(e.target.value)) {
                onPriorityChange(e.target.value)
              }
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground">Story Points</label>
          <div className="flex items-center gap-1">
            {STORY_POINT_PRESETS.map((pts) => (
              <Button
                key={pts}
                type="button"
                size="xs"
                variant={estimatePoints === pts ? 'default' : 'outline'}
                onClick={() => onEstimatePointsChange(estimatePoints === pts ? undefined : pts)}
                className="px-1.5 font-mono text-2xs"
              >
                {pts}
              </Button>
            ))}
            {estimatePoints !== undefined && !STORY_POINT_PRESETS.includes(estimatePoints) ? (
              <Badge variant="secondary" className="font-mono text-3xs">
                {estimatePoints}
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground flex items-center gap-1">
            <GitBranch className="size-3 text-muted-foreground" /> Rama / Worktree
          </label>
          <Input
            value={branchOrWorktree}
            onChange={(e) => onBranchChange(e.target.value)}
            placeholder="orca-team/auto-worktree"
            className="font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground flex items-center gap-1">
            <AlertTriangle className="size-3 text-destructive" /> Motivo de bloqueo
          </label>
          <Input
            value={blockedReason}
            onChange={(e) => onBlockedReasonChange(e.target.value)}
            placeholder="Ej. Esperando revisión de backend..."
            className="text-xs"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-md border border-border bg-muted/20 px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isolateWorktree}
            onChange={(e) => onIsolateWorktreeChange(e.target.checked)}
            className="rounded border-input accent-primary"
          />
          <GitBranch className="size-3.5 text-primary" />
          <span>Aislar agente en Git worktree dedicado</span>
        </label>

        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={requiresApproval}
            onChange={(e) => onRequiresApprovalChange(e.target.checked)}
            className="rounded border-input accent-primary"
          />
          <ShieldCheck className="size-3.5 text-workspace-status-review" />
          <span>Requerir aprobación humana antes de integrar</span>
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-foreground">Etiquetas</label>
        <Input
          value={labelsText}
          onChange={(e) => onLabelsTextChange(e.target.value)}
          placeholder="Frontend, UX, Performance..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-foreground flex items-center gap-1">
          <FileText className="size-3 text-muted-foreground" /> Notas y ADRs vinculados (Contexto
          para Agente)
        </label>
        <select
          aria-label="Vincular nota o ADR"
          value=""
          disabled={unlinkedNotes.length === 0 || !onAttachNote}
          onChange={(e) => {
            if (e.target.value && onAttachNote) {
              onAttachNote(e.target.value)
            }
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        >
          <option value="">
            {availableNotes.length === 0
              ? 'Sin notas o ADRs disponibles en el proyecto'
              : unlinkedNotes.length === 0
                ? 'Todas las notas del proyecto están vinculadas'
                : '+ Adjuntar Nota o ADR como contexto...'}
          </option>
          {unlinkedNotes.map((note) => (
            <option key={note.id} value={note.id}>
              [{note.category.toUpperCase()}] {note.title}
            </option>
          ))}
        </select>

        {linkedNoteIds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {linkedNoteIds.map((noteId) => {
              const note = notesById.get(noteId)
              return (
                <Badge
                  key={noteId}
                  variant="secondary"
                  className="flex items-center gap-1 pl-2 pr-1 py-0.5 text-2xs max-w-full"
                >
                  <FileText className="size-3 shrink-0 text-primary" />
                  <span className="truncate max-w-[260px]">
                    {note ? `[${note.category.toUpperCase()}] ${note.title}` : noteId}
                  </span>
                  {onDetachNote ? (
                    <button
                      type="button"
                      onClick={() => onDetachNote(noteId)}
                      aria-label={`Desvincular ${note?.title ?? noteId}`}
                      title="Desvincular nota"
                      className="ml-0.5 rounded-xs p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </Badge>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-foreground">Descripción (Markdown)</label>
        <Textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe requerimientos o pasos..."
          rows={3}
        />
      </div>
    </>
  )
}
