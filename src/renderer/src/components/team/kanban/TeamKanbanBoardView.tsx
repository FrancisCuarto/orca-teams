import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, closestCorners, useSensor, useSensors } from '@dnd-kit/core'
import { toast } from 'sonner'
import type {
  ExtendedTeamMember,
  ExternalTeamIssue,
  TeamCardComment,
  TeamKanbanBoard,
  TeamKanbanCard,
  TeamNote
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamFactoryConfigModal } from '../factory/TeamFactoryConfigModal'
import { TeamFactoryRunModal } from '../factory/TeamFactoryRunModal'
import {
  getTeamPermissions,
  type TeamPermissions
} from '../../../../../shared/teamwork/team-rbac-policy'
import { DEFAULT_TEAM_HUMAN_MEMBERS } from '../../../../../shared/teamwork/team-members'
import type { TeamRole } from '../../../../../shared/teamwork/team-workspace-types'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'
import { useInstalledConfiguredAgents } from '../hooks/use-installed-configured-agents'
import { useTeamAgentExecutions } from '../hooks/use-team-agent-executions'
import { useTeamFactory } from '../hooks/use-team-factory'
import { getTeamPreloadApi } from '../hooks/use-team-workspace-registry-actions'
import {
  applyReviewRequestToKanbanCard,
  computeBoardSprintMetrics,
  importExternalIssuesToBoard,
  moveKanbanCardToColumn
} from './team-kanban-board-mutations'
import { shouldMoveToInProgress } from './team-kanban-execution-helpers'
import { TeamAgentExecutionModal } from './TeamAgentExecutionModal'
import { TeamIssueImporterModal } from './TeamIssueImporterModal'
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
  teamId?: string
  projectId?: string
  projectPath?: string | null
  currentUserId?: string
  currentUserName?: string
  userRole?: TeamRole
  permissions?: TeamPermissions
  humanMembers?: ExtendedTeamMember[]
  onAddCardComment?: (comment: TeamCardComment) => void
  onDeleteCardComment?: (commentId: string) => void
  peers?: CollaboratorPresence[]
  onActiveCardChange?: (cardId?: string) => void
  availableNotes?: TeamNote[]
  selectedCardId?: string | null
  onSelectedCardIdChange?: (cardId: string | null) => void
  onChange: (updatedBoard: TeamKanbanBoard) => void
}

