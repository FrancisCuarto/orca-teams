import React from 'react'
import { DragOverlay } from '@dnd-kit/core'
import { Sparkles } from 'lucide-react'
import type {
  TeamKanbanAssignee,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamKanbanCardItem } from './TeamKanbanCardItem'

type Props = {
  activeCard: TeamKanbanCard | null
  activeAssignee: TeamKanbanAssignee | null
}

export function TeamKanbanDragOverlay({ activeCard, activeAssignee }: Props): React.JSX.Element {
  return (
    <DragOverlay>
      {activeCard ? (
        <TeamKanbanCardItem card={activeCard} onEdit={() => {}} isOverlay />
      ) : activeAssignee ? (
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-card border-2 border-ring shadow-floating scale-105 pointer-events-none">
          <div className="size-7 rounded-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold shadow-xs">
            {activeAssignee.type === 'agent' ? (
              <Sparkles className="size-3.5" />
            ) : (
              activeAssignee.name[0]
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground">{activeAssignee.name}</span>
            <span className="text-3xs text-muted-foreground">
              {activeAssignee.type === 'agent' ? 'Asignar y Ejecutar Agente' : 'Asignar Miembro'}
            </span>
          </div>
        </div>
      ) : null}
    </DragOverlay>
  )
}
