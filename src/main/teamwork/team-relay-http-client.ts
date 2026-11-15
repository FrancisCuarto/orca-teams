import {
  isTeamRole,
  type Project,
  type Team,
  type TeamActivityActorType,
  type TeamActivityEntry,
  type TeamInvitation,
  type TeamUserProfile
} from '../../shared/teamwork/team-workspace-types'
import type {
  TeamMailProvider,
  TeamMemberWithProfile,
  TeamSendInvitationRequest,
  TeamSendInvitationResult,
  TeamWorkspaceSnapshot
} from '../../shared/teamwork/team-ipc-types'

const DEFAULT_TIMEOUT_MS = 10_000

export type TeamRelayHttpClientOptions = {
  relayUrl: string
  roomSecret?: string
  fetchFn?: typeof globalThis.fetch
  timeoutMs?: number
}

export type TeamRelayHealthResponse = {
  ok: boolean
  service: string
  rooms: number
  peers: number
  authRequired: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isInvitationStatus(value: unknown): value is TeamInvitation['status'] {
  return value === 'pending' || value === 'accepted' || value === 'revoked' || value === 'expired'
}

function isMailProvider(value: unknown): value is TeamMailProvider {
  return value === 'smtp' || value === 'resend' || value === 'sendmail'
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

function parseTeam(value: unknown): Team {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.name) ||
    !isString(value.slug) ||
    !isString(value.ownerId) ||
    !isFiniteNumber(value.createdAt) ||
    !isFiniteNumber(value.updatedAt)
  ) {
    throw new Error('Respuesta inválida de equipo desde el servidor Relay')
  }
  return {
    id: value.id,
    name: value.name,
    slug: value.slug,
    ownerId: value.ownerId,
    ...(isString(value.description) ? { description: value.description } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  }
}

function parseProject(value: unknown): Project {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.teamId) ||
    !isString(value.name) ||
    !isString(value.slug) ||
    (value.visibility !== 'team' && value.visibility !== 'private') ||
    !isFiniteNumber(value.createdAt) ||
    !isFiniteNumber(value.updatedAt)
  ) {
    throw new Error('Respuesta inválida de proyecto desde el servidor Relay')
  }
  return {
    id: value.id,
    teamId: value.teamId,
    name: value.name,
    slug: value.slug,
    ...(isString(value.description) ? { description: value.description } : {}),
    visibility: value.visibility,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  }
}

function parseMemberWithProfile(value: unknown): TeamMemberWithProfile {
  if (
    !isRecord(value) ||
    !isString(value.teamId) ||
    !isString(value.userId) ||
    !isTeamRole(value.role) ||
    !isFiniteNumber(value.joinedAt)
  ) {
    throw new Error('Respuesta inválida de miembro desde el servidor Relay')
  }
  return {
    teamId: value.teamId,
    userId: value.userId,
    role: value.role,
    joinedAt: value.joinedAt,
    displayName: isString(value.displayName) ? value.displayName : value.userId,
    email: isString(value.email) ? value.email : ''
  }
}

function parseInvitation(value: unknown): TeamInvitation {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.teamId) ||
    !isString(value.email) ||
    !isTeamRole(value.role) ||
    !isString(value.token) ||
    !isString(value.invitedBy) ||
    !isInvitationStatus(value.status) ||
    !isFiniteNumber(value.expiresAt) ||
    !isFiniteNumber(value.createdAt)
  ) {
    throw new Error('Respuesta inválida de invitación desde el servidor Relay')
  }
  return {
    id: value.id,
    teamId: value.teamId,
    email: value.email,
    role: value.role,
    token: value.token,
    invitedBy: value.invitedBy,
    status: value.status,
    expiresAt: value.expiresAt,
    createdAt: value.createdAt
  }
}

function parseSendInvitationResult(value: unknown): TeamSendInvitationResult {
  if (!isRecord(value) || !isString(value.joinUrl) || typeof value.emailSent !== 'boolean') {
    throw new Error('Respuesta inválida al enviar invitación desde el servidor Relay')
  }
  return {
    invitation: parseInvitation(value.invitation),
    joinUrl: value.joinUrl,
    emailSent: value.emailSent,
    ...(isMailProvider(value.transportUsed) ? { transportUsed: value.transportUsed } : {}),
    ...(isString(value.error) ? { error: value.error } : {}),
    ...(value.needsMailConfig === true ? { needsMailConfig: true } : {})
  }
}

