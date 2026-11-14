import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { TeamDatabaseService } from './team-database-service'
import type { AgentExecutionRecord } from './team-workspace-types'

describe('TeamDatabaseService', () => {
  let db: DatabaseSync
  let service: TeamDatabaseService

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    service = new TeamDatabaseService(db)
    service.initSchema()
  })

  describe('Equipos (Teams)', () => {
    it('creates team and automatically sets owner in team_members', () => {
      const team = service.createTeam({
        id: 'team-orca',
        name: 'Orca Core Team',
        slug: 'orca-core',
        ownerId: 'usr-francis',
        description: 'Equipo principal'
      })

      expect(team.id).toBe('team-orca')
      const fetched = service.getTeam('team-orca')
      expect(fetched).not.toBeNull()
      expect(fetched?.ownerId).toBe('usr-francis')

      const role = service.getTeamMemberRole('team-orca', 'usr-francis')
      expect(role).toBe('owner')
    })

    it('lists teams where the user is a member', () => {
      service.createTeam({
        id: 'team-1',
        name: 'Team One',
        slug: 'team-1',
        ownerId: 'usr-francis'
      })
      service.createTeam({
        id: 'team-2',
        name: 'Team Two',
        slug: 'team-2',
        ownerId: 'usr-other'
      })

      const francisTeams = service.listTeamsForUser('usr-francis')
      expect(francisTeams.length).toBe(1)
      expect(francisTeams[0].team.id).toBe('team-1')
      expect(francisTeams[0].role).toBe('owner')
    })

    it('enforces admin permission to add team members', () => {
      service.createTeam({
        id: 'team-1',
        name: 'Team One',
        slug: 'team-1',
        ownerId: 'usr-francis'
      })

      // Admin/Owner can add member
      service.addTeamMember({
        teamId: 'team-1',
        userId: 'usr-alice',
        role: 'member',
        actorUserId: 'usr-francis'
      })
      expect(service.getTeamMemberRole('team-1', 'usr-alice')).toBe('member')

      // Regular member CANNOT add other members
      expect(() => {
        service.addTeamMember({
          teamId: 'team-1',
          userId: 'usr-bob',
          role: 'member',
          actorUserId: 'usr-alice'
        })
      }).toThrow(/Permisos insuficientes/)
    })
  })

  describe('Proyectos y Aislamiento de Acceso', () => {
    beforeEach(() => {
      service.createTeam({
        id: 'team-1',
        name: 'Team One',
        slug: 'team-1',
        ownerId: 'usr-francis'
      })
      service.addTeamMember({
        teamId: 'team-1',
        userId: 'usr-alice',
        role: 'member',
        actorUserId: 'usr-francis'
      })
      service.addTeamMember({
        teamId: 'team-1',
        userId: 'usr-bob',
        role: 'member',
        actorUserId: 'usr-francis'
      })
    })

    it('creates public and private projects with appropriate access', () => {
      const publicProj = service.createProject({
        id: 'proj-public',
        teamId: 'team-1',
        name: 'Public Roadmap',
        slug: 'public-roadmap',
        visibility: 'team',
        actorUserId: 'usr-alice'
      })
      expect(publicProj.visibility).toBe('team')

      const privateProj = service.createProject({
        id: 'proj-private-alice',
        teamId: 'team-1',
        name: 'Alice Private Experiments',
        slug: 'alice-private',
        visibility: 'private',
        actorUserId: 'usr-alice'
      })
      expect(privateProj.visibility).toBe('private')

      // Bob can see the public project, but NOT Alice's private project
      const bobProjects = service.listProjectsForUser({ teamId: 'team-1', userId: 'usr-bob' })
      expect(bobProjects.map((p) => p.id)).toContain('proj-public')
      expect(bobProjects.map((p) => p.id)).not.toContain('proj-private-alice')

      // Alice can see both
      const aliceProjects = service.listProjectsForUser({ teamId: 'team-1', userId: 'usr-alice' })
      expect(aliceProjects.map((p) => p.id)).toContain('proj-public')
      expect(aliceProjects.map((p) => p.id)).toContain('proj-private-alice')

      // Francis (Owner) can see both
      const francisProjects = service.listProjectsForUser({
        teamId: 'team-1',
        userId: 'usr-francis'
      })
      expect(francisProjects.map((p) => p.id)).toContain('proj-public')
      expect(francisProjects.map((p) => p.id)).toContain('proj-private-alice')
    })

    it('denies outsiders from accessing projects', () => {
      service.createProject({
        id: 'proj-1',
        teamId: 'team-1',
        name: 'Core Feature',
        slug: 'core-feature',
        visibility: 'team',
        actorUserId: 'usr-francis'
      })

      expect(
        service.canUserAccessProject({
          projectId: 'proj-1',
          userId: 'usr-outsider'
        })
      ).toBe(false)

      expect(
        service.canUserAccessProject({
          projectId: 'proj-1',
          userId: 'usr-alice'
        })
      ).toBe(true)
    })
  })

  describe('Invitaciones', () => {
    beforeEach(() => {
      service.createTeam({
        id: 'team-1',
        name: 'Team One',
        slug: 'team-1',
        ownerId: 'usr-francis'
      })
    })

    it('creates and accepts invitations', () => {
      const inv = service.createInvitation({
        id: 'inv-1',
        teamId: 'team-1',
        email: 'carol@example.com',
        role: 'member',
        token: 'token-carol-secure-123456789',
        invitedBy: 'usr-francis'
      })
      expect(inv.status).toBe('pending')

      const member = service.acceptInvitation('token-carol-secure-123456789', 'usr-carol')
      expect(member.userId).toBe('usr-carol')
      expect(member.role).toBe('member')

      expect(service.getTeamMemberRole('team-1', 'usr-carol')).toBe('member')

      // Cannot accept twice
      expect(() => {
        service.acceptInvitation('token-carol-secure-123456789', 'usr-carol')
      }).toThrow(/ya no es válida/)
    })

    it('rejects expired invitations', () => {
      service.createInvitation({
        id: 'inv-exp',
        teamId: 'team-1',
        email: 'expired@example.com',
        role: 'member',
        token: 'token-expired-99999999999',
        invitedBy: 'usr-francis',
        ttlMs: -1000 // already expired
      })

      expect(() => {
        service.acceptInvitation('token-expired-99999999999', 'usr-expired')
      }).toThrow(/ha expirado/)
    })
  })

  describe('Trazabilidad e Idempotencia de Agentes', () => {
    const executionData: AgentExecutionRecord = {
      id: 'exec-1',
      taskId: 'card-42',
      projectId: 'proj-1',
      agentId: 'agent-antigravity',
      agentType: 'antigravity',
      model: 'Orchestrator (Argon)',
      status: 'queued',
      prompt: 'Implementar modelo de datos',
      branchOrWorktree: 'feat/models',
      logs: [],
      idempotencyKey: 'idem-card-42-try-1',
      createdAt: 1700000000,
      updatedAt: 1700000000
    }

    it('inserts execution and guarantees idempotency on duplicate dispatch', () => {
      const recorded = service.recordAgentExecution(executionData)
      expect(recorded.id).toBe('exec-1')

      // Duplicate request with different id but same idempotencyKey returns the first execution
      const duplicate = service.recordAgentExecution({
        ...executionData,
        id: 'exec-duplicate-ignored'
      })
      expect(duplicate.id).toBe('exec-1')
    })

    it('updates execution status and appends logs sequentially', () => {
      service.recordAgentExecution(executionData)

      service.appendAgentExecutionLog('exec-1', {
        timestamp: 1700000005,
        level: 'info',
        message: 'Agente iniciado en worktree'
      })

      service.updateAgentExecutionStatus({
        executionId: 'exec-1',
        status: 'running'
      })

      let current = service.getAgentExecution('exec-1')
      expect(current?.status).toBe('running')
      expect(current?.logs.length).toBe(1)
      expect(current?.logs[0].message).toBe('Agente iniciado en worktree')

      service.updateAgentExecutionStatus({
        executionId: 'exec-1',
        status: 'completed',
        outputSummary: 'Modelos de datos implementados y verificados con vitest'
      })

      current = service.getAgentExecution('exec-1')
      expect(current?.status).toBe('completed')
      expect(current?.outputSummary).toBe('Modelos de datos implementados y verificados con vitest')
      expect(current?.completedAt).toBeGreaterThan(0)
    })
  })
})
