import React, { useCallback, useMemo, useState } from 'react'
import { DndContext, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import { toast } from 'sonner'
import type {
  ExtendedTeamMember,
  TeamKanbanBoard,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import { useInstalledConfiguredAgents } from '../hooks/use-installed-configured-agents'
import { useTeamAgentExecutions } from '../hooks/use-team-agent-executions'
import {
  applyReviewRequestToKanbanCard,
  computeBoardSprintMetrics
} from './team-kanban-board-mutations'
import { TeamAgentExecutionModal } from './TeamAgentExecutionModal'
import { TeamKanbanCardModal } from './TeamKanbanCardModal'
import { TeamKanbanColumnsViewport } from './TeamKanbanColumnsViewport'
import { TeamKanbanDragOverlay } from './TeamKanbanDragOverlay'
import { TeamKanbanSprintHeader } from './TeamKanbanSprintHeader'
import { TeamKanbanToolbar } from './TeamKanbanToolbar'
import { TeamMembersSidebar } from './TeamMembersSidebar'
import { useKanbanBoardActions } from './use-kanban-board-actions'
import { useKanbanBoardFilters } from './use-kanban-board-filters'
import { useKanbanDragHandlers } from './use-kanban-drag-handlers'

type Props = {
  board: TeamKanbanBoard
  projectId?: string
  projectPath?: string | null
  currentUserId?: string
  currentUserName?: string
  humanMembers?: ExtendedTeamMember[]
  onChange: (updatedBoard: TeamKanbanBoard) => void
}

export function TeamKanbanBoardView({
  board,
  projectId,
  projectPath,
  currentUserId = 'usr-francis',
  currentUserName,
  humanMembers,
  onChange
}: Props): React.JSX.Element {
  const [editingCard, setEditingCard] = useState<TeamKanbanCard | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [targetColumnId, setTargetColumnId] = useState<string | undefined>(undefined)
  const [executionModalCardId, setExecutionModalCardId] = useState<string | null>(null)

  const {
    memberEntries: configuredAgents,
    loading: agentsLoading,
    refreshAgents
  } = useInstalledConfiguredAgents()
  const {
    executionsByCard,
    cardStatuses,
    startCardExecution,
    cancelExecution,
    approveExecution,
    createReviewRequest,
    refreshReviewRequest,
    rejectExecution,
    hydrateLatestForCard
  } = useTeamAgentExecutions()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const cardMap = useMemo(() => board.cards, [board.cards])
  const metrics = useMemo(() => computeBoardSprintMetrics(board), [board])
  const filters = useKanbanBoardFilters(board.columns, cardMap)

  const actions = useKanbanBoardActions({
    board,
    projectId: projectId ?? board.projectId ?? 'proj-default',
    projectPath,
    actorUserId: currentUserId,
    configuredAgents,
    executionsByCard,
    startCardExecution,
    hydrateLatestForCard,
    onOpenExecutionModal: setExecutionModalCardId,
    onChange
  })

  const dnd = useKanbanDragHandlers({
    board,
    onAssignDraggedMember: actions.handleAssignDraggedMember,
    onChange
  })

  const activeCard = dnd.activeCardId ? (cardMap[dnd.activeCardId] ?? null) : null
  const executionModalCard = executionModalCardId ? (cardMap[executionModalCardId] ?? null) : null
  const activeExecution = executionModalCardId
    ? (executionsByCard.get(executionModalCardId) ?? null)
    : null

  const handleOpenNewCard = useCallback(
    (colId?: string) => {
      setEditingCard(null)
      setTargetColumnId(colId ?? board.columns[0]?.id)
      setIsModalOpen(true)
    },
    [board.columns]
  )

  const handleEditCard = useCallback((card: TeamKanbanCard) => {
    setEditingCard(card)
    setTargetColumnId(card.columnId)
    setIsModalOpen(true)
  }, [])

  const handleAddColumn = useCallback(
    (title: string): void => {
      const newCol = { id: `col-${Date.now()}`, title, cardIds: [] }
      onChange({ ...board, columns: [...board.columns, newCol], updatedAt: Date.now() })
      toast.success(`Columna "${newCol.title}" creada`)
    },
    [board, onChange]
  )

  const syncReviewResultToBoard = useCallback(
    (
      updated: Awaited<ReturnType<typeof approveExecution>>,
      mode: 'created' | 'refreshed'
    ): void => {
      if (!updated) {
        return
      }
      if (updated.error) {
        toast.error(updated.error)
        return
      }
      if (!updated.reviewRequest) {
        return
      }
      const { nextBoard, movedToDone } = applyReviewRequestToKanbanCard(
        board,
        updated.taskId,
        updated.reviewRequest
      )
      onChange(nextBoard)
      const label = updated.reviewRequest.provider === 'gitlab' ? 'MR' : 'PR'
      if (mode === 'created') {
        toast.success(`${label} #${updated.reviewRequest.number} creado`)
      } else if (movedToDone) {
        toast.success(
          `${label} #${updated.reviewRequest.number} fusionado. Tarjeta movida a Completado.`
        )
      } else {
        toast.info(
          `Estado de ${label} #${updated.reviewRequest.number}: ${updated.reviewRequest.state}`
        )
      }
    },
    [board, onChange]
  )

  const handleApproveAndCreateReview = useCallback(
    async (executionId: string): Promise<void> => {
      const updated = await approveExecution({
        executionId,
        mergeToBase: false,
        createPullRequestOnApprove: true,
        projectPath,
        title: executionModalCard?.title,
        actorUserId: currentUserId,
        actorName: currentUserName
      })
      syncReviewResultToBoard(updated, 'created')
    },
    [
      approveExecution,
      projectPath,
      executionModalCard?.title,
      currentUserId,
      currentUserName,
      syncReviewResultToBoard
    ]
  )

  const handleCreateReviewRequest = useCallback(
    async (executionId: string): Promise<void> => {
      const updated = await createReviewRequest({
        executionId,
        projectPath,
        title: executionModalCard?.title,
        actorUserId: currentUserId,
        actorName: currentUserName
      })
      syncReviewResultToBoard(updated, 'created')
    },
    [
      createReviewRequest,
      projectPath,
      executionModalCard?.title,
      currentUserId,
      currentUserName,
      syncReviewResultToBoard
    ]
  )

  const handleRefreshReviewRequest = useCallback(
    async (executionId: string): Promise<void> => {
      const updated = await refreshReviewRequest({
        executionId,
        projectPath,
        actorUserId: currentUserId,
        actorName: currentUserName
      })
      syncReviewResultToBoard(updated, 'refreshed')
    },
    [refreshReviewRequest, projectPath, currentUserId, currentUserName, syncReviewResultToBoard]
  )

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden bg-background">
      <TeamKanbanToolbar
        searchQuery={filters.searchQuery}
        selectedPriority={filters.selectedPriority}
        selectedFilterMember={filters.selectedFilterMember}
        statusFilter={filters.statusFilter}
        filteredCount={filters.filteredCards.length}
        filteredPoints={filters.filteredPoints}
        onSearchChange={filters.setSearchQuery}
        onPriorityChange={filters.setSelectedPriority}
        onStatusFilterChange={filters.setStatusFilter}
        onClearFilters={filters.handleClearFilters}
        onCreateTask={() => handleOpenNewCard()}
      />
      <TeamKanbanSprintHeader
        sprintGoal={board.sprintGoal}
        metrics={metrics}
        onSaveSprintGoal={actions.handleSaveSprintGoal}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={dnd.handleDragStart}
        onDragOver={dnd.handleDragOver}
        onDragEnd={dnd.handleDragEnd}
      >
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <TeamKanbanColumnsViewport
            columns={board.columns}
            columnCardsMap={filters.columnCardsMap}
            cardStatuses={cardStatuses}
            onAddCard={handleOpenNewCard}
            onDeleteColumn={actions.handleDeleteColumn}
            onEditCard={handleEditCard}
            onDispatchAgent={actions.handleDispatchAgent}
            onViewExecution={actions.handleViewExecution}
            onToggleChecklistItem={actions.handleToggleChecklistItem}
            onQuickMoveColumn={actions.handleQuickMoveColumn}
            onUpdateColumnWipLimit={actions.handleUpdateColumnWipLimit}
            onAddColumn={handleAddColumn}
          />
          <TeamMembersSidebar
            selectedFilterMember={filters.selectedFilterMember}
            workloadByAssignee={metrics.workloadByAssignee}
            installedAgents={configuredAgents}
            humanMembers={humanMembers}
            customMembers={board.customMembers}
            agentsLoading={agentsLoading}
            onRefreshAgents={() => void refreshAgents()}
            onFilterChange={filters.setSelectedFilterMember}
            onAddCustomMember={actions.handleAddCustomMember}
          />
        </div>
        <TeamKanbanDragOverlay activeCard={activeCard} activeAssignee={dnd.activeAssignee} />
      </DndContext>

      <TeamKanbanCardModal
        isOpen={isModalOpen}
        card={editingCard}
        columns={board.columns}
        defaultColumnId={targetColumnId}
        configuredAgents={configuredAgents}
        humanMembers={humanMembers}
        availableMembers={board.customMembers}
        onClose={() => setIsModalOpen(false)}
        onSave={actions.handleSaveCard}
        onDelete={actions.handleDeleteCard}
        onDispatchAgent={actions.handleDispatchAgent}
      />
      <TeamAgentExecutionModal
        open={Boolean(executionModalCardId && activeExecution)}
        cardTitle={executionModalCard?.title ?? 'Tarea'}
        execution={activeExecution}
        onOpenChange={(open) => {
          if (!open) {
            setExecutionModalCardId(null)
          }
        }}
        onCancel={(executionId) => void cancelExecution(executionId)}
        onApprove={(executionId, mergeToBase) =>
          void approveExecution({
            executionId,
            mergeToBase,
            actorUserId: currentUserId,
            actorName: currentUserName
          })
        }
        onApproveAndCreateReview={handleApproveAndCreateReview}
        onCreateReviewRequest={handleCreateReviewRequest}
        onRefreshReviewRequest={handleRefreshReviewRequest}
        onReject={(executionId, discardWorktree) =>
          void rejectExecution({
            executionId,
            discardWorktree,
            actorUserId: currentUserId,
            actorName: currentUserName
          })
        }
        onRerun={
          executionModalCard
            ? () => void actions.triggerImmediateExecution(executionModalCard)
            : undefined
        }
      />
    </div>
  )
}
