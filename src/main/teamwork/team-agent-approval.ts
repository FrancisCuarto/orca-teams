import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runProcess } from '@orca/process-host'
import type {
  TeamApproveExecutionRequest,
  TeamCreateReviewRequestRequest,
  TeamExecutionDiffFile,
  TeamExecutionDiffFileStatus,
  TeamExecutionDiffResult,
  TeamRefreshReviewRequestRequest,
  TeamRejectExecutionRequest,
  TeamRequestExecutionChangesRequest
} from '../../shared/teamwork/team-ipc-types'
import type { AgentExecutionRecord } from '../../shared/teamwork/team-workspace-types'
import { appendExecutionLog, cloneExecutionRecord } from './team-agent-process-stream'
import {
  pushAndCreateReviewRequest,
  queryReviewRequestState
} from './team-review-provider'
import { discardCardWorktree, mergeWorktreeToBase } from './team-worktree-provisioner'

const MAX_DIFF_CHARS = 120_000
const MAX_DIFF_OUTPUT_BYTES = 512 * 1024
const MAX_UNTRACKED_FILES = 40
const MAX_UNTRACKED_PREVIEW_BYTES = 24 * 1024

export type GitCommandResult = {
  code: number | null
  stdout: string
  stderr: string
  outputTruncated?: boolean
}

export type RunGitCommandFn = (
  cwd: string,
  args: string[],
  options?: { maxOutputBytes?: number; timeoutMs?: number }
) => Promise<GitCommandResult>

async function defaultRunGitCommand(
  cwd: string,
  args: string[],
  options?: { maxOutputBytes?: number; timeoutMs?: number }
): Promise<GitCommandResult> {
  const result = await runProcess({
    program: 'git',
    args,
    cwd,
    timeoutMs: options?.timeoutMs ?? 20_000,
    maxOutputBytes: options?.maxOutputBytes ?? MAX_DIFF_OUTPUT_BYTES
  })
  return {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    outputTruncated: result.outputTruncated
  }
}

function parseGitStatusCode(code: string): TeamExecutionDiffFileStatus {
  const normalized = code.trim().toUpperCase()
  if (normalized.startsWith('A') || normalized.startsWith('C')) {
    return 'added'
  }
  if (normalized.startsWith('D')) {
    return 'deleted'
  }
  if (normalized.startsWith('R')) {
    return 'renamed'
  }
  return 'modified'
}

export function parseGitNameStatus(stdout: string): Map<string, TeamExecutionDiffFileStatus> {
  const statusByPath = new Map<string, TeamExecutionDiffFileStatus>()
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    const parts = line.split('\t')
    const code = parts[0] ?? ''
    const status = parseGitStatusCode(code)
    const filePath = status === 'renamed' ? (parts[2] ?? parts[1] ?? '').trim() : (parts[1] ?? '').trim()
    if (filePath) {
      statusByPath.set(filePath, status)
    }
  }
  return statusByPath
}

export function parseGitNumstat(
  stdout: string,
  statusByPath: Map<string, TeamExecutionDiffFileStatus>
): TeamExecutionDiffFile[] {
  const files: TeamExecutionDiffFile[] = []
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    const parts = line.split('\t')
    if (parts.length < 3) {
      continue
    }
    const addRaw = parts[0] ?? '0'
    const delRaw = parts[1] ?? '0'
    const filePath = parts.slice(2).join('\t').trim()
    if (!filePath) {
      continue
    }
    const additions = addRaw === '-' ? 0 : Number.parseInt(addRaw, 10) || 0
    const deletions = delRaw === '-' ? 0 : Number.parseInt(delRaw, 10) || 0
    const status: TeamExecutionDiffFileStatus = filePath.includes(' => ')
      ? 'renamed'
      : (statusByPath.get(filePath) ?? 'modified')
    files.push({
      path: filePath,
      status,
      additions,
      deletions
    })
  }
  return files
}

