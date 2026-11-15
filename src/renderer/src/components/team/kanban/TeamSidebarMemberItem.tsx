import React, { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical, Sparkles } from 'lucide-react'
import {
  getMemberConfigSource,
  getMemberModels,
  type ExtendedTeamMember
} from '../../../../../shared/teamwork/team-members'
import { Badge } from '@/components/ui/badge'

type DraggableAssigneePayload = {
  type: 'assignee'
  assignee: ExtendedTeamMember
}

type Props = {
  member: ExtendedTeamMember
  isSelected?: boolean
  isReadOnly?: boolean
  workload?: { count: number; points: number }
  onToggleFilter?: (member: ExtendedTeamMember) => void
}

export function TeamSidebarMemberItem({
  member,
  isSelected = false,
  isReadOnly = false,
  workload,
  onToggleFilter
}: Props): React.JSX.Element {
  const draggableData: DraggableAssigneePayload = useMemo(
    () => ({ type: 'assignee', assignee: member }),
    [member]
  )

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member:${member.id}`,
    data: draggableData,
    disabled: isReadOnly
  })

  const isAgent = member.type === 'agent'
  const configSource = isAgent ? getMemberConfigSource(member) : undefined
  const modelCount = isAgent ? getMemberModels(member).length : 0
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
      {...(isReadOnly ? {} : listeners)}
      onClick={() => onToggleFilter?.(member)}
      className={`group relative flex flex-col gap-1 p-2 rounded-xl border transition-all ${
        isReadOnly ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${
        isDragging
          ? 'opacity-40 ring-2 ring-primary border-primary'
          : isSelected
            ? 'bg-accent border-ring shadow-xs'
            : 'bg-card/70 border-border hover:bg-accent/60'
      }`}
      title={
        isReadOnly
          ? 'Clic para filtrar tareas'
          : 'Arrastra sobre una tarjeta para asignar, o clic para filtrar'
      }
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
              <Badge variant="referenceLabel">{isAgent ? 'CLI' : 'HUM'}</Badge>
            </div>
            <span className="text-3xs text-muted-foreground truncate max-w-[125px]">
              {member.role}
            </span>
          </div>
        </div>
        {!isReadOnly ? (
          <div className="text-muted-foreground/40 group-hover:text-foreground shrink-0 cursor-grab">
            <GripVertical className="size-3.5" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-border/40 text-3xs text-muted-foreground">
        {isAgent ? (
          <div className="flex items-center gap-1 min-w-0">
            {configSource ? (
              <Badge variant="outline">
                <span className="text-3xs font-mono">{configSource}</span>
              </Badge>
            ) : null}
            {modelCount > 0 ? (
              <span className="text-3xs font-mono text-muted-foreground/80">
                {modelCount} {modelCount === 1 ? 'modelo' : 'modelos'}
              </span>
            ) : member.defaultModel ? (
              <span className="font-mono text-muted-foreground/80 truncate max-w-[110px]">
                {member.defaultModel}
              </span>
            ) : null}
          </div>
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
