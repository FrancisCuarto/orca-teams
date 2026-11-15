import { useCallback } from 'react'
import { toast } from 'sonner'
import type {
  ExtendedTeamMember,
  TeamKanbanBoard
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  deleteKanbanCard,
  moveKanbanCardToColumn,
  toggleKanbanCardChecklistItem
} from './team-kanban-board-mutations'

export function useKanbanBoardSecondaryActions(
  board: TeamKanbanBoard,
  onChange: (updatedBoard: TeamKanbanBoard) => void
) {
  const handleDeleteCard = useCallback(
    (cardId: string) => {
      onChange(deleteKanbanCard(board, cardId))
      toast.success('Tarea eliminada')
    },
    [board, onChange]
  )

  const handleDeleteColumn = useCallback(
    (colId: string) => {
      const target = board.columns.find((c) => c.id === colId)
      if (board.columns.length <= 1 || !target || target.cardIds.length > 0) {
        return
      }
      onChange({
        ...board,
        columns: board.columns.filter((c) => c.id !== colId),
        updatedAt: Date.now()
      })
      toast.success(`Columna "${target.title}" eliminada`)
    },
    [board, onChange]
  )

  const handleToggleChecklistItem = useCallback(
    (cardId: string, itemId: string) => {
      const next = toggleKanbanCardChecklistItem(board, cardId, itemId)
      if (next) {
        onChange(next)
      }
    },
    [board, onChange]
  )

  const handleQuickMoveColumn = useCallback(
    (cardId: string, targetColId: string) => {
      const next = moveKanbanCardToColumn(board, cardId, targetColId)
      if (next) {
        onChange(next)
        toast.success('Tarjeta movida')
      }
    },
    [board, onChange]
  )

  const handleUpdateColumnWipLimit = useCallback(
    (columnId: string, wipLimit?: number) => {
      onChange({
        ...board,
        columns: board.columns.map((c) => (c.id === columnId ? { ...c, wipLimit } : c)),
        updatedAt: Date.now()
      })
    },
    [board, onChange]
  )

  const handleAddCustomMember = useCallback(
    (member: ExtendedTeamMember) => {
      onChange({
        ...board,
        customMembers: [...(board.customMembers ?? []), member],
        updatedAt: Date.now()
      })
    },
    [board, onChange]
  )

  const handleSaveSprintGoal = useCallback(
    (goal?: string) => {
      onChange({ ...board, sprintGoal: goal, updatedAt: Date.now() })
      toast.success('Objetivo del sprint actualizado')
    },
    [board, onChange]
  )

  return {
    handleDeleteCard,
    handleDeleteColumn,
    handleToggleChecklistItem,
    handleQuickMoveColumn,
    handleUpdateColumnWipLimit,
    handleAddCustomMember,
    handleSaveSprintGoal
  }
}
