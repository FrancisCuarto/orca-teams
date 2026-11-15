import React, { useState } from 'react'
import { Plus } from 'lucide-react'
import type {
  TeamKanbanCard,
  TeamKanbanColumn
} from '../../../../../shared/teamwork/team-kanban-types'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'
import type { AgentExecutionStatus } from '../../../../../shared/teamwork/team-workspace-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { TeamKanbanColumnView } from './TeamKanbanColumnView'

type Props = {
  columns: TeamKanbanColumn[]
  columnCardsMap: Map<string, TeamKanbanCard[]>
  cardStatuses: Record<string, AgentExecutionStatus>
  peersByCardId?: Map<string, CollaboratorPresence[]>
  onAddCard: (columnId: string) => void
  onDeleteColumn: (columnId: string) => void
  onEditCard: (card: TeamKanbanCard) => void
  onDispatchAgent: (card: TeamKanbanCard) => void
  onViewExecution: (card: TeamKanbanCard) => void
  onToggleChecklistItem: (cardId: string, itemId: string) => void
  onQuickMoveColumn: (cardId: string, targetColId: string) => void
  onUpdateColumnWipLimit: (columnId: string, wipLimit?: number) => void
  onAddColumn: (title: string) => void
}

export function TeamKanbanColumnsViewport({
  columns,
  columnCardsMap,
  cardStatuses,
  peersByCardId,
  onAddCard,
  onDeleteColumn,
  onEditCard,
  onDispatchAgent,
  onViewExecution,
  onToggleChecklistItem,
  onQuickMoveColumn,
  onUpdateColumnWipLimit,
  onAddColumn
}: Props): React.JSX.Element {
  const [isAddingColumn, setIsAddingColumn] = useState(false)
  const [newColumnTitle, setNewColumnTitle] = useState('')

  const handleConfirmAddColumn = (): void => {
    if (!newColumnTitle.trim()) {
      return
    }
    onAddColumn(newColumnTitle.trim())
    setNewColumnTitle('')
    setIsAddingColumn(false)
  }

  return (
    <div className="flex flex-1 min-h-0 p-4 gap-3 overflow-x-auto overflow-y-hidden scrollbar-sleek">
      {columns.map((column) => (
        <TeamKanbanColumnView
          key={column.id}
          column={column}
          columns={columns}
          cards={columnCardsMap.get(column.id) ?? []}
          canDelete={columns.length > 1 && column.cardIds.length === 0}
          cardExecutions={cardStatuses}
          peersByCardId={peersByCardId}
          onAddCard={onAddCard}
          onDeleteColumn={onDeleteColumn}
          onEditCard={onEditCard}
          onDispatchAgent={onDispatchAgent}
          onViewExecution={onViewExecution}
          onToggleChecklistItem={onToggleChecklistItem}
          onQuickMoveColumn={onQuickMoveColumn}
          onUpdateColumnWipLimit={onUpdateColumnWipLimit}
        />
      ))}

      <div className="w-[240px] shrink-0">
        {isAddingColumn ? (
          <div className="flex flex-col gap-2 p-3 rounded-xl border border-border bg-secondary/30">
            <Input
              value={newColumnTitle}
              onChange={(e) => setNewColumnTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
                  handleConfirmAddColumn()
                } else if (e.key === 'Escape') {
                  setIsAddingColumn(false)
                }
              }}
              placeholder="Nombre de columna..."
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              <Button size="xs" onClick={handleConfirmAddColumn} className="flex-1">
                Añadir
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setIsAddingColumn(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddingColumn(true)}
            className="w-full"
          >
            <Plus /> Añadir Columna
          </Button>
        )}
      </div>
    </div>
  )
}
