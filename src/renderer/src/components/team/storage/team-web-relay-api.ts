import type {
  ConfiguredTeamAgent,
  TeamApi,
  TeamApproveExecutionRequest,
  TeamMailConfigInput,
  TeamMailConfigPublic,
  TeamMailProvider,
  TeamMemberWithProfile,
  TeamRejectExecutionRequest,
  TeamSendInvitationRequest,
  TeamSendInvitationResult,
  TeamStartExecutionRequest,
  TeamSyncRuntimeStatus,
  TeamWorkspaceSnapshot
} from '../../../../../shared/teamwork/team-ipc-types'
import {
  isTeamRole,
  type AgentApprovalStatus,
  type AgentExecutionLog,
  type AgentExecutionRecord,
  type AgentExecutionStatus,
  type InvitationStatus,
  type Project,
  type ProjectVisibility,
  type Team,
  type TeamActivityActorType,
  type TeamActivityEntry,
  type TeamInvitation,
  type TeamSyncSettings,
  type TeamUserProfile
} from '../../../../../shared/teamwork/team-workspace-types'

const STORAGE_KEY_RELAY_URL = 'orca-teams-portal:relayUrl'
const STORAGE_KEY_ROOM_SECRET = 'orca-teams-portal:roomSecret'
const STORAGE_KEY_USER_PROFILE = 'orca-teams-portal:userProfile'

export type WebPortalConnectionConfig = {
  relayUrl: string
  roomSecret: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readLocalStorage(key: string): string | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage quota or privacy-mode errors.
  }
}

function removeLocalStorage(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore storage removal errors.
  }
}

function isLocalOrPrivateHost(rawWithoutScheme: string): boolean {
  const lower = rawWithoutScheme.toLowerCase()
  return (
    lower.startsWith('localhost') ||
    lower.startsWith('127.0.0.1') ||
    lower.startsWith('192.168.') ||
    lower.startsWith('10.') ||
    lower.startsWith('172.') ||
    lower.startsWith('[::1]')
  )
}

export function normalizeHttpRelayUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '')
  if (!trimmed) {
    return ''
  }
  if (/^ws:\/\//i.test(trimmed)) {
    return `http://${trimmed.slice(5)}`
  }
  if (/^wss:\/\//i.test(trimmed)) {
    return `https://${trimmed.slice(6)}`
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return isLocalOrPrivateHost(trimmed) ? `http://${trimmed}` : `https://${trimmed}`
}

export function normalizeWsRelayUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '')
  if (!trimmed) {
    return ''
  }
  if (/^http:\/\//i.test(trimmed)) {
    return `ws://${trimmed.slice(7)}`
  }
  if (/^https:\/\//i.test(trimmed)) {
    return `wss://${trimmed.slice(8)}`
  }
  if (/^wss?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return isLocalOrPrivateHost(trimmed) ? `ws://${trimmed}` : `wss://${trimmed}`
}

export function isTeamsPortalLocation(loc?: Pick<Location, 'search' | 'pathname'>): boolean {
  const target = loc ?? (typeof window !== 'undefined' ? window.location : undefined)
  if (!target) {
    return false
  }
  const params = new URLSearchParams(target.search)
  if (params.get('portal') === 'teams') {
    return true
  }
  const normalizedPath = target.pathname.replace(/\/+$/, '')
  return (
    normalizedPath === '/teams' ||
    normalizedPath.startsWith('/teams/') ||
    normalizedPath.endsWith('/teams')
  )
}

export function readWebPortalConnectionConfig(): WebPortalConnectionConfig {
  let relayUrl = readLocalStorage(STORAGE_KEY_RELAY_URL) ?? ''
  let roomSecret = readLocalStorage(STORAGE_KEY_ROOM_SECRET) ?? ''

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const queryRelay = params.get('relay')
    const queryToken = params.get('token')
    if (queryRelay && queryRelay.trim()) {
      relayUrl = queryRelay.trim()
      writeLocalStorage(STORAGE_KEY_RELAY_URL, relayUrl)
    }
    if (queryToken !== null && queryToken.trim()) {
      roomSecret = queryToken.trim()
      writeLocalStorage(STORAGE_KEY_ROOM_SECRET, roomSecret)
    }
  }

  return { relayUrl, roomSecret }
}

