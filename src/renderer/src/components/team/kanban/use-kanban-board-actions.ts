import { useCallback } from 'react'
import { toast } from 'sonner'
import type {
  TeamKanbanAssignee,
  TeamKanbanBoard,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import type { TeamMemberEntry } from '../../../../../shared/teamwork/team-members'
import type { TeamStartExecutionRequest } from '../../../../../shared/teamwork/team-ipc-types'
import type { AgentExecutionRecord } from '../../../../../shared/teamwork/team-workspace-types'
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
  configuredAgents: readonly TeamMemberEntry[]
  executionsByCard: Map<string, AgentExecutionRecord>
  startCardExecution: (request: TeamStartExecutionRequest) => Promise<AgentExecutionRecord | null>
  hydrateLatestForCard: (cardId: string) => Promise<AgentExecutionRecord | null>
  onOpenExecutionModal: (cardId: string) => void
  onChange: (updatedBoard: TeamKanbanBoard) => void
}

export function useKanbanBoardActions(options: Options) {
  const {
    board,
    projectId,
    projectPath,
    actorUserId,
    configuredAgents,
    executionsByCard,
    startCardExecution,
    hydrateLatestForCard,
    onOpenExecutionModal,
    onChange
  } = options

  const secondary = useKanbanBoardSecondaryActions(board, onChange)

  const triggerImmediateExecution = useCallback(
    async (card: TeamKanbanCard): Promise<void> => {
      if (card.assignee?.type !== 'agent') {
        return
      }
      const resolvedCard = resolveCardForConfiguredAgent(card, configuredAgents)
      const agentName = resolvedCard.assignee?.name ?? 'Agente IA'
      try {
        const record = await startCardExecution({
          card: resolvedCard,
          projectId,
          projectPath,
          actorUserId,
          sprintGoal: board.sprintGoal
        })
        if (record) {
          onOpenExecutionModal(resolvedCard.id)
          toast.info(`Agente ${agentName} ejecutando: ${resolvedCard.title}`)
          return
        }
        const { prompt } = buildAgentDispatchPrompt(resolvedCard)
        await copyTextToClipboard(prompt)
        toast.warning('Runtime de ejecución no disponible; prompt copiado al portapapeles')
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : `No se pudo iniciar la ejecución de ${agentName}`
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

  const handleSaveCard = useCallback(
    (savedCard: TeamKanbanCard) => {
      const prevCard = board.cards[savedCard.id]
      const willExecute = shouldTriggerExecutionOnSave(prevCard, savedCard, executionsByCard)
      const nextColumnId =
        willExecute && shouldMoveToInProgress(board, savedCard.columnId)
          ? 'col-in-progress'
          : savedCard.columnId
      const cardToSave: TeamKanbanCard =
        nextColumnId !== savedCard.columnId ? { ...savedCard, columnId: nextColumnId } : savedCard

      const { nextBoard, isNew } = upsertKanbanCard(board, cardToSave)
      onChange(nextBoard)
      toast.success(isNew ? 'Tarea creada' : 'Tarea actualizada')
      if (willExecute) {
        void triggerImmediateExecution(cardToSave)
      }
    },
    [board, executionsByCard, onChange, triggerImmediateExecution]
  )

  const handleAssignDraggedMember = useCallback(
    (cardId: string, dragged: TeamKanbanAssignee) => {
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
      onChange(finalBoard)
      toast.success(`Tarea asignada a ${dragged.name}`)
      if (updatedCard && dragged.type === 'agent') {
        void triggerImmediateExecution(updatedCard)
      }
    },
    [board, onChange, triggerImmediateExecution]
  )

  const handleDispatchAgent = useCallback(
    (card: TeamKanbanCard) => {
      let targetCard = card
      if (shouldMoveToInProgress(board, card.columnId)) {
        const moved = moveKanbanCardToColumn(board, card.id, 'col-in-progress')
        if (moved) {
          onChange(moved)
          targetCard = moved.cards[card.id] ?? card
        }
      }
      void triggerImmediateExecution(targetCard)
    },
    [board, onChange, triggerImmediateExecution]
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

  return {
    triggerImmediateExecution,
    handleSaveCard,
    handleAssignDraggedMember,
    handleDispatchAgent,
    handleViewExecution,
    ...secondary
  }
}
