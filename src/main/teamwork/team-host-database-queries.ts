import type { DatabaseSync } from 'node:sqlite'
import { mapProjectRow, mapTeamRow } from '../../shared/teamwork/team-row-mappers'
import {
  isTeamRole,
  type InvitationStatus,
  type TeamInvitation
} from '../../shared/teamwork/team-workspace-types'
import type {
  TeamMemberWithProfile,
  TeamWorkspaceSnapshot
} from '../../shared/teamwork/team-ipc-types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isInvitationStatus(value: unknown): value is InvitationStatus {
  return value === 'pending' || value === 'accepted' || value === 'revoked' || value === 'expired'
}

export function slugify(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return normalized || fallback
}

export function mapInvitationRow(row: Record<string, unknown>): TeamInvitation {
  const rawStatus = row.status
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    email: String(row.email),
    role: isTeamRole(row.role) ? row.role : 'member',
    token: String(row.token),
    invitedBy: String(row.invited_by),
    status: isInvitationStatus(rawStatus) ? rawStatus : 'pending',
    expiresAt: Number(row.expires_at),
    createdAt: Number(row.created_at)
  }
}

export function queryWorkspaceSnapshot(db: DatabaseSync): TeamWorkspaceSnapshot {
  const teamRows = db.prepare('SELECT * FROM teams ORDER BY created_at ASC').all()
  const teams = teamRows.filter(isRecord).map(mapTeamRow)

  const projectRows = db.prepare('SELECT * FROM projects ORDER BY created_at ASC').all()
  const projects = projectRows.filter(isRecord).map(mapProjectRow)

  const membersByTeam: Record<string, TeamMemberWithProfile[]> = {}
  const invitationsByTeam: Record<string, TeamInvitation[]> = {}
  for (const team of teams) {
    membersByTeam[team.id] = []
    invitationsByTeam[team.id] = []
  }

  const memberRows = db
    .prepare(
      `SELECT m.team_id, m.user_id, m.role, m.joined_at, p.display_name, p.email
       FROM team_members m
       LEFT JOIN team_member_profiles p ON m.user_id = p.user_id
       ORDER BY m.joined_at ASC`
    )
    .all()
  for (const row of memberRows) {
    if (!isRecord(row)) {
      continue
    }
    const teamId = String(row.team_id)
    const list = membersByTeam[teamId] ?? (membersByTeam[teamId] = [])
    const userId = String(row.user_id)
    list.push({
      teamId,
      userId,
      role: isTeamRole(row.role) ? row.role : 'member',
      joinedAt: Number(row.joined_at),
      displayName: row.display_name ? String(row.display_name) : userId,
      email: row.email ? String(row.email) : ''
    })
  }

  const now = Date.now()
  const invitationRows = db.prepare('SELECT * FROM team_invitations ORDER BY created_at DESC').all()
  for (const row of invitationRows) {
    if (!isRecord(row)) {
      continue
    }
    const inv = mapInvitationRow(row)
    if (inv.status === 'pending' && now > inv.expiresAt) {
      inv.status = 'expired'
    }
    const list = invitationsByTeam[inv.teamId] ?? (invitationsByTeam[inv.teamId] = [])
    list.push(inv)
  }

  return { teams, projects, membersByTeam, invitationsByTeam }
}
