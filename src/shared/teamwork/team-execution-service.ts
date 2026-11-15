import type { DatabaseSync } from 'node:sqlite'
import type {
  AgentApprovalStatus,
  AgentExecutionLog,
  AgentExecutionRecord,
  AgentExecutionStatus
} from './team-workspace-types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isExecutionStatus(value: unknown): value is AgentExecutionStatus {
  return (
    value === 'queued' ||
    value === 'running' ||
    value === 'waiting_for_input' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
  )
}

function isApprovalStatus(value: unknown): value is AgentApprovalStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected'
}

function parseExecutionLogs(raw: unknown): AgentExecutionLog[] {
  if (typeof raw !== 'string') {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    const result: AgentExecutionLog[] = []
    for (const item of parsed) {
      if (
        isRecord(item) &&
        typeof item.timestamp === 'number' &&
        (item.level === 'info' || item.level === 'warn' || item.level === 'error') &&
        typeof item.message === 'string'
      ) {
        result.push({ timestamp: item.timestamp, level: item.level, message: item.message })
      }
    }
    return result
  } catch {
    return []
  }
}

function parseChangedFiles(raw: unknown): string[] | undefined {
  if (typeof raw !== 'string' || !raw.trim()) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return undefined
    }
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return undefined
  }
}

export class TeamExecutionService {
  constructor(private readonly db: DatabaseSync) {}

  recordAgentExecution(record: AgentExecutionRecord): AgentExecutionRecord {
    const existingQuery = this.db.prepare(
      `SELECT * FROM agent_executions WHERE idempotency_key = ?`
    )
    const existing = existingQuery.get(record.idempotencyKey)
    if (isRecord(existing)) {
      return this.mapExecutionRow(existing)
    }

    const stmt = this.db.prepare(
      `INSERT INTO agent_executions (
        id, task_id, project_id, agent_id, agent_type, model, status,
        prompt, branch_or_worktree, worktree_path, base_branch, approval_status,
        changed_files_json, output_summary, idempotency_key, logs_json,
        started_at, completed_at, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      record.worktreePath ?? null,
      record.baseBranch ?? null,
      record.approvalStatus ?? null,
      record.changedFiles ? JSON.stringify(record.changedFiles) : null,
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
    const row = query.get(executionId)
    if (!isRecord(row)) {
      return null
    }
    return this.mapExecutionRow(row)
  }

  getLatestExecutionForTask(taskId: string): AgentExecutionRecord | null {
    const query = this.db.prepare(
      `SELECT * FROM agent_executions WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`
    )
    const row = query.get(taskId)
    if (!isRecord(row)) {
      return null
    }
    return this.mapExecutionRow(row)
  }

  updateAgentExecutionStatus(options: {
    executionId: string
    status: AgentExecutionStatus
    outputSummary?: string
    error?: string
    approvalStatus?: AgentApprovalStatus
    changedFiles?: string[]
  }): void {
    const now = Date.now()
    const isTerminal =
      options.status === 'completed' ||
      options.status === 'failed' ||
      options.status === 'cancelled'
    const completedAt = isTerminal ? now : null

    const stmt = this.db.prepare(
      `UPDATE agent_executions
       SET status = ?,
           output_summary = COALESCE(?, output_summary),
           error = COALESCE(?, error),
           approval_status = COALESCE(?, approval_status),
           changed_files_json = COALESCE(?, changed_files_json),
           completed_at = COALESCE(?, completed_at),
           updated_at = ?
       WHERE id = ?`
    )
    stmt.run(
      options.status,
      options.outputSummary ?? null,
      options.error ?? null,
      options.approvalStatus ?? null,
      options.changedFiles ? JSON.stringify(options.changedFiles) : null,
      completedAt,
      now,
      options.executionId
    )
  }

  repromptAgentExecution(options: {
    executionId: string
    prompt: string
    status?: AgentExecutionStatus
  }): AgentExecutionRecord | null {
    const existing = this.getAgentExecution(options.executionId)
    if (!existing) {
      return null
    }
    const now = Date.now()
    const nextStatus = options.status ?? 'queued'
    this.db
      .prepare(
        `UPDATE agent_executions
         SET status = ?,
             prompt = ?,
             approval_status = NULL,
             output_summary = NULL,
             error = NULL,
             completed_at = NULL,
             updated_at = ?
         WHERE id = ?`
      )
      .run(nextStatus, options.prompt, now, options.executionId)
    return this.getAgentExecution(options.executionId)
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
    return {
      id: String(row.id),
      taskId: String(row.task_id),
      projectId: String(row.project_id),
      agentId: String(row.agent_id),
      agentType: String(row.agent_type),
      model: String(row.model),
      status: isExecutionStatus(row.status) ? row.status : 'failed',
      prompt: String(row.prompt),
      branchOrWorktree: row.branch_or_worktree ? String(row.branch_or_worktree) : undefined,
      worktreePath: row.worktree_path ? String(row.worktree_path) : undefined,
      baseBranch: row.base_branch ? String(row.base_branch) : undefined,
      approvalStatus: isApprovalStatus(row.approval_status) ? row.approval_status : undefined,
      changedFiles: parseChangedFiles(row.changed_files_json),
      outputSummary: row.output_summary ? String(row.output_summary) : undefined,
      idempotencyKey: String(row.idempotency_key),
      logs: parseExecutionLogs(row.logs_json),
      startedAt: row.started_at ? Number(row.started_at) : undefined,
      completedAt: row.completed_at ? Number(row.completed_at) : undefined,
      error: row.error ? String(row.error) : undefined,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at)
    }
  }
}
