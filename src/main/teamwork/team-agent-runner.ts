import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import type { AgentExecutionRecord } from '../../shared/teamwork/team-workspace-types'
import type {
  TeamExecutionEvent,
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
  appendExecutionLog,
  cloneExecutionRecord,
  resolveWorkingDirectory,
  wireAgentChildProcess
} from './team-agent-process-stream'

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
  onPersistExecution?: (record: AgentExecutionRecord) => void
  onLookupPersistedExecution?: (executionId: string) => AgentExecutionRecord | null
  onLookupLatestForCard?: (cardId: string) => AgentExecutionRecord | null
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
      return cloneExecutionRecord(record)
    }

    const cli = buildAgentCliCommand(resolvedBin, prompt, model)
    const cwd = resolveWorkingDirectory(
      req.projectPath,
      this.deps.getFallbackHomeDir ? this.deps.getFallbackHomeDir() : homedir()
    )

    record.status = 'running'
    record.startedAt = Date.now()
    record.updatedAt = record.startedAt
    appendExecutionLog(record, 'info', `Ejecutando: ${command} en ${cwd}`)
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

    try {
      const child = spawnFn(cli.bin, cli.args, { cwd, env: { ...process.env } })
      this.activeProcesses.set(executionId, child)
      wireAgentChildProcess({
        executionId,
        record,
        child,
        isCancelled: () => this.cancelledIds.has(executionId),
        onFinishProcess: () => this.activeProcesses.delete(executionId),
        onEmitUpdated: () => this.emitUpdated(record)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      record.status = 'failed'
      record.error = `Error al iniciar '${command}': ${message}`
      record.completedAt = Date.now()
      record.updatedAt = record.completedAt
      appendExecutionLog(record, 'error', record.error)
      this.emitUpdated(record)
    }

    return cloneExecutionRecord(record)
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