async function resolveDiffBaseRef(
  worktreePath: string,
  baseBranch: string | undefined,
  runGit: RunGitCommandFn
): Promise<string | null> {
  const trimmedBase = baseBranch?.trim()
  if (trimmedBase && trimmedBase !== 'HEAD') {
    const mergeBase = await runGit(worktreePath, ['merge-base', trimmedBase, 'HEAD'])
    if (mergeBase.code === 0 && mergeBase.stdout.trim()) {
      return mergeBase.stdout.trim()
    }
    const verifiedBase = await runGit(worktreePath, ['rev-parse', '--verify', trimmedBase])
    if (verifiedBase.code === 0 && verifiedBase.stdout.trim()) {
      return trimmedBase
    }
  }
  const verifiedHead = await runGit(worktreePath, ['rev-parse', '--verify', 'HEAD'])
  if (verifiedHead.code === 0 && verifiedHead.stdout.trim()) {
    return 'HEAD'
  }
  return null
}

async function collectUntrackedDiffs(
  worktreePath: string,
  existingPaths: Set<string>,
  runGit: RunGitCommandFn
): Promise<{ files: TeamExecutionDiffFile[]; diffBlocks: string[] }> {
  const untrackedRes = await runGit(worktreePath, ['ls-files', '--others', '--exclude-standard'])
  if (untrackedRes.code !== 0 || !untrackedRes.stdout.trim()) {
    return { files: [], diffBlocks: [] }
  }

  const files: TeamExecutionDiffFile[] = []
  const diffBlocks: string[] = []
  const candidates = untrackedRes.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !existingPaths.has(line))
    .slice(0, MAX_UNTRACKED_FILES)

  for (const relPath of candidates) {
    const fullPath = path.join(worktreePath, relPath)
    let additions = 0
    let block = ''
    try {
      const buf = await readFile(fullPath)
      const isBinary = buf.subarray(0, 4096).includes(0)
      if (isBinary) {
        block = `diff --git a/${relPath} b/${relPath}\nnew file mode 100644\nBinary files /dev/null and b/${relPath} differ`
      } else {
        const truncatedFile = buf.length > MAX_UNTRACKED_PREVIEW_BYTES
        const text = (truncatedFile ? buf.subarray(0, MAX_UNTRACKED_PREVIEW_BYTES) : buf).toString(
          'utf8'
        )
        const normalized = text.replace(/\r?\n$/, '')
        const lines = normalized.length === 0 ? [] : normalized.split(/\r?\n/)
        additions = lines.length
        const body = lines.map((line) => `+${line}`).join('\n')
        const header = `diff --git a/${relPath} b/${relPath}\nnew file mode 100644\n--- /dev/null\n+++ b/${relPath}\n@@ -0,0 +1,${Math.max(1, additions)} @@`
        block = body ? `${header}\n${body}` : header
      }
    } catch {
      block = `diff --git a/${relPath} b/${relPath}\nnew file mode 100644`
    }
    files.push({
      path: relPath,
      status: 'untracked',
      additions,
      deletions: 0
    })
    if (block) {
      diffBlocks.push(block)
    }
  }

  return { files, diffBlocks }
}

function truncateUnifiedDiff(
  rawDiff: string,
  outputTruncated: boolean
): { diff: string; truncated: boolean } {
  if (rawDiff.length <= MAX_DIFF_CHARS) {
    return { diff: rawDiff, truncated: outputTruncated }
  }
  const slice = rawDiff.slice(0, MAX_DIFF_CHARS)
  const lastNewline = slice.lastIndexOf('\n')
  const cleanSlice = lastNewline > 0 ? slice.slice(0, lastNewline) : slice
  return { diff: cleanSlice, truncated: true }
}

