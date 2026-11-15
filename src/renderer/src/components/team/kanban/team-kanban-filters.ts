import type {
  ExtendedTeamMember,
  TeamKanbanBoard,
  TeamKanbanCard,
  TeamKanbanPriority,
  TeamNote,
  TeamNotesCollection
} from '../../../../../shared/teamwork/team-kanban-types'

export type KanbanCardPriority = TeamKanbanPriority
export type TeamKanbanStatusFilter = 'all' | 'blocked' | 'agents'

export type TeamKanbanFilterState = {
  query: string
  assigneeId: string | 'all' | 'unassigned'
  priority: KanbanCardPriority | 'all'
  label: string | 'all'
  onlyMyPending: boolean
}

export const DEFAULT_TEAM_KANBAN_FILTER_STATE: TeamKanbanFilterState = {
  query: '',
  assigneeId: 'all',
  priority: 'all',
  label: 'all',
  onlyMyPending: false
}

export type FilterKanbanCardsContext = {
  currentUserId: string
  currentUserName?: string
  pendingApprovalCardIds?: ReadonlySet<string> | readonly string[]
  members?: readonly ExtendedTeamMember[]
  statusFilter?: TeamKanbanStatusFilter
}

export type TeamKanbanAssigneeOption = {
  value: string
  label: string
  kind: 'human' | 'agent'
}

export type TeamWorkspaceCardMatch = {
  kind: 'card'
  card: TeamKanbanCard
  columnTitle: string
  snippet: string
}

export type TeamWorkspaceNoteMatch = {
  kind: 'note'
  note: TeamNote
  snippet: string
}

export type TeamWorkspaceSearchResult = {
  cards: TeamWorkspaceCardMatch[]
  notes: TeamWorkspaceNoteMatch[]
  totalCount: number
}

function isCardArray(
  value: readonly TeamKanbanCard[] | Record<string, TeamKanbanCard>
): value is readonly TeamKanbanCard[] {
  return Array.isArray(value)
}

function isStringArray(
  value: ReadonlySet<string> | readonly string[]
): value is readonly string[] {
  return Array.isArray(value)
}

function isTeamNoteArray(
  value: TeamNotesCollection | readonly TeamNote[]
): value is readonly TeamNote[] {
  return Array.isArray(value)
}

function toCardList(
  cards: readonly TeamKanbanCard[] | Record<string, TeamKanbanCard>
): readonly TeamKanbanCard[] {
  return isCardArray(cards) ? cards : Object.values(cards)
}

function hasPendingApproval(
  cardId: string,
  pendingApprovalCardIds?: ReadonlySet<string> | readonly string[]
): boolean {
  if (!pendingApprovalCardIds) {
    return false
  }
  return isStringArray(pendingApprovalCardIds)
    ? pendingApprovalCardIds.includes(cardId)
    : pendingApprovalCardIds.has(cardId)
}

function resolveMemberCandidates(
  targetIdOrName: string,
  members?: readonly ExtendedTeamMember[],
  extraName?: string
): Set<string> {
  const candidates = new Set<string>()
  const seeds = [targetIdOrName, extraName]
    .map((s) => s?.trim().toLowerCase() ?? '')
    .filter(Boolean)
  for (const seed of seeds) {
    candidates.add(seed)
  }
  if (!members || seeds.length === 0) {
    return candidates
  }
  for (const member of members) {
    const memberKeys = [member.id, member.name, member.agentType]
      .map((s) => s?.trim().toLowerCase() ?? '')
      .filter(Boolean)
    if (memberKeys.some((key) => seeds.includes(key))) {
      for (const key of memberKeys) {
        candidates.add(key)
      }
    }
  }
  return candidates
}

function isCardAssignedToCandidates(
  card: TeamKanbanCard,
  candidates: ReadonlySet<string>
): boolean {
  if (!card.assignee?.name.trim() || candidates.size === 0) {
    return false
  }
  if (candidates.has(card.assignee.name.trim().toLowerCase())) {
    return true
  }
  const agentType = card.assignee.agentType?.trim().toLowerCase()
  return Boolean(agentType && candidates.has(agentType))
}

export function isCardMyPending(
  card: TeamKanbanCard,
  context: FilterKanbanCardsContext
): boolean {
  if (hasPendingApproval(card.id, context.pendingApprovalCardIds)) {
    return true
  }
  const userCandidates = resolveMemberCandidates(
    context.currentUserId,
    context.members,
    context.currentUserName
  )
  return isCardAssignedToCandidates(card, userCandidates)
}

