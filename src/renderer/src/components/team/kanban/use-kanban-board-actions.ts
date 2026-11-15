import { useCallback } from 'react'
import { toast } from 'sonner'
import type {
  TeamCardComment,
  TeamCommentMention,
  TeamKanbanAssignee,
  TeamKanbanBoard,
  TeamKanbanCard,
  TeamNote
} from '../../../../../shared/teamwork/team-kanban-types'
import type { TeamMemberEntry } from '../../../../../shared/teamwork/team-members'
import type { TeamStartExecutionRequest } from '../../../../../shared/teamwork/team-ipc-types'
import type { AgentExecutionRecord } from '../../../../../shared/teamwork/team-workspace-types'
import { resolveLinkedNotesContext } from '../hooks/use-team-agent-executions'
import { copyTextToClipboard } from '../utils/team-clipboard'
import { buildAgentDispatchPrompt } from './team-kanban-agent-dispatch'
import {
  assignMemberToKanbanCard,
  moveKanbanCardToColumn,
  upsertKanbanCard
} from './team-kanban-board-mutations'
import {
  resolveCardForConfiguredAgent,
  shouldMoveToInProgress,
  shouldTriggerExecutionOnSave
} from './team-kanban-execution-helpers'
import { useKanbanBoardSecondaryActions } from './use-kanban-board-secondary-actions'

type Options = {
  board: TeamKanbanBoard
  projectId: string
  projectPath?: string | null
  actorUserId: string
  canEditBoard?: boolean
  canDispatchAgents?: boolean
  configuredAgents: readonly TeamMemberEntry[]
  availableNotes?: readonly TeamNote[]
  executionsByCard: Map<string, AgentExecutionRecord>
  startCardExecution: (request: TeamStartExecutionRequest) => Promise<AgentExecutionRecord | null>
  hydrateLatestForCard: (cardId: string) => Promise<AgentExecutionRecord | null>
  onOpenExecutionModal: (cardId: string) => void
  onCrdtAddComment?: (comment: TeamCardComment) => void
  onCrdtDeleteComment?: (commentId: string) => void
  onChange: (updatedBoard: TeamKanbanBoard) => void
}