export function saveWebPortalConnectionConfig(
  next: Partial<WebPortalConnectionConfig>
): WebPortalConnectionConfig {
  const current = readWebPortalConnectionConfig()
  const relayUrl = next.relayUrl !== undefined ? next.relayUrl.trim() : current.relayUrl
  const roomSecret = next.roomSecret !== undefined ? next.roomSecret.trim() : current.roomSecret

  if (relayUrl) {
    writeLocalStorage(STORAGE_KEY_RELAY_URL, relayUrl)
  } else {
    removeLocalStorage(STORAGE_KEY_RELAY_URL)
  }

  if (roomSecret) {
    writeLocalStorage(STORAGE_KEY_ROOM_SECRET, roomSecret)
  } else {
    removeLocalStorage(STORAGE_KEY_ROOM_SECRET)
  }

  return { relayUrl, roomSecret }
}

export function clearWebPortalConnectionConfig(): void {
  removeLocalStorage(STORAGE_KEY_RELAY_URL)
  removeLocalStorage(STORAGE_KEY_ROOM_SECRET)
}

function defaultWebGuestProfile(): TeamUserProfile {
  return {
    userId: 'web-guest',
    email: '',
    displayName: 'Invitado Web',
    authMethod: 'local',
    authenticatedAt: 0
  }
}

export function readStoredWebPortalUserProfile(): TeamUserProfile | null {
  const raw = readLocalStorage(STORAGE_KEY_USER_PROFILE)
  if (!raw) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return parseTeamUserProfile(parsed)
  } catch {
    return null
  }
}

export function saveStoredWebPortalUserProfile(profile: TeamUserProfile): void {
  writeLocalStorage(STORAGE_KEY_USER_PROFILE, JSON.stringify(profile))
}

function slugifyIdentifier(raw: string, fallback: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function unwrapCandidate(raw: unknown, keys: readonly string[]): unknown {
  if (!isRecord(raw)) {
    return raw
  }
  for (const key of keys) {
    if (key in raw && raw[key] !== undefined) {
      return raw[key]
    }
  }
  return raw
}

function parseTeam(raw: unknown): Team | null {
  const candidate = unwrapCandidate(raw, ['team'])
  if (!isRecord(candidate)) {
    return null
  }
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.slug !== 'string' ||
    typeof candidate.ownerId !== 'string' ||
    typeof candidate.createdAt !== 'number' ||
    typeof candidate.updatedAt !== 'number'
  ) {
    return null
  }
  return {
    id: candidate.id,
    name: candidate.name,
    slug: candidate.slug,
    ownerId: candidate.ownerId,
    description: typeof candidate.description === 'string' ? candidate.description : undefined,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt
  }
}

function isProjectVisibility(value: unknown): value is ProjectVisibility {
  return value === 'team' || value === 'private'
}

function parseProject(raw: unknown): Project | null {
  const candidate = unwrapCandidate(raw, ['project'])
  if (!isRecord(candidate)) {
    return null
  }
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.teamId !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.slug !== 'string' ||
    !isProjectVisibility(candidate.visibility) ||
    typeof candidate.createdAt !== 'number' ||
    typeof candidate.updatedAt !== 'number'
  ) {
    return null
  }
  return {
    id: candidate.id,
    teamId: candidate.teamId,
    name: candidate.name,
    slug: candidate.slug,
    description: typeof candidate.description === 'string' ? candidate.description : undefined,
    visibility: candidate.visibility,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt
  }
}

function parseTeamMemberWithProfile(raw: unknown): TeamMemberWithProfile | null {
  const candidate = unwrapCandidate(raw, ['member'])
  if (!isRecord(candidate)) {
    return null
  }
  if (
    typeof candidate.teamId !== 'string' ||
    typeof candidate.userId !== 'string' ||
    !isTeamRole(candidate.role) ||
    typeof candidate.joinedAt !== 'number' ||
    typeof candidate.displayName !== 'string' ||
    typeof candidate.email !== 'string'
  ) {
    return null
  }
  return {
    teamId: candidate.teamId,
    userId: candidate.userId,
    role: candidate.role,
    joinedAt: candidate.joinedAt,
    displayName: candidate.displayName,
    email: candidate.email
  }
}

function isInvitationStatus(value: unknown): value is InvitationStatus {
  return value === 'pending' || value === 'accepted' || value === 'revoked' || value === 'expired'
}

