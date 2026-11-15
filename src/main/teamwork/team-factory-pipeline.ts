import { randomUUID } from 'node:crypto'
import {
  createDefaultFactoryConfig,
  type FactoryRunRecord,
  type FactoryStage,
  type FactoryStageAgentConfig,
  type FactoryStageRecord
} from '../../shared/teamwork/team-factory-types'
import type {
  TeamResolveFactoryGateRequest,
  TeamStartFactoryRunRequest
} from '../../shared/teamwork/team-ipc-types'
import { evaluateDeterministicGate } from './team-factory-gate'
import { buildSpecWriterPrompt } from './team-factory-prompts'
import {
  resolveStageAgent,
  runBuildAndReviewLoop,
  type FactoryPipelineContext
} from './team-factory-review-loop'

export type { FactoryPipelineContext } from './team-factory-review-loop'

const MAX_FACTORY_LOGS = 800

export function createInitialFactoryRun(
  req: TeamStartFactoryRunRequest,
  cardAgent?: FactoryStageAgentConfig
) {
  const now = Date.now()
  const config =
    req.configOverride ??
    createDefaultFactoryConfig(req.projectId, cardAgent?.agentId ?? 'claude', cardAgent?.model)

  const run: FactoryRunRecord = {
    id: `factory-${now}-${randomUUID().slice(0, 8)}`,
    cardId: req.card.id,
    cardTitle: req.card.title,
    projectId: req.projectId,
    status: 'queued',
    currentStage: 'queued',
    attempt: 1,
    maxRetries: Math.max(0, config.maxRetries),
    brainNoteIds: [],
    stages: [],
    reviews: [],
    logs: [],
    startedAt: now,
    updatedAt: now
  }
  return { run, config }
}

export function appendFactoryLog(
  run: FactoryRunRecord,
  stage: FactoryStage,
  level: 'info' | 'warn' | 'error',
  message: string
): void {
  run.logs.push({ timestamp: Date.now(), stage, level, message })
  if (run.logs.length > MAX_FACTORY_LOGS) {
    run.logs.splice(0, run.logs.length - MAX_FACTORY_LOGS)
  }
  run.updatedAt = Date.now()
}

export function beginFactoryStage(
  run: FactoryRunRecord,
  stage: FactoryStage,
  label: string,
  attempt: number,
  agent?: FactoryStageAgentConfig
): FactoryStageRecord {
  const entry: FactoryStageRecord = {
    id: `${stage}-${attempt}-${Date.now()}`,
    stage,
    label,
    attempt,
    ...(agent ? { agentId: agent.agentId, model: agent.model ?? 'default' } : {}),
    status: 'running',
    startedAt: Date.now()
  }
  run.currentStage = stage
  run.stages.push(entry)
  appendFactoryLog(run, stage, 'info', `Etapa iniciada: ${label}`)
  return entry
}

export function finishFactoryStage(
  entry: FactoryStageRecord,
  status: FactoryStageRecord['status'],
  summary?: string,
  error?: string
): void {
  entry.status = status
  entry.completedAt = Date.now()
  if (summary) {
    entry.summary = summary
  }
  if (error) {
    entry.error = error
  }
}

export function applyHumanGateResolution(
  run: FactoryRunRecord,
  request: TeamResolveFactoryGateRequest
): void {
  const now = Date.now()
  run.humanGate = {
    status: request.decision === 'approve' ? 'approved' : 'rejected',
    reasons: run.humanGate?.reasons ?? [],
    decidedBy: request.actorUserId,
    decidedAt: now,
    ...(request.comment?.trim() ? { comment: request.comment.trim() } : {})
  }
  if (request.decision === 'approve') {
    run.status = 'completed'
    run.currentStage = 'completed'
    run.completedAt = now
    appendFactoryLog(run, 'human_gate', 'info', `Aprobado manualmente por ${request.actorUserId}.`)
  } else {
    run.status = 'failed'
    run.currentStage = 'failed'
    run.completedAt = now
    run.error = request.comment?.trim() || 'Rechazado en revisión humana.'
    appendFactoryLog(
      run,
      'human_gate',
      'warn',
      `Rechazado por ${request.actorUserId}: ${run.error}`
    )
  }
}