function parseWorkspaceSnapshot(value: unknown): TeamWorkspaceSnapshot {
  if (
    !isRecord(value) ||
    !Array.isArray(value.teams) ||
    !Array.isArray(value.projects) ||
    !isRecord(value.membersByTeam) ||
    !isRecord(value.invitationsByTeam)
  ) {
    throw new Error('Snapshot de workspace inválido desde el servidor Relay')
  }

  const membersByTeam: Record<string, TeamMemberWithProfile[]> = {}
  for (const [teamId, rawList] of Object.entries(value.membersByTeam)) {
    membersByTeam[teamId] = Array.isArray(rawList) ? rawList.map(parseMemberWithProfile) : []
  }

  const invitationsByTeam: Record<string, TeamInvitation[]> = {}
  for (const [teamId, rawList] of Object.entries(value.invitationsByTeam)) {
    invitationsByTeam[teamId] = Array.isArray(rawList) ? rawList.map(parseInvitation) : []
  }

  return {
    teams: value.teams.map(parseTeam),
    projects: value.projects.map(parseProject),
    membersByTeam,
    invitationsByTeam
  }
}

function parseActivityEntry(value: unknown): TeamActivityEntry {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.teamId) ||
    !isString(value.actorId) ||
    !isString(value.actorName) ||
    !isActorType(value.actorType) ||
    !isString(value.action) ||
    !isTargetType(value.targetType) ||
    !isString(value.summary) ||
    !isFiniteNumber(value.createdAt)
  ) {
    throw new Error('Entrada de actividad inválida desde el servidor Relay')
  }
  return {
    id: value.id,
    teamId: value.teamId,
    ...(isString(value.projectId) ? { projectId: value.projectId } : {}),
    actorId: value.actorId,
    actorName: value.actorName,
    actorType: value.actorType,
    action: value.action,
    targetType: value.targetType,
    ...(isString(value.targetId) ? { targetId: value.targetId } : {}),
    summary: value.summary,
    ...(isRecord(value.metadata) ? { metadata: value.metadata } : {}),
    createdAt: value.createdAt
  }
}

function parseUserProfile(value: unknown): TeamUserProfile {
  if (
    !isRecord(value) ||
    !isString(value.userId) ||
    !isString(value.email) ||
    !isString(value.displayName) ||
    !isFiniteNumber(value.authenticatedAt)
  ) {
    throw new Error('Perfil de usuario inválido desde el servidor Relay')
  }
  return {
    userId: value.userId,
    email: value.email,
    displayName: value.displayName,
    ...(isString(value.avatarUrl) ? { avatarUrl: value.avatarUrl } : {}),
    authMethod: value.authMethod === 'magic-link' ? 'magic-link' : 'local',
    authenticatedAt: value.authenticatedAt
  }
}

/** Converts a `ws://` / `wss://` (or `http://` / `https://`) relay URL to an HTTP base URL. */
export function relayUrlToHttpBaseUrl(relayUrl: string): string {
  const trimmed = relayUrl.trim()
  if (!trimmed) {
    throw new Error('La URL del servidor Relay está vacía')
  }
  let normalized = trimmed
  if (/^ws:\/\//i.test(normalized)) {
    normalized = `http://${normalized.slice(5)}`
  } else if (/^wss:\/\//i.test(normalized)) {
    normalized = `https://${normalized.slice(6)}`
  }

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error(`URL del servidor Relay inválida: ${relayUrl}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Protocolo de Relay no soportado: ${parsed.protocol}`)
  }

  const pathname = parsed.pathname.replace(/\/+$/, '')
  return `${parsed.origin}${pathname}`
}

export class TeamRelayHttpClient {
  private readonly baseUrl: string
  private readonly roomSecret?: string
  private readonly fetchFn: typeof globalThis.fetch
  private readonly timeoutMs: number

