import type { TeamTab } from './team-kanban-types'
import type { TeamActivityActorType, TeamActivityEntry } from './team-workspace-types'

export type TeamInboxItemKind = 'assignment' | 'mention' | 'invitation' | 'approval'

export const TEAM_INBOX_ITEM_KINDS: readonly TeamInboxItemKind[] = [
  'assignment',
  'mention',
  'invitation',
  'approval'
]

export function isTeamInboxItemKind(value: unknown): value is TeamInboxItemKind {
  return (
    value === 'assignment' ||
    value === 'mention' ||
    value === 'invitation' ||
    value === 'approval'
  )
}

export type TeamInboxTargetUser = {
  userId: string
  displayName: string
  email?: string
}

export type TeamInboxItem = {
  id: string
  activityId: string
  kind: TeamInboxItemKind
  title: string
  summary: string
  actorId: string
  actorName: string
  actorType: TeamActivityActorType
  targetTab: TeamTab
  targetType: TeamActivityEntry['targetType']
  targetId?: string
  projectId?: string
  createdAt: number
  read: boolean
}

export type TeamInboxReadState = {
  readIds: string[]
  markedAllReadAt?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (!metadata) {
    return undefined
  }
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readStringArrayField(
  metadata: Record<string, unknown> | undefined,
  key: string
): string[] {
  if (!metadata) {
    return []
  }
  const value = metadata[key]
  if (!Array.isArray(value)) {
    return []
  }
  const result: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      result.push(item.trim())
    }
  }
  return result
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsHandleMention(text: string, candidate: string): boolean {
  const trimmed = candidate.trim()
  if (trimmed.length < 2) {
    return false
  }
  const pattern = new RegExp(`(?:^|[\\s(])@${escapeRegex(trimmed)}(?=$|[\\s.,:;!?)])`, 'i')
  return pattern.test(text)
}

function buildMentionCandidates(user: TeamInboxTargetUser): string[] {
  const candidates = new Set<string>()
  if (user.userId.trim()) {
    candidates.add(user.userId.trim())
  }
  if (user.displayName.trim()) {
    candidates.add(user.displayName.trim())
    const firstToken = user.displayName.trim().split(/[\s(]+/)[0]
    if (firstToken && firstToken.length >= 2) {
      candidates.add(firstToken)
    }
  }
  if (user.email?.trim()) {
    const localPart = user.email.trim().split('@')[0]
    if (localPart && localPart.length >= 2) {
      candidates.add(localPart)
    }
  }
  return Array.from(candidates)
}

function matchesUserIdentifier(value: string | undefined, user: TeamInboxTargetUser): boolean {
  if (!value) {
    return false
  }
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return false
  }
  if (normalized === user.userId.trim().toLowerCase()) {
    return true
  }
  if (user.email && normalized === user.email.trim().toLowerCase()) {
    return true
  }
  if (user.displayName && normalized === user.displayName.trim().toLowerCase()) {
    return true
  }
  return false
}

function resolveTargetTab(
  entry: TeamActivityEntry,
  kind: TeamInboxItemKind
): TeamTab {
  if (kind === 'approval' || kind === 'assignment') {
    return 'kanban'
  }
  if (kind === 'invitation') {
    return 'activity'
  }
  if (entry.targetType === 'note') {
    return 'notes'
  }
  if (entry.targetType === 'card' || entry.targetType === 'execution') {
    return 'kanban'
  }
  return 'activity'
}