function parseTeamInvitation(raw: unknown): TeamInvitation | null {
  if (!isRecord(raw)) {
    return null
  }
  if (
    typeof raw.id !== 'string' ||
    typeof raw.teamId !== 'string' ||
    typeof raw.email !== 'string' ||
    !isTeamRole(raw.role) ||
    typeof raw.token !== 'string' ||
    typeof raw.invitedBy !== 'string' ||
    !isInvitationStatus(raw.status) ||
    typeof raw.expiresAt !== 'number' ||
    typeof raw.createdAt !== 'number'
  ) {
    return null
  }
  return {
    id: raw.id,
    teamId: raw.teamId,
    email: raw.email,
    role: raw.role,
    token: raw.token,
    invitedBy: raw.invitedBy,
    status: raw.status,
    expiresAt: raw.expiresAt,
    createdAt: raw.createdAt
  }
}

function parseWorkspaceSnapshot(raw: unknown): TeamWorkspaceSnapshot | null {
  const candidate = unwrapCandidate(raw, ['snapshot'])
  if (!isRecord(candidate)) {
    return null
  }
  if (!Array.isArray(candidate.teams) || !Array.isArray(candidate.projects)) {
    return null
  }

  const teams: Team[] = []
  for (const item of candidate.teams) {
    const parsed = parseTeam(item)
    if (parsed) {
      teams.push(parsed)
    }
  }

  const projects: Project[] = []
  for (const item of candidate.projects) {
    const parsed = parseProject(item)
    if (parsed) {
      projects.push(parsed)
    }
  }

  const membersByTeam: Record<string, TeamMemberWithProfile[]> = {}
  if (isRecord(candidate.membersByTeam)) {
    for (const [teamId, list] of Object.entries(candidate.membersByTeam)) {
      if (!Array.isArray(list)) {
        continue
      }
      const parsedMembers: TeamMemberWithProfile[] = []
      for (const entry of list) {
        const parsed = parseTeamMemberWithProfile(entry)
        if (parsed) {
          parsedMembers.push(parsed)
        }
      }
      membersByTeam[teamId] = parsedMembers
    }
  }

  const invitationsByTeam: Record<string, TeamInvitation[]> = {}
  if (isRecord(candidate.invitationsByTeam)) {
    for (const [teamId, list] of Object.entries(candidate.invitationsByTeam)) {
      if (!Array.isArray(list)) {
        continue
      }
      const parsedInvitations: TeamInvitation[] = []
      for (const entry of list) {
        const parsed = parseTeamInvitation(entry)
        if (parsed) {
          parsedInvitations.push(parsed)
        }
      }
      invitationsByTeam[teamId] = parsedInvitations
    }
  }

  return {
    teams,
    projects,
    membersByTeam,
    invitationsByTeam
  }
}

function isTeamMailProvider(value: unknown): value is TeamMailProvider {
  return value === 'smtp' || value === 'resend' || value === 'sendmail'
}

function parseSendInvitationResult(raw: unknown): TeamSendInvitationResult | null {
  if (!isRecord(raw)) {
    return null
  }
  const invitation = parseTeamInvitation(raw.invitation)
  if (!invitation || typeof raw.joinUrl !== 'string' || typeof raw.emailSent !== 'boolean') {
    return null
  }
  return {
    invitation,
    joinUrl: raw.joinUrl,
    emailSent: raw.emailSent,
    transportUsed: isTeamMailProvider(raw.transportUsed) ? raw.transportUsed : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined,
    needsMailConfig: typeof raw.needsMailConfig === 'boolean' ? raw.needsMailConfig : undefined
  }
}

function parseTeamMailConfigPublic(raw: unknown): TeamMailConfigPublic | null {
  if (!isRecord(raw)) {
    return null
  }
  if (
    !isTeamMailProvider(raw.provider) ||
    typeof raw.fromEmail !== 'string' ||
    typeof raw.fromName !== 'string' ||
    typeof raw.smtpHost !== 'string' ||
    typeof raw.smtpPort !== 'number' ||
    typeof raw.smtpSecure !== 'boolean' ||
    typeof raw.smtpUser !== 'string' ||
    typeof raw.hasSecret !== 'boolean' ||
    typeof raw.sendmailAvailable !== 'boolean'
  ) {
    return null
  }
  return {
    provider: raw.provider,
    fromEmail: raw.fromEmail,
    fromName: raw.fromName,
    smtpHost: raw.smtpHost,
    smtpPort: raw.smtpPort,
    smtpSecure: raw.smtpSecure,
    smtpUser: raw.smtpUser,
    hasSecret: raw.hasSecret,
    sendmailAvailable: raw.sendmailAvailable
  }
}

