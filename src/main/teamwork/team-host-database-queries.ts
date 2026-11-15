import type { DatabaseSync } from 'node:sqlite'
import type { FactoryConfig, FactoryRunRecord } from '../../shared/teamwork/team-factory-types'
import { createDefaultFactoryConfig } from '../../shared/teamwork/team-factory-types'
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

function isFactoryConfigShape(value: unknown): value is FactoryConfig {
  return (
    isRecord(value) &&
    typeof value.projectId === 'string' &&
    isRecord(value.specWriter) &&
    isRecord(value.builder) &&
    isRecord(value.reviewers) &&
    isRecord(value.approver) &&
    isRecord(value.deterministicRules)
  )
}

function isFactoryRunShape(value: unknown): value is FactoryRunRecord {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.cardId === 'string' &&
    typeof value.projectId === 'string' &&
    Array.isArray(value.stages) &&
    Array.isArray(value.reviews) &&
    Array.isArray(value.logs)
  )
}

export function queryFactoryConfig(db: DatabaseSync, projectId: string): FactoryConfig {
  const row = db
    .prepare('SELECT config_json FROM factory_configs WHERE project_id = ?')
    .get(projectId)
  if (isRecord(row) && typeof row.config_json === 'string') {
    try {
      const parsed: unknown = JSON.parse(row.config_json)
      if (isFactoryConfigShape(parsed)) {
        return parsed
      }
    } catch {
      // Fallback to default config.
    }
  }
  return createDefaultFactoryConfig(projectId)
}

export function persistFactoryConfig(db: DatabaseSync, config: FactoryConfig): FactoryConfig {
  const updated: FactoryConfig = { ...config, updatedAt: Date.now() }
  db.prepare(
    `INSERT INTO factory_configs (project_id, config_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       config_json = excluded.config_json,
       updated_at = excluded.updated_at`
  ).run(updated.projectId, JSON.stringify(updated), updated.updatedAt)
  return updated
}

export function persistFactoryRun(db: DatabaseSync, run: FactoryRunRecord): void {
  db.prepare(
    `INSERT INTO factory_runs (
       id, card_id, project_id, status, current_stage, run_json, started_at, completed_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       current_stage = excluded.current_stage,
       run_json = excluded.run_json,
       completed_at = excluded.completed_at,
       updated_at = excluded.updated_at`
  ).run(
    run.id,
    run.cardId,
    run.projectId,
    run.status,
    run.currentStage,
    JSON.stringify(run),
    run.startedAt,
    run.completedAt ?? null,
    run.updatedAt
  )
}

function parseFactoryRunRow(row: unknown): FactoryRunRecord | null {
  if (!isRecord(row) || typeof row.run_json !== 'string') {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(row.run_json)
    return isFactoryRunShape(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function queryFactoryRun(db: DatabaseSync, runId: string): FactoryRunRecord | null {
  const row = db.prepare('SELECT run_json FROM factory_runs WHERE id = ?').get(runId)
  return parseFactoryRunRow(row)
}

export function queryLatestFactoryRunForCard(
  db: DatabaseSync,
  cardId: string
): FactoryRunRecord | null {
  const row = db
    .prepare('SELECT run_json FROM factory_runs WHERE card_id = ? ORDER BY started_at DESC LIMIT 1')
    .get(cardId)
  return parseFactoryRunRow(row)
}

export function queryFactoryRunsForProject(
  db: DatabaseSync,
  projectId: string
): FactoryRunRecord[] {
  const rows = db
    .prepare(
      'SELECT run_json FROM factory_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 50'
    )
    .all(projectId)
  return rows.map(parseFactoryRunRow).filter((r): r is FactoryRunRecord => r !== null)
}
