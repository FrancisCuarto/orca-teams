export type FactoryStage =
  | 'queued'
  | 'spec'
  | 'build'
  | 'checks'
  | 'review'
  | 'approve'
  | 'human_gate'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type FactoryRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_human'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type FactoryReviewerRole = 'security' | 'ux' | 'ui' | 'code'

export const FACTORY_REVIEWER_ROLES: readonly FactoryReviewerRole[] = [
  'security',
  'ux',
  'ui',
  'code'
] as const

export const FACTORY_REVIEWER_LABELS: Record<FactoryReviewerRole, string> = {
  security: 'Seguridad',
  ux: 'UX / Flujo',
  ui: 'UI / Diseño',
  code: 'Consistencia de Código'
}

export type FactoryStageAgentConfig = {
  agentId: string
  model?: string
}

export type FactoryCheckCommand = {
  name: string
  command: string
}

export type FactoryFindingSeverity = 'critical' | 'high' | 'medium' | 'low'

export type FactoryDeterministicRules = {
  protectedPathPatterns: string[]
  maxAutoApproveFiles: number
  maxAutoApproveLines: number
  requireHumanOnFindingSeverity: FactoryFindingSeverity | 'none'
}

export type FactoryConfig = {
  projectId: string
  specWriter: FactoryStageAgentConfig
  builder: FactoryStageAgentConfig
  reviewers: Record<FactoryReviewerRole, FactoryStageAgentConfig>
  approver: FactoryStageAgentConfig
  maxRetries: number
  useWorktreeIsolation: boolean
  writeSpecToBrain: boolean
  checkCommands: FactoryCheckCommand[]
  deterministicRules: FactoryDeterministicRules
  updatedAt: number
}

export type FactoryReviewFinding = {
  severity: FactoryFindingSeverity
  file?: string
  message: string
}

export type FactoryReviewVerdict = {
  role: FactoryReviewerRole
  agentId: string
  model: string
  status: 'pass' | 'fail' | 'error'
  summary: string
  findings: FactoryReviewFinding[]
  durationMs: number
}

export type FactoryCheckResult = {
  name: string
  command: string
  passed: boolean
  exitCode: number | null
  output: string
  durationMs: number
}

export type FactoryDiffSummary = {
  filesChanged: number
  insertions: number
  deletions: number
  files: string[]
}

export type FactoryDeterministicGateResult = {
  requiresHumanApproval: boolean
  reasons: string[]
  checksPassed: boolean
  diff: FactoryDiffSummary
  checkResults: FactoryCheckResult[]
}

export type FactoryApproverDecision = {
  approved: boolean
  summary: string
  fixInstructions?: string
  attempt: number
  agentId: string
  model: string
}

export type FactoryStageRecord = {
  id: string
  stage: FactoryStage
  label: string
  attempt: number
  agentId?: string
  model?: string
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'cancelled'
  startedAt: number
  completedAt?: number
  summary?: string
  error?: string
}

export type FactoryHumanGateState = {
  status: 'pending' | 'approved' | 'rejected'
  reasons: string[]
  decidedBy?: string
  decidedAt?: number
  comment?: string
}

export type FactoryLogEntry = {
  timestamp: number
  stage: FactoryStage
  level: 'info' | 'warn' | 'error'
  message: string
}

export type FactoryRunRecord = {
  id: string
  cardId: string
  cardTitle: string
  projectId: string
  status: FactoryRunStatus
  currentStage: FactoryStage
  attempt: number
  maxRetries: number
  worktreePath?: string
  branchName?: string
  baseRef?: string
  brainNoteIds: string[]
  specMarkdown?: string
  stages: FactoryStageRecord[]
  reviews: FactoryReviewVerdict[]
  approverDecision?: FactoryApproverDecision
  gateResult?: FactoryDeterministicGateResult
  humanGate?: FactoryHumanGateState
  logs: FactoryLogEntry[]
  startedAt: number
  completedAt?: number
  error?: string
  updatedAt: number
}

export const DEFAULT_PROTECTED_PATH_PATTERNS: readonly string[] = [
  'migrations/',
  'prisma/',
  'drizzle/',
  'auth',
  'security',
  'billing',
  'payment',
  'package.json',
  'pnpm-lock.yaml',
  '.env',
  'team-schema.ts'
]

export function createDefaultFactoryConfig(
  projectId = 'proj-default',
  defaultAgentId = 'claude',
  defaultModel?: string
): FactoryConfig {
  const stageAgent = (agentId = defaultAgentId, model = defaultModel): FactoryStageAgentConfig => ({
    agentId,
    ...(model ? { model } : {})
  })
  return {
    projectId,
    specWriter: stageAgent(),
    builder: stageAgent(),
    reviewers: {
      security: stageAgent(),
      ux: stageAgent(),
      ui: stageAgent(),
      code: stageAgent()
    },
    approver: stageAgent(),
    maxRetries: 2,
    useWorktreeIsolation: true,
    writeSpecToBrain: true,
    checkCommands: [],
    deterministicRules: {
      protectedPathPatterns: [...DEFAULT_PROTECTED_PATH_PATTERNS],
      maxAutoApproveFiles: 12,
      maxAutoApproveLines: 400,
      requireHumanOnFindingSeverity: 'high'
    },
    updatedAt: Date.now()
  }
}
