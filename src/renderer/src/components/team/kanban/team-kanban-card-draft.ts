import type {
  TeamKanbanCard,
  TeamKanbanChecklistItem,
  TeamKanbanColumn,
  TeamKanbanPriority
} from '../../../../../shared/teamwork/team-kanban-types'
import type { TeamMemberEntry } from '../../../../../shared/teamwork/team-members'

export type CardFormDraftInput = {
  existingCard: TeamKanbanCard | null
  title: string
  description: string
  columnId: string
  columns: TeamKanbanColumn[]
  priority: TeamKanbanPriority
  assigneeType: 'human' | 'agent'
  assigneeName: string
  matchedAgent?: TeamMemberEntry
  agentModel: string
  agentSkills: string[]
  labelsText: string
  checklist: TeamKanbanChecklistItem[]
  linkedNoteIds?: string[]
  sourceWhiteboardElementId?: string
  estimatePoints?: number
  branchOrWorktree: string
  isolateWorktree: boolean
  requiresApproval: boolean
  blockedReason: string
}

export function buildKanbanCardFromDraft(input: CardFormDraftInput): TeamKanbanCard {
  const { existingCard, columns, assigneeType, assigneeName, matchedAgent } = input
  const labels = input.labelsText
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean)

  const rawLinkedNoteIds = input.linkedNoteIds ?? existingCard?.linkedNoteIds ?? []
  const linkedNoteIds = Array.from(
    new Set(rawLinkedNoteIds.map((id) => id.trim()).filter(Boolean))
  )
  const sourceWhiteboardElementId =
    input.sourceWhiteboardElementId?.trim() ||
    existingCard?.sourceWhiteboardElementId?.trim() ||
    undefined

  const resolvedAgentType =
    assigneeType === 'agent'
      ? (matchedAgent?.agentType ??
        matchedAgent?.id ??
        existingCard?.assignee?.agentType ??
        'custom')
      : undefined
  const resolvedModel =
    assigneeType === 'agent'
      ? input.agentModel.trim() || matchedAgent?.defaultModel || undefined
      : undefined

  return {
    id: existingCard?.id ?? `card-${Date.now()}`,
    title: input.title.trim(),
    description: input.description.trim(),
    columnId: input.columnId || columns[0]?.id || 'col-backlog',
    priority: input.priority,
    assignee: assigneeName.trim()
      ? {
          type: assigneeType,
          name: assigneeName.trim(),
          agentType: resolvedAgentType,
          model: resolvedModel,
          skills: assigneeType === 'agent' ? input.agentSkills : undefined
        }
      : undefined,
    labels,
    checklist: input.checklist,
    ...(existingCard?.comments ? { comments: existingCard.comments } : {}),
    ...(linkedNoteIds.length > 0 ? { linkedNoteIds } : {}),
    ...(sourceWhiteboardElementId ? { sourceWhiteboardElementId } : {}),
    estimatePoints: input.estimatePoints,
    branchOrWorktree: input.branchOrWorktree.trim() || undefined,
    isolateWorktree: input.isolateWorktree,
    requiresApproval: input.requiresApproval,
    reviewRequest: existingCard?.reviewRequest,
    blockedReason: input.blockedReason.trim() || undefined,
    createdAt: existingCard?.createdAt ?? Date.now(),
    updatedAt: Date.now()
  }
}
