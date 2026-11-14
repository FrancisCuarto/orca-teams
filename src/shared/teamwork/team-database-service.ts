import type { DatabaseSync } from 'node:sqlite'
import {
  hasTeamPermission,
  isTeamRole,
  type AgentExecutionLog,
  type AgentExecutionRecord,
  type AgentExecutionStatus,
  type Project,
  type ProjectVisibility,
  type Team,
  type TeamInvitation,
  type TeamMember,
  type TeamRole
} from './team-workspace-types'
import { teamSchemaStatements } from './team-schema'
import { TeamExecutionService } from './team-execution-service'
import { TeamInvitationService } from './team-invitation-service'
import { TeamProjectService } from './team-project-service'
import { mapTeamRow } from './team-row-mappers'

export class TeamDatabaseService {
  private readonly executions: TeamExecutionService
  private readonly invitations: TeamInvitationService
  private readonly projects: TeamProjectService

  constructor(private readonly db: DatabaseSync) {
    this.executions = new TeamExecutionService(db)
    this.invitations = new TeamInvitationService(db, (t, u) => this.getTeamMemberRole(t, u))
    this.projects = new TeamProjectService(db, (t, u) => this.getTeamMemberRole(t, u))
  }

  initSchema(): void {
    const statements = teamSchemaStatements()
    for (const sql of statements) {
      this.db.exec(sql)
    }
  }

  // --- Equipos (Teams) ---

  createTeam(options: {
    id: string
    name: string
    slug: string
    ownerId: string
    description?: string
  }): Team {
    const now = Date.now()
    const team: Team = {
      id: options.id,
      name: options.name,
      slug: options.slug,
      ownerId: options.ownerId,
      description: options.description,
      createdAt: now,
      updatedAt: now
    }

    const insertTeam = this.db.prepare(
      `INSERT INTO teams (id, name, slug, owner_id, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    insertTeam.run(
      team.id,
      team.name,
      team.slug,
      team.ownerId,
      team.description ?? null,
      team.createdAt,
      team.updatedAt
    )

    const insertMember = this.db.prepare(
      `INSERT INTO team_members (team_id, user_id, role, joined_at)
       VALUES (?, ?, ?, ?)`
    )
    insertMember.run(team.id, team.ownerId, 'owner', now)

    return team
  }

  getTeam(teamId: string): Team | null {
    const query = this.db.prepare(`SELECT * FROM teams WHERE id = ?`)
    const row = query.get(teamId) as Record<string, unknown> | undefined
    if (!row) {
      return null
    }

    return mapTeamRow(row)
  }

  getTeamMemberRole(teamId: string, userId: string): TeamRole | null {
    const query = this.db.prepare(`SELECT role FROM team_members WHERE team_id = ? AND user_id = ?`)
    const row = query.get(teamId, userId) as Record<string, unknown> | undefined
    if (!row || !isTeamRole(row.role)) {
      return null
    }
    return row.role
  }

  listTeamsForUser(userId: string): { team: Team; role: TeamRole }[] {
    const query = this.db.prepare(
      `SELECT t.*, m.role as member_role
       FROM teams t
       JOIN team_members m ON t.id = m.team_id
       WHERE m.user_id = ?
       ORDER BY t.created_at DESC`
    )
    const rows = query.all(userId) as Record<string, unknown>[]
    return rows.map((row) => ({
      team: mapTeamRow(row),
      role: isTeamRole(row.member_role) ? row.member_role : 'viewer'
    }))
  }

  addTeamMember(options: {
    teamId: string
    userId: string
    role: TeamRole
    actorUserId: string
  }): TeamMember {
    const actorRole = this.getTeamMemberRole(options.teamId, options.actorUserId)
    if (!actorRole || !hasTeamPermission(actorRole, 'admin')) {
      throw new Error(
        'Permisos insuficientes: se requiere rol admin u owner para gestionar miembros'
      )
    }

    const now = Date.now()
    const stmt = this.db.prepare(
      `INSERT INTO team_members (team_id, user_id, role, joined_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role`
    )
    stmt.run(options.teamId, options.userId, options.role, now)

    return {
      teamId: options.teamId,
      userId: options.userId,
      role: options.role,
      joinedAt: now
    }
  }

  // --- Proyectos (Projects) - Delegación a TeamProjectService ---

  createProject(options: {
    id: string
    teamId: string
    name: string
    slug: string
    description?: string
    visibility: ProjectVisibility
    actorUserId: string
  }): Project {
    return this.projects.createProject(options)
  }

  getProject(projectId: string): Project | null {
    return this.projects.getProject(projectId)
  }

  listProjectsForUser(options: { teamId: string; userId: string }): Project[] {
    return this.projects.listProjectsForUser(options)
  }

  canUserAccessProject(options: {
    projectId: string
    userId: string
    requiredRole?: TeamRole
  }): boolean {
    return this.projects.canUserAccessProject(options)
  }

  // --- Invitaciones (Invitations) - Delegación a TeamInvitationService ---

  createInvitation(options: {
    id: string
    teamId: string
    email: string
    role: TeamRole
    token: string
    invitedBy: string
    ttlMs?: number
  }): TeamInvitation {
    return this.invitations.createInvitation(options)
  }

  acceptInvitation(token: string, userId: string): TeamMember {
    return this.invitations.acceptInvitation(token, userId)
  }

  getInvitationByToken(token: string): TeamInvitation | null {
    return this.invitations.getInvitationByToken(token)
  }

  revokeInvitation(options: { invitationId: string; actorUserId: string }): void {
    this.invitations.revokeInvitation(options)
  }

  // --- Ejecuciones (Executions) - Delegación a TeamExecutionService ---

  recordAgentExecution(record: AgentExecutionRecord): AgentExecutionRecord {
    return this.executions.recordAgentExecution(record)
  }

  getAgentExecution(executionId: string): AgentExecutionRecord | null {
    return this.executions.getAgentExecution(executionId)
  }

  updateAgentExecutionStatus(options: {
    executionId: string
    status: AgentExecutionStatus
    outputSummary?: string
    error?: string
  }): void {
    this.executions.updateAgentExecutionStatus(options)
  }

  appendAgentExecutionLog(executionId: string, log: AgentExecutionLog): void {
    this.executions.appendAgentExecutionLog(executionId, log)
  }
}
