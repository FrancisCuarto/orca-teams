import React, { useState, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { Plus, Sparkles, Zap } from 'lucide-react'
import { toast } from 'sonner'
import type {
  ExtendedTeamMember,
  TeamKanbanAssignee,
  TeamKanbanBoard,
  TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { TeamKanbanColumnView } from './TeamKanbanColumnView'
import { TeamKanbanCardItem } from './TeamKanbanCardItem'
import { TeamKanbanCardModal } from './TeamKanbanCardModal'
import { TeamKanbanToolbar } from './TeamKanbanToolbar'
import { TeamMembersSidebar } from './TeamMembersSidebar'
import { TeamKanbanSprintHeader } from './TeamKanbanSprintHeader'
import {
  assignMemberToKanbanCard,
  computeBoardSprintMetrics,
  deleteKanbanCard,
  moveKanbanCardAcrossColumns,
  moveKanbanCardToColumn,
  reorderKanbanCardInColumn,
  toggleKanbanCardChecklistItem,
  upsertKanbanCard
} from './team-kanban-board-mutations'
import { buildAgentDispatchPrompt, isDraggableAssigneeData } from './team-kanban-agent-dispatch'
import { useAppStore } from '@/store/index'

type Props = {
  board: TeamKanbanBoard
  onChange: (updatedBoard: TeamKanbanBoard) => void
}

export function TeamKanbanBoardView({ board, onChange }: Props): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPriority, setSelectedPriority] = useState<string>('all')
  const [selectedFilterMember, setSelectedFilterMember] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'blocked' | 'agents'>('all')

  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [activeAssignee, setActiveAssignee] = useState<TeamKanbanAssignee | null>(null)
  const [editingCard, setEditingCard] = useState<TeamKanbanCard | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [targetColumnId, setTargetColumnId] = useState<string | undefined>(undefined)
  const [isAddingColumn, setIsAddingColumn] = useState(false)
  const [newColumnTitle, setNewColumnTitle] = useState('')

  const openModal = useAppStore((s) => s.openModal)
  const activeRepoId = useAppStore((s) => s.activeRepoId)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const cardMap = useMemo(() => board.cards, [board.cards])
  const metrics = useMemo(() => computeBoardSprintMetrics(board), [board])

  const filteredCards = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return Object.values(cardMap).filter((card) => {
      const matchQ =
        q === '' ||
        card.title.toLowerCase().includes(q) ||
        card.description?.toLowerCase().includes(q) ||
        card.labels?.some((l) => l.toLowerCase().includes(q))
      const matchP = selectedPriority === 'all' || card.priority === selectedPriority
      const matchM = !selectedFilterMember || card.assignee?.name === selectedFilterMember
      const matchS =
        statusFilter === 'all' ||
        (statusFilter === 'blocked' && Boolean(card.blockedReason?.trim())) ||
        (statusFilter === 'agents' && card.assignee?.type === 'agent')
      return matchQ && matchP && matchM && matchS
    })
  }, [cardMap, searchQuery, selectedPriority, selectedFilterMember, statusFilter])

  const filteredCardIds = useMemo(() => new Set(filteredCards.map((c) => c.id)), [filteredCards])
  const filteredPoints = useMemo(
    () => filteredCards.reduce((acc, c) => acc + (c.estimatePoints ?? 0), 0),
    [filteredCards]
  )

  const columnCardsMap = useMemo(() => {
    const map = new Map<string, TeamKanbanCard[]>()
    for (const column of board.columns) {
      const cards = column.cardIds
        .filter((id) => filteredCardIds.has(id))
        .flatMap((id) => {
          const c = cardMap[id]
          return c ? [c] : []
        })
      map.set(column.id, cards)
    }
    return map
  }, [board.columns, filteredCardIds, cardMap])

  const activeCard = activeCardId ? cardMap[activeCardId] : null

  const handleClearFilters = useCallback(() => {
    setSearchQuery('')
    setSelectedPriority('all')
    setSelectedFilterMember(null)
    setStatusFilter('all')
  }, [])

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

  const handleSaveCard = useCallback(
    (savedCard: TeamKanbanCard) => {
      const { nextBoard, isNew } = upsertKanbanCard(board, savedCard)
      onChange(nextBoard)
      toast.success(isNew ? 'Tarea creada' : 'Tarea actualizada')
    },
    [board, onChange]
  )

  const handleDeleteCard = useCallback(
    (cardId: string) => {
      onChange(deleteKanbanCard(board, cardId))
      toast.success('Tarea eliminada')
    },
    [board, onChange]
  )

  const handleDeleteColumn = useCallback(
    (colId: string) => {
      const target = board.columns.find((c) => c.id === colId)
      if (board.columns.length <= 1 || !target || target.cardIds.length > 0) {
        return
      }
      onChange({
        ...board,
        columns: board.columns.filter((c) => c.id !== colId),
        updatedAt: Date.now()
      })
      toast.success(`Columna "${target.title}" eliminada`)
    },
    [board, onChange]
  )

  const handleToggleChecklistItem = useCallback(
    (cardId: string, itemId: string) => {
      const nextBoard = toggleKanbanCardChecklistItem(board, cardId, itemId)
      if (nextBoard) {
        onChange(nextBoard)
      }
    },
    [board, onChange]
  )

  const handleQuickMoveColumn = useCallback(
    (cardId: string, targetColId: string) => {
      const nextBoard = moveKanbanCardToColumn(board, cardId, targetColId)
      if (nextBoard) {
        onChange(nextBoard)
        toast.success('Tarjeta movida')
      }
    },
    [board, onChange]
  )

  const handleUpdateColumnWipLimit = useCallback(
    (columnId: string, wipLimit?: number) => {
      onChange({
        ...board,
        columns: board.columns.map((c) => (c.id === columnId ? { ...c, wipLimit } : c)),
        updatedAt: Date.now()
      })
    },
    [board, onChange]
  )

  const handleAddCustomMember = useCallback(
    (member: ExtendedTeamMember) => {
      onChange({
        ...board,
        customMembers: [...(board.customMembers ?? []), member],
        updatedAt: Date.now()
      })
    },
    [board, onChange]
  )

  const handleSaveSprintGoal = useCallback(
    (goal?: string) => {
      onChange({ ...board, sprintGoal: goal, updatedAt: Date.now() })
      toast.success('Objetivo del sprint actualizado')
    },
    [board, onChange]
  )

  const handleDispatchAgent = useCallback(
    (card: TeamKanbanCard) => {
      const { prompt, branchName, agentName } = buildAgentDispatchPrompt(card)
      void navigator.clipboard.writeText(prompt)
      try {
        openModal('new-workspace-composer', {
          telemetrySource: 'shortcut',
          ...(activeRepoId ? { initialRepoId: activeRepoId } : {}),
          prefilledName: branchName
        })
      } catch {
        // Fallback
      }
      toast.success(`Prompt despachado para ${agentName}`, {
        description: `Copiado al portapapeles · Worktree: ${branchName}`,
        icon: <Zap className="size-4 text-git-graph-lane-1" />
      })
    },
    [openModal, activeRepoId]
  )

  const handleDragStart = useCallback((event: DragStartEvent): void => {
    const data = event.active.data.current
    if (isDraggableAssigneeData(data)) {
      setActiveAssignee(data.assignee)
      setActiveCardId(null)
    } else {
      setActiveCardId(String(event.active.id))
      setActiveAssignee(null)
    }
  }, [])

  const handleDragOver = useCallback(
    (event: DragOverEvent): void => {
      if (activeAssignee || !event.over) {
        return
      }
      const nextBoard = moveKanbanCardAcrossColumns(
        board,
        String(event.active.id),
        String(event.over.id)
      )
      if (nextBoard) {
        onChange(nextBoard)
      }
    },
    [activeAssignee, board, onChange]
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const { active, over } = event
      const dragged = activeAssignee
      setActiveCardId(null)
      setActiveAssignee(null)
      if (!over) {
        return
      }
      const overId = String(over.id)
      if (dragged) {
        const assigned = assignMemberToKanbanCard(board, overId, dragged)
        if (assigned) {
          onChange(assigned.nextBoard)
          toast.success(`Tarea asignada a ${dragged.name}`)
        }
        return
      }
      const reordered = reorderKanbanCardInColumn(board, String(active.id), overId)
      if (reordered) {
        onChange(reordered)
      }
    },
    [activeAssignee, board, onChange]
  )

  const handleAddColumn = useCallback((): void => {
    if (!newColumnTitle.trim()) {
      return
    }
    const newCol = { id: `col-${Date.now()}`, title: newColumnTitle.trim(), cardIds: [] }
    onChange({ ...board, columns: [...board.columns, newCol], updatedAt: Date.now() })
    setNewColumnTitle('')
    setIsAddingColumn(false)
    toast.success(`Columna "${newCol.title}" creada`)
  }, [board, newColumnTitle, onChange])

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden bg-background">
      <TeamKanbanToolbar
        searchQuery={searchQuery}
        selectedPriority={selectedPriority}
        selectedFilterMember={selectedFilterMember}
        statusFilter={statusFilter}
        filteredCount={filteredCards.length}
        filteredPoints={filteredPoints}
        onSearchChange={setSearchQuery}
        onPriorityChange={setSelectedPriority}
        onStatusFilterChange={setStatusFilter}
        onClearFilters={handleClearFilters}
        onCreateTask={() => handleOpenNewCard()}
      />

      <TeamKanbanSprintHeader
        sprintGoal={board.sprintGoal}
        metrics={metrics}
        onSaveSprintGoal={handleSaveSprintGoal}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-1 min-h-0 p-4 gap-3 overflow-x-auto overflow-y-hidden scrollbar-sleek">
            {board.columns.map((column) => (
              <TeamKanbanColumnView
                key={column.id}
                column={column}
                columns={board.columns}
                cards={columnCardsMap.get(column.id) ?? []}
                canDelete={board.columns.length > 1 && column.cardIds.length === 0}
                onAddCard={handleOpenNewCard}
                onDeleteColumn={handleDeleteColumn}
                onEditCard={handleEditCard}
                onDispatchAgent={handleDispatchAgent}
                onToggleChecklistItem={handleToggleChecklistItem}
                onQuickMoveColumn={handleQuickMoveColumn}
                onUpdateColumnWipLimit={handleUpdateColumnWipLimit}
              />
            ))}

            <div className="w-[240px] shrink-0">
              {isAddingColumn ? (
                <div className="flex flex-col gap-2 p-3 rounded-xl border border-border bg-secondary/30">
                  <Input
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
                        handleAddColumn()
                      } else if (e.key === 'Escape') {
                        setIsAddingColumn(false)
                      }
                    }}
                    placeholder="Nombre de columna..."
                    autoFocus
                  />
                  <div className="flex items-center gap-1.5">
                    <Button size="xs" onClick={handleAddColumn} className="flex-1">
                      Añadir
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setIsAddingColumn(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddingColumn(true)}
                  className="w-full"
                >
                  <Plus /> Añadir Columna
                </Button>
              )}
            </div>
          </div>

          <TeamMembersSidebar
            selectedFilterMember={selectedFilterMember}
            workloadByAssignee={metrics.workloadByAssignee}
            customMembers={board.customMembers}
            onFilterChange={setSelectedFilterMember}
            onAddCustomMember={handleAddCustomMember}
          />
        </div>

        <DragOverlay>
          {activeCard ? (
            <TeamKanbanCardItem card={activeCard} onEdit={() => {}} isOverlay />
          ) : activeAssignee ? (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-card border-2 border-ring shadow-floating scale-105 pointer-events-none">
              <div className="size-7 rounded-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold shadow-xs">
                {activeAssignee.type === 'agent' ? (
                  <Sparkles className="size-3.5" />
                ) : (
                  activeAssignee.name[0]
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-foreground">{activeAssignee.name}</span>
                <span className="text-3xs text-muted-foreground">
                  {activeAssignee.type === 'agent' ? 'Asignar Agente IA' : 'Asignar Miembro'}
                </span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TeamKanbanCardModal
        isOpen={isModalOpen}
        card={editingCard}
        columns={board.columns}
        defaultColumnId={targetColumnId}
        availableMembers={board.customMembers}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveCard}
        onDelete={handleDeleteCard}
        onDispatchAgent={handleDispatchAgent}
      />
    </div>
  )
}
