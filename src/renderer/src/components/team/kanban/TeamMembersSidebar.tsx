import React, { useState, useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Bot, Check, GripVertical, Plus, Sparkles, User, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  ALL_AGENT_MODELS,
  DEFAULT_TEAM_AI_AGENTS,
  DEFAULT_TEAM_HUMAN_MEMBERS,
  RECOMMENDED_AGENT_SKILLS,
  type ExtendedTeamMember
} from '../../../../../shared/teamwork/team-members'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'

type DraggableAssigneePayload = {
  type: 'assignee'
  assignee: ExtendedTeamMember
}

type ItemProps = {
  member: ExtendedTeamMember
  isSelected?: boolean
  workload?: { count: number; points: number }
  onToggleFilter?: (member: ExtendedTeamMember) => void
}

function DraggableMemberItem({
  member,
  isSelected = false,
  workload,
  onToggleFilter
}: ItemProps): React.JSX.Element {
  const draggableData: DraggableAssigneePayload = useMemo(
    () => ({ type: 'assignee', assignee: member }),
    [member]
  )

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member:${member.id}`,
    data: draggableData
  })

  const isAgent = member.type === 'agent'
  const initials = member.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onToggleFilter?.(member)}
      className={`group relative flex flex-col gap-1 p-2 rounded-xl border transition-all cursor-grab active:cursor-grabbing ${
        isDragging
          ? 'opacity-40 ring-2 ring-primary border-primary'
          : isSelected
            ? 'bg-accent border-ring shadow-xs'
            : 'bg-card/70 border-border hover:bg-accent/60'
      }`}
      title="Arrastra sobre una tarjeta para asignar, o clic para filtrar"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <div
              className="size-7 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-xs bg-primary"
              style={member.color ? { backgroundColor: member.color } : undefined}
            >
              {isAgent ? <Sparkles className="size-3.5" /> : initials}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-background ${
                isAgent
                  ? 'bg-git-graph-lane-5'
                  : member.status === 'online'
                    ? 'bg-workspace-status-review'
                    : 'bg-git-graph-lane-1'
              }`}
            />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground truncate max-w-[105px]">
                {member.name}
              </span>
              <Badge variant="referenceLabel">{isAgent ? 'IA' : 'HUM'}</Badge>
            </div>
            <span className="text-3xs text-muted-foreground truncate max-w-[120px]">
              {member.role}
            </span>
          </div>
        </div>
        <div className="text-muted-foreground/40 group-hover:text-foreground shrink-0 cursor-grab">
          <GripVertical className="size-3.5" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-border/40 text-3xs text-muted-foreground">
        {isAgent && member.defaultModel ? (
          <span className="font-mono text-muted-foreground/80 truncate max-w-[125px]">
            {member.defaultModel}
          </span>
        ) : (
          <span />
        )}
        {workload && workload.count > 0 ? (
          <span className="font-mono font-medium text-foreground bg-secondary/80 px-1 py-0.2 rounded ml-auto">
            {workload.count} {workload.count === 1 ? 'tarea' : 'tareas'} · {workload.points} pts
          </span>
        ) : null}
      </div>

      {isAgent && member.defaultSkills && member.defaultSkills.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {member.defaultSkills.map((s) => (
            <Badge key={s} variant="referenceLabel" className="text-3xs px-1 py-0 font-normal">
              {s === 'ponytail-5' ? 'Ponytail 5' : s === 'ctx7' ? 'ctx7' : s}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  )
}

type Props = {
  selectedFilterMember: string | null
  workloadByAssignee?: Record<string, { count: number; points: number }>
  customMembers?: ExtendedTeamMember[]
  onFilterChange: (memberName: string | null) => void
  onAddCustomMember?: (member: ExtendedTeamMember) => void
}

const SIDEBAR_TABS: readonly ('all' | 'agents' | 'humans')[] = ['all', 'agents', 'humans']

export function TeamMembersSidebar({
  selectedFilterMember,
  workloadByAssignee,
  customMembers,
  onFilterChange,
  onAddCustomMember
}: Props): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'all' | 'agents' | 'humans'>('all')
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [newType, setNewType] = useState<'human' | 'agent'>('agent')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newModel, setNewModel] = useState('')
  const [newSkills, setNewSkills] = useState<string[]>(['ponytail-5', 'ctx7'])

  const allAgents = useMemo(() => {
    const custom = customMembers?.filter((m) => m.type === 'agent') ?? []
    return [...DEFAULT_TEAM_AI_AGENTS, ...custom]
  }, [customMembers])

  const allHumans = useMemo(() => {
    const custom = customMembers?.filter((m) => m.type === 'human') ?? []
    return [...DEFAULT_TEAM_HUMAN_MEMBERS, ...custom]
  }, [customMembers])

  const filteredAgents = activeTab === 'humans' ? [] : allAgents
  const filteredHumans = activeTab === 'agents' ? [] : allHumans

  const handleCreateMember = (): void => {
    if (!newName.trim()) {
      toast.error('El nombre del miembro es requerido')
      return
    }
    const created: ExtendedTeamMember = {
      id: `custom-${newType}-${Date.now()}`,
      name: newName.trim(),
      type: newType,
      role: newRole.trim() || (newType === 'agent' ? 'Agente Especialista' : 'Colaborador'),
      color: newType === 'agent' ? '#8b5cf6' : '#14b8a6',
      status: 'online',
      defaultModel: newType === 'agent' ? newModel.trim() || 'Orchestrator (Argon)' : undefined,
      defaultSkills: newType === 'agent' ? newSkills : undefined
    }
    onAddCustomMember?.(created)
    setNewName('')
    setNewRole('')
    setNewModel('')
    setIsAddingMember(false)
    toast.success(`${newType === 'agent' ? 'Agente' : 'Miembro'} creado exitosamente`)
  }

  return (
    <aside className="flex flex-col w-64 shrink-0 border-l border-border bg-card/30 h-full min-h-0 overflow-hidden select-none">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Users className="size-3.5 text-primary" />
            Asignación de Equipo
          </span>
          <span className="text-3xs text-muted-foreground font-mono">
            {allAgents.length + allHumans.length}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 bg-muted/60 p-0.5 rounded-lg border border-border text-2xs">
          {SIDEBAR_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`py-1 rounded text-center font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'all' ? 'Todos' : tab === 'agents' ? 'Agentes' : 'Personas'}
            </button>
          ))}
        </div>

        {selectedFilterMember && (
          <div className="flex items-center justify-between px-2 py-1 rounded bg-accent border border-border text-2xs text-foreground">
            <span className="truncate">Filtrado: {selectedFilterMember}</span>
            <button
              type="button"
              onClick={() => onFilterChange(null)}
              className="text-muted-foreground hover:text-foreground ml-1"
            >
              <X className="size-3" />
            </button>
          </div>
        )}

        {onAddCustomMember ? (
          <div>
            {isAddingMember ? (
              <div className="flex flex-col gap-2 p-2 rounded-xl border border-border bg-secondary/20 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-3xs font-semibold text-foreground uppercase tracking-wider">
                    Nuevo Miembro
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingMember(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant={newType === 'agent' ? 'default' : 'outline'}
                    onClick={() => setNewType('agent')}
                    className="flex-1 text-3xs h-6 gap-1"
                  >
                    <Bot className="size-3" /> Agente IA
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={newType === 'human' ? 'default' : 'outline'}
                    onClick={() => setNewType('human')}
                    className="flex-1 text-3xs h-6 gap-1"
                  >
                    <User className="size-3" /> Humano
                  </Button>
                </div>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
                      handleCreateMember()
                    }
                  }}
                  placeholder="Nombre..."
                  className="h-7 text-xs"
                  autoFocus
                />
                <Input
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  placeholder="Rol o especialidad..."
                  className="h-7 text-xs"
                />
                {newType === 'agent' ? (
                  <>
                    <select
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      className="h-7 rounded-md border border-input bg-background px-2 text-3xs text-foreground font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Modelo por defecto</option>
                      {ALL_AGENT_MODELS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-1">
                      {RECOMMENDED_AGENT_SKILLS.map((s) => (
                        <Button
                          key={s.id}
                          type="button"
                          size="xs"
                          variant={newSkills.includes(s.id) ? 'default' : 'outline'}
                          onClick={() =>
                            setNewSkills((prev) =>
                              prev.includes(s.id) ? prev.filter((k) => k !== s.id) : [...prev, s.id]
                            )
                          }
                          className="text-3xs h-5 px-1.5"
                        >
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  </>
                ) : null}
                <div className="flex items-center gap-1 pt-1">
                  <Button
                    size="xs"
                    onClick={handleCreateMember}
                    className="flex-1 h-6 text-3xs gap-1"
                  >
                    <Check className="size-3" /> Añadir
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setIsAddingMember(false)}
                    className="h-6 text-3xs"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="xs"
                onClick={() => setIsAddingMember(true)}
                className="w-full text-xs h-7 gap-1"
              >
                <Plus className="size-3" /> Añadir al Equipo
              </Button>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-sleek p-3 space-y-4">
        {filteredAgents.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Sparkles className="size-3" /> Agentes de IA
              </span>
              <span className="text-3xs text-muted-foreground font-mono">
                {filteredAgents.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {filteredAgents.map((agent) => (
                <DraggableMemberItem
                  key={agent.id}
                  member={agent}
                  isSelected={selectedFilterMember === agent.name}
                  workload={workloadByAssignee?.[agent.name]}
                  onToggleFilter={(m) =>
                    onFilterChange(selectedFilterMember === m.name ? null : m.name)
                  }
                />
              ))}
            </div>
          </div>
        )}

        {filteredHumans.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <User className="size-3" /> Personas del Team
              </span>
              <span className="text-3xs text-muted-foreground font-mono">
                {filteredHumans.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {filteredHumans.map((human) => (
                <DraggableMemberItem
                  key={human.id}
                  member={human}
                  isSelected={selectedFilterMember === human.name}
                  workload={workloadByAssignee?.[human.name]}
                  onToggleFilter={(m) =>
                    onFilterChange(selectedFilterMember === m.name ? null : m.name)
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-2 border-t border-border bg-secondary/20 text-center">
        <p className="text-3xs text-muted-foreground leading-relaxed">
          <strong>Drag & Drop</strong>: Arrastra un avatar sobre cualquier tarjeta para asignar.
        </p>
      </div>
    </aside>
  )
}
