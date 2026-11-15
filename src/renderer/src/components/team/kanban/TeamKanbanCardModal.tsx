import React from 'react'
import type {
  ExtendedTeamMember,
  TeamKanbanCard,
  TeamKanbanColumn
} from '../../../../../shared/teamwork/team-kanban-types'
import type { TeamMemberEntry } from '../../../../../shared/teamwork/team-members'
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
  configuredAgents?: TeamMemberEntry[]
  humanMembers?: ExtendedTeamMember[]
  availableMembers?: ExtendedTeamMember[]
  readOnly?: boolean
  canDispatchAgents?: boolean
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
  configuredAgents,
  humanMembers,
  availableMembers,
  readOnly = false,
  canDispatchAgents = true,
  onClose,
  onSave,
  onDelete,
  onDispatchAgent
}: Props): React.JSX.Element {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {card ? (readOnly ? 'Detalle de Tarea (Solo lectura)' : 'Editar Tarea') : 'Nueva Tarea de Equipo'}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'Vista de solo lectura de los requerimientos, asignación y criterios de aceptación.'
              : 'Define los requerimientos, asigna un miembro humano o un agente de IA configurado, y gestiona los criterios de aceptación.'}
          </DialogDescription>
        </DialogHeader>

        {isOpen ? (
          <TeamKanbanCardForm
            key={`${card?.id ?? 'new'}-${defaultColumnId ?? ''}`}
            card={card}
            columns={columns}
            defaultColumnId={defaultColumnId}
            configuredAgents={configuredAgents}
            humanMembers={humanMembers}
            availableMembers={availableMembers}
            readOnly={readOnly}
            canDispatchAgents={canDispatchAgents}
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
