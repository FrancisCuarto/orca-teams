import React, { useCallback, useMemo, useState } from 'react'
import { DndContext, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import { toast } from 'sonner'
import type {
  ExtendedTeamMember,
  TeamKanbanBoard,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'
import { useInstalledConfiguredAgents } from '../hooks/use-installed-configured-agents'
import { useTeamAgentExecutions } from '../hooks/use-team-agent-executions'
import { computeBoardSprintMetrics } from './team-kanban-board-mutations'
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
  peers?: CollaboratorPresence[]
  onActiveCardChange?: (cardId?: string) => void
  onChange: (updatedBoard: TeamKanbanBoard) => void
}

export function TeamKanbanBoardView({
  board,
  projectId,
  projectPath,
  currentUserId = 'usr-francis',
  currentUserName,
  humanMembers,
  peers,
  onActiveCardChange,
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
    rejectExecution,
    hydrateLatestForCard
  } = useTeamAgentExecutions()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const cardMap = useMemo(() => board.cards, [board.cards])
  const metrics = useMemo(() => computeBoardSprintMetrics(board), [board])
  const filters = useKanbanBoardFilters(board.columns, cardMap)

  const handleOpenExecutionModal = useCallback(
    (cardId: string | null) => {
      setExecutionModalCardId(cardId)
      onActiveCardChange?.(cardId ?? undefined)
    },
    [onActiveCardChange]
  )

  const actions = useKanbanBoardActions({
    board,
    projectId: projectId ?? board.projectId ?? 'proj-default',
    projectPath,
    actorUserId: currentUserId,
    configuredAgents,
    executionsByCard,
    startCardExecution,
    hydrateLatestForCard,
    onOpenExecutionModal: handleOpenExecutionModal,
    onChange
  })

  const dnd = useKanbanDragHandlers({
    board,
    onAssignDraggedMember: actions.handleAssignDraggedMember,
    onChange
  })

  const peersByCardId = useMemo(() => {
    const map = new Map<string, CollaboratorPresence[]>()
    if (!peers) {
      return map
    }
    for (const peer of peers) {
      if (peer.activeCardId) {
        const list = map.get(peer.activeCardId)
        if (list) {
          list.push(peer)
        } else {
          map.set(peer.activeCardId, [peer])
        }
      }
    }
    return map
  }, [peers])

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
      onActiveCardChange?.(undefined)
    },
    [board.columns, onActiveCardChange]
  )

  const handleEditCard = useCallback(
    (card: TeamKanbanCard) => {
      setEditingCard(card)
      setTargetColumnId(card.columnId)
      setIsModalOpen(true)
      onActiveCardChange?.(card.id)
    },
    [onActiveCardChange]
  )

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
        onDragStart={(event) => {
          dnd.handleDragStart(event)
          if (typeof event.active.id === 'string' && cardMap[event.active.id]) {
            onActiveCardChange?.(event.active.id)
          }
        }}
        onDragOver={dnd.handleDragOver}
        onDragEnd={(event) => {
          dnd.handleDragEnd(event)
          onActiveCardChange?.(undefined)
        }}
        onDragCancel={() => onActiveCardChange?.(undefined)}
      >
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <TeamKanbanColumnsViewport
            columns={board.columns}
            columnCardsMap={filters.columnCardsMap}
            cardStatuses={cardStatuses}
            peersByCardId={peersByCardId}
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
        onClose={() => {
          setIsModalOpen(false)
          onActiveCardChange?.(undefined)
        }}
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
            handleOpenExecutionModal(null)
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
    </div>
  )
}
