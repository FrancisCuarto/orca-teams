import React from 'react'
import { AlertTriangle, GitBranch } from 'lucide-react'
import {
  isTeamKanbanPriority,
  type TeamKanbanColumn,
  type TeamKanbanPriority
} from '../../../../../shared/teamwork/team-kanban-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const STORY_POINT_PRESETS: number[] = [1, 2, 3, 5, 8, 13]

type Props = {
  columns: TeamKanbanColumn[]
  columnId: string
  priority: TeamKanbanPriority
  estimatePoints: number | undefined
  branchOrWorktree: string
  blockedReason: string
  labelsText: string
  description: string
  onColumnChange: (value: string) => void
  onPriorityChange: (value: TeamKanbanPriority) => void
  onEstimatePointsChange: (value: number | undefined) => void
  onBranchChange: (value: string) => void
  onBlockedReasonChange: (value: string) => void
  onLabelsTextChange: (value: string) => void
  onDescriptionChange: (value: string) => void
}

export function TeamKanbanCardDetailsFields({
  columns,
  columnId,
  priority,
  estimatePoints,
  branchOrWorktree,
  blockedReason,
  labelsText,
  description,
  onColumnChange,
  onPriorityChange,
  onEstimatePointsChange,
  onBranchChange,
  onBlockedReasonChange,
  onLabelsTextChange,
  onDescriptionChange
}: Props): React.JSX.Element {
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
            placeholder="feat/nombre-de-rama"
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

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-foreground">Etiquetas</label>
        <Input
          value={labelsText}
          onChange={(e) => onLabelsTextChange(e.target.value)}
          placeholder="Frontend, UX, Performance..."
        />
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