export function TeamKanbanBoardView({
  board,
  teamId = 'team-local',
  projectId,
  projectPath,
  currentUserId = 'usr-francis',
  currentUserName,
  userRole = 'owner',
  permissions,
  humanMembers,
  onAddCardComment,
  onDeleteCardComment,
  peers,
  onActiveCardChange,
  availableNotes,
  selectedCardId = null,
  onSelectedCardIdChange,
  onChange
}: Props): React.JSX.Element {
  const resolvedPermissions = permissions ?? getTeamPermissions(userRole)
  const { canEditBoard, canDispatchAgents, canApproveExecutions } = resolvedPermissions
  const isReadOnly = !canEditBoard

  const [editingCard, setEditingCard] = useState<TeamKanbanCard | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
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
    createReviewRequest,
    refreshReviewRequest,
    rejectExecution,
    getExecutionDiff,
    requestExecutionChanges,
    hydrateLatestForCard
  } = useTeamAgentExecutions({ availableNotes })
  const factory = useTeamFactory(resolvedProjectId)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const cardMap = useMemo(() => board.cards, [board.cards])
  const metrics = useMemo(() => computeBoardSprintMetrics(board), [board])

  const pendingApprovalCardIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [cardId, record] of executionsByCard.entries()) {
      if (record.status === 'waiting_for_input') {
        ids.add(cardId)
      }
    }
    return ids
  }, [executionsByCard])

  const allBoardMembers = useMemo(() => {
    const baseHumans =
      humanMembers && humanMembers.length > 0 ? humanMembers : DEFAULT_TEAM_HUMAN_MEMBERS
    const custom = board.customMembers ?? []
    return Array.from(
      new Map([...baseHumans, ...configuredAgents, ...custom].map((m) => [m.id, m])).values()
    )
  }, [humanMembers, configuredAgents, board.customMembers])

  const filters = useKanbanBoardFilters({
    columns: board.columns,
    cardMap,
    currentUserId,
    currentUserName,
    pendingApprovalCardIds,
    members: allBoardMembers
  })

  const handleOpenExecutionModal = useCallback(
    (cardId: string | null) => {
      setExecutionModalCardId(cardId)
      onActiveCardChange?.(cardId ?? undefined)
    },
    [onActiveCardChange]
  )

  const actions = useKanbanBoardActions({
    board,
    projectId: resolvedProjectId,
    projectPath,
    actorUserId: currentUserId,
    canEditBoard,
    canDispatchAgents,
    configuredAgents,
    availableNotes,
    executionsByCard,
    startCardExecution,
    hydrateLatestForCard,
    onOpenExecutionModal: handleOpenExecutionModal,
    onCrdtAddComment: onAddCardComment,
    onCrdtDeleteComment: onDeleteCardComment,
    onChange
  })

  const dnd = useKanbanDragHandlers({
    board,
    disabled: isReadOnly,
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
  const activeEditingCard = editingCard ? (cardMap[editingCard.id] ?? editingCard) : null
  const executionModalCard = executionModalCardId ? (cardMap[executionModalCardId] ?? null) : null
  const activeExecution = executionModalCardId
    ? (executionsByCard.get(executionModalCardId) ?? null)
    : null
  const factoryModalCard = factoryModalCardId ? (cardMap[factoryModalCardId] ?? null) : null
  const activeFactoryRun = factoryModalCardId
    ? (factory.factoryRunsByCard.get(factoryModalCardId) ?? null)
    : null

  const externalEditingCard = selectedCardId ? (cardMap[selectedCardId] ?? null) : null
  const effectiveIsModalOpen = isModalOpen || Boolean(externalEditingCard)
  const effectiveEditingCard = isModalOpen ? activeEditingCard : externalEditingCard
  const effectiveTargetColumnId = isModalOpen ? targetColumnId : externalEditingCard?.columnId

  const handleOpenNewCard = useCallback(
    (colId?: string) => {
      if (!canEditBoard) {
        return
      }
      onSelectedCardIdChange?.(null)
      setEditingCard(null)
      setTargetColumnId(colId ?? board.columns[0]?.id)
      setIsModalOpen(true)
      onActiveCardChange?.(undefined)
    },
    [board.columns, canEditBoard, onActiveCardChange, onSelectedCardIdChange]
  )

  const handleEditCard = useCallback(
    (card: TeamKanbanCard) => {
      onSelectedCardIdChange?.(null)
      setEditingCard(card)
      setTargetColumnId(card.columnId)
      setIsModalOpen(true)
      onActiveCardChange?.(card.id)
    },
    [onActiveCardChange, onSelectedCardIdChange]
  )

  const handleCloseCardModal = useCallback(() => {
    setIsModalOpen(false)
    onSelectedCardIdChange?.(null)
    onActiveCardChange?.(undefined)
  }, [onActiveCardChange, onSelectedCardIdChange])

  const handleAddColumn = useCallback(
    (title: string): void => {
      if (!canEditBoard) {
        return
      }
      const newCol = { id: `col-${Date.now()}`, title, cardIds: [] }
      onChange({ ...board, columns: [...board.columns, newCol], updatedAt: Date.now() })
      toast.success(`Columna "${newCol.title}" creada`)
    },
    [board, canEditBoard, onChange]
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

  const handleImportExternalIssues = useCallback(
    (selectedIssues: ExternalTeamIssue[], destinationColumnId: string): void => {
      if (!canEditBoard) {
        return
      }
      const { nextBoard, createdCards } = importExternalIssuesToBoard(
        board,
        selectedIssues,
        destinationColumnId
      )
      if (createdCards.length === 0) {
        toast.info('Todos los issues seleccionados ya existen en el tablero')
        return
      }
      onChange(nextBoard)
      const provider = selectedIssues[0]?.provider === 'linear' ? 'Linear' : 'GitHub'
      toast.success(
        `${createdCards.length} ${createdCards.length === 1 ? 'issue importado' : 'issues importados'} desde ${provider}`
      )

      const teamApi = getTeamPreloadApi()
      if (teamApi?.recordActivity) {
        void teamApi
          .recordActivity({
            teamId,
            projectId: resolvedProjectId,
            actorId: currentUserId,
            actorName: currentUserName ?? currentUserId,
            actorType: 'human',
            action: 'issues.imported',
            targetType: 'card',
            summary: `Importó ${createdCards.length} ${createdCards.length === 1 ? 'issue' : 'issues'} desde ${provider}`,
            metadata: {
              provider: selectedIssues[0]?.provider,
              count: createdCards.length,
              keys: createdCards
                .map((card) => card.externalIssueRef?.key)
                .filter((key): key is string => typeof key === 'string')
            }
          })
          .catch(() => undefined)
      }
    },
    [board, canEditBoard, currentUserId, currentUserName, onChange, resolvedProjectId, teamId]
  )

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden bg-background">
      <TeamKanbanToolbar
        filters={filters.filters}
        statusFilter={filters.statusFilter}
        myPendingCount={filters.myPendingCount}
        availableLabels={filters.availableLabels}
        assigneeOptions={filters.assigneeOptions}
        filteredCount={filters.filteredCards.length}
        filteredPoints={filters.filteredPoints}
        activeFactoryCount={factory.activeRunCount}
        waitingHumanCount={factory.waitingHumanCount}
        canCreateTask={canEditBoard}
        onFiltersChange={filters.setFilters}
        onStatusFilterChange={filters.setStatusFilter}
        onClearFilters={filters.handleClearFilters}
        onOpenFactoryConfig={() => setIsFactoryConfigOpen(true)}
        onCreateTask={() => handleOpenNewCard()}
        onOpenImportIssues={canEditBoard ? () => setIsImportModalOpen(true) : undefined}
      />
      <TeamKanbanSprintHeader
        sprintGoal={board.sprintGoal}
        metrics={metrics}
        canEdit={canEditBoard}
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
            factoryRunsByCard={factory.factoryRunsByCard}
            isReadOnly={isReadOnly}
            canDispatchAgents={canDispatchAgents}
            peersByCardId={peersByCardId}
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
            isReadOnly={isReadOnly}
            onRefreshAgents={() => void refreshAgents()}
            onFilterChange={filters.setSelectedFilterMember}
            onAddCustomMember={canEditBoard ? actions.handleAddCustomMember : undefined}
          />
        </div>
        <TeamKanbanDragOverlay activeCard={activeCard} activeAssignee={dnd.activeAssignee} />
      </DndContext>

      <TeamKanbanCardModal
        isOpen={effectiveIsModalOpen}
        card={effectiveEditingCard}
        columns={board.columns}
        defaultColumnId={effectiveTargetColumnId}
        projectId={resolvedProjectId}
        currentUserId={currentUserId}
        currentUserName={currentUserName ?? 'Equipo Local'}
        configuredAgents={configuredAgents}
        humanMembers={humanMembers}
        availableMembers={board.customMembers}
        readOnly={isReadOnly}
        canDispatchAgents={canDispatchAgents}
        availableNotes={availableNotes}
        onClose={handleCloseCardModal}
        onSave={actions.handleSaveCard}
        onDelete={actions.handleDeleteCard}
        onDispatchAgent={actions.handleDispatchAgent}
        onAddCardComment={actions.handleAddCardComment}
        onDeleteCardComment={actions.handleDeleteCardComment}
        onDispatchAgentFollowUp={(targetCard, mention, comment) =>
          void actions.handleDispatchAgentFollowUp(targetCard, mention, comment)
        }
      />
      <TeamIssueImporterModal
        isOpen={isImportModalOpen}
        columns={board.columns}
        defaultColumnId={board.columns[0]?.id}
        existingCards={board.cards}
        projectPath={projectPath}
        onClose={() => setIsImportModalOpen(false)}
        onImport={handleImportExternalIssues}
      />
      <TeamAgentExecutionModal
        open={Boolean(executionModalCardId && activeExecution)}
        cardTitle={executionModalCard?.title ?? 'Tarea'}
        execution={activeExecution}
        canApproveExecutions={canApproveExecutions}
        canDispatchAgents={canDispatchAgents}
        onOpenChange={(open) => {
          if (!open) {
            handleOpenExecutionModal(null)
          }
        }}
        onCancel={(executionId) => {
          if (canDispatchAgents) {
            void cancelExecution(executionId)
          }
        }}
        onApprove={(executionId, mergeToBase) => {
          if (canApproveExecutions) {
            void approveExecution({
              executionId,
              mergeToBase,
              actorUserId: currentUserId,
              actorName: currentUserName
            })
          }
        }}
        onApproveAndCreateReview={canApproveExecutions ? handleApproveAndCreateReview : undefined}
        onCreateReviewRequest={canApproveExecutions ? handleCreateReviewRequest : undefined}
        onRefreshReviewRequest={handleRefreshReviewRequest}
        onReject={(executionId, discardWorktree) => {
          if (canApproveExecutions) {
            void rejectExecution({
              executionId,
              discardWorktree,
              actorUserId: currentUserId,
              actorName: currentUserName
            })
          }
        }}
        onLoadDiff={getExecutionDiff}
        onRequestChanges={
          canDispatchAgents
            ? async (executionId, feedback) => {
                try {
                  const updated = await requestExecutionChanges({
                    executionId,
                    feedback,
                    actorUserId: currentUserId,
                    actorName: currentUserName
                  })
                  if (updated) {
                    toast.info('Agente re-lanzado con tus correcciones')
                  }
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : 'No se pudo solicitar corrección al agente'
                  )
                  throw err
                }
              }
            : undefined
        }
        onRerun={
          executionModalCard && canDispatchAgents
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
