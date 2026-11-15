import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type { AgentExecutionRecord } from '../../shared/teamwork/team-workspace-types'
import type {
  TeamApproveExecutionRequest,
  TeamExecutionDiffResult,
  TeamExecutionEvent,
  TeamRejectExecutionRequest,
  TeamRequestExecutionChangesRequest,
  TeamStartExecutionRequest
} from '../../shared/teamwork/team-ipc-types'
import { hydrateShellPathForAgentDetection } from '../ipc/command-path/agent-detection-shell-path'
import { resolveCommandOnLocalPath } from '../ipc/command-path/command-path-resolver'
import {
  buildAgentCliCommand,
  buildKanbanAgentPrompt,
  extractCardAgentAssignment,
  resolveAgentCommand
} from './team-agent-command'
import {
  applyExecutionApproval,
  applyExecutionRejection,
  inspectExecutionDiff,
  prepareExecutionChangeRequest,
  type RunGitCommandFn
} from './team-agent-approval'
import {
  appendExecutionLog,
  cloneExecutionRecord,
  resolveWorkingDirectory,
  wireAgentChildProcess
} from './team-agent-process-stream'
import {
  inspectWorktreeChanges,
  provisionCardWorktree,
  type discardCardWorktree,
  type mergeWorktreeToBase,
  type ProvisionedWorktree
} from './team-worktree-provisioner'

export { buildAgentCliCommand, buildKanbanAgentPrompt, resolveAgentCommand }

const KILL_GRACE_MS = 1_500

export type TeamAgentRunnerDeps = {
  hydrateShellPath?: () => Promise<void>
  resolveExecutable?: (command: string) => Promise<string | null>
  spawnProcess?: (
    bin: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv }
  ) => ChildProcess
  getFallbackHomeDir?: () => string
  provisionWorktree?: (options: {
    projectPath?: string | null
    cardId: string
    cardTitle: string
    preferredBranch?: string
  }) => Promise<ProvisionedWorktree>
  inspectWorktreeChanges?: (worktreePath: string) => Promise<string[]>
  runGitCommand?: RunGitCommandFn
  mergeWorktreeToBase?: typeof mergeWorktreeToBase
  discardWorktree?: typeof discardCardWorktree
  onPersistExecution?: (record: AgentExecutionRecord) => void
  onLookupPersistedExecution?: (executionId: string) => AgentExecutionRecord | null
  onLookupLatestForCard?: (cardId: string) => AgentExecutionRecord | null
  onNotifyOutcome?: (record: AgentExecutionRecord) => void
}

export class TeamAgentRunner {
  private readonly executions = new Map<string, AgentExecutionRecord>()
  private readonly latestByCard = new Map<string, string>()
  private readonly activeProcesses = new Map<string, ChildProcess>()
  private readonly cancelledIds = new Set<string>()
  private readonly listeners = new Map<string, (event: TeamExecutionEvent) => void>()

  constructor(private readonly deps: TeamAgentRunnerDeps = {}) {}

