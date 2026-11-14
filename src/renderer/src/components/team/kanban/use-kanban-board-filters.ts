import { useCallback, useMemo, useState } from 'react'
import type {
  TeamKanbanCard,
  TeamKanbanColumn
} from '../../../../../shared/teamwork/team-kanban-types'
import { filterKanbanCards } from './team-kanban-execution-helpers'

export function useKanbanBoardFilters(
  columns: readonly TeamKanbanColumn[],
  cardMap: Record<string, TeamKanbanCard>
) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPriority, setSelectedPriority] = useState<string>('all')
  const [selectedFilterMember, setSelectedFilterMember] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'blocked' | 'agents'>('all')

  const filteredCards = useMemo(
    () =>
      filterKanbanCards(cardMap, searchQuery, selectedPriority, selectedFilterMember, statusFilter),
    [cardMap, searchQuery, selectedPriority, selectedFilterMember, statusFilter]
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

  const handleClearFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedPriority('all')
    setSelectedFilterMember(null)
    setStatusFilter('all')
  }, [])

  return {
    searchQuery,
    setSearchQuery,
    selectedPriority,
    setSelectedPriority,
    selectedFilterMember,
    setSelectedFilterMember,
    statusFilter,
    setStatusFilter,
    filteredCards,
    filteredPoints,
    columnCardsMap,
    handleClearFilters
  }
}