function isActivityActorType(value: unknown): value is TeamActivityActorType {
  return value === 'human' || value === 'agent' || value === 'system'
}

function isActivityTargetType(value: unknown): value is TeamActivityEntry['targetType'] {
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

function parseTeamActivityEntry(raw: unknown): TeamActivityEntry | null {
  if (!isRecord(raw)) {
    return null
  }
  if (
    typeof raw.id !== 'string' ||
    typeof raw.teamId !== 'string' ||
    typeof raw.actorId !== 'string' ||
    typeof raw.actorName !== 'string' ||
    typeof raw.action !== 'string' ||
    typeof raw.summary !== 'string' ||
    typeof raw.createdAt !== 'number'
  ) {
    return null
  }
  return {
    id: raw.id,
    teamId: raw.teamId,
    projectId: typeof raw.projectId === 'string' ? raw.projectId : undefined,
    actorId: raw.actorId,
    actorName: raw.actorName,
    actorType: isActivityActorType(raw.actorType) ? raw.actorType : 'system',
    action: raw.action,
    targetType: isActivityTargetType(raw.targetType) ? raw.targetType : 'team',
    targetId: typeof raw.targetId === 'string' ? raw.targetId : undefined,
    summary: raw.summary,
    metadata: isRecord(raw.metadata) ? raw.metadata : undefined,
    createdAt: raw.createdAt
  }
}

function parseTeamActivityList(raw: unknown): TeamActivityEntry[] | null {
  const candidate = unwrapCandidate(raw, ['entries', 'activity', 'items'])
  if (!Array.isArray(candidate)) {
    return null
  }
  const entries: TeamActivityEntry[] = []
  for (const item of candidate) {
    const parsed = parseTeamActivityEntry(item)
    if (parsed) {
      entries.push(parsed)
    }
  }
  return entries
}

function parseTeamUserProfile(raw: unknown): TeamUserProfile | null {
  const candidate = unwrapCandidate(raw, ['user', 'profile'])
  if (!isRecord(candidate)) {
    return null
  }
  if (
    typeof candidate.userId !== 'string' ||
    typeof candidate.email !== 'string' ||
    typeof candidate.displayName !== 'string'
  ) {
    return null
  }
  return {
    userId: candidate.userId,
    email: candidate.email,
    displayName: candidate.displayName,
    avatarUrl: typeof candidate.avatarUrl === 'string' ? candidate.avatarUrl : undefined,
    authMethod: candidate.authMethod === 'magic-link' ? 'magic-link' : 'local',
    authenticatedAt:
      typeof candidate.authenticatedAt === 'number' ? candidate.authenticatedAt : Date.now()
  }
}

function parseRequestCodeResult(
  raw: unknown
): { sent: boolean; expiresAt: number; devCode?: string; error?: string } | null {
  if (!isRecord(raw)) {
    return null
  }
  if (typeof raw.sent !== 'boolean' || typeof raw.expiresAt !== 'number') {
    return null
  }
  return {
    sent: raw.sent,
    expiresAt: raw.expiresAt,
    devCode: typeof raw.devCode === 'string' ? raw.devCode : undefined,
    error: typeof raw.error === 'string' ? raw.error : undefined
  }
}

function isExecutionStatus(value: unknown): value is AgentExecutionStatus {
  return (
    value === 'queued' ||
    value === 'running' ||
    value === 'waiting_for_input' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
  )
}

function isApprovalStatus(value: unknown): value is AgentApprovalStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected'
}

function parseExecutionLog(raw: unknown): AgentExecutionLog | null {
  if (!isRecord(raw)) {
    return null
  }
  if (
    typeof raw.timestamp !== 'number' ||
    (raw.level !== 'info' && raw.level !== 'warn' && raw.level !== 'error') ||
    typeof raw.message !== 'string'
  ) {
    return null
  }
  return {
    timestamp: raw.timestamp,
    level: raw.level,
    message: raw.message
  }
}

function parseStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined
  }
  const items: string[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      items.push(item)
    }
  }
  return items
}

