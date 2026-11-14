import type { DatabaseSync } from 'node:sqlite'
import {
  hasTeamPermission,
  isTeamRole,
  type Project,
  type ProjectVisibility,
  type TeamRole
} from './team-workspace-types'
import { mapProjectRow } from './team-row-mappers'

export class TeamProjectService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly getRole: (teamId: string, userId: string) => TeamRole | null
  ) {}

  createProject(options: {
    id: string
    teamId: string
    name: string
    slug: string
    description?: string
    visibility: ProjectVisibility
    actorUserId: string
  }): Project {
    const actorRole = this.getRole(options.teamId, options.actorUserId)
    if (!actorRole || !hasTeamPermission(actorRole, 'member')) {
      throw new Error(
        'Permisos insuficientes: se requiere rol member o superior para crear proyectos'
      )
    }

    const now = Date.now()
    const project: Project = {
      id: options.id,
      teamId: options.teamId,
      name: options.name,
      slug: options.slug,
      description: options.description,
      visibility: options.visibility,
      createdAt: now,
      updatedAt: now
    }

    const insertProject = this.db.prepare(
      `INSERT INTO projects (id, team_id, name, slug, description, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    insertProject.run(
      project.id,
      project.teamId,
      project.name,
      project.slug,
      project.description ?? null,
      project.visibility,
      project.createdAt,
      project.updatedAt
    )

    if (project.visibility === 'private') {
      const insertProjMember = this.db.prepare(
        `INSERT INTO project_members (project_id, user_id, role, joined_at)
         VALUES (?, ?, ?, ?)`
      )
      insertProjMember.run(project.id, options.actorUserId, 'owner', now)
    }

    return project
  }

  getProject(projectId: string): Project | null {
    const query = this.db.prepare(`SELECT * FROM projects WHERE id = ?`)
    const row = query.get(projectId) as Record<string, unknown> | undefined
    if (!row) {
      return null
    }

    return mapProjectRow(row)
  }

  listProjectsForUser(options: { teamId: string; userId: string }): Project[] {
    const teamRole = this.getRole(options.teamId, options.userId)
    if (!teamRole) {
      throw new Error('Acceso denegado: el usuario no pertenece a este equipo')
    }

    if (hasTeamPermission(teamRole, 'admin')) {
      const query = this.db.prepare(
        `SELECT * FROM projects WHERE team_id = ? ORDER BY created_at DESC`
      )
      const rows = query.all(options.teamId) as Record<string, unknown>[]
      return rows.map((r) => mapProjectRow(r))
    }

    const query = this.db.prepare(
      `SELECT DISTINCT p.* FROM projects p
       LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
       WHERE p.team_id = ? AND (p.visibility = 'team' OR pm.user_id IS NOT NULL)
       ORDER BY p.created_at DESC`
    )
    const rows = query.all(options.userId, options.teamId) as Record<string, unknown>[]
    return rows.map((r) => mapProjectRow(r))
  }

  canUserAccessProject(options: {
    projectId: string
    userId: string
    requiredRole?: TeamRole
  }): boolean {
    const project = this.getProject(options.projectId)
    if (!project) {
      return false
    }

    const teamRole = this.getRole(project.teamId, options.userId)
    if (!teamRole) {
      return false
    }

    const reqRole = options.requiredRole ?? 'viewer'

    if (hasTeamPermission(teamRole, 'admin')) {
      return hasTeamPermission(teamRole, reqRole)
    }

    if (project.visibility === 'team') {
      return hasTeamPermission(teamRole, reqRole)
    }

    const query = this.db.prepare(
      `SELECT role FROM project_members WHERE project_id = ? AND user_id = ?`
    )
    const row = query.get(options.projectId, options.userId) as Record<string, unknown> | undefined
    if (!row || !isTeamRole(row.role)) {
      return false
    }

    return hasTeamPermission(row.role, reqRole)
  }
}
