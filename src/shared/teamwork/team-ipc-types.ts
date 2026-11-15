import type {
  AgentExecutionRecord,
  Project,
  ProjectMember,
  Team,
  TeamActivityEntry,
  TeamInvitation,
  TeamMember,
  TeamRole,
  TeamSyncSettings,
  TeamUserProfile
} from './team-workspace-types'
import type { TeamCardComment, TeamCommentMention, TeamKanbanCard } from './team-kanban-types'
import type { FactoryConfig, FactoryRunRecord } from './team-factory-types'

export type ConfiguredTeamAgent = {
  id: string
  name: string
  role: string
  command: string
  color: string
  configured: boolean
  configSource: string
  models: string[]
  defaultModel?: string
  defaultSkills: string[]
}

export type TeamMailProvider = 'smtp' | 'resend' | 'sendmail'

export type TeamMailConfigPublic = {
  provider: TeamMailProvider
  fromEmail: string
  fromName: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  hasSecret: boolean
  sendmailAvailable: boolean
}

export type TeamMailConfigInput = {
  provider: TeamMailProvider
  fromEmail: string
  fromName?: string
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  smtpUser?: string
  secret?: string
}

export type TeamSendInvitationRequest = {
  teamId: string
  teamName: string
  email: string
  role: TeamRole
  invitedBy: string
  inviterName?: string
}

export type TeamSendInvitationResult = {
  invitation: TeamInvitation
  joinUrl: string
  emailSent: boolean
  transportUsed?: TeamMailProvider
  error?: string
  needsMailConfig?: boolean
}

export type TeamMemberWithProfile = TeamMember & {
  displayName: string
  email: string
}

export type TeamWorkspaceSnapshot = {
  teams: Team[]
  projects: Project[]
  membersByTeam: Record<string, TeamMemberWithProfile[]>
  invitationsByTeam: Record<string, TeamInvitation[]>
  projectMembersByProject?: Record<string, ProjectMember[]>
}

export type TeamLinkedNoteContext = {
  id: string
  title: string
  content: string
}

export type TeamStartExecutionRequest = {
  card: TeamKanbanCard
  projectId: string
  projectPath?: string | null
  actorUserId: string
  sprintGoal?: string
  isolateWorktree?: boolean
  requiresApproval?: boolean
  followUpPrompt?: string
  targetAgentId?: string
  linkedNotesContext?: TeamLinkedNoteContext[]
}

export type TeamAddCardCommentRequest = {
  id?: string
  cardId: string
  projectId: string
  authorId: string
  authorName: string
  authorType?: 'human' | 'agent'
  body: string
  mentions?: TeamCommentMention[]
  createdAt?: number
}

export type TeamExecutionEvent =
  | { type: 'updated'; execution: AgentExecutionRecord }
  | { type: 'removed'; executionId: string }

export type TeamSyncRuntimeStatus = {
  settings: TeamSyncSettings
  hostingActive: boolean
  hostingUrl: string | null
  connectedPeers: number
  activeRooms: number
  lastError?: string
}

export type TeamApproveExecutionRequest = {
  executionId: string
  mergeToBase?: boolean
  createPullRequestOnApprove?: boolean
  projectPath?: string | null
  title?: string
  body?: string
  actorUserId?: string
  actorName?: string
}

export type TeamCreateReviewRequestRequest = {
  executionId: string
  projectPath?: string | null
  title?: string
  body?: string
  actorUserId?: string
  actorName?: string
}

export type TeamRefreshReviewRequestRequest = {
  executionId: string
  projectPath?: string | null
  actorUserId?: string
  actorName?: string
}

export type TeamRejectExecutionRequest = {
  executionId: string
  discardWorktree?: boolean
  reason?: string
  actorUserId?: string
  actorName?: string
}

export type TeamStartFactoryRunRequest = {
  card: TeamKanbanCard
  projectId: string
  projectPath?: string | null
  actorUserId: string
  sprintGoal?: string
  configOverride?: FactoryConfig
}

export type TeamResolveFactoryGateRequest = {
  runId: string
  decision: 'approve' | 'reject'
  actorUserId: string
  comment?: string
}

export type TeamFactoryEvent =
  | { type: 'updated'; run: FactoryRunRecord }
  | { type: 'removed'; runId: string }

export type TeamDeepLinkJoinPayload = {
  token: string
  rawUrl: string
  relayUrl?: string
}

export type TeamRequestExecutionChangesRequest = {
  executionId: string
  feedback: string
  actorUserId?: string
  actorName?: string
}

export type TeamExecutionDiffFileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'

export type TeamExecutionDiffFile = {
  path: string
  status: TeamExecutionDiffFileStatus
  additions: number
  deletions: number
}