function parseAgentExecutionRecord(raw: unknown): AgentExecutionRecord | null {
  const candidate = unwrapCandidate(raw, ['execution'])
  if (!isRecord(candidate)) {
    return null
  }
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.taskId !== 'string' ||
    typeof candidate.projectId !== 'string' ||
    typeof candidate.agentId !== 'string' ||
    typeof candidate.agentType !== 'string' ||
    typeof candidate.model !== 'string' ||
    !isExecutionStatus(candidate.status) ||
    typeof candidate.prompt !== 'string' ||
    typeof candidate.idempotencyKey !== 'string' ||
    typeof candidate.createdAt !== 'number' ||
    typeof candidate.updatedAt !== 'number'
  ) {
    return null
  }

  const logs: AgentExecutionLog[] = []
  if (Array.isArray(candidate.logs)) {
    for (const item of candidate.logs) {
      const parsedLog = parseExecutionLog(item)
      if (parsedLog) {
        logs.push(parsedLog)
      }
    }
  }

  return {
    id: candidate.id,
    taskId: candidate.taskId,
    projectId: candidate.projectId,
    agentId: candidate.agentId,
    agentType: candidate.agentType,
    model: candidate.model,
    status: candidate.status,
    prompt: candidate.prompt,
    branchOrWorktree:
      typeof candidate.branchOrWorktree === 'string' ? candidate.branchOrWorktree : undefined,
    worktreePath: typeof candidate.worktreePath === 'string' ? candidate.worktreePath : undefined,
    baseBranch: typeof candidate.baseBranch === 'string' ? candidate.baseBranch : undefined,
    approvalStatus: isApprovalStatus(candidate.approvalStatus)
      ? candidate.approvalStatus
      : undefined,
    changedFiles: parseStringArray(candidate.changedFiles),
    logs,
    outputSummary: typeof candidate.outputSummary === 'string' ? candidate.outputSummary : undefined,
    idempotencyKey: candidate.idempotencyKey,
    startedAt: typeof candidate.startedAt === 'number' ? candidate.startedAt : undefined,
    completedAt: typeof candidate.completedAt === 'number' ? candidate.completedAt : undefined,
    error: typeof candidate.error === 'string' ? candidate.error : undefined,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt
  }
}

function parseConfiguredAgent(raw: unknown): ConfiguredTeamAgent | null {
  if (!isRecord(raw)) {
    return null
  }
  if (
    typeof raw.id !== 'string' ||
    typeof raw.name !== 'string' ||
    typeof raw.role !== 'string' ||
    typeof raw.command !== 'string' ||
    typeof raw.color !== 'string' ||
    typeof raw.configured !== 'boolean' ||
    typeof raw.configSource !== 'string'
  ) {
    return null
  }
  return {
    id: raw.id,
    name: raw.name,
    role: raw.role,
    command: raw.command,
    color: raw.color,
    configured: raw.configured,
    configSource: raw.configSource,
    models: parseStringArray(raw.models) ?? [],
    defaultModel: typeof raw.defaultModel === 'string' ? raw.defaultModel : undefined,
    defaultSkills: parseStringArray(raw.defaultSkills) ?? []
  }
}

function parseConfiguredAgentsList(raw: unknown): ConfiguredTeamAgent[] | null {
  const candidate = unwrapCandidate(raw, ['agents'])
  if (!Array.isArray(candidate)) {
    return null
  }
  const list: ConfiguredTeamAgent[] = []
  for (const item of candidate) {
    const parsed = parseConfiguredAgent(item)
    if (parsed) {
      list.push(parsed)
    }
  }
  return list
}

class RelayHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'RelayHttpError'
  }
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (isRecord(body)) {
      if (typeof body.error === 'string' && body.error.trim()) {
        return body.error
      }
      if (typeof body.message === 'string' && body.message.trim()) {
        return body.message
      }
    }
  } catch {
    // Response body is not JSON.
  }
  return `Error del servidor Relay (${response.status} ${response.statusText})`
}

async function relayFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body?: unknown
  },
  parse: (raw: unknown) => T | null
): Promise<T> {
  const config = readWebPortalConnectionConfig()
  const baseUrl = normalizeHttpRelayUrl(config.relayUrl)
  if (!baseUrl) {
    throw new Error('URL del servidor Relay no configurada. Conecta un Relay para continuar.')
  }

  const headers: Record<string, string> = {}
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (config.roomSecret.trim()) {
    headers['Authorization'] = `Bearer ${config.roomSecret.trim()}`
  }

  const response = await globalThis.fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  })

  if (!response.ok) {
    throw new RelayHttpError(await extractErrorMessage(response), response.status)
  }

  const payload: unknown = await response.json()
  const parsed = parse(payload)
  if (parsed === null) {
    throw new Error(`Respuesta inválida del servidor Relay en ${path}`)
  }
  return parsed
}

