import { describe, expect, it } from 'vitest'
import {
  AgentExecutionRecordSchema,
  hasTeamPermission,
  isTeamRole,
  ProjectMemberSchema,
  ProjectSchema,
  TeamInvitationSchema,
  TeamMemberSchema,
  TeamRoleSchema,
  TeamSchema,
  UserIdentitySchema
} from './team-workspace-types'

describe('team-workspace-types', () => {
  describe('isTeamRole and TeamRoleSchema', () => {
    it('accepts valid team roles', () => {
      expect(isTeamRole('owner')).toBe(true)
      expect(isTeamRole('admin')).toBe(true)
      expect(isTeamRole('member')).toBe(true)
      expect(isTeamRole('viewer')).toBe(true)
      expect(TeamRoleSchema.safeParse('owner').success).toBe(true)
    })

    it('rejects invalid team roles', () => {
      expect(isTeamRole('superadmin')).toBe(false)
      expect(isTeamRole(123)).toBe(false)
      expect(isTeamRole(null)).toBe(false)
      expect(TeamRoleSchema.safeParse('guest').success).toBe(false)
    })
  })

  describe('hasTeamPermission hierarchy', () => {
    it('allows owners full access across all roles', () => {
      expect(hasTeamPermission('owner', 'owner')).toBe(true)
      expect(hasTeamPermission('owner', 'admin')).toBe(true)
      expect(hasTeamPermission('owner', 'member')).toBe(true)
      expect(hasTeamPermission('owner', 'viewer')).toBe(true)
    })

    it('enforces admin, member, and viewer boundaries', () => {
      expect(hasTeamPermission('admin', 'owner')).toBe(false)
      expect(hasTeamPermission('admin', 'admin')).toBe(true)
      expect(hasTeamPermission('admin', 'member')).toBe(true)
      expect(hasTeamPermission('admin', 'viewer')).toBe(true)

      expect(hasTeamPermission('member', 'admin')).toBe(false)
      expect(hasTeamPermission('member', 'member')).toBe(true)
      expect(hasTeamPermission('member', 'viewer')).toBe(true)

      expect(hasTeamPermission('viewer', 'member')).toBe(false)
      expect(hasTeamPermission('viewer', 'viewer')).toBe(true)
    })
  })

  describe('UserIdentitySchema', () => {
    it('validates correct user profiles', () => {
      const valid = {
        id: 'usr-1',
        email: 'francis@example.com',
        displayName: 'Francis',
        createdAt: 1700000000
      }
      const parsed = UserIdentitySchema.safeParse(valid)
      expect(parsed.success).toBe(true)
    })

    it('rejects invalid emails or empty names', () => {
      expect(
        UserIdentitySchema.safeParse({
          id: 'usr-1',
          email: 'invalid-email',
          displayName: 'Francis',
          createdAt: 1700000000
        }).success
      ).toBe(false)

      expect(
        UserIdentitySchema.safeParse({
          id: 'usr-1',
          email: 'francis@example.com',
          displayName: '',
          createdAt: 1700000000
        }).success
      ).toBe(false)
    })
  })

  describe('TeamSchema', () => {
    it('validates proper team definitions with lowercase slugs', () => {
      const validTeam = {
        id: 'team-1',
        name: 'Orca Core Team',
        slug: 'orca-core-team',
        ownerId: 'usr-francis',
        description: 'Desarrollo principal de Orca',
        createdAt: 1700000000,
        updatedAt: 1700000000
      }
      expect(TeamSchema.safeParse(validTeam).success).toBe(true)
    })

    it('rejects slugs with uppercase or special symbols', () => {
      expect(
        TeamSchema.safeParse({
          id: 'team-1',
          name: 'Orca Core Team',
          slug: 'Orca Core Team!',
          ownerId: 'usr-francis',
          createdAt: 1700000000,
          updatedAt: 1700000000
        }).success
      ).toBe(false)
    })
  })

  describe('ProjectSchema and ProjectMemberSchema', () => {
    it('validates project schemas with visibility', () => {
      const project = {
        id: 'proj-1',
        teamId: 'team-1',
        name: 'Workspace Redesign',
        slug: 'workspace-redesign',
        visibility: 'team' as const,
        createdAt: 1700000000,
        updatedAt: 1700000000
      }
      expect(ProjectSchema.safeParse(project).success).toBe(true)
    })

    it('validates project membership roles', () => {
      const member = {
        projectId: 'proj-1',
        userId: 'usr-2',
        role: 'member' as const,
        joinedAt: 1700000100
      }
      expect(ProjectMemberSchema.safeParse(member).success).toBe(true)
      expect(TeamMemberSchema.safeParse({ teamId: 'team-1', ...member }).success).toBe(true)
    })
  })

  describe('TeamInvitationSchema', () => {
    it('validates valid invitations', () => {
      const invitation = {
        id: 'inv-1',
        teamId: 'team-1',
        email: 'collaborator@orca.run',
        role: 'member' as const,
        token: 'token-secure-at-least-16-characters-long',
        invitedBy: 'usr-francis',
        status: 'pending' as const,
        expiresAt: 1700100000,
        createdAt: 1700000000
      }
      expect(TeamInvitationSchema.safeParse(invitation).success).toBe(true)
    })

    it('rejects tokens shorter than 16 characters', () => {
      const invitation = {
        id: 'inv-1',
        teamId: 'team-1',
        email: 'collaborator@orca.run',
        role: 'member' as const,
        token: 'short',
        invitedBy: 'usr-francis',
        status: 'pending' as const,
        expiresAt: 1700100000,
        createdAt: 1700000000
      }
      expect(TeamInvitationSchema.safeParse(invitation).success).toBe(false)
    })
  })

  describe('AgentExecutionRecordSchema', () => {
    it('validates a complete agent execution record', () => {
      const record = {
        id: 'exec-1',
        taskId: 'card-101',
        projectId: 'proj-1',
        agentId: 'agent-antigravity',
        agentType: 'antigravity',
        model: 'Orchestrator (Argon)',
        status: 'running' as const,
        prompt: '# Tarea: Implementar Auth\n\nDetalles...',
        branchOrWorktree: 'feat/auth',
        logs: [
          { timestamp: 1700000010, level: 'info' as const, message: 'Spawned subagent' },
          { timestamp: 1700000020, level: 'warn' as const, message: 'Low memory' }
        ],
        outputSummary: 'Generando archivos base',
        idempotencyKey: 'idem-card-101-1700000000',
        startedAt: 1700000005,
        createdAt: 1700000000,
        updatedAt: 1700000020
      }
      expect(AgentExecutionRecordSchema.safeParse(record).success).toBe(true)
    })
  })
})
