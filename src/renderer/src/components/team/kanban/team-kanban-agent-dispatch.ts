import type {
  TeamKanbanAssignee,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'

export function isDraggableAssigneeData(
  data: unknown
): data is { type: 'assignee'; assignee: TeamKanbanAssignee } {
  if (typeof data !== 'object' || data === null || !('type' in data) || data.type !== 'assignee') {
    return false
  }
  if (!('assignee' in data) || typeof data.assignee !== 'object' || data.assignee === null) {
    return false
  }
  const { assignee } = data
  const hasValidType =
    'type' in assignee && (assignee.type === 'human' || assignee.type === 'agent')
  const hasValidName = 'name' in assignee && typeof assignee.name === 'string'
  return hasValidType && hasValidName
}

export function buildAgentDispatchPrompt(card: TeamKanbanCard): {
  prompt: string
  branchName: string
  agentName: string
} {
  const agentName = card.assignee?.name || 'Antigravity'
  const model = card.assignee?.model || 'Orchestrator (Argon)'
  const branchName =
    card.branchOrWorktree ||
    card.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)
  const skills = card.assignee?.skills ?? ['ponytail-5', 'ctx7']
  const checklist = card.checklist?.length
    ? `\n\n### Criterios de Aceptación:\n${card.checklist.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n')}`
    : ''
  const rules = [
    skills.includes('ponytail-5') || !skills.length
      ? `### Reglas Ponytail 5 (Minimum Complete Engineering):\n- YAGNI: Resuelve estrictamente el requerimiento sin abstracciones prematuras.\n- Reutilizar antes de reimplementar: Reutiliza componentes de @/components/ui/ y utilidades existentes.\n- Tipado estricto: CERO aserciones 'as' en código de producción.\n- Seguridad IME: Usa <Input>/<Textarea> o guarda Enter con !isImeOwnedKeyboardEvent(e).`
      : '',
    skills.includes('ctx7')
      ? '### Regla Context7 (ctx7):\n- Consulta documentación oficial versionada vía Context7 antes de usar APIs externas.'
      : ''
  ]
    .filter(Boolean)
    .join('\n\n')
  const cli =
    card.assignee?.agentType === 'opencode'
      ? `opencode run --model "${model}" "${card.title}"`
      : `agy run --model "${model}" "${card.title}"`
  const prompt = `# Tarea: ${card.title}\n\n**Agente:** ${agentName} (${model})\n**Rama:** ${branchName}\n\n## Descripción:\n${card.description || 'Sin descripción adicional.'}${checklist}\n\n${rules}\n\n\`\`\`bash\n${cli}\n\`\`\``
  return { prompt, branchName, agentName }
}
