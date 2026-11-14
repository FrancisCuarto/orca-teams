import React from 'react'
import { Sparkles } from 'lucide-react'
import {
  RECOMMENDED_AGENT_SKILLS,
  type ExtendedTeamMember
} from '../../../../../shared/teamwork/team-members'
import { Button } from '@/components/ui/button'

type Props = {
  matchedAgent?: ExtendedTeamMember
  agentModel: string
  agentSkills: string[]
  availableModelList: readonly string[]
  onModelChange: (model: string) => void
  onToggleSkill: (skillId: string) => void
}

export function TeamKanbanCardAgentFields({
  matchedAgent,
  agentModel,
  agentSkills,
  availableModelList,
  onModelChange,
  onToggleSkill
}: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-border bg-secondary/15">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Sparkles className="size-3 text-git-graph-lane-5" /> Configuración del Agente IA
        </span>
        {matchedAgent?.defaultModel ? (
          <span className="text-3xs text-muted-foreground font-mono">
            Sugerido: {matchedAgent.defaultModel}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-3xs font-medium text-foreground">Modelo LLM</label>
          <select
            value={agentModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Por defecto / Automático</option>
            {availableModelList.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-3xs font-medium text-foreground">Skills y Reglas</label>
          <div className="flex flex-wrap gap-1">
            {RECOMMENDED_AGENT_SKILLS.map((skill) => (
              <Button
                key={skill.id}
                type="button"
                size="xs"
                variant={agentSkills.includes(skill.id) ? 'default' : 'outline'}
                onClick={() => onToggleSkill(skill.id)}
                title={skill.summary}
                className="text-3xs h-5 px-1.5"
              >
                {skill.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
