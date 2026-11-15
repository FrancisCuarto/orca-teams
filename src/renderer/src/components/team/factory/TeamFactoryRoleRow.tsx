import React from 'react'
import type { FactoryStageAgentConfig } from '../../../../../shared/teamwork/team-factory-types'
import { getMemberModels, type TeamMemberEntry } from '../../../../../shared/teamwork/team-members'

type Props = {
  label: string
  description: string
  value: FactoryStageAgentConfig
  agents: readonly TeamMemberEntry[]
  onChange: (next: FactoryStageAgentConfig) => void
}

export function TeamFactoryRoleRow({
  label,
  description,
  value,
  agents,
  onChange
}: Props): React.JSX.Element {
  const matched = agents.find(
    (a) => a.agentType === value.agentId || a.id === value.agentId || a.name === value.agentId
  )
  const models = getMemberModels(matched)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-2 p-2.5 rounded-lg border border-border bg-card/50">
      <div className="sm:col-span-5 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">{label}</div>
        <div className="text-2xs text-muted-foreground truncate">{description}</div>
      </div>
      <div className="sm:col-span-3">
        <select
          value={value.agentId}
          onChange={(e) => {
            const nextAgentId = e.target.value
            const nextAgent = agents.find((a) => (a.agentType ?? a.id) === nextAgentId)
            onChange({
              agentId: nextAgentId,
              model: nextAgent?.defaultModel ?? nextAgent?.models?.[0] ?? ''
            })
          }}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {agents.length === 0 ? (
            <option value={value.agentId}>{value.agentId || 'claude'}</option>
          ) : (
            agents.map((agent) => {
              const id = agent.agentType ?? agent.id
              return (
                <option key={agent.id} value={id}>
                  {agent.name}
                </option>
              )
            })
          )}
          {agents.length > 0 &&
          !agents.some((a) => (a.agentType ?? a.id) === value.agentId) &&
          value.agentId ? (
            <option value={value.agentId}>{value.agentId}</option>
          ) : null}
        </select>
      </div>
      <div className="sm:col-span-4">
        <select
          value={value.model ?? ''}
          onChange={(e) => onChange({ ...value, model: e.target.value || undefined })}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Modelo por defecto</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          {value.model && !models.includes(value.model) ? (
            <option value={value.model}>{value.model}</option>
          ) : null}
        </select>
      </div>
    </div>
  )
}
