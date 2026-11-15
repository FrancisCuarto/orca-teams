import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { TeamActivityActorType, TeamActivityEntry } from './team-workspace-types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isActorType(value: unknown): value is TeamActivityActorType {
  return value === 'human' || value === 'agent' || value === 'system'
}

function isTargetType(value: unknown): value is TeamActivityEntry['targetType'] {
  return (
    value === 'team' ||
    value === 'project' ||
    value === 'member' ||
    value === 'invitation' ||
    value === 'card' ||
    value === 'execution' ||
    value === 'note' ||
    value === 'sync'
  )
}

function parseMetadata(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== 'string' || !raw.trim()) {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export class TeamActivityService {
  constructor(private readonly db: DatabaseSync) {}

  recordActivity(input: Omit<TeamActivityEntry, 'id' | 'createdAt'>): TeamActivityEntry {
    const entry: TeamActivityEntry = {
      ...input,
      id: `act-${randomUUID().slice(0, 12)}`,
      createdAt: Date.now()
    }
    this.db
      .prepare(
        `INSERT INTO team_activity_log (
          id, team_id, project_id, actor_id, actor_name, actor_type,
          action, target_type, target_id, summary, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.teamId,
        entry.projectId ?? null,
        entry.actorId,
        entry.actorName,
        entry.actorType,
        entry.action,
        entry.targetType,
        entry.targetId ?? null,
        entry.summary,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.createdAt
      )
    return entry
  }

  listActivity(options: {
    teamId: string
    projectId?: string
    limit?: number
  }): TeamActivityEntry[] {
    const limit = Math.max(1, Math.min(options.limit ?? 100, 300))
    const rows = options.projectId
      ? this.db
          .prepare(
            `SELECT * FROM team_activity_log
             WHERE team_id = ? AND (project_id = ? OR project_id IS NULL)
             ORDER BY created_at DESC LIMIT ?`
          )
          .all(options.teamId, options.projectId, limit)
      : this.db
          .prepare(
            `SELECT * FROM team_activity_log
             WHERE team_id = ?
             ORDER BY created_at DESC LIMIT ?`
          )
          .all(options.teamId, limit)

    const entries: TeamActivityEntry[] = []
    for (const row of rows) {
      if (!isRecord(row)) {
        continue
      }
      entries.push({
        id: String(row.id),
        teamId: String(row.team_id),
        projectId: typeof row.project_id === 'string' ? row.project_id : undefined,
        actorId: String(row.actor_id),
        actorName: String(row.actor_name),
        actorType: isActorType(row.actor_type) ? row.actor_type : 'system',
        action: String(row.action),
        targetType: isTargetType(row.target_type) ? row.target_type : 'team',
        targetId: typeof row.target_id === 'string' ? row.target_id : undefined,
        summary: String(row.summary),
        metadata: parseMetadata(row.metadata_json),
        createdAt: Number(row.created_at)
      })
    }
    return entries
  }
}
