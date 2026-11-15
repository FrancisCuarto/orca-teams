import type {
  FactoryCheckResult,
  FactoryReviewerRole,
  FactoryReviewVerdict
} from '../../shared/teamwork/team-factory-types'
import { FACTORY_REVIEWER_LABELS } from '../../shared/teamwork/team-factory-types'
import type { TeamKanbanCard } from '../../shared/teamwork/team-kanban-types'

export { parseApproverDecisionJson, parseReviewerVerdictJson } from './team-factory-verdicts'

function formatChecklist(card: TeamKanbanCard): string {
  if (!card.checklist.length) {
    return 'Sin checklist explícita.'
  }
  return card.checklist.map((i) => `- [${i.done ? 'x' : ' '}] ${i.text}`).join('\n')
}

export function buildSpecWriterPrompt(options: {
  card: TeamKanbanCard
  sprintGoal?: string
  brainMarkdown: string
}): string {
  const { card, sprintGoal, brainMarkdown } = options
  return [
    '# Rol: Spec Writer (Software Factory)',
    'Tu trabajo es redactar una especificación técnica precisa (SDD) ANTES de escribir código.',
    'NO modifiques archivos de código fuente en esta etapa; entrega únicamente la especificación en Markdown.',
    '',
    `## Tarea: ${card.title}`,
    `Prioridad: ${card.priority.toUpperCase()}`,
    sprintGoal ? `Objetivo del Sprint: ${sprintGoal}` : '',
    `Etiquetas: ${card.labels.join(', ') || 'ninguna'}`,
    '',
    '### Descripción',
    card.description.trim() || 'Sin descripción adicional.',
    '',
    '### Criterios de Aceptación',
    formatChecklist(card),
    '',
    brainMarkdown
      ? `## Memoria del Proyecto (El Brain — ADRs & Specs previas)\n${brainMarkdown}`
      : '## Memoria del Proyecto (El Brain)\nNo hay notas previas registradas para este proyecto.',
    '',
    '## Formato de Salida Esperado (Markdown)',
    '1. Objetivo y alcance exacto (YAGNI).',
    '2. Archivos probables a crear o modificar.',
    '3. Casos de prueba a escribir primero (plan TDD).',
    '4. Riesgos de seguridad, UX/UI o regresiones a vigilar.'
  ]
    .filter((line) => line !== undefined && !(line === '' && false))
    .join('\n')
}

export function buildBuilderPrompt(options: {
  card: TeamKanbanCard
  specMarkdown: string
  attempt: number
  fixInstructions?: string
  failedChecks?: FactoryCheckResult[]
}): string {
  const { card, specMarkdown, attempt, fixInstructions, failedChecks } = options
  const sections = [
    '# Rol: Builder TDD (Software Factory)',
    `Intento: ${attempt}`,
    'Implementa la especificación en el repositorio actual siguiendo TDD estricto:',
    '1. Escribe o actualiza primero los tests que validen los criterios de aceptación.',
    '2. Implementa el código mínimo completo para pasar los tests (sin abstracciones prematuras).',
    '3. Ejecuta las pruebas relevantes y verifica que el código compile sin errores.',
    '',
    `## Tarea: ${card.title}`,
    '## Especificación Técnica (Spec)',
    specMarkdown
  ]

  if (fixInstructions?.trim()) {
    sections.push(
      '',
      '## Correcciones Obligatorias del Aprobador (Iteración previa)',
      fixInstructions
    )
  }

  if (failedChecks && failedChecks.length > 0) {
    const checkBlock = failedChecks
      .map((c) => `### Check fallido: ${c.name} (\`${c.command}\`)\n\`\`\`\n${c.output}\n\`\`\``)
      .join('\n\n')
    sections.push('', '## Checks Deterministas Fallidos', checkBlock)
  }

  return sections.join('\n')
}

const REVIEWER_FOCUS: Record<FactoryReviewerRole, string> = {
  security:
    'Audita vulnerabilidades: inyección, exposición de secretos/tokens, validación de inputs, bypass de permisos/RBAC, path traversal, ejecución de comandos insegura.',
  ux: 'Audita experiencia de uso: estados de carga/vacío/error honestos, mensajes claros, accesibilidad, flujos incompletos, bloqueos o regresiones funcionales.',
  ui: 'Audita diseño e interfaz: consistencia con tokens del sistema de diseño, ausencia de hex hardcodeados innecesarios, jerarquía visual, responsive y legibilidad.',
  code: 'Audita consistencia de código: tipado estricto (sin `as` innecesarios), reutilización, modularidad, manejo de errores, cobertura real de tests y cumplimiento de la spec.'
}

export function buildReviewerPrompt(options: {
  role: FactoryReviewerRole
  card: TeamKanbanCard
  specMarkdown: string
  diffPatch: string
  changedFiles: string[]
}): string {
  const { role, card, specMarkdown, diffPatch, changedFiles } = options
  return [
    `# Rol: Revisor Independiente de ${FACTORY_REVIEWER_LABELS[role]}`,
    'Trabajas en contexto AISLADO respecto al Builder. NO modifiques archivos.',
    REVIEWER_FOCUS[role],
    '',
    `## Tarea: ${card.title}`,
    '## Especificación',
    specMarkdown,
    '',
    `## Archivos modificados (${changedFiles.length})`,
    changedFiles.map((f) => `- ${f}`).join('\n') ||
      '(sin archivos modificados detectados en git diff)',
    '',
    '## Diff Aislado',
    '```diff',
    diffPatch || '(diff vacío)',
    '```',
    '',
    '## Respuesta Obligatoria',
    'Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura exacta (sin texto extra si es posible):',
    '```json',
    '{',
    '  "status": "pass" | "fail",',
    '  "summary": "resumen breve de la revisión",',
    '  "findings": [',
    '    { "severity": "critical" | "high" | "medium" | "low", "file": "ruta/opcional.ts", "message": "detalle concreto" }',
    '  ]',
    '}',
    '```'
  ].join('\n')
}

export function buildApproverPrompt(options: {
  card: TeamKanbanCard
  specMarkdown: string
  reviews: FactoryReviewVerdict[]
  attempt: number
}): string {
  const { card, specMarkdown, reviews, attempt } = options
  const reviewSummary = reviews
    .map(
      (r) =>
        `### Revisor ${FACTORY_REVIEWER_LABELS[r.role]} (${r.agentId}/${r.model}) -> ${r.status.toUpperCase()}\nResumen: ${r.summary}\nHallazgos:\n${
          r.findings.length
            ? r.findings
                .map((f) => `- [${f.severity}] ${f.file ? `(${f.file}) ` : ''}${f.message}`)
                .join('\n')
            : '- Sin hallazgos'
        }`
    )
    .join('\n\n')

  return [
    '# Rol: Aprobador de Software Factory',
    `Intento actual: ${attempt}`,
    'Consolida los 4 informes de revisión independientes. NO modifiques archivos.',
    'Si algún revisor reportó `fail` o hallazgos `critical`/`high`, debes rechazar (`"approved": false`) y redactar `fixInstructions` concretas para el Builder.',
    '',
    `## Tarea: ${card.title}`,
    '## Especificación',
    specMarkdown,
    '',
    '## Informes de los 4 Revisores',
    reviewSummary,
    '',
    '## Respuesta Obligatoria (JSON válido)',
    '```json',
    '{',
    '  "approved": true | false,',
    '  "summary": "decisión consolidada",',
    '  "fixInstructions": "instrucciones concretas si approved es false"',
    '}',
    '```'
  ].join('\n')
}
