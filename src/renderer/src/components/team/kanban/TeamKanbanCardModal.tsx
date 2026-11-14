import React from 'react'
import type {
  ExtendedTeamMember,
  TeamKanbanCard,
  TeamKanbanColumn
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { TeamKanbanCardForm } from './TeamKanbanCardForm'

type Props = {
  isOpen: boolean
  card: TeamKanbanCard | null
  columns: TeamKanbanColumn[]
  defaultColumnId?: string
  availableMembers?: ExtendedTeamMember[]
  onClose: () => void
  onSave: (card: TeamKanbanCard) => void
  onDelete?: (cardId: string) => void
  onDispatchAgent?: (card: TeamKanbanCard) => void
}

export function TeamKanbanCardModal({
  isOpen,
  card,
  columns,
  defaultColumnId,
  availableMembers,
  onClose,
  onSave,
  onDelete,
  onDispatchAgent
}: Props): React.JSX.Element {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{card ? 'Editar Tarea' : 'Nueva Tarea de Equipo'}</DialogTitle>
          <DialogDescription>
            Define los requerimientos, asigna un miembro humano o un agente de IA, y gestiona los
            criterios de aceptación.
          </DialogDescription>
        </DialogHeader>

        {isOpen ? (
          <TeamKanbanCardForm
            key={`${card?.id ?? 'new'}-${defaultColumnId ?? ''}`}
            card={card}
            columns={columns}
            defaultColumnId={defaultColumnId}
            availableMembers={availableMembers}
            onClose={onClose}
            onSave={onSave}
            onDelete={onDelete}
            onDispatchAgent={onDispatchAgent}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