async function runSpecPhase(ctx: FactoryPipelineContext, workingDir: string): Promise<boolean> {
  const { run, req, config, cardAgent } = ctx
  const brain = await ctx.loadBrain(req.projectPath, req.projectId, req.card)
  run.brainNoteIds = brain.noteIds
  ctx.appendLog(
    'spec',
    'info',
    brain.noteIds.length > 0
      ? `Brain consultado: ${brain.noteIds.length} nota(s) relevantes cargadas.`
      : 'Brain consultado: sin notas previas en el proyecto.'
  )

  const specAgent = resolveStageAgent(config.specWriter, cardAgent)
  const specStage = ctx.beginStage('spec', 'Spec Writer (SDD)', 1, specAgent)
  const specResult = await ctx.runAgent(
    'spec',
    specAgent,
    workingDir,
    buildSpecWriterPrompt({
      card: req.card,
      sprintGoal: req.sprintGoal,
      brainMarkdown: brain.markdown
    })
  )
  if (ctx.isCancelled()) {
    return false
  }
  if (!specResult.ok || !specResult.output.trim()) {
    ctx.finishStage(specStage, 'failed', undefined, specResult.error ?? 'Spec vacía.')
    ctx.failRun(specResult.error ?? 'Spec Writer no pudo generar una especificación.')
    return false
  }

  run.specMarkdown = specResult.output
  ctx.finishStage(specStage, 'passed', 'Especificación SDD generada.')
  if (config.writeSpecToBrain) {
    const proposedId = await ctx.proposeBrainNote({
      projectPath: req.projectPath,
      projectId: req.projectId,
      card: req.card,
      specMarkdown: specResult.output
    })
    if (proposedId) {
      ctx.appendLog('spec', 'info', `Spec propuesta en Brain (Notas & ADRs): ${proposedId}`)
    }
  }
  return true
}

export async function executeFactoryPipeline(ctx: FactoryPipelineContext): Promise<void> {
  const { run, req, config } = ctx
  run.status = 'running'
  ctx.emitUpdated()

  const workspace = await ctx.prepareWorkspace({
    projectPath: req.projectPath,
    cardId: req.card.id,
    cardTitle: req.card.title,
    branchOrWorktree: req.card.branchOrWorktree,
    useWorktreeIsolation: config.useWorktreeIsolation,
    fallbackDir: ctx.fallbackDir
  })
  run.worktreePath = workspace.workingDir
  run.branchName = workspace.branchName
  if (workspace.baseRef) {
    run.baseRef = workspace.baseRef
  }
  ctx.appendLog(
    'queued',
    'info',
    workspace.isIsolatedWorktree
      ? `Worktree aislado listo en '${workspace.workingDir}' (rama '${workspace.branchName}').`
      : `Ejecutando en directorio '${workspace.workingDir}' (rama '${workspace.branchName}').`
  )
  ctx.emitUpdated()

  if (ctx.isCancelled()) {
    return
  }

  const specOk = await runSpecPhase(ctx, workspace.workingDir)
  if (!specOk || ctx.isCancelled()) {
    return
  }

  const loopResult = await runBuildAndReviewLoop(ctx, workspace)
  if (loopResult.aborted || ctx.isCancelled()) {
    return
  }

  const gateResult = evaluateDeterministicGate({
    diff: loopResult.latestDiff.summary,
    checkResults: loopResult.latestChecks,
    reviews: run.reviews,
    rules: config.deterministicRules
  })
  if (run.approverDecision && !run.approverDecision.approved) {
    gateResult.requiresHumanApproval = true
    gateResult.reasons.push(
      `El aprobador no aprobó tras ${run.attempt} intento(s): ${run.approverDecision.summary}`
    )
  }
  run.gateResult = gateResult

  if (gateResult.requiresHumanApproval) {
    run.status = 'waiting_human'
    run.currentStage = 'human_gate'
    run.humanGate = { status: 'pending', reasons: gateResult.reasons }
    ctx.appendLog(
      'human_gate',
      'warn',
      `Escalado a revisión humana: ${gateResult.reasons.join(' ')}`
    )
    ctx.emitUpdated()
    return
  }

  run.status = 'completed'
  run.currentStage = 'completed'
  run.completedAt = Date.now()
  ctx.appendLog('completed', 'info', 'Software Factory completada automáticamente sin bloqueos.')
  ctx.emitUpdated()
}
