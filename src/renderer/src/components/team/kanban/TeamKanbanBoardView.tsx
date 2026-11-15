import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import { toast } from 'sonner'
import type {
  ExtendedTeamMember,
  TeamKanbanBoard,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamFactoryConfigModal } from '../factory/TeamFactoryConfigModal'
import { TeamFactoryRunModal } from '../factory/TeamFactoryRunModal'
import { useInstalledConfiguredAgents } from '../hooks/use-installed-configured-agents'
import { useTeamAgentExecutions } from '../hooks/use-team-agent-executions'
import { useTeamFactory } from '../hooks/use-team-factory'
import { computeBoardSprintMetrics, moveKanbanCardToColumn } from './team-kanban-board-mutations'
import { shouldMoveToInProgress } from './team-kanban-execution-helpers'
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
  const [factoryModalCardId, setFactoryModalCardId] = useState<string | null>(null)
  const [isFactoryConfigOpen, setIsFactoryConfigOpen] = useState(false)

  const resolvedProjectId = projectId ?? board.projectId ?? 'proj-default'

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
    rejectExecution,
    hydrateLatestForCard
  } = useTeamAgentExecutions()
  const factory = useTeamFactory(resolvedProjectId)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const cardMap = useMemo(() => board.cards, [board.cards])
  const metrics = useMemo(() => computeBoardSprintMetrics(board), [board])
  const filters = useKanbanBoardFilters(board.columns, cardMap)

  const actions = useKanbanBoardActions({
    board,
    projectId: resolvedProjectId,
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

  const seenFactoryStatusesRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    let nextBoard = board
    let changed = false
    for (const run of factory.factoryRunsByCard.values()) {
      const prevStatus = seenFactoryStatusesRef.current.get(run.id)
      if (prevStatus === run.status) {
        continue
      }
      seenFactoryStatusesRef.current.set(run.id, run.status)
      if (!prevStatus) {
        continue
      }
      const card = nextBoard.cards[run.cardId]
      if (!card) {
        continue
      }
      let targetColId: string | null = null
      if (run.status === 'waiting_human' && nextBoard.columns.some((c) => c.id === 'col-review')) {
        targetColId = 'col-review'
      } else if (run.status === 'completed' && nextBoard.columns.some((c) => c.id === 'col-done')) {
        targetColId = 'col-done'
      }
      if (targetColId && card.columnId !== targetColId) {
        const moved = moveKanbanCardToColumn(nextBoard, card.id, targetColId)
        if (moved) {
          nextBoard = moved
          changed = true
        }
      }
    }
    if (changed) {
      onChange(nextBoard)
    }
  }, [board, factory.factoryRunsByCard, onChange])

  const handleStartFactory = useCallback(
    async (card: TeamKanbanCard) => {
      if (shouldMoveToInProgress(board, card.columnId)) {
        const moved = moveKanbanCardToColumn(board, card.id, 'col-in-progress')
        if (moved) {
          onChange(moved)
        }
      }
      try {
        const run = await factory.startFactoryRun({
          card,
          projectId: resolvedProjectId,
          projectPath,
          actorUserId: currentUserId,
          sprintGoal: board.sprintGoal,
          configOverride: factory.factoryConfig
        })
        if (run) {
          seenFactoryStatusesRef.current.set(run.id, run.status)
          setFactoryModalCardId(card.id)
          toast.info(`Software Factory iniciada para "${card.title}"`)
        } else {
          toast.warning('Runtime de Software Factory no disponible en este entorno')
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo iniciar Software Factory')
      }
    },
    [board, currentUserId, factory, onChange, projectPath, resolvedProjectId]
  )

  const handleViewFactory = useCallback(
    (card: TeamKanbanCard) => {
      setFactoryModalCardId(card.id)
      if (!factory.factoryRunsByCard.has(card.id)) {
        void factory.hydrateFactoryRunForCard(card.id)
      }
    },
    [factory]
  )

  const activeCard = dnd.activeCardId ? (cardMap[dnd.activeCardId] ?? null) : null
  const executionModalCard = executionModalCardId ? (cardMap[executionModalCardId] ?? null) : null
  const activeExecution = executionModalCardId
    ? (executionsByCard.get(executionModalCardId) ?? null)
    : null
  const factoryModalCard = factoryModalCardId ? (cardMap[factoryModalCardId] ?? null) : null
  const activeFactoryRun = factoryModalCardId
    ? (factory.factoryRunsByCard.get(factoryModalCardId) ?? null)
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

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden bg-background">
      <TeamKanbanToolbar
        searchQuery={filters.searchQuery}
        selectedPriority={filters.selectedPriority}
        selectedFilterMember={filters.selectedFilterMember}
        statusFilter={filters.statusFilter}
        filteredCount={filters.filteredCards.length}
        filteredPoints={filters.filteredPoints}
        activeFactoryCount={factory.activeRunCount}
        waitingHumanCount={factory.waitingHumanCount}
        onSearchChange={filters.setSearchQuery}
        onPriorityChange={filters.setSelectedPriority}
        onStatusFilterChange={filters.setStatusFilter}
        onClearFilters={filters.handleClearFilters}
        onOpenFactoryConfig={() => setIsFactoryConfigOpen(true)}
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
            factoryRunsByCard={factory.factoryRunsByCard}
            onAddCard={handleOpenNewCard}
            onDeleteColumn={actions.handleDeleteColumn}
            onEditCard={handleEditCard}
            onDispatchAgent={actions.handleDispatchAgent}
            onViewExecution={actions.handleViewExecution}
            onStartFactory={(card) => void handleStartFactory(card)}
            onViewFactory={handleViewFactory}
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
      <TeamFactoryConfigModal
        open={isFactoryConfigOpen}
        config={factory.factoryConfig}
        configuredAgents={configuredAgents}
        onOpenChange={setIsFactoryConfigOpen}
        onSave={factory.saveFactoryConfig}
      />
      <TeamFactoryRunModal
        open={Boolean(factoryModalCardId && activeFactoryRun)}
        run={activeFactoryRun}
        actorUserId={currentUserId}
        onOpenChange={(open) => {
          if (!open) {
            setFactoryModalCardId(null)
          }
        }}
        onCancel={(runId) => void factory.cancelFactoryRun(runId)}
        onResolveHumanGate={(runId, decision, comment) =>
          void factory.resolveHumanGate({
            runId,
            decision,
            actorUserId: currentUserId,
            comment
          })
        }
        onRerun={factoryModalCard ? () => void handleStartFactory(factoryModalCard) : undefined}
      />
    </div>
  )
}
