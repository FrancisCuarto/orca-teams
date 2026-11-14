import type { ExtendedTeamMember } from './team-kanban-types'

export type { ExtendedTeamMember }

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

export const AVAILABLE_AGENT_MODELS: Record<string, readonly string[]> = {
  antigravity: [
    'Orchestrator (Argon)',
    'Gemini 4 Hydrogen',
    'Gemini 4 Argon',
    'Claude Opus 5.5',
    'Claude Sonnet 5.5'
  ],
  opencode: [
    'opencode-go/glm-5.3',
    'opencode-go/deepseek-v4-pro',
    'opencode-go/qwen3.8-max',
    'opencode-go/kimi-k3.1-pro',
    'opencode-go/claude-haiku-5-5'
  ],
  claude: ['Claude Sonnet 5.5', 'Claude Opus 5.5', 'Claude Haiku 5.5'],
  codex: ['GPT-5.6', 'GPT-6 Luna', 'Codex Mini'],
  qa: ['Gemini 4 Hydrogen', 'opencode-go/glm-5.3-flash', 'Claude Sonnet 5.5']
}

export const ALL_AGENT_MODELS: readonly string[] = Array.from(
  new Set(Object.values(AVAILABLE_AGENT_MODELS).flat())
)

export const DEFAULT_TEAM_AI_AGENTS: ExtendedTeamMember[] = [
  {
    id: 'agent-antigravity',
    name: 'Antigravity',
    type: 'agent',
    agentType: 'antigravity',
    role: 'Orquestador de Enjambre & Planificación',
    color: '#8b5cf6',
    defaultModel: 'Orchestrator (Argon)',
    defaultSkills: ['ponytail-5', 'ctx7', 'orca-styleguide']
  },
  {
    id: 'agent-opencode',
    name: 'OpenCode',
    type: 'agent',
    agentType: 'opencode',
    role: 'Ejecución Rápida & Refactoring',
    color: '#06b6d4',
    defaultModel: 'opencode-go/glm-5.3',
    defaultSkills: ['ponytail-5', 'ctx7']
  },
  {
    id: 'agent-claude',
    name: 'Claude Code',
    type: 'agent',
    agentType: 'claude',
    role: 'Fullstack & Arquitectura',
    color: '#f59e0b',
    defaultModel: 'Claude Sonnet 5.5',
    defaultSkills: ['ponytail-5', 'ctx7', 'orca-styleguide']
  },
  {
    id: 'agent-codex',
    name: 'Codex AI',
    type: 'agent',
    agentType: 'codex',
    role: 'Backend, APIs & Seguridad',
    color: '#10b981',
    defaultModel: 'GPT-5.6',
    defaultSkills: ['ponytail-5', 'ctx7', 'security-audit']
  },
  {
    id: 'agent-qa',
    name: 'QA Playtest',
    type: 'agent',
    agentType: 'qa',
    role: 'Pruebas E2E, Vitest & Calidad',
    color: '#ec4899',
    defaultModel: 'Gemini 4 Hydrogen',
    defaultSkills: ['ponytail-5', 'tdd-strict']
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
  },
  {
    id: 'human-frontend',
    name: 'Dev Frontend',
    type: 'human',
    role: 'UI/UX & React',
    status: 'online',
    color: '#14b8a6'
  },
  {
    id: 'human-backend',
    name: 'Dev Backend',
    type: 'human',
    role: 'Servicios & Datos',
    status: 'away',
    color: '#f97316'
  }
]