async function relayFetchVoid(
  path: string,
  options: {
    method: 'POST' | 'DELETE'
    body?: unknown
  }
): Promise<void> {
  const config = readWebPortalConnectionConfig()
  const baseUrl = normalizeHttpRelayUrl(config.relayUrl)
  if (!baseUrl) {
    throw new Error('URL del servidor Relay no configurada. Conecta un Relay para continuar.')
  }

  const headers: Record<string, string> = {}
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  if (config.roomSecret.trim()) {
    headers['Authorization'] = `Bearer ${config.roomSecret.trim()}`
  }

  const response = await globalThis.fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  })

  if (!response.ok) {
    throw new RelayHttpError(await extractErrorMessage(response), response.status)
  }
}

function buildSyncRuntimeStatusFromConfig(): TeamSyncRuntimeStatus {
  const config = readWebPortalConnectionConfig()
  const wsUrl = normalizeWsRelayUrl(config.relayUrl)
  const isRemote = Boolean(wsUrl)
  return {
    settings: {
      mode: isRemote ? 'remote' : 'local',
      relayUrl: wsUrl,
      hostPort: 4789,
      roomSecret: config.roomSecret.trim() || undefined,
      autoConnect: isRemote
    },
    hostingActive: false,
    hostingUrl: null,
    connectedPeers: 0,
    activeRooms: 0
  }
}

function defaultMailConfigPublic(): TeamMailConfigPublic {
  return {
    provider: 'smtp',
    fromEmail: '',
    fromName: 'Orca Teams',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    hasSecret: false,
    sendmailAvailable: false
  }
}

function isUnsupportedExecutionStatus(error: unknown): boolean {
  return error instanceof RelayHttpError && (error.status === 404 || error.status === 405 || error.status === 501)
}

