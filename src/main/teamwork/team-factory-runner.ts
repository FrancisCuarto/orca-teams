import type { ChildProcess } from 'node:child_process'
import { homedir } from 'node:os'
import type {
  FactoryConfig,
  FactoryRunRecord,
  FactoryStage,
  FactoryStageAgentConfig,
  FactoryStageRecord
} from '../../shared/teamwork/team-factory-types'
import type {
  TeamFactoryEvent,
  TeamResolveFactoryGateRequest,
  TeamStartFactoryRunRequest
} from '../../shared/teamwork/team-ipc-types'
import { resolveWorkingDirectory } from './team-agent-process-stream'
import {
  runIsolatedAgentStep,
  type AgentStepExecutionInput,
  type AgentStepExecutionOutput,
  type AgentStepExecutorDeps
} from './team-factory-agent-step'
import { loadFactoryBrainContext, proposeFactorySpecNoteToBrain } from './team-factory-brain'
import { runDeterministicChecks } from './team-factory-gate'
import {
  appendFactoryLog,
  applyHumanGateResolution,
  beginFactoryStage,
  createInitialFactoryRun,
  executeFactoryPipeline,
  finishFactoryStage
} from './team-factory-pipeline'
import { collectFactoryDiff, prepareFactoryWorktree } from './team-factory-worktree'

const KILL_GRACE_MS = 1_500

export type TeamFactoryRunnerDeps = AgentStepExecutorDeps & {
  getFallbackHomeDir?: () => string
  loadConfig?: (projectId: string) => FactoryConfig | null
  onPersistRun?: (run: FactoryRunRecord) => void
  onLookupRun?: (runId: string) => FactoryRunRecord | null
  onLookupLatestForCard?: (cardId: string) => FactoryRunRecord | null
  onListRuns?: (projectId: string) => FactoryRunRecord[]
  executeAgentStep?: (input: AgentStepExecutionInput) => Promise<AgentStepExecutionOutput>
  prepareWorkspace?: typeof prepareFactoryWorktree
  collectDiff?: typeof collectFactoryDiff
  runChecks?: typeof runDeterministicChecks
  loadBrain?: typeof loadFactoryBrainContext
  proposeBrainNote?: typeof proposeFactorySpecNoteToBrain
}

function cloneRun(run: FactoryRunRecord): FactoryRunRecord {
  return structuredClone(run)
}

export class TeamFactoryRunner {
  private readonly runs = new Map<string, FactoryRunRecord>()
  private readonly latestByCard = new Map<string, string>()
  private readonly activeChildren = new Map<string, Set<ChildProcess>>()
  private readonly cancelledRunIds = new Set<string>()
  private readonly listeners = new Set<(event: TeamFactoryEvent) => void>()

  constructor(private readonly deps: TeamFactoryRunnerDeps = {}) {}

