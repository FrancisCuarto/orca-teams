import React, { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  GitBranch,
  MessageSquare
} from 'lucide-react'
import type {
  TeamKanbanCard,
  TeamKanbanColumn
} from '../../../../../shared/teamwork/team-kanban-types'
import type { AgentExecutionStatus } from '../../../../../shared/teamwork/team-workspace-types'
import { Badge } from '@/components/ui/badge'
import { TeamKanbanCardAgentBadge } from './TeamKanbanCardAgentBadge'

type Props = {
  card: TeamKanbanCard
  columns?: TeamKanbanColumn[]
  onEdit: (card: TeamKanbanCard) => void
  onDispatchAgent?: (card: TeamKanbanCard) => void
  executionStatus?: AgentExecutionStatus
  onViewExecution?: (card: TeamKanbanCard) => void
  onToggleChecklistItem?: (cardId: string, itemId: string) => void
  onQuickMoveColumn?: (cardId: string, targetColId: string) => void
  isOverlay?: boolean
}

const PRIORITY_STYLES: Record<
  TeamKanbanCard['priority'],
  { label: string; variant: 'outline' | 'secondary' | 'destructive'; dotClass: string }
> = {
  low: { label: 'Baja', variant: 'outline', dotClass: 'bg-blue-400' },
  medium: { label: 'Media', variant: 'outline', dotClass: 'bg-yellow-400' },
  high: { label: 'Alta', variant: 'secondary', dotClass: 'bg-orange-400' },
  urgent: { label: 'Urgente', variant: 'destructive', dotClass: 'bg-red-200' }
}