export async function inspectExecutionDiff(options: {
  record: AgentExecutionRecord
  runGitFn?: RunGitCommandFn
}): Promise<TeamExecutionDiffResult> {
  const { record } = options
  const worktreePath = record.worktreePath?.trim()
  if (!worktreePath || !existsSync(worktreePath)) {
    return {
      executionId: record.id,
      worktreePath: record.worktreePath,
      baseBranch: record.baseBranch,
      branch: record.branchOrWorktree,
      files: [],
      diff: '',
      truncated: false,
      error: 'No hay worktree activo disponible para inspeccionar cambios.'
    }
  }

  const runGit = options.runGitFn ?? defaultRunGitCommand
  try {
    const baseRef = await resolveDiffBaseRef(worktreePath, record.baseBranch, runGit)
    const numstatArgs = baseRef ? ['diff', '--numstat', baseRef] : ['diff', '--numstat']
    const nameStatusArgs = baseRef ? ['diff', '--name-status', baseRef] : ['diff', '--name-status']
    const diffArgs = baseRef ? ['diff', '--no-color', baseRef] : ['diff', '--no-color']

    const [numstatRes, nameStatusRes, diffRes] = await Promise.all([
      runGit(worktreePath, numstatArgs),
      runGit(worktreePath, nameStatusArgs),
      runGit(worktreePath, diffArgs, { maxOutputBytes: MAX_DIFF_OUTPUT_BYTES })
    ])

    if (diffRes.code !== 0 && numstatRes.code !== 0) {
      return {
        executionId: record.id,
        worktreePath,
        baseBranch: record.baseBranch,
        branch: record.branchOrWorktree,
        files: [],
        diff: '',
        truncated: false,
        error: diffRes.stderr.trim() || numstatRes.stderr.trim() || 'No se pudo calcular git diff.'
      }
    }

    const statusByPath =
      nameStatusRes.code === 0
        ? parseGitNameStatus(nameStatusRes.stdout)
        : new Map<string, TeamExecutionDiffFileStatus>()
    const trackedFiles = numstatRes.code === 0 ? parseGitNumstat(numstatRes.stdout, statusByPath) : []
    const existingPaths = new Set(trackedFiles.map((file) => file.path))
    const untracked = await collectUntrackedDiffs(worktreePath, existingPaths, runGit)
    const files = [...trackedFiles, ...untracked.files]

    const combinedDiffParts = [diffRes.stdout.trimEnd(), ...untracked.diffBlocks].filter(Boolean)
    const { diff, truncated } = truncateUnifiedDiff(
      combinedDiffParts.join('\n'),
      Boolean(diffRes.outputTruncated)
    )

    return {
      executionId: record.id,
      worktreePath,
      baseBranch: baseRef ?? record.baseBranch,
      branch: record.branchOrWorktree,
      files,
      diff,
      truncated
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      executionId: record.id,
      worktreePath,
      baseBranch: record.baseBranch,
      branch: record.branchOrWorktree,
      files: [],
      diff: '',
      truncated: false,
      error: `Error al ejecutar git diff: ${message}`
    }
  }
}

export function appendFeedbackToExecutionPrompt(
  existingPrompt: string,
  feedback: string,
  actor?: string
): string {
  const cleanFeedback = feedback.trim()
  const reviewer = actor?.trim() || 'Equipo'
  return `${existingPrompt.trimEnd()}\n\n## Correcciones solicitadas (${reviewer})\n${cleanFeedback}\n\nAplica únicamente las correcciones solicitadas manteniendo los avances válidos existentes en el worktree actual.`
}

export function prepareExecutionChangeRequest(options: {
  record: AgentExecutionRecord
  request: TeamRequestExecutionChangesRequest
  onPersistAndEmit: (record: AgentExecutionRecord) => void
}): { requiresApproval: boolean } {
  const { record, request, onPersistAndEmit } = options
  if (record.status !== 'waiting_for_input' && record.status !== 'completed') {
    throw new Error(
      `Solo se pueden pedir correcciones cuando la ejecución está en 'waiting_for_input' o 'completed' (estado actual: '${record.status}').`
    )
  }

  const feedback = request.feedback.trim()
  if (!feedback) {
    throw new Error('Debes ingresar instrucciones de corrección para el agente.')
  }

  const actor = request.actorName?.trim() || request.actorUserId?.trim() || 'Equipo'
  const requiresApproval =
    record.status === 'waiting_for_input' || record.approvalStatus !== undefined

  record.prompt = appendFeedbackToExecutionPrompt(record.prompt, feedback, actor)
  record.status = 'queued'
  record.approvalStatus = undefined
  record.completedAt = undefined
  record.error = undefined
  record.outputSummary = undefined
  record.updatedAt = Date.now()
  appendExecutionLog(record, 'info', `${actor} solicitó correcciones: ${feedback}`)
  onPersistAndEmit(record)

  return { requiresApproval }
}

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
