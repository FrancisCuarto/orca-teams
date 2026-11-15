import React, { useState } from 'react'
import { AlertTriangle, CheckCircle2, Edit2, Flame, Sparkles, Target, User, X } from 'lucide-react'
import type { BoardSprintMetrics } from './team-kanban-board-mutations'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'

type Props = {
  sprintGoal?: string
  metrics: BoardSprintMetrics
  canEdit?: boolean
  onSaveSprintGoal: (goal?: string) => void
}

export function TeamKanbanSprintHeader({
  sprintGoal,
  metrics,
  canEdit = true,
  onSaveSprintGoal
}: Props): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')

  const handleStartEdit = (): void => {
    if (!canEdit) {
      return
    }
    setInputVal(sprintGoal ?? '')
    setIsEditing(true)
  }

  const handleSave = (): void => {
    if (!canEdit) {
      setIsEditing(false)
      return
    }
    onSaveSprintGoal(inputVal.trim() || undefined)
    setIsEditing(false)
  }

  const completionPct =
    metrics.totalCards > 0 ? Math.round((metrics.completedCards / metrics.totalCards) * 100) : 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-1.5 border-b border-border bg-card/60 text-xs">
      <div className="flex items-center gap-2 flex-1 min-w-[240px]">
        <Target className="size-3.5 text-primary shrink-0" />
        <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
          Sprint Goal:
        </span>
        {isEditing ? (
          <div className="flex items-center gap-1.5 flex-1 max-w-sm">
            <Input
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
                  handleSave()
                } else if (e.key === 'Escape') {
                  setIsEditing(false)
                }
              }}
              placeholder="Definir meta del sprint..."
              className="h-6 text-xs flex-1"
              autoFocus
            />
            <Button size="xs" onClick={handleSave} className="h-6 px-2 text-3xs">
              OK
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setIsEditing(false)}
              className="h-6 px-1.5 text-3xs"
            >
              <X className="size-3" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span
              className={`truncate ${canEdit ? 'cursor-pointer hover:underline' : 'cursor-default'} ${
                sprintGoal ? 'text-foreground font-medium' : 'text-muted-foreground italic'
              }`}
              onClick={canEdit ? handleStartEdit : undefined}
              title={canEdit ? 'Clic para editar objetivo del sprint' : sprintGoal}
            >
              {sprintGoal || (canEdit ? 'Sin objetivo establecido. Clic para definir.' : 'Sin objetivo establecido.')}
            </span>
            {canEdit ? (
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={handleStartEdit}
                className="size-5 text-muted-foreground hover:text-foreground"
                title="Editar objetivo"
              >
                <Edit2 className="size-2.5" />
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/70 border border-border text-3xs font-mono">
          <CheckCircle2 className="size-3 text-workspace-status-review" />
          <span>
            {metrics.completedCards}/{metrics.totalCards} ({completionPct}%)
          </span>
        </div>

        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/70 border border-border text-3xs font-mono">
          <Flame className="size-3 text-orange-400" />
          <span>
            {metrics.completedPoints}/{metrics.totalPoints} pts
          </span>
        </div>

        {metrics.blockedCards > 0 ? (
          <Badge variant="destructive" className="text-3xs h-5 px-1.5 gap-1">
            <AlertTriangle className="size-3" />
            {metrics.blockedCards}
          </Badge>
        ) : null}

        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-muted/70 text-3xs text-muted-foreground">
          <span className="flex items-center gap-0.5 text-git-graph-lane-5 font-medium">
            <Sparkles className="size-2.5" />
            {metrics.agentCards}
          </span>
          <span>/</span>
          <span className="flex items-center gap-0.5 text-foreground font-medium">
            <User className="size-2.5" />
            {metrics.humanCards}
          </span>
        </div>
      </div>
    </div>
  )
}
