export type TeamKanbanPriority = 'low' | 'medium' | 'high' | 'urgent'

export type TeamKanbanAssignee = {
  type: 'human' | 'agent'
  name: string
  avatar?: string
  agentType?: string
  model?: string
  skills?: string[]
}

export type ExtendedTeamMember = TeamKanbanAssignee & {
  id: string
  role: string
  status?: 'online' | 'busy' | 'away'
  color?: string
  defaultModel?: string
  defaultSkills?: string[]
}

export type TeamKanbanChecklistItem = {
  id: string
  text: string
  done: boolean
}

export type TeamCommentMentionType = 'human' | 'agent'

export type TeamCommentMention = {
  token: string
  label: string
  type: TeamCommentMentionType
  targetId?: string
}

export type TeamCardComment = {
  id: string
  cardId: string
  projectId: string
  authorId: string
  authorName: string
  authorType: 'human' | 'agent'
  body: string
  mentions: TeamCommentMention[]
  createdAt: number
  updatedAt?: number
}

export type TeamKanbanCard = {
  id: string
  title: string
  description: string
  columnId: string
  priority: TeamKanbanPriority
  assignee?: TeamKanbanAssignee
  labels: string[]
  checklist: TeamKanbanChecklistItem[]
  comments?: TeamCardComment[]
  branchOrWorktree?: string
  isolateWorktree?: boolean
  requiresApproval?: boolean
  estimatePoints?: number
  blockedReason?: string
  dueDate?: string
  createdAt: number
  updatedAt: number
}

export type TeamKanbanColumn = {
  id: string
  title: string
  color?: string
  wipLimit?: number
  cardIds: string[]
}

export type TeamKanbanBoard = {
  id: string
  projectId?: string
  title: string
  description?: string
  sprintGoal?: string
  columns: TeamKanbanColumn[]
  cards: Record<string, TeamKanbanCard>
  customMembers?: ExtendedTeamMember[]
  createdAt: number
  updatedAt: number
}

export type WhiteboardItemType = 'sticky' | 'mermaid' | 'text' | 'spec' | 'shape' | 'draw' | 'arrow'

export type WhiteboardColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'orange'

export type WhiteboardShapeKind = 'rect' | 'ellipse' | 'diamond'

export type WhiteboardFillStyle = 'tinted' | 'solid' | 'outline'

export type WhiteboardFontSize = 'sm' | 'md' | 'lg'

export type WhiteboardPoint = {
  x: number
  y: number
}

export type TeamWhiteboardItem = {
  id: string
  type: WhiteboardItemType
  x: number
  y: number
  width: number
  height: number
  content: string
  color?: WhiteboardColor
  title?: string
  shapeKind?: WhiteboardShapeKind
  strokeColor?: string
  strokeWidth?: number
  fillStyle?: WhiteboardFillStyle
  /**
   * Coordinates relative to the item's (x, y) bounding-box origin.
   * For 'draw', represents the freehand polyline points.
   * For 'arrow', represents [startPoint, endPoint] relative to (x, y).
   */
  points?: WhiteboardPoint[]
  fromId?: string
  toId?: string
  endX?: number
  endY?: number
  zIndex?: number
  fontSize?: WhiteboardFontSize
}

export type TeamWhiteboard = {
  id: string
  projectId: string
  title: string
  items: TeamWhiteboardItem[]
  viewport: { x: number; y: number; zoom: number }
  createdAt: number
  updatedAt: number
}

export type TeamNoteCategory = 'adr' | 'spec' | 'meeting' | 'general'

export type TeamNoteStatus = 'draft' | 'proposed' | 'accepted' | 'deprecated'