  constructor(options: TeamRelayHttpClientOptions) {
    this.baseUrl = relayUrlToHttpBaseUrl(options.relayUrl)
    this.roomSecret = options.roomSecret?.trim() || undefined
    this.fetchFn = options.fetchFn ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  private async request<T>(
    method: 'GET' | 'POST',
    endpointPath: string,
    body: unknown,
    parse: (data: unknown) => T
  ): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const headers: Record<string, string> = {
      Accept: 'application/json'
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    if (this.roomSecret) {
      headers.Authorization = `Bearer ${this.roomSecret}`
    }

    try {
      const response = await this.fetchFn(`${this.baseUrl}${endpointPath}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal
      })

      const text = await response.text()
      let parsedBody: unknown = null
      if (text.trim().length > 0) {
        try {
          parsedBody = JSON.parse(text)
        } catch {
          if (!response.ok) {
            throw new Error(`Error del servidor Relay (${response.status}): ${text.slice(0, 160)}`)
          }
          throw new Error('El servidor Relay devolvió una respuesta no JSON')
        }
      }

      if (!response.ok) {
        const message =
          isRecord(parsedBody) && isString(parsedBody.error)
            ? parsedBody.error
            : `Error del servidor Relay (HTTP ${response.status})`
        throw new Error(message)
      }

      return parse(parsedBody)
    } finally {
      clearTimeout(timer)
    }
  }

  async getHealth(): Promise<TeamRelayHealthResponse> {
    return this.request('GET', '/api/health', undefined, (data) => {
      if (
        !isRecord(data) ||
        typeof data.ok !== 'boolean' ||
        !isString(data.service) ||
        !isFiniteNumber(data.rooms) ||
        !isFiniteNumber(data.peers)
      ) {
        throw new Error('Respuesta inválida en /api/health')
      }
      return {
        ok: data.ok,
        service: data.service,
        rooms: data.rooms,
        peers: data.peers,
        authRequired: Boolean(data.authRequired)
      }
    })
  }

  async getWorkspaceSnapshot(): Promise<TeamWorkspaceSnapshot> {
    return this.request('GET', '/api/workspace/snapshot', undefined, parseWorkspaceSnapshot)
  }

  async createTeam(input: {
    name: string
    slug?: string
    description?: string
    ownerId?: string
  }): Promise<Team> {
    return this.request('POST', '/api/teams', input, parseTeam)
  }

  async createProject(input: {
    teamId: string
    name: string
    slug?: string
    description?: string
    visibility?: 'team' | 'private'
    actorUserId?: string
  }): Promise<Project> {
    return this.request('POST', '/api/projects', input, parseProject)
  }

  async sendInvitation(request: TeamSendInvitationRequest): Promise<TeamSendInvitationResult> {
    return this.request('POST', '/api/invitations', request, parseSendInvitationResult)
  }

  async resendInvitation(
    invitationId: string,
    inviterName?: string
  ): Promise<TeamSendInvitationResult> {
    return this.request(
      'POST',
      '/api/invitations/resend',
      { invitationId, inviterName },
      parseSendInvitationResult
    )
  }

  async acceptInvitation(
    token: string,
    userId: string,
    displayName?: string,
    email?: string
  ): Promise<TeamMemberWithProfile> {
    return this.request(
      'POST',
      '/api/invitations/accept',
      { token, userId, displayName, email },
      parseMemberWithProfile
    )
  }

  async revokeInvitation(invitationId: string, actorUserId: string): Promise<void> {
    await this.request('POST', '/api/invitations/revoke', { invitationId, actorUserId }, () => undefined)
  }

  async requestMagicLinkCode(
    email: string,
    displayName?: string
  ): Promise<{ sent: boolean; expiresAt: number; devCode?: string; error?: string }> {
    return this.request('POST', '/api/auth/request-code', { email, displayName }, (data) => {
      if (
        !isRecord(data) ||
        typeof data.sent !== 'boolean' ||
        !isFiniteNumber(data.expiresAt)
      ) {
        throw new Error('Respuesta inválida en /api/auth/request-code')
      }
      return {
        sent: data.sent,
        expiresAt: data.expiresAt,
        ...(isString(data.devCode) ? { devCode: data.devCode } : {}),
        ...(isString(data.error) ? { error: data.error } : {})
      }
    })
  }

  async verifyMagicLinkCode(
    email: string,
    code: string,
    displayName?: string,
    userId?: string
  ): Promise<TeamUserProfile> {
    return this.request(
      'POST',
      '/api/auth/verify-code',
      { email, code, displayName, userId },
      parseUserProfile
    )
  }

  async listActivity(options: {
    teamId: string
    projectId?: string
    limit?: number
  }): Promise<TeamActivityEntry[]> {
    const params = new URLSearchParams({ teamId: options.teamId })
    if (options.projectId) {
      params.set('projectId', options.projectId)
    }
    if (options.limit !== undefined) {
      params.set('limit', String(options.limit))
    }
    return this.request('GET', `/api/activity?${params.toString()}`, undefined, (data) => {
      if (!Array.isArray(data)) {
        throw new Error('Respuesta inválida en /api/activity')
      }
      return data.map(parseActivityEntry)
    })
  }

  async recordActivity(
    entry: Omit<TeamActivityEntry, 'id' | 'createdAt'>
  ): Promise<TeamActivityEntry> {
    return this.request('POST', '/api/activity', entry, parseActivityEntry)
  }
}
