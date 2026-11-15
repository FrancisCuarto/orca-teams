import type {
  TeamApproveExecutionRequest,
  TeamRejectExecutionRequest
} from '../../shared/teamwork/team-ipc-types'
import type { AgentExecutionRecord } from '../../shared/teamwork/team-workspace-types'
import { appendExecutionLog, cloneExecutionRecord } from './team-agent-process-stream'
import { discardCardWorktree, mergeWorktreeToBase } from './team-worktree-provisioner'

export async function applyExecutionApproval(options: {
  record: AgentExecutionRecord
  request: TeamApproveExecutionRequest
  mergeWorktreeToBaseFn?: typeof mergeWorktreeToBase
  onPersistAndEmit: (record: AgentExecutionRecord) => void
}): Promise<AgentExecutionRecord> {
  const { record, request, onPersistAndEmit } = options
  const actor = request.actorName?.trim() || request.actorUserId || 'Equipo'
  if (request.mergeToBase && record.worktreePath && record.branchOrWorktree) {
    const merger = options.mergeWorktreeToBaseFn ?? mergeWorktreeToBase
    try {
      const result = await merger({
        worktreePath: record.worktreePath,
        branch: record.branchOrWorktree,
        baseBranch: record.baseBranch,
        commitMessage: `feat(team): ${record.taskId} (${record.agentId})`
      })
      if (result.changedFiles.length > 0) {
        record.changedFiles = result.changedFiles
      }
      appendExecutionLog(record, 'info', `${actor} aprobó ejecución. ${result.message}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendExecutionLog(record, 'error', `Error al integrar worktree: ${msg}`)
      record.error = msg
      onPersistAndEmit(record)
      return cloneExecutionRecord(record)
    }
  } else {
    appendExecutionLog(record, 'info', `${actor} aprobó la ejecución.`)
  }

  record.approvalStatus = 'approved'
  record.status = 'completed'
  record.completedAt ??= Date.now()
  record.updatedAt = Date.now()
  onPersistAndEmit(record)
  return cloneExecutionRecord(record)
}

export async function applyExecutionRejection(options: {
  record: AgentExecutionRecord
  request: TeamRejectExecutionRequest
  discardWorktreeFn?: typeof discardCardWorktree
  onPersistAndEmit: (record: AgentExecutionRecord) => void
}): Promise<AgentExecutionRecord> {
  const { record, request, onPersistAndEmit } = options
  const actor = request.actorName?.trim() || request.actorUserId || 'Equipo'
  if (request.discardWorktree && record.worktreePath) {
    const discarder = options.discardWorktreeFn ?? discardCardWorktree
    await discarder({
      worktreePath: record.worktreePath,
      branch: record.branchOrWorktree
    })
    appendExecutionLog(record, 'warn', `Worktree descartado (${record.worktreePath}).`)
  }
  const reason = request.reason?.trim()
  appendExecutionLog(
    record,
    'warn',
    reason ? `${actor} rechazó la ejecución: ${reason}` : `${actor} rechazó la ejecución.`
  )
  record.approvalStatus = 'rejected'
  record.status = 'cancelled'
  record.completedAt ??= Date.now()
  record.updatedAt = Date.now()
  onPersistAndEmit(record)
  return cloneExecutionRecord(record)
}