export function createWebRelayTeamApi(): TeamApi {
  return {
    listConfiguredAgents: async (): Promise<ConfiguredTeamAgent[]> => {
      const config = readWebPortalConnectionConfig()
      if (!normalizeHttpRelayUrl(config.relayUrl)) {
        return []
      }
      try {
        return await relayFetch('/api/agents', { method: 'GET' }, parseConfiguredAgentsList)
      } catch {
        // Configured local CLI agents are host-only unless the relay exposes them.
        return []
      }
    },

    startExecution: async (_request: TeamStartExecutionRequest): Promise<AgentExecutionRecord> => {
      throw new Error(
        'La ejecución local de agentes CLI solo está disponible desde la app de escritorio Orca Teams.'
      )
    },

    cancelExecution: async (executionId: string): Promise<AgentExecutionRecord | null> => {
      try {
        return await relayFetch(
          `/api/executions/${encodeURIComponent(executionId)}/cancel`,
          { method: 'POST', body: {} },
          parseAgentExecutionRecord
        )
      } catch (err) {
        if (isUnsupportedExecutionStatus(err)) {
          throw new Error(
            'Cancelar ejecuciones remotas no está habilitado en este Relay; cancélala desde el host de escritorio.'
          )
        }
        throw err
      }
    },

    approveExecution: async (
      request: TeamApproveExecutionRequest
    ): Promise<AgentExecutionRecord | null> => {
      try {
        return await relayFetch(
          `/api/executions/${encodeURIComponent(request.executionId)}/approve`,
          { method: 'POST', body: request },
          parseAgentExecutionRecord
        )
      } catch (err) {
        if (isUnsupportedExecutionStatus(err)) {
          throw new Error(
            'La aprobación remota de ejecuciones no está habilitada en este Relay; apruébala desde el host de escritorio.'
          )
        }
        throw err
      }
    },

    rejectExecution: async (
      request: TeamRejectExecutionRequest
    ): Promise<AgentExecutionRecord | null> => {
      try {
        return await relayFetch(
          `/api/executions/${encodeURIComponent(request.executionId)}/reject`,
          { method: 'POST', body: request },
          parseAgentExecutionRecord
        )
      } catch (err) {
        if (isUnsupportedExecutionStatus(err)) {
          throw new Error(
            'El rechazo remoto de ejecuciones no está habilitado en este Relay; recházala desde el host de escritorio.'
          )
        }
        throw err
      }
    },

    getExecution: async (executionId: string): Promise<AgentExecutionRecord | null> => {
      const config = readWebPortalConnectionConfig()
      if (!normalizeHttpRelayUrl(config.relayUrl)) {
        return null
      }
      try {
        return await relayFetch(
          `/api/executions/${encodeURIComponent(executionId)}`,
          { method: 'GET' },
          parseAgentExecutionRecord
        )
      } catch (err) {
        if (isUnsupportedExecutionStatus(err)) {
          return null
        }
        throw err
      }
    },

    getLatestExecutionForCard: async (cardId: string): Promise<AgentExecutionRecord | null> => {
      const config = readWebPortalConnectionConfig()
      if (!normalizeHttpRelayUrl(config.relayUrl)) {
        return null
      }
      try {
        return await relayFetch(
          `/api/executions/by-card/${encodeURIComponent(cardId)}`,
          { method: 'GET' },
          parseAgentExecutionRecord
        )
      } catch (err) {
        if (isUnsupportedExecutionStatus(err)) {
          return null
        }
        throw err
      }
    },

    onExecutionEvent: (): (() => void) => () => {},

    getWorkspaceSnapshot: async (): Promise<TeamWorkspaceSnapshot> => {
      const config = readWebPortalConnectionConfig()
      if (!normalizeHttpRelayUrl(config.relayUrl)) {
        return {
          teams: [],
          projects: [],
          membersByTeam: {},
          invitationsByTeam: {}
        }
      }
      return relayFetch('/api/workspace/snapshot', { method: 'GET' }, parseWorkspaceSnapshot)
    },

    createTeam: async (input): Promise<Team> => {
      const user = readStoredWebPortalUserProfile() ?? defaultWebGuestProfile()
      return relayFetch(
        '/api/teams',
        {
          method: 'POST',
          body: {
            ...input,
            ownerId: input.ownerId ?? user.userId
          }
        },
        parseTeam
      )
    },

    createProject: async (input): Promise<Project> => {
      const user = readStoredWebPortalUserProfile() ?? defaultWebGuestProfile()
      return relayFetch(
        '/api/projects',
        {
          method: 'POST',
          body: {
            ...input,
            actorUserId: input.actorUserId ?? user.userId
          }
        },
        parseProject
      )
    },

    sendInvitation: async (
      request: TeamSendInvitationRequest
    ): Promise<TeamSendInvitationResult> =>
      relayFetch('/api/invitations', { method: 'POST', body: request }, parseSendInvitationResult),

    resendInvitation: async (
      invitationId: string,
      inviterName?: string
    ): Promise<TeamSendInvitationResult> =>
      relayFetch(
        `/api/invitations/${encodeURIComponent(invitationId)}/resend`,
        { method: 'POST', body: { inviterName } },
        parseSendInvitationResult
      ),

    acceptInvitation: async (
      token: string,
      userId: string,
      displayName?: string,
      email?: string
    ): Promise<TeamMemberWithProfile> =>
      relayFetch(
        '/api/invitations/accept',
        {
          method: 'POST',
          body: { token, userId, displayName, email }
        },
        parseTeamMemberWithProfile
      ),

    revokeInvitation: async (invitationId: string, actorUserId: string): Promise<void> =>
      relayFetchVoid(`/api/invitations/${encodeURIComponent(invitationId)}/revoke`, {
        method: 'POST',
        body: { actorUserId }
      }),

    getMailConfig: async (): Promise<TeamMailConfigPublic> => {
      const config = readWebPortalConnectionConfig()
      if (!normalizeHttpRelayUrl(config.relayUrl)) {
        return defaultMailConfigPublic()
      }
      try {
        return await relayFetch('/api/mail/config', { method: 'GET' }, parseTeamMailConfigPublic)
      } catch {
        return defaultMailConfigPublic()
      }
    },

    saveMailConfig: async (_input: TeamMailConfigInput): Promise<TeamMailConfigPublic> => {
      throw new Error(
        'La configuración del servidor de correo solo se administra desde la app de escritorio host.'
      )
    },

    testMailConfig: async (_toEmail: string): Promise<{ ok: boolean; error?: string }> => ({
      ok: false,
      error: 'La prueba de correo solo está disponible desde la app de escritorio host.'
    }),

    listActivity: async (options: {
      teamId: string
      projectId?: string
      limit?: number
    }): Promise<TeamActivityEntry[]> => {
      const config = readWebPortalConnectionConfig()
      if (!normalizeHttpRelayUrl(config.relayUrl)) {
        return []
      }
      const query = new URLSearchParams({ teamId: options.teamId })
      if (options.projectId) {
        query.set('projectId', options.projectId)
      }
      if (typeof options.limit === 'number') {
        query.set('limit', String(options.limit))
      }
      return relayFetch(`/api/activity?${query.toString()}`, { method: 'GET' }, parseTeamActivityList)
    },

    recordActivity: async (
      entry: Omit<TeamActivityEntry, 'id' | 'createdAt'>
    ): Promise<TeamActivityEntry> =>
      relayFetch(
        '/api/activity',
        { method: 'POST', body: entry },
        (raw) => parseTeamActivityEntry(unwrapCandidate(raw, ['entry']))
      ),

    getCurrentUser: async (): Promise<TeamUserProfile> =>
      readStoredWebPortalUserProfile() ?? defaultWebGuestProfile(),

    updateUserProfile: async (input: {
      displayName: string
      email: string
    }): Promise<TeamUserProfile> => {
      const current = readStoredWebPortalUserProfile() ?? defaultWebGuestProfile()
      const displayName = input.displayName.trim() || current.displayName
      const email = input.email.trim().toLowerCase() || current.email
      const emailPrefix = email.split('@')[0] || displayName
      const userId =
        current.userId === 'web-guest'
          ? `usr-${slugifyIdentifier(emailPrefix, 'web-member')}`
          : current.userId

      const updated: TeamUserProfile = {
        ...current,
        userId,
        displayName,
        email,
        authenticatedAt: Date.now()
      }
      saveStoredWebPortalUserProfile(updated)
      return updated
    },

    requestMagicLinkCode: async (
      email: string,
      displayName?: string
    ): Promise<{ sent: boolean; expiresAt: number; devCode?: string; error?: string }> =>
      relayFetch(
        '/api/auth/request-code',
        {
          method: 'POST',
          body: {
            email: email.trim().toLowerCase(),
            ...(displayName?.trim() ? { displayName: displayName.trim() } : {})
          }
        },
        parseRequestCodeResult
      ),

    verifyMagicLinkCode: async (
      email: string,
      code: string,
      displayName?: string
    ): Promise<TeamUserProfile> => {
      const profile = await relayFetch(
        '/api/auth/verify-code',
        {
          method: 'POST',
          body: {
            email: email.trim().toLowerCase(),
            code: code.trim(),
            ...(displayName?.trim() ? { displayName: displayName.trim() } : {})
          }
        },
        parseTeamUserProfile
      )
      saveStoredWebPortalUserProfile(profile)
      return profile
    },

    getSyncStatus: async (): Promise<TeamSyncRuntimeStatus> => buildSyncRuntimeStatusFromConfig(),

    configureSync: async (
      settings: Partial<TeamSyncSettings>
    ): Promise<TeamSyncRuntimeStatus> => {
      const current = readWebPortalConnectionConfig()
      if (settings.mode === 'local') {
        saveWebPortalConnectionConfig({ relayUrl: '', roomSecret: '' })
      } else {
        saveWebPortalConnectionConfig({
          relayUrl: settings.relayUrl !== undefined ? settings.relayUrl : current.relayUrl,
          roomSecret:
            'roomSecret' in settings ? (settings.roomSecret ?? '') : current.roomSecret
        })
      }
      return buildSyncRuntimeStatusFromConfig()
    }
  }
}

let cachedWebRelayTeamApi: TeamApi | null = null

export function getWebRelayTeamApi(): TeamApi {
  if (!cachedWebRelayTeamApi) {
    cachedWebRelayTeamApi = createWebRelayTeamApi()
  }
  return cachedWebRelayTeamApi
}

function isNativeElectronTeamApi(candidate: unknown): candidate is TeamApi {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'getWorkspaceSnapshot' in candidate &&
    typeof candidate.getWorkspaceSnapshot === 'function'
  )
}

export function isElectronTeamPreloadAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return isNativeElectronTeamApi(window.api?.team)
}

export function getTeamsTeamApi(): TeamApi | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  const nativeTeamApi = window.api?.team
  if (isNativeElectronTeamApi(nativeTeamApi)) {
    return nativeTeamApi
  }
  return getWebRelayTeamApi()
}
