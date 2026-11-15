import { useCallback, useState } from 'react'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core'
import type {
  TeamKanbanAssignee,
  TeamKanbanBoard
} from '../../../../../shared/teamwork/team-kanban-types'
import { isDraggableAssigneeData } from './team-kanban-agent-dispatch'
import {
  moveKanbanCardAcrossColumns,
  reorderKanbanCardInColumn
} from './team-kanban-board-mutations'

export function useKanbanDragHandlers(options: {
  board: TeamKanbanBoard
  disabled?: boolean
  onAssignDraggedMember: (cardId: string, dragged: TeamKanbanAssignee) => void
  onChange: (updatedBoard: TeamKanbanBoard) => void
}) {
  const { board, disabled = false, onAssignDraggedMember, onChange } = options
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [activeAssignee, setActiveAssignee] = useState<TeamKanbanAssignee | null>(null)

  const handleDragStart = useCallback(
    (event: DragStartEvent): void => {
      if (disabled) {
        return
      }
      const data = event.active.data.current
      if (isDraggableAssigneeData(data)) {
        setActiveAssignee(data.assignee)
        setActiveCardId(null)
      } else {
        setActiveCardId(String(event.active.id))
        setActiveAssignee(null)
      }
    },
    [disabled]
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent): void => {
      if (disabled || activeAssignee || !event.over) {
        return
      }
      const next = moveKanbanCardAcrossColumns(
        board,
        String(event.active.id),
        String(event.over.id)
      )
      if (next) {
        onChange(next)
      }
    },
    [activeAssignee, board, disabled, onChange]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const { active, over } = event
      const dragged = activeAssignee
      setActiveCardId(null)
      setActiveAssignee(null)
      if (disabled || !over) {
        return
      }
      const overId = String(over.id)
      if (dragged) {
        onAssignDraggedMember(overId, dragged)
        return
      }
      const reordered = reorderKanbanCardInColumn(board, String(active.id), overId)
      if (reordered) {
        onChange(reordered)
      }
    },
    [activeAssignee, board, disabled, onAssignDraggedMember, onChange]
  )

  return {
    activeCardId,
    activeAssignee,
    handleDragStart,
    handleDragOver,
    handleDragEnd
  }
}
