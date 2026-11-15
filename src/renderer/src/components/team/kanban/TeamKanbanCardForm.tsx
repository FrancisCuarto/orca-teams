import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type {
  ExtendedTeamMember,
  TeamCardComment,
  TeamCommentMention,
  TeamKanbanCard,
  TeamKanbanColumn,
  TeamKanbanPriority
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  DEFAULT_TEAM_HUMAN_MEMBERS,
  getMemberModels,
  type TeamMemberEntry
} from '../../../../../shared/teamwork/team-members'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { TeamCardCommentsPanel } from './TeamCardCommentsPanel'
import { TeamKanbanCardAgentFields } from './TeamKanbanCardAgentFields'
import { TeamKanbanCardAssigneeFields } from './TeamKanbanCardAssigneeFields'
import { TeamKanbanCardChecklist } from './TeamKanbanCardChecklist'
import { TeamKanbanCardDetailsFields } from './TeamKanbanCardDetailsFields'
import { TeamKanbanCardFormFooter } from './TeamKanbanCardFormFooter'
import { buildKanbanCardFromDraft } from './team-kanban-card-draft'

export type TeamKanbanCardFormProps = {
  card: TeamKanbanCard | null
  columns: TeamKanbanColumn[]
  defaultColumnId?: string
  projectId?: string
  currentUserId?: string
  currentUserName?: string
  configuredAgents?: TeamMemberEntry[]
  humanMembers?: ExtendedTeamMember[]
  availableMembers?: ExtendedTeamMember[]
  readOnly?: boolean
  canDispatchAgents?: boolean
  onClose: () => void
  onSave: (card: TeamKanbanCard) => void
  onDelete?: (cardId: string) => void
  onDispatchAgent?: (card: TeamKanbanCard) => void
  onAddCardComment?: (comment: TeamCardComment) => void
  onDeleteCardComment?: (commentId: string) => void
  onDispatchAgentFollowUp?: (
    card: TeamKanbanCard,
    agentMention: TeamCommentMention,
    comment: TeamCardComment
  ) => void
}

const EMPTY_AGENTS: TeamMemberEntry[] = []