export type TeamExecutionDiffResult = {
  executionId: string
  worktreePath?: string
  baseBranch?: string
  branch?: string
  files: TeamExecutionDiffFile[]
  diff: string
  truncated: boolean
  error?: string
}

export type TeamApi = {
  listConfiguredAgents: (options?: { refresh?: boolean }) => Promise<ConfiguredTeamAgent[]>
  startExecution: (request: TeamStartExecutionRequest) => Promise<AgentExecutionRecord>
  cancelExecution: (executionId: string) => Promise<AgentExecutionRecord | null>
  approveExecution: (request: TeamApproveExecutionRequest) => Promise<AgentExecutionRecord | null>
  createReviewRequest: (
    request: TeamCreateReviewRequestRequest
  ) => Promise<AgentExecutionRecord | null>
  refreshReviewRequest: (
    request: TeamRefreshReviewRequestRequest
  ) => Promise<AgentExecutionRecord | null>
  rejectExecution: (request: TeamRejectExecutionRequest) => Promise<AgentExecutionRecord | null>
  getExecutionDiff: (executionId: string) => Promise<TeamExecutionDiffResult>
  requestExecutionChanges: (
    request: TeamRequestExecutionChangesRequest
  ) => Promise<AgentExecutionRecord | null>
  getExecution: (executionId: string) => Promise<AgentExecutionRecord | null>
  getLatestExecutionForCard: (cardId: string) => Promise<AgentExecutionRecord | null>
  onExecutionEvent: (callback: (event: TeamExecutionEvent) => void) => () => void
  getFactoryConfig: (projectId: string) => Promise<FactoryConfig>
  saveFactoryConfig: (config: FactoryConfig) => Promise<FactoryConfig>
  startFactoryRun: (request: TeamStartFactoryRunRequest) => Promise<FactoryRunRecord>
  cancelFactoryRun: (runId: string) => Promise<FactoryRunRecord | null>
  resolveFactoryHumanGate: (
    request: TeamResolveFactoryGateRequest
  ) => Promise<FactoryRunRecord | null>
  getFactoryRun: (runId: string) => Promise<FactoryRunRecord | null>
  getLatestFactoryRunForCard: (cardId: string) => Promise<FactoryRunRecord | null>
  listFactoryRuns: (projectId: string) => Promise<FactoryRunRecord[]>
  onFactoryEvent: (callback: (event: TeamFactoryEvent) => void) => () => void
  onDeepLinkJoin: (callback: (payload: TeamDeepLinkJoinPayload) => void) => () => void
  consumePendingDeepLinkJoin: () => Promise<TeamDeepLinkJoinPayload | null>
  getWorkspaceSnapshot: () => Promise<TeamWorkspaceSnapshot>
  createTeam: (input: {
    name: string
    slug?: string
    description?: string
    ownerId?: string
  }) => Promise<Team>
  createProject: (input: {
    teamId: string
    name: string
    slug?: string
    description?: string
    visibility?: 'team' | 'private'
    actorUserId?: string
  }) => Promise<Project>
  sendInvitation: (request: TeamSendInvitationRequest) => Promise<TeamSendInvitationResult>
  resendInvitation: (
    invitationId: string,
    inviterName?: string
  ) => Promise<TeamSendInvitationResult>
  acceptInvitation: (
    token: string,
    userId: string,
    displayName?: string,
    email?: string
  ) => Promise<TeamMemberWithProfile>
  revokeInvitation: (invitationId: string, actorUserId: string) => Promise<void>
  getMailConfig: () => Promise<TeamMailConfigPublic>
  saveMailConfig: (input: TeamMailConfigInput) => Promise<TeamMailConfigPublic>
  testMailConfig: (toEmail: string) => Promise<{ ok: boolean; error?: string }>
  listActivity: (options: {
    teamId: string
    projectId?: string
    limit?: number
  }) => Promise<TeamActivityEntry[]>
  recordActivity: (entry: Omit<TeamActivityEntry, 'id' | 'createdAt'>) => Promise<TeamActivityEntry>
  getCurrentUser: () => Promise<TeamUserProfile>
  updateUserProfile: (input: { displayName: string; email: string }) => Promise<TeamUserProfile>
  requestMagicLinkCode: (
    email: string,
    displayName?: string
  ) => Promise<{ sent: boolean; expiresAt: number; devCode?: string; error?: string }>
  verifyMagicLinkCode: (
    email: string,
    code: string,
    displayName?: string
  ) => Promise<TeamUserProfile>
  getSyncStatus: () => Promise<TeamSyncRuntimeStatus>
  configureSync: (settings: Partial<TeamSyncSettings>) => Promise<TeamSyncRuntimeStatus>
  listCardComments: (cardId: string) => Promise<TeamCardComment[]>
  addCardComment: (request: TeamAddCardCommentRequest) => Promise<TeamCardComment>
  deleteCardComment: (commentId: string) => Promise<boolean>
}
