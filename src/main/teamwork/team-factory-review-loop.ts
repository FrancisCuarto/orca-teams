import {
  FACTORY_REVIEWER_LABELS,
  FACTORY_REVIEWER_ROLES,
  type FactoryCheckResult,
  type FactoryConfig,
  type FactoryReviewerRole,
  type FactoryReviewVerdict,
  type FactoryRunRecord,
  type FactoryStage,
  type FactoryStageAgentConfig,
  type FactoryStageRecord
} from '../../shared/teamwork/team-factory-types'
import type { TeamStartFactoryRunRequest } from '../../shared/teamwork/team-ipc-types'
import type { AgentStepExecutionOutput } from './team-factory-agent-step'
import type { loadFactoryBrainContext, proposeFactorySpecNoteToBrain } from './team-factory-brain'
import type { runDeterministicChecks } from './team-factory-gate'
import {
  buildApproverPrompt,
  buildBuilderPrompt,
  buildReviewerPrompt,
  parseApproverDecisionJson,
  parseReviewerVerdictJson
} from './team-factory-prompts'
import type {
  collectFactoryDiff,
  CollectedFactoryDiff,
  prepareFactoryWorktree,
  PreparedFactoryWorkspace
} from './team-factory-worktree'

export type FactoryPipelineContext = {
  run: FactoryRunRecord
  req: TeamStartFactoryRunRequest
  config: FactoryConfig
  cardAgent?: FactoryStageAgentConfig
  fallbackDir: string
  isCancelled: () => boolean
  prepareWorkspace: typeof prepareFactoryWorktree
  loadBrain: typeof loadFactoryBrainContext
  proposeBrainNote: typeof proposeFactorySpecNoteToBrain
  runChecks: typeof runDeterministicChecks
  collectDiff: typeof collectFactoryDiff
  runAgent: (
    stage: FactoryStage,
    agent: FactoryStageAgentConfig,
    cwd: string,
    prompt: string
  ) => Promise<AgentStepExecutionOutput>
  beginStage: (
    stage: FactoryStage,
    label: string,
    attempt: number,
    agent?: FactoryStageAgentConfig
  ) => FactoryStageRecord
  finishStage: (
    entry: FactoryStageRecord,
    status: FactoryStageRecord['status'],
    summary?: string,
    error?: string
  ) => void
  appendLog: (stage: FactoryStage, level: 'info' | 'warn' | 'error', message: string) => void
  emitUpdated: () => void
  failRun: (error: string) => void
}

export function resolveStageAgent(
  configured: FactoryStageAgentConfig,
  fallbackCardAgent?: FactoryStageAgentConfig
): FactoryStageAgentConfig {
  if (configured.agentId.trim()) {
    return configured
  }
  if (fallbackCardAgent?.agentId.trim()) {
    return fallbackCardAgent
  }
  return { agentId: 'claude' }
}

async function runSingleReviewer(
  ctx: FactoryPipelineContext,
  role: FactoryReviewerRole,
  agent: FactoryStageAgentConfig,
  cwd: string,
  specMarkdown: string,
  diff: CollectedFactoryDiff
): Promise<FactoryReviewVerdict> {
  ctx.appendLog(
    'review',
    'info',
    `Iniciando revisor ${FACTORY_REVIEWER_LABELS[role]} (${agent.agentId})...`
  )
  const result = await ctx.runAgent(
    'review',
    agent,
    cwd,
    buildReviewerPrompt({
      role,
      card: ctx.req.card,
      specMarkdown,
      diffPatch: diff.patch,
      changedFiles: diff.summary.files
    })
  )
  const verdict = parseReviewerVerdictJson({
    rawOutput: result.output,
    role,
    agentId: agent.agentId,
    model: agent.model ?? 'default',
    durationMs: result.durationMs
  })
  ctx.appendLog(
    'review',
    verdict.status === 'pass' ? 'info' : 'warn',
    `Revisor ${FACTORY_REVIEWER_LABELS[role]}: ${verdict.status.toUpperCase()} — ${verdict.summary}`
  )
  return verdict
}