export function countMyPendingCards(
  cards: readonly TeamKanbanCard[] | Record<string, TeamKanbanCard>,
  context: FilterKanbanCardsContext
): number {
  let count = 0
  for (const card of toCardList(cards)) {
    if (isCardMyPending(card, context)) {
      count += 1
    }
  }
  return count
}

function matchesCardQuery(card: TeamKanbanCard, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true
  }
  const fields = [
    card.title,
    card.description,
    card.branchOrWorktree ?? '',
    card.assignee?.name ?? '',
    card.blockedReason ?? '',
    ...card.labels
  ]
  return fields.some((field) => field.toLowerCase().includes(normalizedQuery))
}

export function filterKanbanCards(
  cards: readonly TeamKanbanCard[] | Record<string, TeamKanbanCard>,
  filters: TeamKanbanFilterState,
  context: FilterKanbanCardsContext
): TeamKanbanCard[] {
  const normalizedQuery = filters.query.trim().toLowerCase()
  const normalizedLabel = filters.label !== 'all' ? filters.label.trim().toLowerCase() : null
  const assigneeCandidates =
    filters.assigneeId !== 'all' && filters.assigneeId !== 'unassigned'
      ? resolveMemberCandidates(filters.assigneeId, context.members)
      : null
  const userCandidates = filters.onlyMyPending
    ? resolveMemberCandidates(context.currentUserId, context.members, context.currentUserName)
    : null
  const statusFilter = context.statusFilter ?? 'all'

  return toCardList(cards).filter((card) => {
    if (!matchesCardQuery(card, normalizedQuery)) {
      return false
    }
    if (filters.priority !== 'all' && card.priority !== filters.priority) {
      return false
    }
    if (
      normalizedLabel !== null &&
      !card.labels.some((lbl) => lbl.trim().toLowerCase() === normalizedLabel)
    ) {
      return false
    }
    if (filters.assigneeId === 'unassigned') {
      if (card.assignee?.name.trim()) {
        return false
      }
    } else if (
      assigneeCandidates !== null &&
      !isCardAssignedToCandidates(card, assigneeCandidates)
    ) {
      return false
    }
    if (filters.onlyMyPending) {
      const pendingApproval = hasPendingApproval(card.id, context.pendingApprovalCardIds)
      const assignedToMe =
        userCandidates !== null && isCardAssignedToCandidates(card, userCandidates)
      if (!pendingApproval && !assignedToMe) {
        return false
      }
    }
    if (statusFilter === 'blocked' && !card.blockedReason?.trim()) {
      return false
    }
    if (statusFilter === 'agents' && card.assignee?.type !== 'agent') {
      return false
    }
    return true
  })
}

export function hasActiveKanbanFilters(
  filters: TeamKanbanFilterState,
  statusFilter: TeamKanbanStatusFilter = 'all'
): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.assigneeId !== 'all' ||
    filters.priority !== 'all' ||
    filters.label !== 'all' ||
    filters.onlyMyPending ||
    statusFilter !== 'all'
  )
}

export function collectBoardLabels(
  cards: readonly TeamKanbanCard[] | Record<string, TeamKanbanCard>
): string[] {
  const unique = new Map<string, string>()
  for (const card of toCardList(cards)) {
    for (const rawLabel of card.labels) {
      const trimmed = rawLabel.trim()
      if (trimmed && !unique.has(trimmed.toLowerCase())) {
        unique.set(trimmed.toLowerCase(), trimmed)
      }
    }
  }
  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
}

export function collectBoardAssignees(
  cards: readonly TeamKanbanCard[] | Record<string, TeamKanbanCard>,
  members: readonly ExtendedTeamMember[]
): TeamKanbanAssigneeOption[] {
  const byName = new Map<string, TeamKanbanAssigneeOption>()
  for (const member of members) {
    const trimmedName = member.name.trim()
    if (trimmedName && !byName.has(trimmedName.toLowerCase())) {
      byName.set(trimmedName.toLowerCase(), {
        value: member.id,
        label: member.type === 'agent' ? `${trimmedName} (IA)` : trimmedName,
        kind: member.type
      })
    }
  }
  for (const card of toCardList(cards)) {
    const trimmedName = card.assignee?.name.trim()
    if (card.assignee && trimmedName && !byName.has(trimmedName.toLowerCase())) {
      byName.set(trimmedName.toLowerCase(), {
        value: trimmedName,
        label: card.assignee.type === 'agent' ? `${trimmedName} (IA)` : trimmedName,
        kind: card.assignee.type
      })
    }
  }
  return Array.from(byName.values())
}

