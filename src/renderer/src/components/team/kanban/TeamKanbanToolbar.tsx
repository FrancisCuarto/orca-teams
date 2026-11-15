import React from 'react'
import { AlertTriangle, Factory, Plus, Search, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type Props = {
  searchQuery: string
  selectedPriority: string
  selectedFilterMember: string | null
  statusFilter: 'all' | 'blocked' | 'agents'
  filteredCount: number
  filteredPoints: number
  activeFactoryCount?: number
  waitingHumanCount?: number
  canCreateTask?: boolean
  onSearchChange: (value: string) => void
  onPriorityChange: (value: string) => void
  onStatusFilterChange: (value: 'all' | 'blocked' | 'agents') => void
  onClearFilters: () => void
  onOpenFactoryConfig?: () => void
  onCreateTask: () => void
}

export function TeamKanbanToolbar({
  searchQuery,
  selectedPriority,
  selectedFilterMember,
  statusFilter,
  filteredCount,
  filteredPoints,
  activeFactoryCount = 0,
  waitingHumanCount = 0,
  canCreateTask = true,
  onSearchChange,
  onPriorityChange,
  onStatusFilterChange,
  onClearFilters,
  onOpenFactoryConfig,
  onCreateTask
}: Props): React.JSX.Element {
  const hasActiveFilters =
    searchQuery !== '' ||
    selectedPriority !== 'all' ||
    selectedFilterMember !== null ||
    statusFilter !== 'all'

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-border bg-secondary/10">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        {/* Search */}
        <div className="relative w-56 min-w-[160px]">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar tareas, etiquetas..."
            className="h-8 pl-8 pr-3 text-xs"
          />
        </div>

        {/* Priority Filter */}
        <select
          value={selectedPriority}
          onChange={(e) => onPriorityChange(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">Todas las prioridades</option>
          <option value="urgent">Urgente</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
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

        {/* Filtered Count & Points Badge */}
        <Badge variant="outline" className="text-3xs font-mono h-6 px-2 text-muted-foreground">
          {filteredCount} {filteredCount === 1 ? 'tarea' : 'tareas'} · {filteredPoints} pts
        </Badge>

        {/* Clear Filters */}
        {hasActiveFilters ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={onClearFilters}
            title="Limpiar filtros activos"
            className="h-6 gap-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
            Limpiar
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onOpenFactoryConfig ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onOpenFactoryConfig}
            title="Configurar roles, checks y gate determinista de Software Factory"
          >
            <Factory className="size-3.5" />
            <span>Factory</span>
            {activeFactoryCount > 0 ? (
              <Badge variant="secondary" className="text-3xs px-1 py-0 h-4">
                {activeFactoryCount}
              </Badge>
            ) : null}
            {waitingHumanCount > 0 ? (
              <Badge variant="destructive" className="text-3xs px-1 py-0 h-4">
                {waitingHumanCount} gate
              </Badge>
            ) : null}
          </Button>
        ) : null}
        <Button
          size="sm"
          disabled={!canCreateTask}
          title={canCreateTask ? 'Crear nueva tarea' : 'Solo lectura: no puedes crear tareas'}
          onClick={() => {
            if (canCreateTask) {
              onCreateTask()
            }
          }}
        >
          <Plus className="size-3.5" />
          Nueva Tarea
        </Button>
      </div>
    </div>
  )
}
