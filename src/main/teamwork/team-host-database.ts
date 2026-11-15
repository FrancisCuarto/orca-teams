import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { userInfo } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { TeamDatabaseService } from '../../shared/teamwork/team-database-service'
import type {
  AgentExecutionRecord,
  Project,
  Team,
  TeamInvitation
} from '../../shared/teamwork/team-workspace-types'
import type {
  TeamMemberWithProfile,
  TeamSendInvitationRequest,
  TeamWorkspaceSnapshot
} from '../../shared/teamwork/team-ipc-types'
import {
  isRecord,
  mapInvitationRow,
  queryWorkspaceSnapshot,
  slugify
} from './team-host-database-queries'

const DB_FILENAME = 'orca-teams.db'

export class TeamHostDatabase {
  private readonly db: DatabaseSync
  private readonly service: TeamDatabaseService
  private closed = false

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? path.join(app.getPath('userData'), DB_FILENAME)
    if (resolvedPath !== ':memory:') {
      mkdirSync(path.dirname(resolvedPath), { recursive: true })
    }
    this.db = new DatabaseSync(resolvedPath)
    this.service = new TeamDatabaseService(this.db)
    this.service.initSchema()
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS team_member_profiles (
        user_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      )
    `)
    this.seedInitialWorkspaceIfEmpty()
  }

  private seedInitialWorkspaceIfEmpty(): void {
    const row = this.db.prepare('SELECT COUNT(*) as total FROM teams').get()
    const total = isRecord(row) ? Number(row.total) : 0
    if (total > 0) {
      return
    }
    const ownerId = 'local-owner'
    const username = userInfo().username || 'Owner'
    this.upsertMemberProfile(ownerId, username, `${slugify(username, 'owner')}@local.orca`)
    this.service.createTeam({
      id: 'team-local',
      name: 'Mi Equipo Local',
      slug: 'mi-equipo-local',
      ownerId,
      description: 'Espacio de trabajo colaborativo local'
    })
    this.service.createProject({
      id: 'proj-default',
      teamId: 'team-local',
      name: 'Proyecto Principal',
      slug: 'proyecto-principal',
      description: 'Tablero Kanban, pizarra y notas técnicas del equipo',
      visibility: 'team',
      actorUserId: ownerId
    })
  }

  private upsertMemberProfile(userId: string, displayName: string, email: string): void {
    this.db
      .prepare(
        `INSERT INTO team_member_profiles (user_id, display_name, email, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name = excluded.display_name,
           email = CASE WHEN excluded.email != '' THEN excluded.email ELSE team_member_profiles.email END,
           updated_at = excluded.updated_at`
      )
      .run(userId, displayName, email, Date.now())
  }

  getWorkspaceSnapshot(): TeamWorkspaceSnapshot {
    return queryWorkspaceSnapshot(this.db)
  }

  createTeam(input: { name: string; slug?: string; description?: string; ownerId?: string }): Team {
    const ownerId = input.ownerId?.trim() || 'local-owner'
    const baseSlug = slugify(input.slug ?? input.name, 'team')
    const existingSlug = this.db.prepare('SELECT id FROM teams WHERE slug = ?').get(baseSlug)
    const slug = existingSlug ? `${baseSlug}-${randomUUID().slice(0, 4)}` : baseSlug
    const username = userInfo().username || ownerId
    this.upsertMemberProfile(ownerId, ownerId === 'local-owner' ? username : ownerId, '')

    return this.service.createTeam({
      id: `team-${randomUUID().slice(0, 8)}`,
      name: input.name.trim(),
      slug,
      ownerId,
      description: input.description?.trim() || undefined
    })
  }

  createProject(input: {
    teamId: string
    name: string
    slug?: string
    description?: string
    visibility?: 'team' | 'private'
    actorUserId?: string
  }): Project {
    const team = this.service.getTeam(input.teamId)
    if (!team) {
      throw new Error(`Equipo '${input.teamId}' no encontrado`)
    }
    const actorUserId = input.actorUserId?.trim() || team.ownerId
    const baseSlug = slugify(input.slug ?? input.name, 'project')
    const existingSlug = this.db
      .prepare('SELECT id FROM projects WHERE team_id = ? AND slug = ?')
      .get(input.teamId, baseSlug)
    const slug = existingSlug ? `${baseSlug}-${randomUUID().slice(0, 4)}` : baseSlug

    return this.service.createProject({
      id: `proj-${randomUUID().slice(0, 8)}`,
      teamId: input.teamId,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || undefined,
      visibility: input.visibility ?? 'team',
      actorUserId
    })
  }

  createAndPersistInvitation(request: TeamSendInvitationRequest): TeamInvitation {
    const team = this.service.getTeam(request.teamId)
    if (!team) {
      throw new Error(`Equipo '${request.teamId}' no encontrado`)
    }
    const invitedBy = request.invitedBy?.trim() || team.ownerId
    return this.service.createInvitation({
      id: `inv-${randomUUID().slice(0, 8)}`,
      teamId: request.teamId,
      email: request.email.trim(),
      role: request.role,
      token: randomBytes(24).toString('hex'),
      invitedBy
    })
  }

  getTeam(teamId: string): Team | null {
    return this.service.getTeam(teamId)
  }

  getInvitationById(invitationId: string): TeamInvitation | null {
    const row = this.db.prepare('SELECT * FROM team_invitations WHERE id = ?').get(invitationId)
    return isRecord(row) ? mapInvitationRow(row) : null
  }

  acceptInvitation(
    token: string,
    userId: string,
    displayName?: string,
    email?: string
  ): TeamMemberWithProfile {
    const inv = this.service.getInvitationByToken(token)
    const member = this.service.acceptInvitation(token, userId)
    const resolvedEmail = email?.trim() || inv?.email || ''
    const resolvedName = displayName?.trim() || resolvedEmail.split('@')[0] || userId
    this.upsertMemberProfile(userId, resolvedName, resolvedEmail)
    return { ...member, displayName: resolvedName, email: resolvedEmail }
  }

  revokeInvitation(invitationId: string, actorUserId: string): void {
    this.service.revokeInvitation({ invitationId, actorUserId })
  }

  upsertExecution(record: AgentExecutionRecord): void {
    const existing = this.service.getAgentExecution(record.id)
    if (!existing) {
      this.service.recordAgentExecution(record)
      return
    }
    this.db
      .prepare(
        `UPDATE agent_executions
         SET status = ?, logs_json = ?, output_summary = ?, error = ?,
             started_at = COALESCE(?, started_at),
             completed_at = COALESCE(?, completed_at),
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        record.status,
        JSON.stringify(record.logs),
        record.outputSummary ?? null,
        record.error ?? null,
        record.startedAt ?? null,
        record.completedAt ?? null,
        record.updatedAt,
        record.id
      )
  }

  getExecution(executionId: string): AgentExecutionRecord | null {
    return this.service.getAgentExecution(executionId)
  }

  getLatestExecutionForCard(cardId: string): AgentExecutionRecord | null {
    return this.service.getLatestExecutionForTask(cardId)
  }

  close(): void {
    if (!this.closed) {
      this.closed = true
      this.db.close()
    }
  }
}
