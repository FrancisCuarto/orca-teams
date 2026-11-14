import type { TeamExecutionService } from './team-execution-service'
import type { AgentExecutionLog, AgentExecutionRecord } from './team-workspace-types'
import type { TeamKanbanCard } from './team-kanban-types'
import { buildAgentDispatchPrompt } from '../../renderer/src/components/team/kanban/team-kanban-agent-dispatch'

export type DispatchOptions = {
  card: TeamKanbanCard
  projectId: string
  actorUserId: string
  sprintGoal?: string
}

export class TeamAgentDispatchService {
  constructor(private readonly executionService: TeamExecutionService) {}

  dispatchCardToAgent(options: DispatchOptions): AgentExecutionRecord {
    const { card, projectId } = options

    if (!card.assignee || card.assignee.type !== 'agent') {
      throw new Error('La tarjeta no tiene un agente asignado válido')
    }

    const { prompt, branchName, agentName } = buildAgentDispatchPrompt(card)
    const idempotencyKey = `agent-exec-${card.id}-${card.updatedAt}`
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const now = Date.now()

    const record: AgentExecutionRecord = {
      id: executionId,
      taskId: card.id,
      projectId,
      agentId: card.assignee.agentType ?? 'antigravity',
      agentType: card.assignee.agentType ?? 'orchestration',
      model: card.assignee.model ?? 'Orchestrator (Argon)',
      status: 'queued',
      prompt,
      branchOrWorktree: branchName,
      idempotencyKey,
      logs: [
        {
          timestamp: now,
          level: 'info',
          message: `Tarea encolada para agente '${agentName}' en rama '${branchName}'.`
        }
      ],
      createdAt: now,
      updatedAt: now
    }

    return this.executionService.recordAgentExecution(record)
  }

  startExecution(executionId: string): AgentExecutionRecord {
    const record = this.executionService.getAgentExecution(executionId)
    if (!record) {
      throw new Error(`Ejecución '${executionId}' no encontrada`)
    }

    if (record.status !== 'queued') {
      return record
    }

    const now = Date.now()
    this.executionService.updateAgentExecutionStatus({
      executionId,
      status: 'running'
    })

    this.executionService.appendAgentExecutionLog(executionId, {
      timestamp: now,
      level: 'info',
      message: `Ejecución iniciada por el runtime agéntico.`
    })

    const updated = this.executionService.getAgentExecution(executionId)
    if (!updated) {
      throw new Error(`Error al recuperar ejecución '${executionId}'`)
    }
    return updated
  }

  appendLog(executionId: string, level: 'info' | 'warn' | 'error', message: string): void {
    const log: AgentExecutionLog = {
      timestamp: Date.now(),
      level,
      message
    }
    this.executionService.appendAgentExecutionLog(executionId, log)
  }

  completeExecution(executionId: string, outputSummary: string): void {
    const now = Date.now()
    this.executionService.appendAgentExecutionLog(executionId, {
      timestamp: now,
      level: 'info',
      message: `Ejecución completada con éxito.`
    })

    this.executionService.updateAgentExecutionStatus({
      executionId,
      status: 'completed',
      outputSummary
    })
  }

  failExecution(executionId: string, error: string): void {
    const now = Date.now()
    this.executionService.appendAgentExecutionLog(executionId, {
      timestamp: now,
      level: 'error',
      message: `Fallo de ejecución: ${error}`
    })

    this.executionService.updateAgentExecutionStatus({
      executionId,
      status: 'failed',
      error
    })
  }

  cancelExecution(executionId: string): void {
    const now = Date.now()
    this.executionService.appendAgentExecutionLog(executionId, {
      timestamp: now,
      level: 'warn',
      message: `Ejecución cancelada por el usuario.`
    })

    this.executionService.updateAgentExecutionStatus({
      executionId,
      status: 'cancelled'
    })
  }

  getExecution(executionId: string): AgentExecutionRecord | null {
    return this.executionService.getAgentExecution(executionId)
  }

  getLatestExecutionForCard(cardId: string): AgentExecutionRecord | null {
    return this.executionService.getLatestExecutionForTask(cardId)
  }
}
