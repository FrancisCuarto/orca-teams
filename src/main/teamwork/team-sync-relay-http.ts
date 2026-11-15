import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  isTeamRole,
  type TeamActivityActorType,
  type TeamActivityEntry
} from '../../shared/teamwork/team-workspace-types'
import type { TeamSendInvitationResult } from '../../shared/teamwork/team-ipc-types'
import type { TeamAuthService } from './team-auth-service'
import { buildTeamJoinUrl } from './team-deep-link'
import type { TeamEmailService } from './team-email-service'
import type { TeamHostDatabase } from './team-host-database'

const MAX_BODY_BYTES = 1_048_576

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

type ActivityTargetType = TeamActivityEntry['targetType']

class HttpRequestError extends Error {
  constructor(
    readonly statusCode: number,
    message: string
  ) {
    super(message)
  }
}

export type TeamRelayHttpDeps = {
  db: TeamHostDatabase
  authService: TeamAuthService
  emailService: TeamEmailService
  roomSecret?: string
  getRoomStats: () => { rooms: number; peers: number }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isActorType(value: unknown): value is TeamActivityActorType {
  return value === 'human' || value === 'agent' || value === 'system'
}

function isTargetType(value: unknown): value is ActivityTargetType {
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

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8'
  })
  res.end(JSON.stringify(payload))
}

function requireNonEmptyString(body: Record<string, unknown>, key: string, label?: string): string {
  const val = body[key]
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new HttpRequestError(400, `${label ?? key} is required`)
  }
  return val.trim()
}

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const val = body[key]
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let totalBytes = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8')
    totalBytes += buf.byteLength
    if (totalBytes > MAX_BODY_BYTES) {
      throw new HttpRequestError(413, 'Payload too large')
    }
    chunks.push(buf)
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new HttpRequestError(400, 'Invalid JSON body')
  }
  if (!isRecord(parsed)) {
    throw new HttpRequestError(400, 'JSON body must be an object')
  }
  return parsed
}

function isAuthorized(req: IncomingMessage, roomSecret?: string): boolean {
  const expected = roomSecret?.trim()
  if (!expected) {
    return true
  }
  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  return bearer === expected
}

function recordActivityBestEffort(
  db: TeamHostDatabase,
  entry: Omit<TeamActivityEntry, 'id' | 'createdAt'>
): void {
  try {
    db.recordActivity(entry)
  } catch {
    // Activity logging must never break primary mutations.
  }
}