  subscribe(listener: (event: TeamFactoryEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async startRun(
    req: TeamStartFactoryRunRequest,
    onEvent?: (event: TeamFactoryEvent) => void
  ): Promise<FactoryRunRecord> {
    if (onEvent) {
      this.listeners.add(onEvent)
    }

    const cardAgent: FactoryStageAgentConfig | undefined =
      req.card.assignee?.type === 'agent'
        ? {
            agentId: req.card.assignee.agentType ?? req.card.assignee.name,
            ...(req.card.assignee.model ? { model: req.card.assignee.model } : {})
          }
        : undefined

    const loaded = req.configOverride
      ? undefined
      : (this.deps.loadConfig?.(req.projectId) ?? undefined)
    const { run, config } = createInitialFactoryRun(
      loaded ? { ...req, configOverride: loaded } : req,
      cardAgent
    )

    this.runs.set(run.id, run)
    this.latestByCard.set(req.card.id, run.id)
    this.activeChildren.set(run.id, new Set())
    appendFactoryLog(run, 'queued', 'info', `Software Factory iniciada para "${req.card.title}".`)
    this.emitUpdated(run)

    void this.runPipelineSafely(run, req, config, cardAgent)
    return cloneRun(run)
  }

  private async runPipelineSafely(
    run: FactoryRunRecord,
    req: TeamStartFactoryRunRequest,
    config: FactoryConfig,
    cardAgent?: FactoryStageAgentConfig
  ): Promise<void> {
    const fallbackDir = resolveWorkingDirectory(
      req.projectPath,
      this.deps.getFallbackHomeDir ? this.deps.getFallbackHomeDir() : homedir()
    )

    try {
      await executeFactoryPipeline({
        run,
        req,
        config,
        cardAgent,
        fallbackDir,
        isCancelled: () => this.cancelledRunIds.has(run.id),
        prepareWorkspace: this.deps.prepareWorkspace ?? prepareFactoryWorktree,
        loadBrain: this.deps.loadBrain ?? loadFactoryBrainContext,
        proposeBrainNote: this.deps.proposeBrainNote ?? proposeFactorySpecNoteToBrain,
        runChecks: this.deps.runChecks ?? runDeterministicChecks,
        collectDiff: this.deps.collectDiff ?? collectFactoryDiff,
        runAgent: (stage, agent, cwd, prompt) => this.runAgent(run, stage, agent, cwd, prompt),
        beginStage: (stage, label, attempt, agent) => {
          const entry = beginFactoryStage(run, stage, label, attempt, agent)
          this.emitUpdated(run)
          return entry
        },
        finishStage: (entry: FactoryStageRecord, status, summary, error) => {
          finishFactoryStage(entry, status, summary, error)
          this.emitUpdated(run)
        },
        appendLog: (stage, level, message) => appendFactoryLog(run, stage, level, message),
        emitUpdated: () => this.emitUpdated(run),
        failRun: (error) => {
          run.status = 'failed'
          run.currentStage = 'failed'
          run.error = error
          run.completedAt = Date.now()
          appendFactoryLog(run, 'failed', 'error', error)
          this.emitUpdated(run)
        }
      })
    } catch (err) {
      if (!this.cancelledRunIds.has(run.id)) {
        const error = err instanceof Error ? err.message : String(err)
        run.status = 'failed'
        run.currentStage = 'failed'
        run.error = error
        run.completedAt = Date.now()
        appendFactoryLog(run, 'failed', 'error', error)
        this.emitUpdated(run)
      }
    } finally {
      this.activeChildren.delete(run.id)
    }
  }

  private runAgent(
    run: FactoryRunRecord,
    stage: FactoryStage,
    agent: FactoryStageAgentConfig,
    cwd: string,
    prompt: string
  ): Promise<AgentStepExecutionOutput> {
    const input: AgentStepExecutionInput = {
      agentId: agent.agentId,
      model: agent.model,
      prompt,
      cwd,
      onLog: (level, msg) => {
        appendFactoryLog(run, stage, level, `[${stage}:${agent.agentId}] ${msg}`)
        this.emitUpdated(run)
      },
      onRegisterChild: (child) => {
        const set = this.activeChildren.get(run.id)
        set?.add(child)
        return () => set?.delete(child)
      },
      isCancelled: () => this.cancelledRunIds.has(run.id)
    }
    if (this.deps.executeAgentStep) {
      return this.deps.executeAgentStep(input)
    }
    return runIsolatedAgentStep(input, this.deps)
  }

  private emitUpdated(run: FactoryRunRecord): void {
    run.updatedAt = Date.now()
    const snapshot = cloneRun(run)
    this.deps.onPersistRun?.(snapshot)
    for (const listener of this.listeners) {
      listener({ type: 'updated', run: snapshot })
    }
  }

  resolveHumanGate(request: TeamResolveFactoryGateRequest): FactoryRunRecord | null {
    const run = this.runs.get(request.runId) ?? this.deps.onLookupRun?.(request.runId) ?? null
    if (!run || run.status !== 'waiting_human') {
      return null
    }
    this.runs.set(run.id, run)
    applyHumanGateResolution(run, request)
    this.emitUpdated(run)
    return cloneRun(run)
  }

  cancelRun(runId: string): FactoryRunRecord | null {
    const run = this.runs.get(runId) ?? this.deps.onLookupRun?.(runId) ?? null
    if (!run) {
      return null
    }
    this.cancelledRunIds.add(runId)
    for (const child of this.activeChildren.get(runId) ?? []) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL')
          }
        }, KILL_GRACE_MS).unref?.()
      }
    }
    run.status = 'cancelled'
    run.currentStage = 'cancelled'
    run.completedAt = Date.now()
    for (const stage of run.stages) {
      if (stage.status === 'running') {
        stage.status = 'cancelled'
        stage.completedAt = Date.now()
      }
    }
    appendFactoryLog(
      run,
      'cancelled',
      'warn',
      'Ejecución de Software Factory cancelada por el usuario.'
    )
    this.emitUpdated(run)
    return cloneRun(run)
  }

  getRun(runId: string): FactoryRunRecord | null {
    const mem = this.runs.get(runId)
    return mem ? cloneRun(mem) : (this.deps.onLookupRun?.(runId) ?? null)
  }

  getLatestRunForCard(cardId: string): FactoryRunRecord | null {
    const latestId = this.latestByCard.get(cardId)
    const mem = latestId ? this.runs.get(latestId) : undefined
    return mem ? cloneRun(mem) : (this.deps.onLookupLatestForCard?.(cardId) ?? null)
  }

  listRuns(projectId: string): FactoryRunRecord[] {
    const persisted = this.deps.onListRuns?.(projectId) ?? []
    const byId = new Map<string, FactoryRunRecord>()
    for (const r of persisted) {
      byId.set(r.id, r)
    }
    for (const r of this.runs.values()) {
      if (r.projectId === projectId) {
        byId.set(r.id, cloneRun(r))
      }
    }
    return Array.from(byId.values()).sort((a, b) => b.startedAt - a.startedAt)
  }

  dispose(): void {
    for (const [runId, children] of this.activeChildren) {
      this.cancelledRunIds.add(runId)
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGTERM')
        }
      }
    }
    this.activeChildren.clear()
  }
}
