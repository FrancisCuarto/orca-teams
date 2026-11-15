import React from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Factory,
  Loader2,
  Sparkles,
  User,
  Zap
} from 'lucide-react'
import { Button } from '../../ui/button'
import type { FactoryRunRecord } from '../../../../../shared/teamwork/team-factory-types'
import type {
  TeamKanbanAssignee,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import type { AgentExecutionStatus } from '../../../../../shared/teamwork/team-workspace-types'

type Props = {
  card: TeamKanbanCard
  assignee?: TeamKanbanAssignee
  executionStatus?: AgentExecutionStatus
  factoryRun?: FactoryRunRecord
  canDispatchAgents?: boolean
  onDispatchAgent?: (card: TeamKanbanCard) => void
  onViewExecution?: (card: TeamKanbanCard) => void
  onStartFactory?: (card: TeamKanbanCard) => void
  onViewFactory?: (card: TeamKanbanCard) => void
}

export function TeamKanbanCardAgentBadge({
  card,
  assignee,
  executionStatus,
  factoryRun,
  canDispatchAgents = true,
  onDispatchAgent,
  onViewExecution,
  onStartFactory,
  onViewFactory
}: Props): React.JSX.Element | null {
  if (!assignee) {
    return null
  }

  const isAgent = assignee.type === 'agent'
  const isRunning = executionStatus === 'running' || executionStatus === 'queued'
  const isFactoryRunning = factoryRun?.status === 'running' || factoryRun?.status === 'queued'
  const isWaitingHuman = factoryRun?.status === 'waiting_human'

  return (
    <div className="flex flex-wrap items-center gap-1 shrink-0">
      {/* Factory live stage badge */}
      {factoryRun && onViewFactory ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onViewFactory(card)
          }}
          className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-3xs font-medium border cursor-pointer transition-all ${
            isFactoryRunning
              ? 'bg-primary/10 border-primary/30 text-primary animate-pulse'
              : isWaitingHuman
                ? 'bg-destructive/15 border-destructive/40 text-destructive'
                : factoryRun.status === 'completed'
                  ? 'bg-secondary/40 border-border text-foreground'
                  : factoryRun.status === 'failed'
                    ? 'bg-destructive/10 border-destructive/20 text-destructive'
                    : 'bg-muted border-border text-muted-foreground'
          }`}
          title={`Ver Software Factory (${factoryRun.currentStage})`}
        >
          {isFactoryRunning ? (
            <Loader2 className="size-2.5 animate-spin" />
          ) : isWaitingHuman ? (
            <AlertTriangle className="size-2.5" />
          ) : (
            <Factory className="size-2.5" />
          )}
          <span className="uppercase">
            {isWaitingHuman ? 'GATE' : `F:${factoryRun.currentStage}`}
          </span>
        </button>
      ) : null}

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

      {/* Quick Factory pipeline trigger */}
      {isAgent && !isRunning && !isFactoryRunning && onStartFactory ? (
        <Button
          size="xs"
          variant="ghost"
          disabled={!canDispatchAgents}
          title={
            canDispatchAgents
              ? 'Ejecutar pipeline completo Software Factory (Spec → TDD → 4 Revisores → Gate)'
              : 'Solo lectura: no puedes ejecutar Software Factory'
          }
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            if (canDispatchAgents) {
              onStartFactory(card)
            }
          }}
        >
          <Factory className="size-3 text-primary mr-1 inline" />
          <span>Factory</span>
        </Button>
      ) : null}

      {/* Quick Dispatch Action if not running */}
      {isAgent && !isRunning && !isFactoryRunning && onDispatchAgent ? (
        <Button
          size="xs"
          variant="ghost"
          disabled={!canDispatchAgents}
          title={
            canDispatchAgents
              ? 'Despachar tarea al Agente de IA'
              : 'Solo lectura: no puedes ejecutar agentes'
          }
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            if (canDispatchAgents) {
              onDispatchAgent(card)
            }
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