export function useKanbanBoardActions(options: Options) {
  const {
    board,
    projectId,
    projectPath,
    actorUserId,
    canEditBoard = true,
    canDispatchAgents = true,
    configuredAgents,
    availableNotes,
    executionsByCard,
    startCardExecution,
    hydrateLatestForCard,
    onOpenExecutionModal,
    onCrdtAddComment,
    onCrdtDeleteComment,
    onChange
  } = options

  const guardedOnChange = useCallback(
    (updatedBoard: TeamKanbanBoard) => {
      if (!canEditBoard) {
        return
      }
      onChange(updatedBoard)
    },
    [canEditBoard, onChange]
  )

  const secondary = useKanbanBoardSecondaryActions(board, guardedOnChange)

  const triggerImmediateExecution = useCallback(
    async (card: TeamKanbanCard): Promise<void> => {
      if (!canDispatchAgents) {
        toast.error('Permisos insuficientes: tu rol no permite ejecutar agentes')
        return
      }
      if (card.assignee?.type !== 'agent') {
        return
      }
      const resolvedCard = resolveCardForConfiguredAgent(card, configuredAgents)
      const linkedNotesContext = resolveLinkedNotesContext(
        resolvedCard.linkedNoteIds,
        availableNotes
      )
      const agentName = resolvedCard.assignee?.name ?? 'Agente IA'
      try {
        const record = await startCardExecution({
          card: resolvedCard,
          projectId,
          projectPath,
          actorUserId,
          sprintGoal: board.sprintGoal,
          isolateWorktree: resolvedCard.isolateWorktree,
          requiresApproval: resolvedCard.requiresApproval,
          ...(linkedNotesContext ? { linkedNotesContext } : {})
        })
        if (record) {
          onOpenExecutionModal(resolvedCard.id)
          toast.info(`Agente ${agentName} ejecutando: ${resolvedCard.title}`)
          return
        }
        const { prompt } = buildAgentDispatchPrompt(resolvedCard, linkedNotesContext)
        await copyTextToClipboard(prompt)
        toast.warning('Runtime de ejecución no disponible; prompt copiado al portapapeles')
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : `No se pudo iniciar la ejecución de ${agentName}`
        )
      }
    },
    [
      canDispatchAgents,
      configuredAgents,
      availableNotes,
      startCardExecution,
      projectId,
      projectPath,
      actorUserId,
      board.sprintGoal,
      onOpenExecutionModal
    ]
  )

  const handleSaveCard = useCallback(
    (savedCard: TeamKanbanCard) => {
      if (!canEditBoard) {
        return
      }
      const prevCard = board.cards[savedCard.id]
      const willExecute = shouldTriggerExecutionOnSave(prevCard, savedCard, executionsByCard)
      const nextColumnId =
        willExecute && shouldMoveToInProgress(board, savedCard.columnId)
          ? 'col-in-progress'
          : savedCard.columnId
      const cardToSave: TeamKanbanCard =
        nextColumnId !== savedCard.columnId ? { ...savedCard, columnId: nextColumnId } : savedCard

      const { nextBoard, isNew } = upsertKanbanCard(board, cardToSave)
      guardedOnChange(nextBoard)
      toast.success(isNew ? 'Tarea creada' : 'Tarea actualizada')
      if (willExecute && canDispatchAgents) {
        void triggerImmediateExecution(cardToSave)
      }
    },
    [
      board,
      canDispatchAgents,
      canEditBoard,
      executionsByCard,
      guardedOnChange,
      triggerImmediateExecution
    ]
  )

  const handleAssignDraggedMember = useCallback(
    (cardId: string, dragged: TeamKanbanAssignee) => {
      if (!canEditBoard) {
        return
      }
      const assigned = assignMemberToKanbanCard(board, cardId, dragged)
      if (!assigned) {
        return
      }
      let finalBoard = assigned.nextBoard
      let updatedCard = finalBoard.cards[assigned.targetCard.id]
      if (
        updatedCard &&
        dragged.type === 'agent' &&
        shouldMoveToInProgress(finalBoard, updatedCard.columnId)
      ) {
        const moved = moveKanbanCardToColumn(finalBoard, updatedCard.id, 'col-in-progress')
        if (moved) {
          finalBoard = moved
          updatedCard = moved.cards[updatedCard.id]
        }
      }
      guardedOnChange(finalBoard)
      toast.success(`Tarea asignada a ${dragged.name}`)
      if (updatedCard && dragged.type === 'agent' && canDispatchAgents) {
        void triggerImmediateExecution(updatedCard)
      }
    },
    [board, canDispatchAgents, canEditBoard, guardedOnChange, triggerImmediateExecution]
  )

  const handleDispatchAgent = useCallback(
    (card: TeamKanbanCard) => {
      if (!canDispatchAgents) {
        toast.error('Permisos insuficientes: tu rol no permite ejecutar agentes')
        return
      }
      let targetCard = card
      if (canEditBoard && shouldMoveToInProgress(board, card.columnId)) {
        const moved = moveKanbanCardToColumn(board, card.id, 'col-in-progress')
        if (moved) {
          guardedOnChange(moved)
          targetCard = moved.cards[card.id] ?? card
        }
      }
      void triggerImmediateExecution(targetCard)
    },
    [board, canDispatchAgents, canEditBoard, guardedOnChange, triggerImmediateExecution]
  )

  const handleViewExecution = useCallback(
    (card: TeamKanbanCard) => {
      onOpenExecutionModal(card.id)
      if (!executionsByCard.has(card.id)) {
        void hydrateLatestForCard(card.id)
      }
    },
    [executionsByCard, hydrateLatestForCard, onOpenExecutionModal]
  )

  const handleAddCardComment = useCallback(
    (comment: TeamCardComment) => {
      if (onCrdtAddComment) {
        onCrdtAddComment(comment)
        return
      }
      const targetCard = board.cards[comment.cardId]
      if (!targetCard) {
        return
      }
      const existing = targetCard.comments ?? []
      const nextComments = [...existing.filter((c) => c.id !== comment.id), comment]
      onChange({
        ...board,
        cards: {
          ...board.cards,
          [targetCard.id]: {
            ...targetCard,
            comments: nextComments,
            updatedAt: Date.now()
          }
        },
        updatedAt: Date.now()
      })
    },
    [board, onChange, onCrdtAddComment]
  )

  const handleDeleteCardComment = useCallback(
    (commentId: string) => {
      if (onCrdtDeleteComment) {
        onCrdtDeleteComment(commentId)
        return
      }
      let changed = false
      const nextCards: Record<string, TeamKanbanCard> = {}
      for (const [cardId, card] of Object.entries(board.cards)) {
        if (card.comments?.some((c) => c.id === commentId)) {
          changed = true
          nextCards[cardId] = {
            ...card,
            comments: card.comments.filter((c) => c.id !== commentId),
            updatedAt: Date.now()
          }
        } else {
          nextCards[cardId] = card
        }
      }
      if (changed) {
        onChange({ ...board, cards: nextCards, updatedAt: Date.now() })
      }
    },
    [board, onChange, onCrdtDeleteComment]
  )

  const handleDispatchAgentFollowUp = useCallback(
    async (
      card: TeamKanbanCard,
      agentMention: TeamCommentMention,
      comment: TeamCardComment
    ): Promise<void> => {
      const tokenLower = agentMention.token.toLowerCase()
      const matchedAgent = configuredAgents.find(
        (a) =>
          (agentMention.targetId && a.id === agentMention.targetId) ||
          a.id.toLowerCase() === tokenLower ||
          a.agentType?.toLowerCase() === tokenLower ||
          a.name.toLowerCase() === tokenLower
      )
      const targetAgentId = matchedAgent?.agentType ?? matchedAgent?.id ?? agentMention.token
      const followUpCard: TeamKanbanCard = {
        ...card,
        assignee: {
          type: 'agent',
          name: matchedAgent?.name ?? agentMention.label,
          agentType: targetAgentId,
          model: matchedAgent?.defaultModel ?? matchedAgent?.models?.[0] ?? card.assignee?.model,
          skills: matchedAgent?.defaultSkills ?? card.assignee?.skills
        }
      }
      const followUpPrompt = `Comentario de ${comment.authorName}: ${comment.body}`
      try {
        const record = await startCardExecution({
          card: followUpCard,
          projectId,
          projectPath,
          actorUserId,
          sprintGoal: board.sprintGoal,
          isolateWorktree: card.isolateWorktree,
          requiresApproval: card.requiresApproval,
          followUpPrompt,
          targetAgentId
        })
        if (record) {
          onOpenExecutionModal(card.id)
          toast.info(`Consulta enviada a @${agentMention.token}`)
          return
        }
        const { prompt } = buildAgentDispatchPrompt(followUpCard)
        await copyTextToClipboard(`${prompt}\n\n### Seguimiento\n${followUpPrompt}`)
        toast.warning('Runtime de ejecución no disponible; prompt copiado al portapapeles')
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : `No se pudo despachar consulta a @${agentMention.token}`
        )
      }
    },
    [
      configuredAgents,
      startCardExecution,
      projectId,
      projectPath,
      actorUserId,
      board.sprintGoal,
      onOpenExecutionModal
    ]
  )

  return {
    triggerImmediateExecution,
    handleSaveCard,
    handleAssignDraggedMember,
    handleDispatchAgent,
    handleViewExecution,
    handleAddCardComment,
    handleDeleteCardComment,
    handleDispatchAgentFollowUp,
    ...secondary
  }
}