export async function runBuildAndReviewLoop(
  ctx: FactoryPipelineContext,
  workspace: PreparedFactoryWorkspace
): Promise<{
  aborted: boolean
  latestChecks: FactoryCheckResult[]
  latestDiff: CollectedFactoryDiff
}> {
  const { run, req, config, cardAgent } = ctx
  const maxAttempts = Math.max(1, config.maxRetries + 1)
  let fixInstructions: string | undefined
  let failedChecks: FactoryCheckResult[] = []
  let latestChecks: FactoryCheckResult[] = []
  let latestDiff: CollectedFactoryDiff = {
    summary: { filesChanged: 0, insertions: 0, deletions: 0, files: [] },
    patch: ''
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (ctx.isCancelled()) {
      return { aborted: true, latestChecks, latestDiff }
    }
    run.attempt = attempt

    const builderAgent = resolveStageAgent(config.builder, cardAgent)
    const buildStage = ctx.beginStage(
      'build',
      `Builder TDD (Intento ${attempt})`,
      attempt,
      builderAgent
    )
    const buildResult = await ctx.runAgent(
      'build',
      builderAgent,
      workspace.workingDir,
      buildBuilderPrompt({
        card: req.card,
        specMarkdown: run.specMarkdown ?? '',
        attempt,
        fixInstructions,
        failedChecks
      })
    )
    if (ctx.isCancelled()) {
      return { aborted: true, latestChecks, latestDiff }
    }
    if (!buildResult.ok) {
      ctx.finishStage(buildStage, 'failed', undefined, buildResult.error)
      ctx.failRun(buildResult.error ?? 'Fallo en etapa Builder.')
      return { aborted: true, latestChecks, latestDiff }
    }
    ctx.finishStage(buildStage, 'passed', 'Implementación y tests completados.')

    const checksStage = ctx.beginStage(
      'checks',
      `Checks Deterministas (Intento ${attempt})`,
      attempt
    )
    latestChecks = await ctx.runChecks({
      workingDir: workspace.workingDir,
      checkCommands: config.checkCommands,
      isCancelled: ctx.isCancelled,
      onLog: (msg) => ctx.appendLog('checks', 'info', msg)
    })
    if (ctx.isCancelled()) {
      return { aborted: true, latestChecks, latestDiff }
    }
    failedChecks = latestChecks.filter((c) => !c.passed)
    if (failedChecks.length > 0) {
      const checkSummary = `Fallaron checks: ${failedChecks.map((c) => c.name).join(', ')}`
      ctx.finishStage(checksStage, 'failed', checkSummary)
      if (attempt < maxAttempts) {
        ctx.appendLog('checks', 'warn', `${checkSummary}. Reintentando Builder...`)
        fixInstructions = 'Corrige los checks deterministas fallidos antes de volver a revisión.'
        continue
      }
      break
    }
    ctx.finishStage(
      checksStage,
      latestChecks.length === 0 ? 'skipped' : 'passed',
      latestChecks.length === 0
        ? 'Sin comandos configurados.'
        : `${latestChecks.length} check(s) en verde.`
    )

    latestDiff = await ctx.collectDiff({
      workingDir: workspace.workingDir,
      isGitRepo: workspace.isGitRepo,
      baseRef: workspace.baseRef
    })

    const reviewStage = ctx.beginStage(
      'review',
      `4 Revisores en Paralelo (Intento ${attempt})`,
      attempt
    )
    const verdicts = await Promise.all(
      FACTORY_REVIEWER_ROLES.map((role) =>
        runSingleReviewer(
          ctx,
          role,
          resolveStageAgent(config.reviewers[role], cardAgent),
          workspace.workingDir,
          run.specMarkdown ?? '',
          latestDiff
        )
      )
    )
    if (ctx.isCancelled()) {
      return { aborted: true, latestChecks, latestDiff }
    }
    run.reviews = verdicts
    const failingRoles = verdicts.filter((v) => v.status !== 'pass').map((v) => v.role)
    ctx.finishStage(
      reviewStage,
      failingRoles.length === 0 ? 'passed' : 'failed',
      failingRoles.length === 0
        ? 'Los 4 revisores aprobaron.'
        : `Observaciones en: ${failingRoles.join(', ')}.`
    )

    const approverAgent = resolveStageAgent(config.approver, cardAgent)
    const approverStage = ctx.beginStage(
      'approve',
      `El Aprobador (Intento ${attempt})`,
      attempt,
      approverAgent
    )
    const approverOutput = await ctx.runAgent(
      'approve',
      approverAgent,
      workspace.workingDir,
      buildApproverPrompt({
        card: req.card,
        specMarkdown: run.specMarkdown ?? '',
        reviews: verdicts,
        attempt
      })
    )
    if (ctx.isCancelled()) {
      return { aborted: true, latestChecks, latestDiff }
    }
    const decision = parseApproverDecisionJson({
      rawOutput: approverOutput.output,
      attempt,
      agentId: approverAgent.agentId,
      model: approverAgent.model ?? 'default',
      reviews: verdicts
    })
    run.approverDecision = decision
    ctx.finishStage(approverStage, decision.approved ? 'passed' : 'failed', decision.summary)

    if (decision.approved) {
      break
    }
    if (attempt < maxAttempts) {
      fixInstructions = decision.fixInstructions || decision.summary
      ctx.appendLog(
        'approve',
        'warn',
        `Aprobador devolvió la tarea al Builder (intento ${attempt + 1}/${maxAttempts}).`
      )
    }
  }

  return { aborted: false, latestChecks, latestDiff }
}
