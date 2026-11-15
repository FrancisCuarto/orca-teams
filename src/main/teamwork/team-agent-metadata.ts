import path from 'node:path'
import type { TuiAgent } from '../../shared/agent-launch/catalog/tui-agent'

export type AgentRoleProfile = {
  role: string
  color: string
  defaultSkills: string[]
  preferredModelPatterns?: readonly string[]
}

const DEFAULT_AGENT_PROFILE: AgentRoleProfile = {
  role: 'Agente CLI Configurado',
  color: '#64748b',
  defaultSkills: ['ponytail-5']
}

const AGENT_ROLE_PROFILES: Partial<Record<TuiAgent, AgentRoleProfile>> = {
  antigravity: {
    role: 'Orquestador de Enjambre & Planificación',
    color: '#8b5cf6',
    defaultSkills: ['ponytail-5', 'ctx7', 'orca-styleguide'],
    preferredModelPatterns: ['orchestrator', 'gemini-4-argon-medium', 'gemini-4-argon']
  },
  opencode: {
    role: 'Ejecución Rápida & Refactoring',
    color: '#06b6d4',
    defaultSkills: ['ponytail-5', 'ctx7'],
    preferredModelPatterns: ['opencode-go/glm-5.3', 'glm-5.3', 'deepseek-v4']
  },
  opencode2: {
    role: 'Ejecución Rápida & Refactoring',
    color: '#06b6d4',
    defaultSkills: ['ponytail-5', 'ctx7'],
    preferredModelPatterns: ['opencode-go/glm-5.3', 'glm-5.3']
  },
  claude: {
    role: 'Fullstack & Arquitectura',
    color: '#f59e0b',
    defaultSkills: ['ponytail-5', 'ctx7', 'orca-styleguide']
  },
  openclaude: {
    role: 'Fullstack & Arquitectura',
    color: '#f59e0b',
    defaultSkills: ['ponytail-5', 'ctx7', 'orca-styleguide']
  },
  codex: {
    role: 'Backend, APIs & Seguridad',
    color: '#10b981',
    defaultSkills: ['ponytail-5', 'ctx7', 'security-audit']
  },
  gemini: {
    role: 'Análisis & Razonamiento Multimodal',
    color: '#3b82f6',
    defaultSkills: ['ponytail-5', 'ctx7']
  },
  aider: {
    role: 'Edición Asistida por Git',
    color: '#ec4899',
    defaultSkills: ['ponytail-5', 'tdd-strict']
  },
  goose: {
    role: 'Automatización & Tooling',
    color: '#f97316',
    defaultSkills: ['ponytail-5']
  },
  'qwen-code': {
    role: 'Código & Refactoring',
    color: '#6366f1',
    defaultSkills: ['ponytail-5', 'ctx7']
  },
  kiro: {
    role: 'Especificaciones & Flujos',
    color: '#a855f7',
    defaultSkills: ['ponytail-5', 'ctx7']
  },
  cursor: {
    role: 'Desarrollo Fullstack',
    color: '#14b8a6',
    defaultSkills: ['ponytail-5', 'orca-styleguide']
  },
  copilot: {
    role: 'Asistente GitHub & PRs',
    color: '#0ea5e9',
    defaultSkills: ['ponytail-5']
  }
}

export function getAgentRoleProfile(agentId: TuiAgent): AgentRoleProfile {
  return AGENT_ROLE_PROFILES[agentId] ?? DEFAULT_AGENT_PROFILE
}

export type AgentConfigCheckSpec = {
  files: (home: string) => readonly string[]
  nonEmptyFiles?: (home: string) => readonly string[]
  envVars: readonly string[]
  supportsModelListing?: boolean
}

const AGENT_CONFIG_SPECS: Partial<Record<TuiAgent, AgentConfigCheckSpec>> = {
  claude: {
    files: (home) => [
      path.join(home, '.claude', '.credentials.json'),
      path.join(home, '.claude.json')
    ],
    envVars: ['ANTHROPIC_API_KEY']
  },
  openclaude: {
    files: (home) => [
      path.join(home, '.claude', '.credentials.json'),
      path.join(home, '.claude.json')
    ],
    envVars: ['ANTHROPIC_API_KEY']
  },
  codex: {
    files: (home) => [path.join(home, '.codex', 'auth.json')],
    envVars: ['OPENAI_API_KEY']
  },
  opencode: {
    files: (home) => [
      path.join(home, '.local', 'share', 'opencode', 'auth.json'),
      path.join(home, '.local', 'share', 'opencode', 'opencode.db'),
      path.join(home, '.config', 'opencode', 'cli.json'),
      path.join(home, '.config', 'opencode', 'opencode.json')
    ],
    envVars: ['OPENCODE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
    supportsModelListing: true
  },
  opencode2: {
    files: (home) => [
      path.join(home, '.local', 'share', 'opencode', 'auth.json'),
      path.join(home, '.local', 'share', 'opencode', 'opencode.db'),
      path.join(home, '.config', 'opencode', 'cli.json'),
      path.join(home, '.config', 'opencode', 'opencode.json')
    ],
    envVars: ['OPENCODE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
    supportsModelListing: true
  },
  antigravity: {
    files: (home) => [
      path.join(home, '.gemini', 'antigravity'),
      path.join(home, '.gemini', 'antigravity-cli'),
      path.join(home, '.config', 'Antigravity')
    ],
    envVars: [],
    supportsModelListing: true
  },
  gemini: {
    files: (home) => [path.join(home, '.gemini', 'oauth_creds.json')],
    nonEmptyFiles: (home) => [path.join(home, '.gemini', 'settings.json')],
    envVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY']
  },
  aider: {
    files: (home) => [path.join(home, '.aider.conf.yml'), path.join(home, '.aider.env')],
    envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY']
  },
  goose: {
    files: (home) => [
      path.join(home, '.config', 'goose', 'config.yaml'),
      path.join(home, '.config', 'goose', 'profiles.yaml')
    ],
    envVars: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY']
  },
  'qwen-code': {
    files: (home) => [
      path.join(home, '.qwen', 'settings.json'),
      path.join(home, '.config', 'qwen')
    ],
    envVars: ['DASHSCOPE_API_KEY', 'OPENAI_API_KEY']
  },
  kiro: {
    files: (home) => [
      path.join(home, '.kiro'),
      path.join(home, '.config', 'kiro'),
      path.join(home, '.local', 'share', 'kiro-cli')
    ],
    envVars: []
  },
  cursor: {
    files: (home) => [path.join(home, '.cursor'), path.join(home, '.config', 'Cursor')],
    envVars: ['CURSOR_API_KEY']
  },
  copilot: {
    files: (home) => [path.join(home, '.config', 'github-copilot'), path.join(home, '.copilot')],
    envVars: ['GITHUB_TOKEN', 'GH_TOKEN']
  }
}

export function getAgentConfigCheckSpec(agentId: TuiAgent, command: string): AgentConfigCheckSpec {
  const matched = AGENT_CONFIG_SPECS[agentId]
  if (matched) {
    return matched
  }
  return {
    files: (home) => [path.join(home, '.config', agentId), path.join(home, '.config', command)],
    envVars: []
  }
}

export function pickDefaultModel(
  models: readonly string[],
  preferredPatterns?: readonly string[]
): string | undefined {
  if (models.length === 0) {
    return undefined
  }
  if (preferredPatterns) {
    for (const pattern of preferredPatterns) {
      const lowerPattern = pattern.toLowerCase()
      const match = models.find((m) => m.toLowerCase().includes(lowerPattern))
      if (match) {
        return match
      }
    }
  }
  return models[0]
}
