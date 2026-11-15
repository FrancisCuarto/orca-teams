import { useCallback, useMemo, useState } from 'react'
import type {
  ExtendedTeamMember,
  TeamKanbanCard,
  TeamKanbanColumn
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  collectBoardAssignees,
  collectBoardLabels,
  countMyPendingCards,
  DEFAULT_TEAM_KANBAN_FILTER_STATE,
  filterKanbanCards,
  type TeamKanbanFilterState,
  type TeamKanbanStatusFilter
} from './team-kanban-filters'

export type UseKanbanBoardFiltersOptions = {
  columns: readonly TeamKanbanColumn[]
  cardMap: Record<string, TeamKanbanCard>
  currentUserId: string
  currentUserName?: string
  pendingApprovalCardIds: ReadonlySet<string>
  members: readonly ExtendedTeamMember[]
}

export function useKanbanBoardFilters({
  columns,
  cardMap,
  currentUserId,
  currentUserName,
  pendingApprovalCardIds,
  members
}: UseKanbanBoardFiltersOptions) {
  const [filters, setFilters] = useState<TeamKanbanFilterState>(DEFAULT_TEAM_KANBAN_FILTER_STATE)
  const [statusFilter, setStatusFilter] = useState<TeamKanbanStatusFilter>('all')

  const filterContext = useMemo(
    () => ({
      currentUserId,
      currentUserName,
      pendingApprovalCardIds,
      members,
      statusFilter
    }),
    [currentUserId, currentUserName, pendingApprovalCardIds, members, statusFilter]
  )

  const filteredCards = useMemo(
    () => filterKanbanCards(cardMap, filters, filterContext),
    [cardMap, filters, filterContext]
  )

  const myPendingCount = useMemo(
    () => countMyPendingCards(cardMap, filterContext),
    [cardMap, filterContext]
  )

  const availableLabels = useMemo(() => collectBoardLabels(cardMap), [cardMap])

  const assigneeOptions = useMemo(
    () => collectBoardAssignees(cardMap, members),
    [cardMap, members]
  )

  const filteredCardIds = useMemo(() => new Set(filteredCards.map((c) => c.id)), [filteredCards])
  const filteredPoints = useMemo(
    () => filteredCards.reduce((acc, c) => acc + (c.estimatePoints ?? 0), 0),
    [filteredCards]
  )

  const columnCardsMap = useMemo(() => {
    const map = new Map<string, TeamKanbanCard[]>()
    for (const column of columns) {
      const cards = column.cardIds
        .filter((id) => filteredCardIds.has(id))
        .flatMap((id) => (cardMap[id] ? [cardMap[id]] : []))
      map.set(column.id, cards)
    }
    return map
  }, [columns, filteredCardIds, cardMap])

  const selectedFilterMember = useMemo(() => {
    if (filters.assigneeId === 'all' || filters.assigneeId === 'unassigned') {
      return null
    }
    const targetNorm = filters.assigneeId.trim().toLowerCase()
    const matched = members.find(
      (m) =>
        m.id.toLowerCase() === targetNorm ||
        m.name.toLowerCase() === targetNorm ||
        m.agentType?.toLowerCase() === targetNorm
    )
    return matched ? matched.name : filters.assigneeId
  }, [filters.assigneeId, members])

  const setSelectedFilterMember = useCallback(
    (memberName: string | null) => {
      if (!memberName) {
        setFilters((prev) => ({ ...prev, assigneeId: 'all' }))
        return
      }
      const targetNorm = memberName.trim().toLowerCase()
      const matched = members.find((m) => m.name.toLowerCase() === targetNorm)
      setFilters((prev) => ({ ...prev, assigneeId: matched ? matched.id : memberName }))
    },
    [members]
  )

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_TEAM_KANBAN_FILTER_STATE)
    setStatusFilter('all')
  }, [])

  return {
    filters,
    setFilters,
    statusFilter,
    setStatusFilter,
    selectedFilterMember,
    setSelectedFilterMember,
    myPendingCount,
    availableLabels,
    assigneeOptions,
    filteredCards,
    filteredPoints,
    columnCardsMap,
    handleClearFilters
  }
}