  async startExecution(
    req: TeamStartExecutionRequest,
    onEvent: (event: TeamExecutionEvent) => void
  ): Promise<AgentExecutionRecord> {
    const { agentId, model } = extractCardAgentAssignment(req.card)
    const command = resolveAgentCommand(agentId)
    const prompt = buildKanbanAgentPrompt(req)
    const now = Date.now()
    const executionId = `exec-${now}-${randomUUID().slice(0, 8)}`
    const requiresApproval = req.requiresApproval ?? req.card.requiresApproval ?? false
    const isolateWorktree = req.isolateWorktree ?? req.card.isolateWorktree ?? true

    const record: AgentExecutionRecord = {
      id: executionId,
      taskId: req.card.id,
      projectId: req.projectId,
      agentId,
      agentType: command,
      model: model ?? 'default',
      status: 'queued',
      prompt,
      branchOrWorktree: req.card.branchOrWorktree,
      logs: [
        {
          timestamp: now,
          level: 'info',
          message: `Tarea encolada para ${agentId} (${command}).`
        }
      ],
      idempotencyKey: `${req.card.id}-${executionId}`,
      createdAt: now,
      updatedAt: now
    }

    this.executions.set(executionId, record)
    this.latestByCard.set(req.card.id, executionId)
    this.listeners.set(executionId, onEvent)
    this.emitUpdated(record)

    let workingDirInput = req.projectPath
    if (isolateWorktree && req.projectPath?.trim()) {
      const provisioner = this.deps.provisionWorktree ?? provisionCardWorktree
      try {
        const wt = await provisioner({
          projectPath: req.projectPath,
          cardId: req.card.id,
          cardTitle: req.card.title,
          preferredBranch: req.card.branchOrWorktree
        })
        if (wt.isGitRepo && wt.workDir) {
          workingDirInput = wt.workDir
          record.worktreePath = wt.workDir
          record.branchOrWorktree = wt.branch ?? record.branchOrWorktree
          record.baseBranch = wt.baseBranch
          appendExecutionLog(
            record,
            'info',
            wt.reused
              ? `Reutilizando worktree aislado (${wt.branch ?? 'git'}) en ${wt.workDir}`
              : `Worktree aislado creado (${wt.branch ?? 'git'}) en ${wt.workDir}`
          )
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        appendExecutionLog(
          record,
          'warn',
          `No se pudo crear worktree aislado (${msg}); ejecutando en workspace principal.`
        )
      }
    }

    await this.launchExecutionProcess({
      record,
      command,
      model,
      workingDirInput,
      requiresApproval,
      launchActionLabel: 'Ejecutando'
    })

    return cloneExecutionRecord(record)
  }

  async getExecutionDiff(executionId: string): Promise<TeamExecutionDiffResult> {
    const record = this.getExecution(executionId)
    if (!record) {
      return {
        executionId,
        files: [],
        diff: '',
        truncated: false,
        error: 'Ejecución no encontrada.'
      }
    }
    return inspectExecutionDiff({
      record,
      runGitFn: this.deps.runGitCommand
    })
  }

  async requestExecutionChanges(
    request: TeamRequestExecutionChangesRequest,
    onEvent?: (event: TeamExecutionEvent) => void
  ): Promise<AgentExecutionRecord | null> {
    const record = this.loadMutableExecution(request.executionId)
    if (!record) {
      return null
    }
    if (onEvent) {
      this.listeners.set(record.id, onEvent)
    }
    if (this.activeProcesses.has(record.id)) {
      throw new Error('La ejecución ya tiene un proceso activo en curso.')
    }

    const { requiresApproval } = prepareExecutionChangeRequest({
      record,
      request,
      onPersistAndEmit: (updated) => this.emitUpdated(updated)
    })

    this.cancelledIds.delete(record.id)
    this.latestByCard.set(record.taskId, record.id)

    const command = record.agentType.trim() || resolveAgentCommand(record.agentId)
    const model = record.model && record.model !== 'default' ? record.model : undefined

    await this.launchExecutionProcess({
      record,
      command,
      model,
      workingDirInput: record.worktreePath,
      requiresApproval,
      launchActionLabel: 'Re-ejecutando con correcciones'
    })

    return cloneExecutionRecord(record)
  }

  async approveExecution(
    request: TeamApproveExecutionRequest
  ): Promise<AgentExecutionRecord | null> {
    const record = this.loadMutableExecution(request.executionId)
    if (!record) {
      return null
    }
    return applyExecutionApproval({
      record,
      request,
      mergeWorktreeToBaseFn: this.deps.mergeWorktreeToBase,
      onPersistAndEmit: (updated) => this.emitUpdated(updated)
    })
  }

  async rejectExecution(request: TeamRejectExecutionRequest): Promise<AgentExecutionRecord | null> {
    const record = this.loadMutableExecution(request.executionId)
    if (!record) {
      return null
    }
    return applyExecutionRejection({
      record,
      request,
      discardWorktreeFn: this.deps.discardWorktree,
      onPersistAndEmit: (updated) => this.emitUpdated(updated)
    })
  }

  private async launchExecutionProcess(options: {
    record: AgentExecutionRecord
    command: string
    model?: string
    workingDirInput?: string | null
    requiresApproval: boolean
    launchActionLabel: string
  }): Promise<void> {
    const { record, command, model, workingDirInput, requiresApproval, launchActionLabel } = options
    const hydrate = this.deps.hydrateShellPath ?? (() => hydrateShellPathForAgentDetection())
    const resolveExec =
      this.deps.resolveExecutable ?? ((cmd: string) => resolveCommandOnLocalPath(cmd))
    await hydrate()
    const resolvedBin = await resolveExec(command)

    if (!resolvedBin) {
      record.status = 'failed'
      record.error = `No se encontró el binario '${command}' en PATH.`
      record.completedAt = Date.now()
      record.updatedAt = record.completedAt
      appendExecutionLog(record, 'error', record.error)
      this.emitUpdated(record)
      this.deps.onNotifyOutcome?.(cloneExecutionRecord(record))
      return
    }

    const cli = buildAgentCliCommand(resolvedBin, record.prompt, model)
    const cwd = resolveWorkingDirectory(
      workingDirInput,
      this.deps.getFallbackHomeDir ? this.deps.getFallbackHomeDir() : homedir()
    )

    record.status = 'running'
    record.startedAt = Date.now()
    record.updatedAt = record.startedAt
    appendExecutionLog(record, 'info', `${launchActionLabel}: ${command} en ${cwd}`)
    this.emitUpdated(record)

    const spawnFn =
      this.deps.spawnProcess ??
      ((bin, args, opts) =>
        spawn(bin, args, {
          cwd: opts.cwd,
          env: opts.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        }))

    const inspectFn = this.deps.inspectWorktreeChanges ?? inspectWorktreeChanges

    try {
      const child = spawnFn(cli.bin, cli.args, { cwd, env: { ...process.env } })
      this.activeProcesses.set(record.id, child)
      const worktreePath = record.worktreePath
      wireAgentChildProcess({
        executionId: record.id,
        record,
        child,
        requiresApproval,
        inspectChanges: worktreePath ? () => inspectFn(worktreePath) : undefined,
        isCancelled: () => this.cancelledIds.has(record.id),
        onFinishProcess: () => this.activeProcesses.delete(record.id),
        onEmitUpdated: () => this.emitUpdated(record),
        onNotifyOutcome: () => this.deps.onNotifyOutcome?.(cloneExecutionRecord(record))
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      record.status = 'failed'
      record.error = `Error al iniciar '${command}': ${message}`
      record.completedAt = Date.now()
      record.updatedAt = record.completedAt
      appendExecutionLog(record, 'error', record.error)
      this.emitUpdated(record)
      this.deps.onNotifyOutcome?.(cloneExecutionRecord(record))
    }
  }

  private loadMutableExecution(executionId: string): AgentExecutionRecord | null {
    const mem = this.executions.get(executionId)
    if (mem) {
      return mem
    }
    const persisted = this.deps.onLookupPersistedExecution?.(executionId)
    if (!persisted) {
      return null
    }
    const cloned = cloneExecutionRecord(persisted)
    this.executions.set(executionId, cloned)
    return cloned
  }

  private emitUpdated(record: AgentExecutionRecord): void {
    const snapshot = cloneExecutionRecord(record)
    this.deps.onPersistExecution?.(snapshot)
    this.listeners.get(record.id)?.({ type: 'updated', execution: snapshot })
  }

  cancelExecution(executionId: string): AgentExecutionRecord | null {
    const record = this.executions.get(executionId)
    if (!record) {
      return null
    }
    this.cancelledIds.add(executionId)
    record.status = 'cancelled'
    record.completedAt = Date.now()
    record.updatedAt = record.completedAt
    appendExecutionLog(record, 'warn', 'Ejecución cancelada por el usuario.')

    const child = this.activeProcesses.get(executionId)
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      const killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
        }
      }, KILL_GRACE_MS)
      if (typeof killTimer.unref === 'function') {
        killTimer.unref()
      }
    }

    this.emitUpdated(record)
    return cloneExecutionRecord(record)
  }

  getExecution(executionId: string): AgentExecutionRecord | null {
    const mem = this.executions.get(executionId)
    if (mem) {
      return cloneExecutionRecord(mem)
    }
    return this.deps.onLookupPersistedExecution?.(executionId) ?? null
  }

  getLatestExecutionForCard(cardId: string): AgentExecutionRecord | null {
    const latestId = this.latestByCard.get(cardId)
    if (latestId) {
      const mem = this.executions.get(latestId)
      if (mem) {
        return cloneExecutionRecord(mem)
      }
    }
    return this.deps.onLookupLatestForCard?.(cardId) ?? null
  }

  dispose(): void {
    for (const [id, child] of this.activeProcesses) {
      this.cancelledIds.add(id)
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
      }
    }
    this.activeProcesses.clear()
  }
}