export function classifyActivityForInbox(
  entry: TeamActivityEntry,
  user: TeamInboxTargetUser
): Omit<TeamInboxItem, 'read'> | null {
  const metadata = isRecord(entry.metadata) ? entry.metadata : undefined
  const targetUserId = readStringField(metadata, 'targetUserId')
  const actionLower = entry.action.toLowerCase()
  const isSelfHumanActor = entry.actorType === 'human' && entry.actorId === user.userId

  if (entry.action === 'execution.waiting_for_input') {
    const assigneeId = readStringField(metadata, 'assigneeId')
    const explicitRecipient = targetUserId ?? assigneeId
    if (explicitRecipient && !matchesUserIdentifier(explicitRecipient, user)) {
      return null
    }
    return {
      id: entry.id,
      activityId: entry.id,
      kind: 'approval',
      title: 'Aprobación requerida',
      summary: entry.summary,
      actorId: entry.actorId,
      actorName: entry.actorName,
      actorType: entry.actorType,
      targetTab: resolveTargetTab(entry, 'approval'),
      targetType: entry.targetType,
      targetId: entry.targetId,
      projectId: entry.projectId,
      createdAt: entry.createdAt
    }
  }

  if (
    entry.targetType === 'invitation' ||
    actionLower === 'invitation.sent' ||
    actionLower === 'invitation.received'
  ) {
    if (isSelfHumanActor && !targetUserId) {
      return null
    }
    const inviteeEmail =
      readStringField(metadata, 'inviteeEmail') ?? readStringField(metadata, 'email')
    const emailLower = user.email?.trim().toLowerCase()
    const emailMatchesSummary =
      Boolean(emailLower) && entry.summary.toLowerCase().includes(emailLower ?? '')
    const matchesTarget =
      matchesUserIdentifier(targetUserId, user) ||
      matchesUserIdentifier(inviteeEmail, user) ||
      emailMatchesSummary

    if (!matchesTarget) {
      return null
    }

    return {
      id: entry.id,
      activityId: entry.id,
      kind: 'invitation',
      title: 'Invitación de equipo',
      summary: entry.summary,
      actorId: entry.actorId,
      actorName: entry.actorName,
      actorType: entry.actorType,
      targetTab: resolveTargetTab(entry, 'invitation'),
      targetType: entry.targetType,
      targetId: entry.targetId,
      projectId: entry.projectId,
      createdAt: entry.createdAt
    }
  }

  if (actionLower.includes('assign')) {
    if (isSelfHumanActor) {
      return null
    }
    const assigneeId = readStringField(metadata, 'assigneeId')
    const assigneeName = readStringField(metadata, 'assigneeName')
    const assigneeEmail = readStringField(metadata, 'assigneeEmail')
    const hasExplicitMetadataTarget = Boolean(
      targetUserId || assigneeId || assigneeName || assigneeEmail
    )
    const displayNameLower = user.displayName.trim().toLowerCase()
    const summaryMatchesName =
      !hasExplicitMetadataTarget &&
      displayNameLower.length >= 2 &&
      entry.summary.toLowerCase().includes(displayNameLower)

    const matchesTarget =
      matchesUserIdentifier(targetUserId, user) ||
      matchesUserIdentifier(assigneeId, user) ||
      matchesUserIdentifier(assigneeName, user) ||
      matchesUserIdentifier(assigneeEmail, user) ||
      summaryMatchesName

    if (!matchesTarget) {
      return null
    }

    return {
      id: entry.id,
      activityId: entry.id,
      kind: 'assignment',
      title: 'Tarea asignada',
      summary: entry.summary,
      actorId: entry.actorId,
      actorName: entry.actorName,
      actorType: entry.actorType,
      targetTab: resolveTargetTab(entry, 'assignment'),
      targetType: entry.targetType,
      targetId: entry.targetId,
      projectId: entry.projectId,
      createdAt: entry.createdAt
    }
  }

  if (!isSelfHumanActor) {
    const mentionedIds = readStringArrayField(metadata, 'mentionedUserIds')
    const mentionsList = readStringArrayField(metadata, 'mentions')
    const mentionCandidates = buildMentionCandidates(user)

    const matchedInMetadata =
      (actionLower.includes('mention') && matchesUserIdentifier(targetUserId, user)) ||
      mentionedIds.some((id) => matchesUserIdentifier(id, user)) ||
      mentionsList.some((m) => matchesUserIdentifier(m, user))

    const matchedInSummary = mentionCandidates.some((candidate) =>
      containsHandleMention(entry.summary, candidate)
    )

    if (matchedInMetadata || matchedInSummary) {
      return {
        id: entry.id,
        activityId: entry.id,
        kind: 'mention',
        title: 'Te mencionaron',
        summary: entry.summary,
        actorId: entry.actorId,
        actorName: entry.actorName,
        actorType: entry.actorType,
        targetTab: resolveTargetTab(entry, 'mention'),
        targetType: entry.targetType,
        targetId: entry.targetId,
        projectId: entry.projectId,
        createdAt: entry.createdAt
      }
    }
  }

  return null
}

export function buildTeamInboxItems(
  entries: readonly TeamActivityEntry[],
  user: TeamInboxTargetUser,
  readState: TeamInboxReadState
): TeamInboxItem[] {
  const readSet = new Set(readState.readIds)
  const items: TeamInboxItem[] = []
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt)

  for (const entry of sorted) {
    const classified = classifyActivityForInbox(entry, user)
    if (!classified) {
      continue
    }
    const isMarkedByTimestamp =
      readState.markedAllReadAt !== undefined && classified.createdAt <= readState.markedAllReadAt
    items.push({
      ...classified,
      read: readSet.has(classified.id) || isMarkedByTimestamp
    })
  }

  return items
}

export function parseTeamInboxReadState(raw: unknown): TeamInboxReadState {
  if (!isRecord(raw)) {
    return { readIds: [] }
  }
  const readIds: string[] = []
  if (Array.isArray(raw.readIds)) {
    for (const id of raw.readIds) {
      if (typeof id === 'string' && id) {
        readIds.push(id)
      }
    }
  }
  const markedAllReadAt =
    typeof raw.markedAllReadAt === 'number' && Number.isFinite(raw.markedAllReadAt)
      ? raw.markedAllReadAt
      : undefined

  return markedAllReadAt !== undefined ? { readIds, markedAllReadAt } : { readIds }
}
