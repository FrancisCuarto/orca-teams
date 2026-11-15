import React from 'react'
import { Check, Trash2, Zap } from 'lucide-react'
import type { TeamKanbanCard } from '../../../../../shared/teamwork/team-kanban-types'
import { DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  card: TeamKanbanCard | null
  canSave: boolean
  onClose: () => void
  onSave: () => void
  onDelete?: (cardId: string) => void
  onDispatchAgent?: (card: TeamKanbanCard) => void
}

export function TeamKanbanCardFormFooter({
  card,
  canSave,
  onClose,
  onSave,
  onDelete,
  onDispatchAgent
}: Props): React.JSX.Element {
  return (
    <DialogFooter>
      <div className="flex w-full items-center justify-between gap-2 pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          {card && onDelete ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                onDelete(card.id)
                onClose()
              }}
            >
              <Trash2 className="size-3.5" /> Eliminar
            </Button>
          ) : null}
          {card && onDispatchAgent && card.assignee?.type === 'agent' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onDispatchAgent(card)
                onClose()
              }}
            >
              <Zap className="size-3.5 text-git-graph-lane-1" /> Ejecutar
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={!canSave}>
            <Check className="size-3.5" /> Guardar Tarea
          </Button>
        </div>
      </div>
    </DialogFooter>
  )
}
