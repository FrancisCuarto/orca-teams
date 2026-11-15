import type { TeamMemberEntry } from '../../../../../shared/teamwork/team-members'
import type {
  TeamKanbanBoard,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import type {
  AgentExecutionLog,
  AgentExecutionRecord
} from '../../../../../shared/teamwork/team-workspace-types'

export function shouldMoveToInProgress(board: TeamKanbanBoard, columnId: string): boolean {
  const hasInProgress = board.columns.some((c) => c.id === 'col-in-progress')
  return hasInProgress && (columnId === 'col-backlog' || columnId === 'col-todo')
}

export function shouldTriggerExecutionOnSave(
  prevCard: TeamKanbanCard | undefined,
  savedCard: TeamKanbanCard,
  executionsByCard: Map<string, AgentExecutionRecord>
): boolean {
  if (savedCard.assignee?.type !== 'agent') {
    return false
  }
  if (!prevCard || prevCard.assignee?.type !== 'agent') {
    return true
  }
  if (
    prevCard.assignee.name !== savedCard.assignee.name ||
    prevCard.assignee.agentType !== savedCard.assignee.agentType ||
    prevCard.assignee.model !== savedCard.assignee.model
  ) {
    return true
  }
  return !executionsByCard.has(savedCard.id)
}

export function resolveCardForConfiguredAgent(
  card: TeamKanbanCard,
  configuredAgents: readonly TeamMemberEntry[]
): TeamKanbanCard {
  if (!card.assignee || card.assignee.type !== 'agent') {
    return card
  }
  const matched = configuredAgents.find(
    (a) =>
      a.name === card.assignee?.name ||
      a.id === card.assignee?.agentType ||
      a.agentType === card.assignee?.agentType
  )
  if (!matched) {
    return card
  }
  return {
    ...card,
    assignee: {
      ...card.assignee,
      agentType: matched.agentType ?? matched.id,
      model: card.assignee.model ?? matched.defaultModel
    }
  }
}

export type KeyedExecutionLog = {
  key: string
  log: AgentExecutionLog
}

export function buildKeyedExecutionLogs(logs: readonly AgentExecutionLog[]): KeyedExecutionLog[] {
  const seen = new Map<string, number>()
  return logs.map((log) => {
    const base = `${log.timestamp}-${log.level}-${log.message.slice(0, 40)}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return { key: `${base}#${count}`, log }
  })
}

export function filterKanbanCards(
  cardMap: Record<string, TeamKanbanCard>,
  searchQuery: string,
  selectedPriority: string,
  selectedFilterMember: string | null,
  statusFilter: 'all' | 'blocked' | 'agents'
): TeamKanbanCard[] {
  const q = searchQuery.toLowerCase()
  return Object.values(cardMap).filter((card) => {
    const matchQ =
      q === '' ||
      card.title.toLowerCase().includes(q) ||
      card.description?.toLowerCase().includes(q) ||
      card.labels?.some((l) => l.toLowerCase().includes(q))
    const matchP = selectedPriority === 'all' || card.priority === selectedPriority
    const matchM = !selectedFilterMember || card.assignee?.name === selectedFilterMember
    const matchS =
      statusFilter === 'all' ||
      (statusFilter === 'blocked' && Boolean(card.blockedReason?.trim())) ||
      (statusFilter === 'agents' && card.assignee?.type === 'agent')
    return matchQ && matchP && matchM && matchS
  })
}
