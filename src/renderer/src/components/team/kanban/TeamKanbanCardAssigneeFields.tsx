import React from 'react'
import { Bot, User } from 'lucide-react'
import type {
  ExtendedTeamMember,
  TeamMemberEntry
} from '../../../../../shared/teamwork/team-members'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Props = {
  assigneeType: 'human' | 'agent'
  assigneeName: string
  agents: readonly TeamMemberEntry[]
  humans: readonly ExtendedTeamMember[]
  isSavedAgentMissing?: boolean
  onAssigneeTypeChange: (nextType: 'human' | 'agent') => void
  onAgentSelect: (agentName: string) => void
  onHumanNameChange: (name: string) => void
}

export function TeamKanbanCardAssigneeFields({
  assigneeType,
  assigneeName,
  agents,
  humans,
  isSavedAgentMissing = false,
  onAssigneeTypeChange,
  onAgentSelect,
  onHumanNameChange
}: Props): React.JSX.Element {
  const selectedAgentValue = agents.some((a) => a.name === assigneeName) ? assigneeName : ''

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-foreground">Tipo de asignado</label>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={assigneeType === 'human' ? 'default' : 'outline'}
            onClick={() => onAssigneeTypeChange('human')}
            className="flex-1"
          >
            <User className="size-3.5" /> Humano
          </Button>
          <Button
            type="button"
            size="sm"
            variant={assigneeType === 'agent' ? 'default' : 'outline'}
            onClick={() => onAssigneeTypeChange('agent')}
            className="flex-1"
          >
            <Bot className="size-3.5" /> Agente IA
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-foreground">
          {assigneeType === 'human' ? 'Miembro asignado' : 'Agente IA'}
        </label>
        {assigneeType === 'agent' ? (
          <div className="flex flex-col gap-1">
            <select
              aria-label="Agente IA"
              value={selectedAgentValue}
              onChange={(e) => onAgentSelect(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">
                {agents.length === 0
                  ? 'No hay agentes CLI configurados...'
                  : 'Seleccionar agente...'}
              </option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.name}>
                  {agent.name} ({agent.role})
                </option>
              ))}
            </select>
            {isSavedAgentMissing && assigneeName ? (
              <span className="text-3xs text-annotation-highlight">
                El agente guardado ({assigneeName}) no está configurado en este equipo.
              </span>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={humans.some((h) => h.name === assigneeName) ? assigneeName : ''}
              onChange={(e) => {
                if (e.target.value) {
                  onHumanNameChange(e.target.value)
                }
              }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-1/2"
            >
              <option value="">Elegir del equipo...</option>
              {humans.map((human) => (
                <option key={human.id} value={human.name}>
                  {human.name}
                </option>
              ))}
            </select>
            <Input
              value={assigneeName}
              onChange={(e) => onHumanNameChange(e.target.value)}
              placeholder="O nombre..."
              className="h-8 text-xs flex-1"
            />
          </div>
        )}
      </div>
    </div>
  )
}