export function TeamKanbanCardItem({
  card,
  columns,
  onEdit,
  onDispatchAgent,
  executionStatus,
  onViewExecution,
  onToggleChecklistItem,
  onQuickMoveColumn,
  isOverlay = false
}: Props): React.JSX.Element {
  const [isChecklistExpanded, setIsChecklistExpanded] = useState(false)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id: card.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1
  }

  const priority = PRIORITY_STYLES[card.priority] ?? PRIORITY_STYLES.medium
  const completedChecklist = card.checklist?.filter((item) => item.done).length ?? 0
  const totalChecklist = card.checklist?.length ?? 0
  const commentCount = card.comments?.length ?? 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onEdit(card)}
      className={`group relative flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-xs transition-all cursor-grab active:cursor-grabbing ${
        isOver
          ? 'ring-2 ring-ring border-ring bg-accent/60 shadow-floating scale-[1.01]'
          : 'border-border hover:border-ring/50'
      } ${isOverlay ? 'shadow-floating ring-2 ring-ring/50 rotate-1' : ''}`}
    >
      {/* Top Header: Priority & Story Points */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge variant={priority.variant} className="text-3xs px-1.5 py-0 h-4">
            <span className={`size-1.5 rounded-full ${priority.dotClass}`} />
            {priority.label}
          </Badge>

          {card.estimatePoints !== undefined && card.estimatePoints !== null ? (
            <Badge variant="outline" className="font-mono text-3xs px-1.5 py-0 h-4">
              {card.estimatePoints} pts
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {columns && onQuickMoveColumn && columns.length > 1 ? (
            <div
              className="opacity-0 group-hover:opacity-100 transition-opacity"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <select
                value={card.columnId}
                onChange={(e) => {
                  if (e.target.value !== card.columnId) {
                    onQuickMoveColumn(card.id, e.target.value)
                  }
                }}
                className="h-5 rounded text-3xs border border-border bg-background px-1 text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                title="Mover rápidamente a otra columna"
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      {/* Blocked Badge */}
      {card.blockedReason ? (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20 text-destructive text-3xs font-medium">
          <AlertTriangle className="size-3 shrink-0" />
          <span className="truncate" title={card.blockedReason}>
            {card.blockedReason}
          </span>
        </div>
      ) : null}

      {/* Card Title */}
      <h4 className="text-xs font-semibold text-foreground leading-snug line-clamp-2">
        {card.title}
      </h4>

      {/* Description Snippet */}
      {card.description ? (
        <p className="text-2xs text-muted-foreground line-clamp-2 leading-relaxed">
          {card.description}
        </p>
      ) : null}

      {/* Git Branch / Worktree */}
      {card.branchOrWorktree ? (
        <div className="flex items-center gap-1 text-3xs font-mono text-muted-foreground truncate">
          <GitBranch className="size-3 shrink-0" />
          <span className="truncate">{card.branchOrWorktree}</span>
        </div>
      ) : null}

      {/* Agent Details: Model & Skills */}
      {card.assignee?.type === 'agent' &&
      (card.assignee.model || (card.assignee.skills && card.assignee.skills.length > 0)) ? (
        <div className="flex flex-wrap items-center gap-1">
          {card.assignee.model ? (
            <span
              className="text-3xs font-mono text-muted-foreground bg-secondary/80 border border-border/50 px-1.5 py-0.2 rounded truncate max-w-[130px]"
              title={card.assignee.model}
            >
              {card.assignee.model}
            </span>
          ) : null}
          {card.assignee.skills?.map((skillId) => (
            <Badge
              key={skillId}
              variant="referenceLabel"
              className="text-3xs px-1 py-0 font-normal"
            >
              {skillId === 'ponytail-5' ? 'Ponytail 5' : skillId === 'ctx7' ? 'ctx7' : skillId}
            </Badge>
          ))}
        </div>
      ) : null}

      {/* Labels / Tags */}
      {card.labels && card.labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center text-3xs bg-secondary/80 text-secondary-foreground px-1.5 py-0.5 rounded"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      {/* Footer: Checklist Summary, Comment Count & Assignee */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50 text-2xs text-muted-foreground mt-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {totalChecklist > 0 ? (
            <button
              type="button"
              className="flex items-center gap-1 text-3xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                setIsChecklistExpanded((prev) => !prev)
              }}
              title={isChecklistExpanded ? 'Ocultar checklist' : 'Ver checklist'}
            >
              <CheckSquare className="size-3" />
              <span>
                {completedChecklist}/{totalChecklist}
              </span>
              {isChecklistExpanded ? (
                <ChevronUp className="size-2.5" />
              ) : (
                <ChevronDown className="size-2.5" />
              )}
            </button>
          ) : null}

          {commentCount > 0 ? (
            <Badge
              variant="outline"
              className="text-3xs px-1.5 py-0 h-4 gap-1 text-muted-foreground font-normal"
              title={`${commentCount} ${commentCount === 1 ? 'comentario' : 'comentarios'}`}
            >
              <MessageSquare className="size-2.5" />
              <span>{commentCount}</span>
            </Badge>
          ) : null}
        </div>

        <TeamKanbanCardAgentBadge
          card={card}
          assignee={card.assignee}
          executionStatus={executionStatus}
          onDispatchAgent={onDispatchAgent}
          onViewExecution={onViewExecution}
        />
      </div>

      {/* Expandable Checklist Items */}
      {isChecklistExpanded && card.checklist && card.checklist.length > 0 ? (
        <div
          className="flex flex-col gap-1 pt-1.5 border-t border-border/50 mt-1 max-h-36 overflow-y-auto scrollbar-sleek"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {card.checklist.map((item) => (
            <label
              key={item.id}
              className="flex items-center gap-1.5 text-3xs text-foreground cursor-pointer hover:bg-muted/40 p-1 rounded transition-colors"
            >
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => onToggleChecklistItem?.(card.id, item.id)}
                className="size-3 rounded border-input text-primary focus:ring-primary cursor-pointer shrink-0"
              />
              <span
                className={item.done ? 'line-through text-muted-foreground truncate' : 'truncate'}
              >
                {item.text}
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}
