import { z } from 'zod'

export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer'

export const TEAM_ROLES: readonly TeamRole[] = ['owner', 'admin', 'member', 'viewer'] as const

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === 'string' && (TEAM_ROLES as readonly string[]).includes(value)
}

export const TeamRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer'])

export type UserIdentity = {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
  createdAt: number
}

export const UserIdentitySchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  avatarUrl: z.string().url().optional(),
  createdAt: z.number().int().nonnegative()
})

export type Team = {
  id: string
  name: string
  slug: string
  ownerId: string
  description?: string
  createdAt: number
  updatedAt: number
}

export const TeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug debe contener solo minúsculas, números y guiones'),
  ownerId: z.string().min(1),
  description: z.string().max(500).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
})

export type TeamMember = {
  teamId: string
  userId: string
  role: TeamRole
  joinedAt: number
}

export const TeamMemberSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
  role: TeamRoleSchema,
  joinedAt: z.number().int().nonnegative()
})

export type ProjectVisibility = 'team' | 'private'

export const ProjectVisibilitySchema = z.enum(['team', 'private'])

export type Project = {
  id: string
  teamId: string
  name: string
  slug: string
  description?: string
  visibility: ProjectVisibility
  createdAt: number
  updatedAt: number
}

export const ProjectSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug debe contener solo minúsculas, números y guiones'),
  description: z.string().max(1000).optional(),
  visibility: ProjectVisibilitySchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
})

export type ProjectMember = {
  projectId: string
  userId: string
  role: TeamRole
  joinedAt: number
}

export const ProjectMemberSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  role: TeamRoleSchema,
  joinedAt: z.number().int().nonnegative()
})

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export const InvitationStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired'])

export type TeamInvitation = {
  id: string
  teamId: string
  email: string
  role: TeamRole
  token: string
  invitedBy: string
  status: InvitationStatus
  expiresAt: number
  createdAt: number
}

export const TeamInvitationSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  email: z.string().email(),
  role: TeamRoleSchema,
  token: z.string().min(16),
  invitedBy: z.string().min(1),
  status: InvitationStatusSchema,
  expiresAt: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative()
})

export type AgentExecutionStatus =
  | 'queued'
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'
  | 'cancelled'

export const AgentExecutionStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_for_input',
  'completed',
  'failed',
  'cancelled'
])

export type AgentExecutionLog = {
  timestamp: number
  level: 'info' | 'warn' | 'error'
  message: string
}

export const AgentExecutionLogSchema = z.object({
  timestamp: z.number().int().nonnegative(),
  level: z.enum(['info', 'warn', 'error']),
  message: z.string()
})

export type AgentExecutionRecord = {
  id: string
  taskId: string
  projectId: string
  agentId: string
  agentType: string
  model: string
  status: AgentExecutionStatus
  prompt: string
  branchOrWorktree?: string
  logs: AgentExecutionLog[]
  outputSummary?: string
  idempotencyKey: string
  startedAt?: number
  completedAt?: number
  error?: string
  createdAt: number
  updatedAt: number
}

export const AgentExecutionRecordSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  agentId: z.string().min(1),
  agentType: z.string().min(1),
  model: z.string().min(1),
  status: AgentExecutionStatusSchema,
  prompt: z.string().min(1),
  branchOrWorktree: z.string().optional(),
  logs: z.array(AgentExecutionLogSchema),
  outputSummary: z.string().optional(),
  idempotencyKey: z.string().min(1),
  startedAt: z.number().int().nonnegative().optional(),
  completedAt: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
})

export function hasTeamPermission(userRole: TeamRole, requiredRole: TeamRole): boolean {
  const roleHierarchy: Record<TeamRole, number> = {
    owner: 4,
    admin: 3,
    member: 2,
    viewer: 1
  }
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole]
}
