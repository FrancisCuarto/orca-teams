import type { DatabaseSync } from 'node:sqlite'
import {
  hasTeamPermission,
  isTeamRole,
  type InvitationStatus,
  type TeamInvitation,
  type TeamMember,
  type TeamRole
} from './team-workspace-types'

export class TeamInvitationService {
  constructor(
    private readonly db: DatabaseSync,
    private readonly getRole: (teamId: string, userId: string) => TeamRole | null
  ) {}

  createInvitation(options: {
    id: string
    teamId: string
    email: string
    role: TeamRole
    token: string
    invitedBy: string
    ttlMs?: number
  }): TeamInvitation {
    const actorRole = this.getRole(options.teamId, options.invitedBy)
    if (!actorRole || !hasTeamPermission(actorRole, 'admin')) {
      throw new Error('Permisos insuficientes: solo admins u owners pueden emitir invitaciones')
    }

    const now = Date.now()
    const expiresAt = now + (options.ttlMs ?? 7 * 24 * 60 * 60 * 1000)

    const invitation: TeamInvitation = {
      id: options.id,
      teamId: options.teamId,
      email: options.email,
      role: options.role,
      token: options.token,
      invitedBy: options.invitedBy,
      status: 'pending',
      expiresAt,
      createdAt: now
    }

    const stmt = this.db.prepare(
      `INSERT INTO team_invitations (id, team_id, email, role, token, invited_by, status, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    stmt.run(
      invitation.id,
      invitation.teamId,
      invitation.email,
      invitation.role,
      invitation.token,
      invitation.invitedBy,
      invitation.status,
      invitation.expiresAt,
      invitation.createdAt
    )

    return invitation
  }

  acceptInvitation(token: string, userId: string): TeamMember {
    const query = this.db.prepare(`SELECT * FROM team_invitations WHERE token = ?`)
    const row = query.get(token) as Record<string, unknown> | undefined
    if (!row) {
      throw new Error('Invitación no encontrada')
    }

    const status = String(row.status) as InvitationStatus
    if (status !== 'pending') {
      throw new Error(`La invitación ya no es válida (estado: ${status})`)
    }

    const now = Date.now()
    const expiresAt = Number(row.expires_at)
    if (now > expiresAt) {
      this.db.prepare(`UPDATE team_invitations SET status = 'expired' WHERE token = ?`).run(token)
      throw new Error('La invitación ha expirado')
    }

    const role = isTeamRole(row.role) ? row.role : 'member'
    const teamId = String(row.team_id)

    const insertMember = this.db.prepare(
      `INSERT INTO team_members (team_id, user_id, role, joined_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role`
    )
    insertMember.run(teamId, userId, role, now)

    this.db.prepare(`UPDATE team_invitations SET status = 'accepted' WHERE token = ?`).run(token)

    return {
      teamId,
      userId,
      role,
      joinedAt: now
    }
  }

  getInvitationByToken(token: string): TeamInvitation | null {
    const query = this.db.prepare(`SELECT * FROM team_invitations WHERE token = ?`)
    const row = query.get(token) as Record<string, unknown> | undefined
    if (!row) {
      return null
    }

    return {
      id: String(row.id),
      teamId: String(row.team_id),
      email: String(row.email),
      role: isTeamRole(row.role) ? row.role : 'member',
      token: String(row.token),
      invitedBy: String(row.invited_by),
      status: String(row.status) as InvitationStatus,
      expiresAt: Number(row.expires_at),
      createdAt: Number(row.created_at)
    }
  }

  revokeInvitation(options: { invitationId: string; actorUserId: string }): void {
    const query = this.db.prepare(`SELECT * FROM team_invitations WHERE id = ?`)
    const row = query.get(options.invitationId) as Record<string, unknown> | undefined
    if (!row) {
      throw new Error('Invitación no encontrada')
    }

    const teamId = String(row.team_id)
    const actorRole = this.getRole(teamId, options.actorUserId)
    if (!actorRole || !hasTeamPermission(actorRole, 'admin')) {
      throw new Error(
        'Permisos insuficientes: se requiere rol admin u owner para revocar invitaciones'
      )
    }

    this.db
      .prepare(`UPDATE team_invitations SET status = 'revoked' WHERE id = ?`)
      .run(options.invitationId)
  }
}
