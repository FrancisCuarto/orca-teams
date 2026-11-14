import type { ConfiguredTeamAgent } from './team-ipc-types'
import type { ExtendedTeamMember } from './team-kanban-types'

export type { ExtendedTeamMember }

export type TeamMemberEntry = ExtendedTeamMember & {
  models?: string[]
  configSource?: string
  command?: string
  configured?: boolean
}

export type RecommendedAgentSkill = {
  id: string
  label: string
  summary: string
}

export const RECOMMENDED_AGENT_SKILLS: readonly RecommendedAgentSkill[] = [
  {
    id: 'ponytail-5',
    label: 'Ponytail 5',
    summary: 'Cambio mínimo completo: YAGNI, reutilizar antes de reimplementar, cero bloat.'
  },
  {
    id: 'ctx7',
    label: 'ctx7',
    summary: 'Consultar documentación oficial versionada vía Context7 antes de usar APIs.'
  },
  {
    id: 'tdd-strict',
    label: 'TDD Estricto',
    summary: 'Validar cada regla de negocio con pruebas unitarias deterministas.'
  },
  {
    id: 'security-audit',
    label: 'Seguridad & Auth',
    summary: 'Validar entradas en límites de confianza, permisos y manejo seguro de datos.'
  },
  {
    id: 'orca-styleguide',
    label: 'Orca Styleguide',
    summary: 'Usar tokens semánticos de main.css y primitivos shadcn sin type assertions.'
  }
]

export const DEFAULT_TEAM_HUMAN_MEMBERS: ExtendedTeamMember[] = [
  {
    id: 'human-francis',
    name: 'Francis (Lead)',
    type: 'human',
    role: 'Tech Lead / Arquitecto',
    status: 'online',
    color: '#6366f1'
  }
]

export function configuredAgentToMemberEntry(agent: ConfiguredTeamAgent): TeamMemberEntry {
  return {
    id: agent.id,
    name: agent.name,
    type: 'agent',
    agentType: agent.id,
    role: agent.role,
    status: 'online',
    color: agent.color,
    defaultModel: agent.defaultModel,
    defaultSkills: agent.defaultSkills,
    models: agent.models,
    configSource: agent.configSource,
    command: agent.command,
    configured: agent.configured
  }
}

export function configuredAgentsToMemberEntries(
  agents: readonly ConfiguredTeamAgent[]
): TeamMemberEntry[] {
  return agents.filter((agent) => agent.configured).map(configuredAgentToMemberEntry)
}

export function getMemberById(
  members: readonly ExtendedTeamMember[],
  idOrName: string
): ExtendedTeamMember | undefined {
  const normalized = idOrName.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }
  return members.find(
    (member) =>
      member.id.toLowerCase() === normalized ||
      member.name.toLowerCase() === normalized ||
      (member.agentType && member.agentType.toLowerCase() === normalized)
  )
}

export function getMemberModels(member?: ExtendedTeamMember): readonly string[] {
  if (!member) {
    return []
  }
  if ('models' in member && Array.isArray(member.models)) {
    const valid = member.models.filter((item): item is string => typeof item === 'string')
    if (valid.length > 0) {
      return valid
    }
  }
  return member.defaultModel ? [member.defaultModel] : []
}

export function getMemberConfigSource(member?: ExtendedTeamMember): string | undefined {
  if (!member || !('configSource' in member)) {
    return undefined
  }
  return typeof member.configSource === 'string' && member.configSource.trim()
    ? member.configSource
    : undefined
}
