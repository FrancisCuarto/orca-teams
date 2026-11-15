import path from 'node:path'
import { isTuiAgent, TUI_AGENT_CONFIG } from '../../shared/agent-launch/catalog/tui-agent-config'
import type { TeamStartExecutionRequest } from '../../shared/teamwork/team-ipc-types'

const AGENT_COMMAND_OVERRIDES: Record<string, string> = {
  antigravity: 'agy',
  agy: 'agy',
  openclaude: 'claude',
  'claude-agent-teams': 'claude',
  claude: 'claude',
  opencode: 'opencode',
  opencode2: 'opencode2',
  codex: 'codex',
  gemini: 'gemini',
  aider: 'aider',
  goose: 'goose'
}

export function resolveAgentCommand(agentId: string): string {
  const normalized = agentId
    .trim()
    .toLowerCase()
    .replace(/^agent-/, '')
  if (AGENT_COMMAND_OVERRIDES[normalized]) {
    return AGENT_COMMAND_OVERRIDES[normalized]
  }
  if (isTuiAgent(normalized)) {
    return TUI_AGENT_CONFIG[normalized].detectCmd
  }
  return normalized
}

export function buildAgentCliCommand(
  agentCommand: string,
  prompt: string,
  modelId?: string
): { bin: string; args: string[] } {
  const base = path
    .basename(agentCommand)
    .toLowerCase()
    .replace(/\.(exe|cmd|bat)$/i, '')
  const modelArgs = modelId?.trim() ? ['--model', modelId.trim()] : []

  switch (base) {
    case 'agy':
      return {
        bin: agentCommand,
        args: [
          '-p',
          '--dangerously-skip-permissions',
          '--output-format',
          'text',
          ...modelArgs,
          prompt
        ]
      }
    case 'opencode':
    case 'opencode2':
      return {
        bin: agentCommand,
        args: ['run', '--auto', ...modelArgs, prompt]
      }
    case 'claude':
    case 'openclaude':
      return {
        bin: agentCommand,
        args: ['-p', '--dangerously-skip-permissions', ...modelArgs, prompt]
      }
    case 'codex':
      return {
        bin: agentCommand,
        args: ['exec', '--full-auto', ...modelArgs, prompt]
      }
    case 'gemini':
      return {
        bin: agentCommand,
        args: ['-p', prompt, '--yolo', ...modelArgs]
      }
    case 'aider':
      return {
        bin: agentCommand,
        args: ['--yes-always', '--message', prompt, ...modelArgs]
      }
    case 'goose':
      return {
        bin: agentCommand,
        args: ['run', '--text', prompt]
      }
    default:
      return {
        bin: agentCommand,
        args: [prompt]
      }
  }
}

export function extractCardAgentAssignment(card: TeamStartExecutionRequest['card']): {
  agentId: string
  model?: string
  skills: string[]
} {
  let agentId = ''
  if ('assignedAgentId' in card && typeof card.assignedAgentId === 'string') {
    agentId = card.assignedAgentId.trim()
  } else if (card.assignee?.type === 'agent') {
    agentId = (card.assignee.agentType ?? card.assignee.name ?? '').trim()
  }
  if (!agentId) {
    throw new Error('La tarjeta no tiene un agente asignado válido (assignedAgentId requerido)')
  }

  let model: string | undefined
  if (
    'assignedModel' in card &&
    typeof card.assignedModel === 'string' &&
    card.assignedModel.trim()
  ) {
    model = card.assignedModel.trim()
  } else if (card.assignee?.model?.trim()) {
    model = card.assignee.model.trim()
  }

  const skills = card.assignee?.skills?.filter((s) => s.trim().length > 0) ?? []
  return { agentId, model, skills }
}

export function buildKanbanAgentPrompt(req: TeamStartExecutionRequest): string {
  const { card, sprintGoal, linkedNotesContext } = req
  const { skills } = extractCardAgentAssignment(card)
  const sections: string[] = [
    `# Tarea Kanban: ${card.title}`,
    `Prioridad: ${card.priority.toUpperCase()}`
  ]
  if (card.labels.length > 0) {
    sections.push(`Etiquetas: ${card.labels.join(', ')}`)
  }
  if (sprintGoal?.trim()) {
    sections.push(`Objetivo del Sprint: ${sprintGoal.trim()}`)
  }
  if (card.branchOrWorktree?.trim()) {
    sections.push(`Rama / Worktree: ${card.branchOrWorktree.trim()}`)
  }
  sections.push(`## Descripción\n${card.description.trim() || 'Sin descripción adicional.'}`)
  if (card.checklist.length > 0) {
    const items = card.checklist.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n')
    sections.push(`## Criterios de Aceptación\n${items}`)
  }
  if (linkedNotesContext && linkedNotesContext.length > 0) {
    const noteEntries = linkedNotesContext
      .filter((note) => note.title.trim() || note.content.trim())
      .map((note) => {
        const heading = note.title.trim() || note.id
        const body = note.content.trim() || 'Sin contenido.'
        return `### ${heading}\n${body}`
      })
    if (noteEntries.length > 0) {
      sections.push(
        `## Notas y ADRs Vinculados (Contexto de Arquitectura)\n${noteEntries.join('\n\n')}`
      )
    }
  }
  if (skills.length > 0) {
    sections.push(`## Instrucciones / Skills\nAplica: ${skills.join(', ')}`)
  }
  sections.push(
    'Ejecuta esta tarea de forma autónoma en el repositorio actual y reporta un resumen concreto de los cambios y pruebas.'
  )
  return sections.join('\n\n')
}
