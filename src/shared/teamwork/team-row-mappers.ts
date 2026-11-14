import type { Project, Team } from './team-workspace-types'

export function mapTeamRow(row: Record<string, unknown>): Team {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    ownerId: String(row.owner_id),
    description: row.description ? String(row.description) : undefined,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }
}

export function mapProjectRow(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    name: String(row.name),
    slug: String(row.slug),
    description: row.description ? String(row.description) : undefined,
    visibility: row.visibility === 'private' ? 'private' : 'team',
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  }
}