function buildTextSnippet(text: string, normalizedQuery: string, maxLength = 96): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (!collapsed || collapsed.length <= maxLength) {
    return collapsed
  }
  const matchIdx = collapsed.toLowerCase().indexOf(normalizedQuery)
  if (matchIdx <= 24) {
    return `${collapsed.slice(0, maxLength - 1)}…`
  }
  const start = Math.max(0, matchIdx - 24)
  const end = Math.min(collapsed.length, start + maxLength - 2)
  return `${start > 0 ? '…' : ''}${collapsed.slice(start, end)}${end < collapsed.length ? '…' : ''}`
}

function getOrderedBoardCards(board: TeamKanbanBoard): TeamKanbanCard[] {
  const ordered: TeamKanbanCard[] = []
  const seen = new Set<string>()
  for (const col of board.columns) {
    for (const cardId of col.cardIds) {
      const card = board.cards[cardId]
      if (card && !seen.has(card.id)) {
        ordered.push(card)
        seen.add(card.id)
      }
    }
  }
  for (const card of Object.values(board.cards)) {
    if (!seen.has(card.id)) {
      ordered.push(card)
    }
  }
  return ordered
}

export function searchTeamWorkspace(
  board: TeamKanbanBoard | null | undefined,
  notes: TeamNotesCollection | readonly TeamNote[] | null | undefined,
  query: string
): TeamWorkspaceSearchResult {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return { cards: [], notes: [], totalCount: 0 }
  }

  const titleCardMatches: TeamWorkspaceCardMatch[] = []
  const secondaryCardMatches: TeamWorkspaceCardMatch[] = []
  if (board) {
    const columnTitles = new Map(board.columns.map((col) => [col.id, col.title]))
    for (const card of getOrderedBoardCards(board)) {
      const titleHit = card.title.toLowerCase().includes(normalizedQuery)
      const checklistHit = card.checklist.some((item) =>
        item.text.toLowerCase().includes(normalizedQuery)
      )
      if (!titleHit && !checklistHit && !matchesCardQuery(card, normalizedQuery)) {
        continue
      }
      const snippetSource =
        card.description.trim() ||
        card.labels.join(', ') ||
        card.branchOrWorktree ||
        card.assignee?.name ||
        ''
      const match: TeamWorkspaceCardMatch = {
        kind: 'card',
        card,
        columnTitle: columnTitles.get(card.columnId) ?? 'Tablero',
        snippet: buildTextSnippet(snippetSource, normalizedQuery)
      }
      if (titleHit) {
        titleCardMatches.push(match)
      } else {
        secondaryCardMatches.push(match)
      }
    }
  }

  const noteList = !notes ? [] : isTeamNoteArray(notes) ? notes : notes.notes
  const titleNoteMatches: TeamWorkspaceNoteMatch[] = []
  const secondaryNoteMatches: TeamWorkspaceNoteMatch[] = []
  for (const note of noteList) {
    const titleHit = note.title.toLowerCase().includes(normalizedQuery)
    const secondaryHit =
      note.content.toLowerCase().includes(normalizedQuery) ||
      note.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery)) ||
      note.category.toLowerCase().includes(normalizedQuery) ||
      (note.author?.toLowerCase().includes(normalizedQuery) ?? false)
    if (!titleHit && !secondaryHit) {
      continue
    }
    const match: TeamWorkspaceNoteMatch = {
      kind: 'note',
      note,
      snippet: buildTextSnippet(note.content || note.tags.join(', '), normalizedQuery)
    }
    if (titleHit) {
      titleNoteMatches.push(match)
    } else {
      secondaryNoteMatches.push(match)
    }
  }

  const cards = [...titleCardMatches, ...secondaryCardMatches]
  const matchedNotes = [...titleNoteMatches, ...secondaryNoteMatches]
  return { cards, notes: matchedNotes, totalCount: cards.length + matchedNotes.length }
}
