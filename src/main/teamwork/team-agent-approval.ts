import { existsSync } from 'node:fs'
import type {
  TeamApproveExecutionRequest,
  TeamCreateReviewRequestRequest,
  TeamRefreshReviewRequestRequest,
  TeamRejectExecutionRequest
} from '../../shared/teamwork/team-ipc-types'
import type { AgentExecutionRecord } from '../../shared/teamwork/team-workspace-types'
import { appendExecutionLog, cloneExecutionRecord } from './team-agent-process-stream'
import {
  pushAndCreateReviewRequest,
  queryReviewRequestState
} from './team-review-provider'
import { discardCardWorktree, mergeWorktreeToBase } from './team-worktree-provisioner'

function resolveReviewWorkingDir(
  record: AgentExecutionRecord,
  projectPath?: string | null
): string | null {
  const wt = record.worktreePath?.trim()
  const proj = projectPath?.trim()
  if (wt && (existsSync(wt) || !proj)) {
    return wt
  }
  return proj || null
}

function formatProviderReviewLabel(provider: 'github' | 'gitlab', number: number): string {
  return provider === 'gitlab' ? `MR !${number} (GitLab)` : `PR #${number} (GitHub)`
}

export async function applyExecutionApproval(options: {
  record: AgentExecutionRecord
  request: TeamApproveExecutionRequest
  mergeWorktreeToBaseFn?: typeof mergeWorktreeToBase
  createReviewRequestFn?: typeof pushAndCreateReviewRequest
  onPersistAndEmit: (record: AgentExecutionRecord) => void
}): Promise<AgentExecutionRecord> {
  const { record, request, onPersistAndEmit } = options
  const actor = request.actorName?.trim() || request.actorUserId || 'Equipo'

  if (request.createPullRequestOnApprove) {
    const workingDir = resolveReviewWorkingDir(record, request.projectPath)
    if (!workingDir) {
      const msg = 'No se encontró un directorio Git válido para crear el PR/MR.'
      appendExecutionLog(record, 'error', msg)
      record.error = msg
      onPersistAndEmit(record)
      return cloneExecutionRecord(record)
    }
    const creator = options.createReviewRequestFn ?? pushAndCreateReviewRequest
    try {
      const reviewRequest = await creator({
        cwd: workingDir,
        branch: record.branchOrWorktree,
        baseBranch: record.baseBranch,
        title: request.title?.trim() || `feat(team): ${record.taskId}`,
        body: request.body?.trim() || record.outputSummary || record.prompt.slice(0, 600),
        commitMessage: `feat(team): ${record.taskId} (${record.agentId})`
      })
      record.reviewRequest = reviewRequest
      record.error = undefined
      appendExecutionLog(
        record,
        'info',
        `${actor} aprobó la ejecución y abrió ${formatProviderReviewLabel(reviewRequest.provider, reviewRequest.number)}: ${reviewRequest.url}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      appendExecutionLog(record, 'error', `Error al crear PR/MR: ${msg}`)
      record.error = msg
      onPersistAndEmit(record)
      return cloneExecutionRecord(record)
    }
  } else if (request.mergeToBase && record.worktreePath && record.branchOrWorktree) {
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
      record.error = undefined
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

export async function applyCreateReviewRequest(options: {
  record: AgentExecutionRecord
  request: TeamCreateReviewRequestRequest
  createReviewRequestFn?: typeof pushAndCreateReviewRequest
  onPersistAndEmit: (record: AgentExecutionRecord) => void
}): Promise<AgentExecutionRecord> {
  const { record, request, onPersistAndEmit } = options
  const actor = request.actorName?.trim() || request.actorUserId || 'Equipo'
  const workingDir = resolveReviewWorkingDir(record, request.projectPath)
  if (!workingDir) {
    const msg = 'No se encontró un directorio Git válido para crear el PR/MR.'
    appendExecutionLog(record, 'error', msg)
    record.error = msg
    onPersistAndEmit(record)
    return cloneExecutionRecord(record)
  }

  const creator = options.createReviewRequestFn ?? pushAndCreateReviewRequest
  try {
    const reviewRequest = await creator({
      cwd: workingDir,
      branch: record.branchOrWorktree,
      baseBranch: record.baseBranch,
      title: request.title?.trim() || `feat(team): ${record.taskId}`,
      body: request.body?.trim() || record.outputSummary || record.prompt.slice(0, 600),
      commitMessage: `feat(team): ${record.taskId} (${record.agentId})`
    })
    record.reviewRequest = reviewRequest
    record.error = undefined
    record.updatedAt = Date.now()
    appendExecutionLog(
      record,
      'info',
      `${actor} creó ${formatProviderReviewLabel(reviewRequest.provider, reviewRequest.number)}: ${reviewRequest.url}`
    )
    onPersistAndEmit(record)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    appendExecutionLog(record, 'error', `Error al crear PR/MR: ${msg}`)
    record.error = msg
    onPersistAndEmit(record)
  }
  return cloneExecutionRecord(record)
}

export async function applyRefreshReviewRequest(options: {
  record: AgentExecutionRecord
  request: TeamRefreshReviewRequestRequest
  queryReviewRequestStateFn?: typeof queryReviewRequestState
  onPersistAndEmit: (record: AgentExecutionRecord) => void
}): Promise<AgentExecutionRecord> {
  const { record, request, onPersistAndEmit } = options
  if (!record.reviewRequest) {
    return cloneExecutionRecord(record)
  }
  const workingDir = resolveReviewWorkingDir(record, request.projectPath)
  if (!workingDir) {
    const msg = 'No se encontró un directorio Git válido para consultar el estado del PR/MR.'
    appendExecutionLog(record, 'error', msg)
    record.error = msg
    onPersistAndEmit(record)
    return cloneExecutionRecord(record)
  }

  const prevState = record.reviewRequest.state
  const querier = options.queryReviewRequestStateFn ?? queryReviewRequestState
  try {
    const updatedReview = await querier({
      cwd: workingDir,
      reviewRequest: record.reviewRequest
    })
    record.reviewRequest = updatedReview
    record.error = undefined
    record.updatedAt = Date.now()
    if (updatedReview.state !== prevState) {
      appendExecutionLog(
        record,
        'info',
        `Estado de ${formatProviderReviewLabel(updatedReview.provider, updatedReview.number)} actualizado: ${prevState} -> ${updatedReview.state}.`
      )
    }
    onPersistAndEmit(record)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    appendExecutionLog(record, 'error', `Error al consultar estado de PR/MR: ${msg}`)
    record.error = msg
    onPersistAndEmit(record)
  }
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