export type TeamNote = {
  id: string
  title: string
  content: string
  category: TeamNoteCategory
  status?: TeamNoteStatus
  author?: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export type TeamNotesCollection = {
  projectId: string
  notes: TeamNote[]
  updatedAt: number
}

export type TeamTab = 'kanban' | 'whiteboard' | 'notes' | 'activity'

export function isTeamKanbanPriority(value: string): value is TeamKanbanPriority {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'urgent'
}

export function isTeamNoteCategory(value: string): value is TeamNoteCategory {
  return value === 'adr' || value === 'spec' || value === 'meeting' || value === 'general'
}

export function isTeamNoteStatus(value: string): value is TeamNoteStatus {
  return value === 'draft' || value === 'proposed' || value === 'accepted' || value === 'deprecated'
}

const KNOWN_AGENT_MENTION_HANDLES = new Set([
  'claude',
  'openclaude',
  'claude-agent-teams',
  'codex',
  'opencode',
  'opencode2',
  'antigravity',
  'agy',
  'gemini',
  'aider',
  'goose'
])

export function toMentionHandle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type ExtractMentionsOptions = {
  members?: readonly {
    id: string
    name: string
    type?: 'human' | 'agent'
    agentType?: string
  }[]
  agents?: readonly {
    id: string
    name: string
    agentType?: string
  }[]
}

export function extractMentionsFromComment(
  body: string,
  options?: ExtractMentionsOptions
): TeamCommentMention[] {
  const mentions: TeamCommentMention[] = []
  const seen = new Set<string>()
  const pattern = /(?:^|[\s(\[,])@([a-zA-Z0-9][a-zA-Z0-9._-]*)/g

  for (const match of body.matchAll(pattern)) {
    const rawToken = match[1]?.replace(/[.,;:!?]+$/, '') ?? ''
    if (!rawToken) {
      continue
    }
    const normalized = rawToken.toLowerCase()
    if (seen.has(normalized)) {
      continue
    }
    seen.add(normalized)

    const matchedAgent = options?.agents?.find(
      (agent) =>
        agent.id.toLowerCase() === normalized ||
        agent.agentType?.toLowerCase() === normalized ||
        toMentionHandle(agent.name) === normalized ||
        agent.name.toLowerCase() === normalized
    )
    if (matchedAgent) {
      mentions.push({
        token: rawToken,
        label: matchedAgent.name,
        type: 'agent',
        targetId: matchedAgent.id
      })
      continue
    }

    const matchedMember = options?.members?.find((member) => {
      const firstWord = member.name.trim().toLowerCase().split(/\s+/)[0]
      return (
        member.id.toLowerCase() === normalized ||
        toMentionHandle(member.name) === normalized ||
        member.name.toLowerCase() === normalized ||
        firstWord === normalized
      )
    })
    if (matchedMember) {
      const isAgentMember =
        matchedMember.type === 'agent' || KNOWN_AGENT_MENTION_HANDLES.has(normalized)
      mentions.push({
        token: rawToken,
        label: matchedMember.name,
        type: isAgentMember ? 'agent' : 'human',
        targetId: matchedMember.id
      })
      continue
    }

    if (KNOWN_AGENT_MENTION_HANDLES.has(normalized)) {
      mentions.push({
        token: rawToken,
        label: rawToken,
        type: 'agent'
      })
      continue
    }

    mentions.push({
      token: rawToken,
      label: rawToken,
      type: 'human'
    })
  }

  return mentions
}

export function isTeamCommentMention(value: unknown): value is TeamCommentMention {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const hasToken = 'token' in value && typeof value.token === 'string'
  const hasLabel = 'label' in value && typeof value.label === 'string'
  const hasType = 'type' in value && (value.type === 'human' || value.type === 'agent')
  const hasValidTarget =
    !('targetId' in value) || value.targetId === undefined || typeof value.targetId === 'string'
  return hasToken && hasLabel && hasType && hasValidTarget
}

export function isTeamCardComment(value: unknown): value is TeamCardComment {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'cardId' in value &&
    typeof value.cardId === 'string' &&
    'projectId' in value &&
    typeof value.projectId === 'string' &&
    'authorId' in value &&
    typeof value.authorId === 'string' &&
    'authorName' in value &&
    typeof value.authorName === 'string' &&
    'authorType' in value &&
    (value.authorType === 'human' || value.authorType === 'agent') &&
    'body' in value &&
    typeof value.body === 'string' &&
    'mentions' in value &&
    Array.isArray(value.mentions) &&
    value.mentions.every(isTeamCommentMention) &&
    'createdAt' in value &&
    typeof value.createdAt === 'number'
  )
}