export function TeamKanbanCardForm({
  card,
  columns,
  defaultColumnId,
  projectId = 'proj-default',
  currentUserId = 'local-owner',
  currentUserName = 'Equipo Local',
  configuredAgents = EMPTY_AGENTS,
  humanMembers,
  availableMembers,
  readOnly = false,
  canDispatchAgents = true,
  onClose,
  onSave,
  onDelete,
  onDispatchAgent,
  onAddCardComment,
  onDeleteCardComment,
  onDispatchAgentFollowUp
}: TeamKanbanCardFormProps): React.JSX.Element {
  const [title, setTitle] = useState(card?.title ?? '')
  const [description, setDescription] = useState(card?.description ?? '')
  const [columnId, setColumnId] = useState(
    card?.columnId ?? defaultColumnId ?? columns[0]?.id ?? ''
  )
  const [priority, setPriority] = useState<TeamKanbanPriority>(card?.priority ?? 'medium')
  const [assigneeType, setAssigneeType] = useState<'human' | 'agent'>(
    card?.assignee?.type ?? 'human'
  )
  const [assigneeName, setAssigneeName] = useState(card?.assignee?.name ?? '')
  const [agentModel, setAgentModel] = useState(card?.assignee?.model ?? '')
  const [agentSkills, setAgentSkills] = useState<string[]>(
    card?.assignee?.skills ?? ['ponytail-5', 'ctx7']
  )
  const [labelsText, setLabelsText] = useState(card?.labels?.join(', ') ?? '')
  const [checklist, setChecklist] = useState(card?.checklist ? [...card.checklist] : [])
  const [estimatePoints, setEstimatePoints] = useState<number | undefined>(card?.estimatePoints)
  const [branchOrWorktree, setBranchOrWorktree] = useState(card?.branchOrWorktree ?? '')
  const [isolateWorktree, setIsolateWorktree] = useState(card?.isolateWorktree ?? true)
  const [requiresApproval, setRequiresApproval] = useState(card?.requiresApproval ?? false)
  const [blockedReason, setBlockedReason] = useState(card?.blockedReason ?? '')

  const agents = useMemo(
    () => Array.from(new Map(configuredAgents.map((a) => [a.id, a])).values()),
    [configuredAgents]
  )

  const humans = useMemo(() => {
    const base = humanMembers && humanMembers.length > 0 ? humanMembers : DEFAULT_TEAM_HUMAN_MEMBERS
    const custom = availableMembers?.filter((m) => m.type === 'human') ?? []
    return Array.from(new Map([...base, ...custom].map((h) => [h.name, h])).values())
  }, [humanMembers, availableMembers])

  const matchedAgent = useMemo(
    () =>
      agents.find(
        (a) =>
          a.name === assigneeName ||
          (card?.assignee?.agentType &&
            (a.agentType === card.assignee.agentType || a.id === card.assignee.agentType))
      ),
    [agents, assigneeName, card?.assignee?.agentType]
  )

  const availableModelList = useMemo(() => getMemberModels(matchedAgent), [matchedAgent])

  const handleAssigneeTypeChange = (nextType: 'human' | 'agent'): void => {
    setAssigneeType(nextType)
    if (nextType === 'agent') {
      const def = agents[0]
      if (def && !agents.some((a) => a.name === assigneeName)) {
        setAssigneeName(def.name)
        setAgentModel(def.defaultModel ?? def.models?.[0] ?? '')
        if (def.defaultSkills?.length) {
          setAgentSkills(def.defaultSkills)
        }
      }
    } else if (agents.some((a) => a.name === assigneeName)) {
      setAssigneeName('')
    }
  }

  const handleAgentSelect = (name: string): void => {
    setAssigneeName(name)
    const found = agents.find((a) => a.name === name)
    if (found) {
      setAgentModel(found.defaultModel ?? found.models?.[0] ?? '')
      if (found.defaultSkills?.length) {
        setAgentSkills(found.defaultSkills)
      }
    } else {
      setAgentModel('')
    }
  }

  const handleSave = (): void => {
    if (readOnly) {
      return
    }
    if (!title.trim()) {
      toast.error('El título de la tarea es obligatorio')
      return
    }
    const updatedCard = buildKanbanCardFromDraft({
      existingCard: card,
      title,
      description,
      columnId,
      columns,
      priority,
      assigneeType,
      assigneeName,
      matchedAgent,
      agentModel,
      agentSkills,
      labelsText,
      checklist,
      estimatePoints,
      branchOrWorktree,
      isolateWorktree,
      requiresApproval,
      blockedReason
    })
    onSave(updatedCard)
    onClose()
  }

  const isSavedAgentMissing =
    assigneeType === 'agent' && Boolean(assigneeName.trim()) && !matchedAgent

  return (
    <>
      <div className="flex flex-col gap-3 py-2 max-h-[65vh] overflow-y-auto scrollbar-sleek pr-1">
        <fieldset disabled={readOnly} className="flex flex-col gap-3 border-0 m-0 p-0 min-w-0">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground">Título de la tarea</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (!readOnly && e.key === 'Enter' && !isImeOwnedKeyboardEvent(e) && title.trim()) {
                e.preventDefault()
                handleSave()
              }
            }}
            placeholder="Ej. Implementar arquitectura limpia..."
            autoFocus={!readOnly}
          />
        </div>

        <TeamKanbanCardAssigneeFields
          assigneeType={assigneeType}
          assigneeName={assigneeName}
          agents={agents}
          humans={humans}
          isSavedAgentMissing={isSavedAgentMissing}
          onAssigneeTypeChange={handleAssigneeTypeChange}
          onAgentSelect={handleAgentSelect}
          onHumanNameChange={setAssigneeName}
        />

        {assigneeType === 'agent' ? (
          <TeamKanbanCardAgentFields
            matchedAgent={matchedAgent}
            agentModel={agentModel}
            agentSkills={agentSkills}
            availableModelList={availableModelList}
            onModelChange={setAgentModel}
            onToggleSkill={(id) =>
              setAgentSkills((prev) =>
                prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
              )
            }
          />
        ) : null}

        <TeamKanbanCardDetailsFields
          columns={columns}
          columnId={columnId}
          priority={priority}
          estimatePoints={estimatePoints}
          branchOrWorktree={branchOrWorktree}
          isolateWorktree={isolateWorktree}
          requiresApproval={requiresApproval}
          blockedReason={blockedReason}
          labelsText={labelsText}
          description={description}
          onColumnChange={setColumnId}
          onPriorityChange={setPriority}
          onEstimatePointsChange={setEstimatePoints}
          onBranchChange={setBranchOrWorktree}
          onIsolateWorktreeChange={setIsolateWorktree}
          onRequiresApprovalChange={setRequiresApproval}
          onBlockedReasonChange={setBlockedReason}
          onLabelsTextChange={setLabelsText}
          onDescriptionChange={setDescription}
        />

        <TeamKanbanCardChecklist
          items={checklist}
          onAdd={(text) =>
            setChecklist((prev) => [...prev, { id: `check-${Date.now()}`, text, done: false }])
          }
          onToggle={(id) =>
            setChecklist((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
          }
          onDelete={(id) => setChecklist((prev) => prev.filter((i) => i.id !== id))}
        />
        </fieldset>

        {card ? (
          <TeamCardCommentsPanel
            key={card.id}
            card={card}
            projectId={projectId}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            humans={humans}
            configuredAgents={agents}
            onAddComment={onAddCardComment}
            onDeleteComment={onDeleteCardComment}
            onDispatchAgentFollowUp={
              onDispatchAgentFollowUp
                ? (targetCard, mention, comment) => {
                    onDispatchAgentFollowUp(targetCard, mention, comment)
                    onClose()
                  }
                : undefined
            }
          />
        ) : null}
      </div>

      <TeamKanbanCardFormFooter
        card={card}
        canSave={!readOnly && Boolean(title.trim())}
        readOnly={readOnly}
        canDispatchAgents={canDispatchAgents}
        onClose={onClose}
        onSave={handleSave}
        onDelete={onDelete}
        onDispatchAgent={onDispatchAgent}
      />
    </>
  )
}
