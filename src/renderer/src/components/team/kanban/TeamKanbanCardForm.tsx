import React, { useState, useMemo } from 'react'
import { AlertTriangle, Bot, Check, GitBranch, Trash2, User, Zap } from 'lucide-react'
import { toast } from 'sonner'
import {
  isTeamKanbanPriority,
  type ExtendedTeamMember,
  type TeamKanbanCard,
  type TeamKanbanColumn,
  type TeamKanbanPriority
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  ALL_AGENT_MODELS,
  AVAILABLE_AGENT_MODELS,
  DEFAULT_TEAM_AI_AGENTS,
  DEFAULT_TEAM_HUMAN_MEMBERS
} from '../../../../../shared/teamwork/team-members'
import { DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { TeamKanbanCardAgentFields } from './TeamKanbanCardAgentFields'
import { TeamKanbanCardChecklist } from './TeamKanbanCardChecklist'

export type TeamKanbanCardFormProps = {
  card: TeamKanbanCard | null
  columns: TeamKanbanColumn[]
  defaultColumnId?: string
  availableMembers?: ExtendedTeamMember[]
  onClose: () => void
  onSave: (card: TeamKanbanCard) => void
  onDelete?: (cardId: string) => void
  onDispatchAgent?: (card: TeamKanbanCard) => void
}

const STORY_POINT_PRESETS: number[] = [1, 2, 3, 5, 8, 13]

export function TeamKanbanCardForm({
  card,
  columns,
  defaultColumnId,
  availableMembers,
  onClose,
  onSave,
  onDelete,
  onDispatchAgent
}: TeamKanbanCardFormProps): React.JSX.Element {
  const [title, setTitle] = useState(card?.title ?? '')
  const [description, setDescription] = useState(card?.description ?? '')
  const [columnId, setColumnId] = useState(
    card?.columnId ?? defaultColumnId ?? columns[0]?.id ?? ''
  )
  const [priority, setPriority] = useState<TeamKanbanPriority>(card?.priority ?? 'medium')
  const [assigneeType, setAssigneeType] = useState<'human' | 'agent'>(
    card?.assignee?.type ?? 'human'
  )
  const [assigneeName, setAssigneeName] = useState(card?.assignee?.name ?? '')
  const [agentModel, setAgentModel] = useState(card?.assignee?.model ?? '')
  const [agentSkills, setAgentSkills] = useState<string[]>(
    card?.assignee?.skills ?? ['ponytail-5', 'ctx7']
  )
  const [labelsText, setLabelsText] = useState(card?.labels?.join(', ') ?? '')
  const [checklist, setChecklist] = useState(card?.checklist ? [...card.checklist] : [])
  const [estimatePoints, setEstimatePoints] = useState<number | undefined>(card?.estimatePoints)
  const [branchOrWorktree, setBranchOrWorktree] = useState(card?.branchOrWorktree ?? '')
  const [blockedReason, setBlockedReason] = useState(card?.blockedReason ?? '')

  const agents = useMemo(() => {
    const list = [
      ...DEFAULT_TEAM_AI_AGENTS,
      ...(availableMembers?.filter((m) => m.type === 'agent') ?? [])
    ]
    return Array.from(new Map(list.map((a) => [a.name, a])).values())
  }, [availableMembers])

  const humans = useMemo(() => {
    const list = [
      ...DEFAULT_TEAM_HUMAN_MEMBERS,
      ...(availableMembers?.filter((m) => m.type === 'human') ?? [])
    ]
    return Array.from(new Map(list.map((h) => [h.name, h])).values())
  }, [availableMembers])

  const matchedAgent = agents.find((a) => a.name === assigneeName)
  const availableModelList = useMemo(() => {
    if (matchedAgent?.agentType && AVAILABLE_AGENT_MODELS[matchedAgent.agentType]) {
      return AVAILABLE_AGENT_MODELS[matchedAgent.agentType]
    }
    return ALL_AGENT_MODELS
  }, [matchedAgent])

  const handleAssigneeTypeChange = (nextType: 'human' | 'agent'): void => {
    setAssigneeType(nextType)
    if (nextType === 'agent') {
      const def = agents[0]
      if (def && !agents.some((a) => a.name === assigneeName)) {
        setAssigneeName(def.name)
        if (def.defaultModel && !agentModel) {
          setAgentModel(def.defaultModel)
        }
        if (def.defaultSkills?.length) {
          setAgentSkills(def.defaultSkills)
        }
      }
    } else if (agents.some((a) => a.name === assigneeName)) {
      setAssigneeName('')
    }
  }

  const handleAgentSelect = (name: string): void => {
    setAssigneeName(name)
    const found = agents.find((a) => a.name === name)
    if (found?.defaultModel) {
      setAgentModel(found.defaultModel)
    }
    if (found?.defaultSkills?.length) {
      setAgentSkills(found.defaultSkills)
    }
  }

  const handleSave = (): void => {
    if (!title.trim()) {
      toast.error('El título de la tarea es obligatorio')
      return
    }
    const labels = labelsText
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean)
    const updatedCard: TeamKanbanCard = {
      id: card?.id ?? `card-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      columnId: columnId || columns[0]?.id || 'col-backlog',
      priority,
      assignee: assigneeName.trim()
        ? {
            type: assigneeType,
            name: assigneeName.trim(),
            agentType: assigneeType === 'agent' ? (matchedAgent?.agentType ?? 'custom') : undefined,
            model: assigneeType === 'agent' && agentModel.trim() ? agentModel.trim() : undefined,
            skills: assigneeType === 'agent' ? agentSkills : undefined
          }
        : undefined,
      labels,
      checklist,
      estimatePoints,
      branchOrWorktree: branchOrWorktree.trim() || undefined,
      blockedReason: blockedReason.trim() || undefined,
      createdAt: card?.createdAt ?? Date.now(),
      updatedAt: Date.now()
    }
    onSave(updatedCard)
    onClose()
  }

  return (
    <>
      <div className="flex flex-col gap-3 py-2 max-h-[65vh] overflow-y-auto scrollbar-sleek pr-1">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground">Título de la tarea</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e) && title.trim()) {
                e.preventDefault()
                handleSave()
              }
            }}
            placeholder="Ej. Implementar arquitectura limpia..."
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground">Columna</label>
            <select
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {columns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground">Prioridad</label>
            <select
              value={priority}
              onChange={(e) => {
                if (isTeamKanbanPriority(e.target.value)) {
                  setPriority(e.target.value)
                }
              }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground">Story Points</label>
            <div className="flex items-center gap-1">
              {STORY_POINT_PRESETS.map((pts) => (
                <Button
                  key={pts}
                  type="button"
                  size="xs"
                  variant={estimatePoints === pts ? 'default' : 'outline'}
                  onClick={() => setEstimatePoints(estimatePoints === pts ? undefined : pts)}
                  className="px-1.5 font-mono text-2xs"
                >
                  {pts}
                </Button>
              ))}
              {estimatePoints !== undefined && !STORY_POINT_PRESETS.includes(estimatePoints) ? (
                <Badge variant="secondary" className="font-mono text-3xs">
                  {estimatePoints}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground">Tipo de asignado</label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={assigneeType === 'human' ? 'default' : 'outline'}
                onClick={() => handleAssigneeTypeChange('human')}
                className="flex-1"
              >
                <User className="size-3.5" /> Humano
              </Button>
              <Button
                type="button"
                size="sm"
                variant={assigneeType === 'agent' ? 'default' : 'outline'}
                onClick={() => handleAssigneeTypeChange('agent')}
                className="flex-1"
              >
                <Bot className="size-3.5" /> Agente IA
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground">
              {assigneeType === 'human' ? 'Miembro asignado' : 'Agente IA'}
            </label>
            {assigneeType === 'agent' ? (
              <select
                value={assigneeName}
                onChange={(e) => handleAgentSelect(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Seleccionar agente...</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.name}>
                    {agent.name} ({agent.role})
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={humans.some((h) => h.name === assigneeName) ? assigneeName : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setAssigneeName(e.target.value)
                    }
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-1/2"
                >
                  <option value="">Elegir del equipo...</option>
                  {humans.map((human) => (
                    <option key={human.id} value={human.name}>
                      {human.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={assigneeName}
                  onChange={(e) => setAssigneeName(e.target.value)}
                  placeholder="O nombre..."
                  className="h-8 text-xs flex-1"
                />
              </div>
            )}
          </div>
        </div>

        {assigneeType === 'agent' ? (
          <TeamKanbanCardAgentFields
            matchedAgent={matchedAgent}
            agentModel={agentModel}
            agentSkills={agentSkills}
            availableModelList={availableModelList}
            onModelChange={setAgentModel}
            onToggleSkill={(id) =>
              setAgentSkills((prev) =>
                prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
              )
            }
          />
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground flex items-center gap-1">
              <GitBranch className="size-3 text-muted-foreground" /> Rama / Worktree
            </label>
            <Input
              value={branchOrWorktree}
              onChange={(e) => setBranchOrWorktree(e.target.value)}
              placeholder="feat/nombre-de-rama"
              className="font-mono text-xs"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-foreground flex items-center gap-1">
              <AlertTriangle className="size-3 text-destructive" /> Motivo de bloqueo
            </label>
            <Input
              value={blockedReason}
              onChange={(e) => setBlockedReason(e.target.value)}
              placeholder="Ej. Esperando revisión de backend..."
              className="text-xs"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground">Etiquetas</label>
          <Input
            value={labelsText}
            onChange={(e) => setLabelsText(e.target.value)}
            placeholder="Frontend, UX, Performance..."
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground">Descripción (Markdown)</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe requerimientos o pasos..."
            rows={3}
          />
        </div>

        <TeamKanbanCardChecklist
          items={checklist}
          onAdd={(text) =>
            setChecklist((prev) => [...prev, { id: `check-${Date.now()}`, text, done: false }])
          }
          onToggle={(id) =>
            setChecklist((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
          }
          onDelete={(id) => setChecklist((prev) => prev.filter((i) => i.id !== id))}
        />
      </div>

      <DialogFooter>
        <div className="flex w-full items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            {card && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  onDelete(card.id)
                  onClose()
                }}
              >
                <Trash2 className="size-3.5" /> Eliminar
              </Button>
            ) : null}

            {card && onDispatchAgent ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onDispatchAgent(card)
                  onClose()
                }}
              >
                <Zap className="size-3.5 text-git-graph-lane-1" /> Despachar
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={!title.trim()}>
              <Check className="size-3.5" /> Guardar Tarea
            </Button>
          </div>
        </div>
      </DialogFooter>
    </>
  )
}
