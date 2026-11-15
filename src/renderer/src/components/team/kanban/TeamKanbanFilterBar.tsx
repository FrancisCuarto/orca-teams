import React from 'react'
import { AlertTriangle, Inbox, Search, Sparkles, X } from 'lucide-react'
import { isTeamKanbanPriority } from '../../../../../shared/teamwork/team-kanban-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  hasActiveKanbanFilters,
  type TeamKanbanAssigneeOption,
  type TeamKanbanFilterState,
  type TeamKanbanStatusFilter
} from './team-kanban-filters'

type Props = {
  filters: TeamKanbanFilterState
  statusFilter: TeamKanbanStatusFilter
  myPendingCount: number
  availableLabels: readonly string[]
  assigneeOptions: readonly TeamKanbanAssigneeOption[]
  onFiltersChange: (next: TeamKanbanFilterState) => void
  onStatusFilterChange: (next: TeamKanbanStatusFilter) => void
  onClearFilters: () => void
}

export function TeamKanbanFilterBar({
  filters,
  statusFilter,
  myPendingCount,
  availableLabels,
  assigneeOptions,
  onFiltersChange,
  onStatusFilterChange,
  onClearFilters
}: Props): React.JSX.Element {
  const hasActiveFilters = hasActiveKanbanFilters(filters, statusFilter)

  return (
    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
      {/* Prominent My Pending toggle pill */}
      <Button
        type="button"
        size="xs"
        variant={filters.onlyMyPending ? 'default' : 'outline'}
        aria-pressed={filters.onlyMyPending}
        onClick={() => onFiltersChange({ ...filters, onlyMyPending: !filters.onlyMyPending })}
        className={`h-8 gap-1.5 rounded-full px-3 text-xs font-medium transition-all ${
          filters.onlyMyPending
            ? 'shadow-xs'
            : myPendingCount > 0
              ? 'border-primary/45 text-foreground hover:border-primary/80 hover:bg-primary/5'
              : 'text-muted-foreground'
        }`}
        title="Mostrar tareas asignadas a ti o esperando tu aprobación (waiting_for_input)"
      >
        <Inbox className="size-3.5 shrink-0" />
        <span>Mis pendientes</span>
        <Badge
          variant={filters.onlyMyPending ? 'secondary' : 'outline'}
          className={`h-4 min-w-4 px-1.5 text-3xs font-mono ${
            filters.onlyMyPending
              ? 'bg-primary-foreground/20 text-primary-foreground border-transparent'
              : myPendingCount > 0
                ? 'border-primary/40 text-primary'
                : 'text-muted-foreground'
          }`}
        >
          {myPendingCount}
        </Badge>
      </Button>

      {/* Search */}
      <div className="relative w-52 min-w-[150px]">
        <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          aria-label="Buscar tarjetas en el tablero"
          value={filters.query}
          onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
          placeholder="Buscar tareas, etiquetas..."
          className="h-8 pl-8 pr-7 text-xs"
        />
        {filters.query ? (
          <button
            type="button"
            onClick={() => onFiltersChange({ ...filters, query: '' })}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Assignee Filter */}
      <select
        aria-label="Filtrar por responsable"
        value={filters.assigneeId}
        onChange={(e) => onFiltersChange({ ...filters, assigneeId: e.target.value })}
        className="h-8 max-w-[165px] rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="all">Todos los responsables</option>
        <option value="unassigned">Sin asignar</option>
        {assigneeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {/* Priority Filter */}
      <select
        aria-label="Filtrar por prioridad"
        value={filters.priority}
        onChange={(e) => {
          const val = e.target.value
          onFiltersChange({
            ...filters,
            priority: val === 'all' || isTeamKanbanPriority(val) ? val : 'all'
          })
        }}
        className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="all">Todas las prioridades</option>
        <option value="urgent">Urgente</option>
        <option value="high">Alta</option>
        <option value="medium">Media</option>
        <option value="low">Baja</option>
      </select>

      {/* Label Filter */}
      <select
        aria-label="Filtrar por etiqueta"
        value={filters.label}
        onChange={(e) => onFiltersChange({ ...filters, label: e.target.value })}
        className="h-8 max-w-[155px] rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="all">Todas las etiquetas</option>
        {availableLabels.map((lbl) => (
          <option key={lbl} value={lbl}>
            {lbl}
          </option>
        ))}
      </select>

      {/* Quick Status Pills */}
      <div className="flex items-center gap-1 bg-secondary/40 p-0.5 rounded-lg border border-border">
        <Button
          type="button"
          size="xs"
          variant={statusFilter === 'all' ? 'secondary' : 'ghost'}
          onClick={() => onStatusFilterChange('all')}
          className="text-xs h-6 px-2"
        >
          Todas
        </Button>
        <Button
          type="button"
          size="xs"
          variant={statusFilter === 'agents' ? 'secondary' : 'ghost'}
          onClick={() => onStatusFilterChange('agents')}
          className="text-xs h-6 px-2 gap-1"
        >
          <Sparkles className="size-3 text-git-graph-lane-5" />
          Agentes IA
        </Button>
        <Button
          type="button"
          size="xs"
          variant={statusFilter === 'blocked' ? 'secondary' : 'ghost'}
          onClick={() => onStatusFilterChange('blocked')}
          className="text-xs h-6 px-2 gap-1"
        >
          <AlertTriangle className="size-3 text-destructive" />
          Bloqueadas
        </Button>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onClearFilters}
          title="Limpiar filtros activos"
          className="h-7 gap-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
          Limpiar filtros
        </Button>
      ) : null}
    </div>
  )
}
