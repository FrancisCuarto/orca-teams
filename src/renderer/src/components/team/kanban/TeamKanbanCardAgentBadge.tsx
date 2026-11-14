import React from 'react'
import { AlertCircle, CheckCircle2, Loader2, Sparkles, User, Zap } from 'lucide-react'
import { Button } from '../../ui/button'
import type {
  TeamKanbanAssignee,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import type { AgentExecutionStatus } from '../../../../../shared/teamwork/team-workspace-types'

type Props = {
  card: TeamKanbanCard
  assignee?: TeamKanbanAssignee
  executionStatus?: AgentExecutionStatus
  onDispatchAgent?: (card: TeamKanbanCard) => void
  onViewExecution?: (card: TeamKanbanCard) => void
}

export function TeamKanbanCardAgentBadge({
  card,
  assignee,
  executionStatus,
  onDispatchAgent,
  onViewExecution
}: Props): React.JSX.Element | null {
  if (!assignee) {
    return null
  }

  const isAgent = assignee.type === 'agent'
  const isRunning = executionStatus === 'running' || executionStatus === 'queued'

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* Execution status indicator badge */}
      {isAgent && executionStatus && onViewExecution ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onViewExecution(card)
          }}
          className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-3xs font-medium border cursor-pointer transition-all ${
            isRunning
              ? 'bg-primary/10 border-primary/30 text-primary animate-pulse'
              : executionStatus === 'completed'
                ? 'bg-secondary/40 border-border text-workspace-status-review'
                : executionStatus === 'failed'
                  ? 'bg-destructive/10 border-destructive/20 text-destructive'
                  : 'bg-muted border-border text-muted-foreground'
          }`}
          title={`Ver logs de ejecución (${executionStatus})`}
        >
          {isRunning ? (
            <Loader2 className="size-2.5 animate-spin" />
          ) : executionStatus === 'completed' ? (
            <CheckCircle2 className="size-2.5" />
          ) : executionStatus === 'failed' ? (
            <AlertCircle className="size-2.5" />
          ) : (
            <Sparkles className="size-2.5" />
          )}
          <span className="uppercase">{executionStatus}</span>
        </button>
      ) : null}

      {/* Quick Dispatch Action if not running */}
      {isAgent && !isRunning && onDispatchAgent ? (
        <Button
          size="xs"
          variant="ghost"
          title="Despachar tarea al Agente de IA"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDispatchAgent(card)
          }}
        >
          <Zap className="size-3 text-primary mr-1 inline" />
          <span>Ejecutar</span>
        </Button>
      ) : null}

      {/* Assignee pill */}
      <div
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-medium ${
          isAgent
            ? 'bg-accent text-accent-foreground border border-border'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {isAgent ? <Sparkles className="size-2.5 text-primary" /> : <User className="size-2.5" />}
        <span className="truncate max-w-[90px]">{assignee.name}</span>
      </div>
    </div>
  )
}
