import type {
  AgentExecutionRecord,
  Project,
  Team,
  TeamInvitation,
  TeamMember,
  TeamRole
} from './team-workspace-types'
import type { TeamKanbanCard } from './team-kanban-types'

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
}

export type TeamStartExecutionRequest = {
  card: TeamKanbanCard
  projectId: string
  projectPath?: string | null
  actorUserId: string
  sprintGoal?: string
}

export type TeamExecutionEvent =
  | { type: 'updated'; execution: AgentExecutionRecord }
  | { type: 'removed'; executionId: string }

export type TeamApi = {
  listConfiguredAgents: (options?: { refresh?: boolean }) => Promise<ConfiguredTeamAgent[]>
  startExecution: (request: TeamStartExecutionRequest) => Promise<AgentExecutionRecord>
  cancelExecution: (executionId: string) => Promise<AgentExecutionRecord | null>
  getExecution: (executionId: string) => Promise<AgentExecutionRecord | null>
  getLatestExecutionForCard: (cardId: string) => Promise<AgentExecutionRecord | null>
  onExecutionEvent: (callback: (event: TeamExecutionEvent) => void) => () => void
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
}
