import React from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TeamKanbanFilterBar } from './TeamKanbanFilterBar'
import type {
  TeamKanbanAssigneeOption,
  TeamKanbanFilterState,
  TeamKanbanStatusFilter
} from './team-kanban-filters'

type Props = {
  filters: TeamKanbanFilterState
  statusFilter: TeamKanbanStatusFilter
  myPendingCount: number
  availableLabels: readonly string[]
  assigneeOptions: readonly TeamKanbanAssigneeOption[]
  filteredCount: number
  filteredPoints: number
  onFiltersChange: (next: TeamKanbanFilterState) => void
  onStatusFilterChange: (value: TeamKanbanStatusFilter) => void
  onClearFilters: () => void
  onCreateTask: () => void
}

export function TeamKanbanToolbar({
  filters,
  statusFilter,
  myPendingCount,
  availableLabels,
  assigneeOptions,
  filteredCount,
  filteredPoints,
  onFiltersChange,
  onStatusFilterChange,
  onClearFilters,
  onCreateTask
}: Props): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-border bg-secondary/10">
      <TeamKanbanFilterBar
        filters={filters}
        statusFilter={statusFilter}
        myPendingCount={myPendingCount}
        availableLabels={availableLabels}
        assigneeOptions={assigneeOptions}
        onFiltersChange={onFiltersChange}
        onStatusFilterChange={onStatusFilterChange}
        onClearFilters={onClearFilters}
      />

      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className="text-3xs font-mono h-6 px-2 text-muted-foreground">
          {filteredCount} {filteredCount === 1 ? 'tarea' : 'tareas'} · {filteredPoints} pts
        </Badge>
        <Button size="sm" onClick={onCreateTask}>
          <Plus className="size-3.5" />
          Nueva Tarea
        </Button>
      </div>
    </div>
  )
}