export async function handleTeamRelayHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: TeamRelayHttpDeps
): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase()
  if (method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    res.end()
    return
  }

  const parsedUrl = new URL(req.url ?? '/', 'http://127.0.0.1')
  const pathname = parsedUrl.pathname
  const stats = deps.getRoomStats()
  const authRequired = Boolean(deps.roomSecret?.trim())

  if (method === 'GET' && pathname === '/') {
    sendJson(res, 200, {
      service: 'orca-teams-sync-relay',
      rooms: stats.rooms,
      peers: stats.peers
    })
    return
  }

  if (method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'orca-teams-sync-relay',
      rooms: stats.rooms,
      peers: stats.peers,
      authRequired
    })
    return
  }

  if (!pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  if (!isAuthorized(req, deps.roomSecret)) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  try {
    if (method === 'GET' && pathname === '/api/workspace/snapshot') {
      sendJson(res, 200, deps.db.getWorkspaceSnapshot())
      return
    }

    if (method === 'POST' && pathname === '/api/teams') {
      const body = await readJsonBody(req)
      const name = requireNonEmptyString(body, 'name')
      const team = deps.db.createTeam({
        name,
        slug: optionalString(body, 'slug'),
        description: optionalString(body, 'description'),
        ownerId: optionalString(body, 'ownerId')
      })
      recordActivityBestEffort(deps.db, {
        teamId: team.id,
        actorId: team.ownerId,
        actorName: team.ownerId,
        actorType: 'human',
        action: 'team.created',
        targetType: 'team',
        targetId: team.id,
        summary: `Creó el equipo "${team.name}"`
      })
      sendJson(res, 201, team)
      return
    }

    if (method === 'POST' && pathname === '/api/projects') {
      const body = await readJsonBody(req)
      const teamId = requireNonEmptyString(body, 'teamId')
      const name = requireNonEmptyString(body, 'name')
      const visibility = body.visibility === 'private' ? 'private' : 'team'
      const actorUserId = optionalString(body, 'actorUserId')
      const project = deps.db.createProject({
        teamId,
        name,
        slug: optionalString(body, 'slug'),
        description: optionalString(body, 'description'),
        visibility,
        actorUserId
      })
      recordActivityBestEffort(deps.db, {
        teamId: project.teamId,
        projectId: project.id,
        actorId: actorUserId ?? 'local-owner',
        actorName: actorUserId ?? 'Equipo',
        actorType: 'human',
        action: 'project.created',
        targetType: 'project',
        targetId: project.id,
        summary: `Creó el proyecto "${project.name}" (${project.visibility})`
      })
      sendJson(res, 201, project)
      return
    }

    if (method === 'POST' && pathname === '/api/invitations') {
      const body = await readJsonBody(req)
      const teamId = requireNonEmptyString(body, 'teamId')
      const email = requireNonEmptyString(body, 'email')
      if (!email.includes('@')) {
        throw new HttpRequestError(400, 'email must be a valid email address')
      }
      const role = isTeamRole(body.role) ? body.role : 'member'
      const team = deps.db.getTeam(teamId)
      const teamName = optionalString(body, 'teamName') ?? team?.name ?? teamId
      const invitedBy = optionalString(body, 'invitedBy') ?? team?.ownerId ?? 'local-owner'
      const inviterName = optionalString(body, 'inviterName')
      const invitation = deps.db.createAndPersistInvitation({
        teamId,
        teamName,
        email,
        role,
        invitedBy,
        inviterName
      })
      const joinUrl = buildTeamJoinUrl(invitation.token)
      const mail = await deps.emailService.sendInvitationEmail({
        toEmail: invitation.email,
        teamName,
        role: invitation.role,
        joinUrl,
        token: invitation.token,
        inviterName
      })
      recordActivityBestEffort(deps.db, {
        teamId,
        actorId: invitedBy,
        actorName: inviterName ?? invitedBy,
        actorType: 'human',
        action: 'invitation.sent',
        targetType: 'invitation',
        targetId: invitation.id,
        summary: `Invitó a ${invitation.email} como ${invitation.role}`
      })
      const result: TeamSendInvitationResult = {
        invitation,
        joinUrl,
        emailSent: mail.sent,
        ...(mail.transportUsed ? { transportUsed: mail.transportUsed } : {}),
        ...(mail.error ? { error: mail.error } : {}),
        ...(mail.needsMailConfig ? { needsMailConfig: true } : {})
      }
      sendJson(res, 201, result)
      return
    }

    if (method === 'POST' && pathname === '/api/invitations/resend') {
      const body = await readJsonBody(req)
      const invitationId = requireNonEmptyString(body, 'invitationId')
      const inviterName = optionalString(body, 'inviterName')
      const invitation = deps.db.getInvitationById(invitationId)
      if (!invitation) {
        throw new HttpRequestError(404, 'Invitación no encontrada')
      }
      if (invitation.status !== 'pending' || Date.now() > invitation.expiresAt) {
        throw new HttpRequestError(400, 'La invitación ya no está pendiente o ha expirado')
      }
      const team = deps.db.getTeam(invitation.teamId)
      const joinUrl = buildTeamJoinUrl(invitation.token)
      const mail = await deps.emailService.sendInvitationEmail({
        toEmail: invitation.email,
        teamName: team?.name ?? invitation.teamId,
        role: invitation.role,
        joinUrl,
        token: invitation.token,
        inviterName
      })
      const result: TeamSendInvitationResult = {
        invitation,
        joinUrl,
        emailSent: mail.sent,
        ...(mail.transportUsed ? { transportUsed: mail.transportUsed } : {}),
        ...(mail.error ? { error: mail.error } : {}),
        ...(mail.needsMailConfig ? { needsMailConfig: true } : {})
      }
      sendJson(res, 200, result)
      return
    }

    if (method === 'POST' && pathname === '/api/invitations/accept') {
      const body = await readJsonBody(req)
      const token = requireNonEmptyString(body, 'token')
      const userId = requireNonEmptyString(body, 'userId')
      const displayName = optionalString(body, 'displayName')
      const email = optionalString(body, 'email')
      const member = deps.db.acceptInvitation(token, userId, displayName, email)
      recordActivityBestEffort(deps.db, {
        teamId: member.teamId,
        actorId: member.userId,
        actorName: member.displayName,
        actorType: 'human',
        action: 'member.joined',
        targetType: 'member',
        targetId: member.userId,
        summary: `${member.displayName} se unió al equipo con rol ${member.role}`
      })
      sendJson(res, 200, member)
      return
    }

    if (method === 'POST' && pathname === '/api/invitations/revoke') {
      const body = await readJsonBody(req)
      const invitationId = requireNonEmptyString(body, 'invitationId')
      const actorUserId = requireNonEmptyString(body, 'actorUserId')
      deps.db.revokeInvitation(invitationId, actorUserId)
      sendJson(res, 200, { ok: true })
      return
    }

    if (method === 'POST' && pathname === '/api/auth/request-code') {
      const body = await readJsonBody(req)
      const email = requireNonEmptyString(body, 'email')
      const displayName = optionalString(body, 'displayName')
      const result = await deps.authService.requestMagicLinkCode(email, displayName)
      sendJson(res, 200, result)
      return
    }

    if (method === 'POST' && pathname === '/api/auth/verify-code') {
      const body = await readJsonBody(req)
      const email = requireNonEmptyString(body, 'email')
      const code = requireNonEmptyString(body, 'code')
      const displayName = optionalString(body, 'displayName')
      const userId = optionalString(body, 'userId')
      const profile = deps.authService.verifyRemoteChallenge(email, code, displayName, userId)
      sendJson(res, 200, profile)
      return
    }

    if (method === 'GET' && pathname === '/api/activity') {
      const teamId = parsedUrl.searchParams.get('teamId')?.trim() ?? ''
      if (!teamId) {
        throw new HttpRequestError(400, 'teamId query parameter is required')
      }
      const projectId = parsedUrl.searchParams.get('projectId')?.trim() || undefined
      const rawLimit = parsedUrl.searchParams.get('limit')
      const parsedLimit = rawLimit ? Number(rawLimit) : undefined
      const limit =
        parsedLimit !== undefined && Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(Math.floor(parsedLimit), 500)
          : undefined
      const entries = deps.db.listActivity({ teamId, projectId, limit })
      sendJson(res, 200, entries)
      return
    }

    if (method === 'POST' && pathname === '/api/activity') {
      const body = await readJsonBody(req)
      const teamId = requireNonEmptyString(body, 'teamId')
      const actorId = requireNonEmptyString(body, 'actorId')
      const actorName = requireNonEmptyString(body, 'actorName')
      const action = requireNonEmptyString(body, 'action')
      const summary = requireNonEmptyString(body, 'summary')
      if (!isActorType(body.actorType)) {
        throw new HttpRequestError(400, 'Invalid actorType')
      }
      if (!isTargetType(body.targetType)) {
        throw new HttpRequestError(400, 'Invalid targetType')
      }
      const metadata = isRecord(body.metadata) ? body.metadata : undefined
      const created = deps.db.recordActivity({
        teamId,
        projectId: optionalString(body, 'projectId'),
        actorId,
        actorName,
        actorType: body.actorType,
        action,
        targetType: body.targetType,
        targetId: optionalString(body, 'targetId'),
        summary,
        ...(metadata ? { metadata } : {})
      })
      sendJson(res, 201, created)
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (err) {
    if (err instanceof HttpRequestError) {
      sendJson(res, err.statusCode, { error: err.message })
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    sendJson(res, 400, { error: message })
  }
}
