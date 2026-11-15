import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TeamHostDatabase } from './team-host-database'

describe('team-host-database', () => {
  let tempDir: string
  let dbPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'orca-team-db-'))
    dbPath = path.join(tempDir, 'orca-teams.db')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('seeds default team and project only on first boot when empty', () => {
    const db1 = new TeamHostDatabase(dbPath)
    const snap1 = db1.getWorkspaceSnapshot()
    expect(snap1.teams).toHaveLength(1)
    expect(snap1.projects).toHaveLength(1)
    db1.close()

    const db2 = new TeamHostDatabase(dbPath)
    const snap2 = db2.getWorkspaceSnapshot()
    expect(snap2.teams).toHaveLength(1)
    expect(snap2.projects).toHaveLength(1)
    db2.close()
  })

  it('persists teams, projects, invitations, accepted members, and executions across restarts', () => {
    const db1 = new TeamHostDatabase(dbPath)
    const team = db1.createTeam({
      name: 'Engineering Core',
      description: 'Equipo de ingeniería'
    })
    const project = db1.createProject({
      teamId: team.id,
      name: 'API Gateway',
      visibility: 'team'
    })
    const inv = db1.createAndPersistInvitation({
      teamId: team.id,
      teamName: team.name,
      email: 'carol@orca.run',
      role: 'admin',
      invitedBy: team.ownerId
    })
    expect(db1.getInvitationById(inv.id)?.status).toBe('pending')

    const member = db1.acceptInvitation(inv.token, 'usr-carol', 'Carol Dev', 'carol@orca.run')
    expect(member.displayName).toBe('Carol Dev')
    expect(member.role).toBe('admin')

    db1.upsertExecution({
      id: 'exec-1',
      taskId: 'card-99',
      projectId: project.id,
      agentId: 'antigravity',
      agentType: 'agy',
      model: 'gemini-4-argon-medium',
      status: 'completed',
      prompt: 'Build feature',
      logs: [{ timestamp: 1234, level: 'info', message: 'Done' }],
      idempotencyKey: 'idem-99',
      createdAt: 1000,
      updatedAt: 2000
    })
    db1.close()

    const db2 = new TeamHostDatabase(dbPath)
    const snap = db2.getWorkspaceSnapshot()
    expect(snap.teams.some((t) => t.id === team.id)).toBe(true)
    expect(snap.projects.some((p) => p.id === project.id)).toBe(true)
    const teamMembers = snap.membersByTeam[team.id] ?? []
    expect(teamMembers.find((m) => m.userId === 'usr-carol')?.displayName).toBe('Carol Dev')
    expect(db2.getLatestExecutionForCard('card-99')?.status).toBe('completed')

    const inv2 = db2.createAndPersistInvitation({
      teamId: team.id,
      teamName: team.name,
      email: 'dave@orca.run',
      role: 'member',
      invitedBy: 'usr-carol'
    })
    db2.revokeInvitation(inv2.id, 'usr-carol')
    expect(db2.getInvitationById(inv2.id)?.status).toBe('revoked')
    db2.close()
  })
})
