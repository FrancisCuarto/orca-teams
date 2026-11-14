import React, { useMemo, useState } from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { AlertCircle, Gauge, Plus, Trash2 } from 'lucide-react'
import type {
  TeamKanbanCard,
  TeamKanbanColumn
} from '../../../../../shared/teamwork/team-kanban-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { TeamKanbanCardItem } from './TeamKanbanCardItem'

type Props = {
  column: TeamKanbanColumn
  cards: TeamKanbanCard[]
  columns?: TeamKanbanColumn[]
  canDelete?: boolean
  onAddCard: (columnId: string) => void
  onDeleteColumn?: (columnId: string) => void
  onEditCard: (card: TeamKanbanCard) => void
  onDispatchAgent?: (card: TeamKanbanCard) => void
  onToggleChecklistItem?: (cardId: string, itemId: string) => void
  onQuickMoveColumn?: (cardId: string, targetColId: string) => void
  onUpdateColumnWipLimit?: (columnId: string, wipLimit?: number) => void
}

export function TeamKanbanColumnView({
  column,
  cards,
  columns,
  canDelete = false,
  onAddCard,
  onDeleteColumn,
  onEditCard,
  onDispatchAgent,
  onToggleChecklistItem,
  onQuickMoveColumn,
  onUpdateColumnWipLimit
}: Props): React.JSX.Element {
  const [isEditingWip, setIsEditingWip] = useState(false)
  const [wipInput, setWipInput] = useState(
    column.wipLimit !== undefined ? String(column.wipLimit) : ''
  )

  const { setNodeRef, isOver } = useDroppable({
    id: column.id
  })

  const cardIds = useMemo(() => cards.map((c) => c.id), [cards])
  const totalPts = useMemo(
    () => cards.reduce((sum, c) => sum + (c.estimatePoints ?? 0), 0),
    [cards]
  )

  const hasWipLimit = column.wipLimit !== undefined && column.wipLimit > 0
  const isOverWip = hasWipLimit && cards.length > (column.wipLimit ?? 0)

  const handleSaveWip = (): void => {
    const parsed = Number.parseInt(wipInput.trim(), 10)
    if (!Number.isNaN(parsed) && parsed > 0) {
      onUpdateColumnWipLimit?.(column.id, parsed)
    } else {
      onUpdateColumnWipLimit?.(column.id, undefined)
    }
    setIsEditingWip(false)
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-[290px] shrink-0 rounded-xl transition-colors max-h-full overflow-hidden border ${
        isOverWip
          ? 'border-destructive/60 bg-destructive/5'
          : isOver
            ? 'border-ring bg-secondary/50'
            : 'border-border bg-secondary/30'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-secondary/20">
        <div className="flex items-center gap-1.5 min-w-0">
          {column.color ? (
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ backgroundColor: column.color }}
            />
          ) : null}
          <h3 className="text-xs font-semibold text-foreground tracking-wide truncate max-w-[110px]">
            {column.title}
          </h3>

          {/* WIP / Card Count Indicator */}
          {hasWipLimit ? (
            <button
              type="button"
              onClick={() => setIsEditingWip((prev) => !prev)}
              className="inline-flex items-center cursor-pointer"
              title={`Límite WIP: ${cards.length}/${column.wipLimit}. Clic para editar`}
            >
              <Badge
                variant={isOverWip ? 'destructive' : 'outline'}
                className={`text-3xs font-mono h-4 px-1.5 gap-0.5 ${
                  isOverWip
                    ? 'bg-destructive/15 text-destructive border-destructive/30'
                    : 'text-muted-foreground'
                }`}
              >
                {isOverWip ? <AlertCircle className="size-2.5" /> : null}
                {cards.length}/{column.wipLimit}
              </Badge>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingWip((prev) => !prev)}
              className="text-2xs font-medium text-muted-foreground bg-muted/60 hover:bg-muted px-1.5 py-0.2 rounded-full cursor-pointer transition-colors"
              title="Cantidad de tareas. Clic para configurar límite WIP"
            >
              {cards.length}
            </button>
          )}

          {/* Column Story Points */}
          {totalPts > 0 ? (
            <span
              className="text-3xs font-mono text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded"
              title={`Total: ${totalPts} story points`}
            >
              {totalPts} pts
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => setIsEditingWip((prev) => !prev)}
            title="Configurar límite WIP"
          >
            <Gauge className="size-3 text-muted-foreground" />
          </Button>

          {canDelete && cards.length === 0 && onDeleteColumn ? (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => onDeleteColumn(column.id)}
              title="Eliminar columna vacía"
            >
              <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
            </Button>
          ) : null}

          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => onAddCard(column.id)}
            title="Añadir tarjeta a esta columna"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Inline WIP Limit Editor */}
      {isEditingWip ? (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-secondary/40 text-xs">
          <span className="text-3xs text-muted-foreground shrink-0">Límite WIP:</span>
          <Input
            type="number"
            min={0}
            max={99}
            value={wipInput}
            onChange={(e) => setWipInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
                handleSaveWip()
              } else if (e.key === 'Escape') {
                setIsEditingWip(false)
              }
            }}
            placeholder="Sin límite"
            className="h-6 w-20 text-xs font-mono"
            autoFocus
          />
          <Button size="xs" onClick={handleSaveWip} className="h-6 px-2 text-3xs">
            OK
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setWipInput('')
              onUpdateColumnWipLimit?.(column.id, undefined)
              setIsEditingWip(false)
            }}
            className="h-6 px-1.5 text-3xs text-muted-foreground"
            title="Quitar límite WIP"
          >
            Quitar
          </Button>
        </div>
      ) : null}

      {/* Cards Scrollable Container */}
      <div className="flex flex-col gap-2 p-2 overflow-y-auto scrollbar-sleek min-h-[150px] flex-1">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <TeamKanbanCardItem
              key={card.id}
              card={card}
              columns={columns}
              onEdit={onEditCard}
              onDispatchAgent={onDispatchAgent}
              onToggleChecklistItem={onToggleChecklistItem}
              onQuickMoveColumn={onQuickMoveColumn}
            />
          ))}
        </SortableContext>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground/60">
            <p className="text-xs">Sin tareas</p>
            <Button
              variant="link"
              size="xs"
              onClick={() => onAddCard(column.id)}
              className="mt-1 text-xs"
            >
              + Crear primera
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
