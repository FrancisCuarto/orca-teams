import type {
  ExternalTeamIssue,
  TeamKanbanCard
} from './team-kanban-types'

export type BuildKanbanCardsOptions = {
  existingCards: Record<string, TeamKanbanCard> | readonly TeamKanbanCard[]
  targetColumnId: string
  now?: number
}

function toCardList(
  existingCards: Record<string, TeamKanbanCard> | readonly TeamKanbanCard[]
): readonly TeamKanbanCard[] {
  return Array.isArray(existingCards) ? existingCards : Object.values(existingCards)
}

function externalIdentityKeys(issue: {
  provider: ExternalTeamIssue['provider']
  id: string
  key: string
}): [string, string] {
  return [`${issue.provider}:id:${issue.id}`, `${issue.provider}:key:${issue.key}`]
}

export function collectExistingExternalIssueKeys(
  existingCards: Record<string, TeamKanbanCard> | readonly TeamKanbanCard[]
): Set<string> {
  const keys = new Set<string>()
  for (const card of toCardList(existingCards)) {
    if (card.externalIssueRef) {
      const [byId, byKey] = externalIdentityKeys(card.externalIssueRef)
      keys.add(byId)
      keys.add(byKey)
    }
  }
  return keys
}

export function isDuplicateExternalIssue(
  issue: Pick<ExternalTeamIssue, 'provider' | 'id' | 'key'>,
  existingCards: Record<string, TeamKanbanCard> | readonly TeamKanbanCard[]
): boolean {
  const seen = collectExistingExternalIssueKeys(existingCards)
  const [byId, byKey] = externalIdentityKeys(issue)
  return seen.has(byId) || seen.has(byKey)
}

function sanitizeCardIdSegment(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'issue'
}

export function buildKanbanCardsFromExternalIssues(
  issues: readonly ExternalTeamIssue[],
  options: BuildKanbanCardsOptions
): TeamKanbanCard[] {
  const cardsList = toCardList(options.existingCards)
  const seenExternal = collectExistingExternalIssueKeys(cardsList)
  const existingCardIds = new Set(cardsList.map((card) => card.id))
  const baseTime = options.now ?? Date.now()
  const created: TeamKanbanCard[] = []

  for (const [index, issue] of issues.entries()) {
    const [byId, byKey] = externalIdentityKeys(issue)
    if (seenExternal.has(byId) || seenExternal.has(byKey)) {
      continue
    }
    seenExternal.add(byId)
    seenExternal.add(byKey)

    const idBase = `card-${issue.provider}-${sanitizeCardIdSegment(issue.id)}-${baseTime + index}`
    let cardId = idBase
    let collisionCounter = 1
    while (existingCardIds.has(cardId)) {
      cardId = `${idBase}-${collisionCounter}`
      collisionCounter += 1
    }
    existingCardIds.add(cardId)

    const labels = Array.from(
      new Set(issue.labels.map((label) => label.trim()).filter(Boolean))
    )
    const timestamp = baseTime + index

    created.push({
      id: cardId,
      title: issue.title.trim() || issue.key,
      description: issue.description.trim(),
      columnId: options.targetColumnId,
      priority: issue.priority,
      labels,
      checklist: [],
      externalIssueRef: {
        provider: issue.provider,
        id: issue.id,
        key: issue.key,
        url: issue.url
      },
      createdAt: timestamp,
      updatedAt: timestamp
    })
  }

  return created
}
