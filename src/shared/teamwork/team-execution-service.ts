import type { DatabaseSync } from 'node:sqlite'
import type {
  AgentExecutionLog,
  AgentExecutionRecord,
  AgentExecutionStatus
} from './team-workspace-types'

export class TeamExecutionService {
  constructor(private readonly db: DatabaseSync) {}

  recordAgentExecution(record: AgentExecutionRecord): AgentExecutionRecord {
    const existingQuery = this.db.prepare(
      `SELECT * FROM agent_executions WHERE idempotency_key = ?`
    )
    const existing = existingQuery.get(record.idempotencyKey) as Record<string, unknown> | undefined
    if (existing) {
      return this.mapExecutionRow(existing)
    }

    const stmt = this.db.prepare(
      `INSERT INTO agent_executions (
        id, task_id, project_id, agent_id, agent_type, model, status,
        prompt, branch_or_worktree, output_summary, idempotency_key, logs_json,
        started_at, completed_at, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    stmt.run(
      record.id,
      record.taskId,
      record.projectId,
      record.agentId,
      record.agentType,
      record.model,
      record.status,
      record.prompt,
      record.branchOrWorktree ?? null,
      record.outputSummary ?? null,
      record.idempotencyKey,
      JSON.stringify(record.logs),
      record.startedAt ?? null,
      record.completedAt ?? null,
      record.error ?? null,
      record.createdAt,
      record.updatedAt
    )

    return record
  }

  getAgentExecution(executionId: string): AgentExecutionRecord | null {
    const query = this.db.prepare(`SELECT * FROM agent_executions WHERE id = ?`)
    const row = query.get(executionId) as Record<string, unknown> | undefined
    if (!row) {
      return null
    }
    return this.mapExecutionRow(row)
  }

  updateAgentExecutionStatus(options: {
    executionId: string
    status: AgentExecutionStatus
    outputSummary?: string
    error?: string
  }): void {
    const now = Date.now()
    const isTerminal =
      options.status === 'completed' ||
      options.status === 'failed' ||
      options.status === 'cancelled'
    const completedAt = isTerminal ? now : null

    const stmt = this.db.prepare(
      `UPDATE agent_executions
       SET status = ?, output_summary = COALESCE(?, output_summary),
           error = COALESCE(?, error), completed_at = COALESCE(?, completed_at),
           updated_at = ?
       WHERE id = ?`
    )
    stmt.run(
      options.status,
      options.outputSummary ?? null,
      options.error ?? null,
      completedAt,
      now,
      options.executionId
    )
  }

  appendAgentExecutionLog(executionId: string, log: AgentExecutionLog): void {
    const existing = this.getAgentExecution(executionId)
    if (!existing) {
      return
    }

    const updatedLogs = [...existing.logs, log]
    const stmt = this.db.prepare(
      `UPDATE agent_executions SET logs_json = ?, updated_at = ? WHERE id = ?`
    )
    stmt.run(JSON.stringify(updatedLogs), Date.now(), executionId)
  }

  private mapExecutionRow(row: Record<string, unknown>): AgentExecutionRecord {
    let logs: AgentExecutionLog[] = []
    if (typeof row.logs_json === 'string') {
      try {
        logs = JSON.parse(row.logs_json) as AgentExecutionLog[]
      } catch {
        logs = []
      }
    }

    return {
      id: String(row.id),
      taskId: String(row.task_id),
      projectId: String(row.project_id),
      agentId: String(row.agent_id),
      agentType: String(row.agent_type),
      model: String(row.model),
      status: String(row.status) as AgentExecutionStatus,
      prompt: String(row.prompt),
      branchOrWorktree: row.branch_or_worktree ? String(row.branch_or_worktree) : undefined,
      outputSummary: row.output_summary ? String(row.output_summary) : undefined,
      idempotencyKey: String(row.idempotency_key),
      logs,
      startedAt: row.started_at ? Number(row.started_at) : undefined,
      completedAt: row.completed_at ? Number(row.completed_at) : undefined,
      error: row.error ? String(row.error) : undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }
  }
}
