import React, { useMemo, useState } from 'react'
import { RefreshCw, Sparkles, Terminal, User, Users, X } from 'lucide-react'
import {
  DEFAULT_TEAM_HUMAN_MEMBERS,
  type ExtendedTeamMember,
  type TeamMemberEntry
} from '../../../../../shared/teamwork/team-members'
import { Button } from '@/components/ui/button'
import { TeamSidebarMemberItem } from './TeamSidebarMemberItem'
import { TeamSidebarAddMemberForm } from './TeamSidebarAddMemberForm'

type Props = {
  selectedFilterMember: string | null
  workloadByAssignee?: Record<string, { count: number; points: number }>
  installedAgents?: TeamMemberEntry[]
  humanMembers?: ExtendedTeamMember[]
  customMembers?: ExtendedTeamMember[]
  agentsLoading?: boolean
  isReadOnly?: boolean
  onRefreshAgents?: () => void
  onFilterChange: (memberName: string | null) => void
  onAddCustomMember?: (member: ExtendedTeamMember) => void
}

const SIDEBAR_TABS: readonly ('all' | 'agents' | 'humans')[] = ['all', 'agents', 'humans']
const EMPTY_AGENTS: TeamMemberEntry[] = []

export function TeamMembersSidebar({
  selectedFilterMember,
  workloadByAssignee,
  installedAgents = EMPTY_AGENTS,
  humanMembers,
  customMembers,
  agentsLoading = false,
  isReadOnly = false,
  onRefreshAgents,
  onFilterChange,
  onAddCustomMember
}: Props): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'all' | 'agents' | 'humans'>('all')

  const allAgents = useMemo(() => installedAgents, [installedAgents])

  const allHumans = useMemo(() => {
    const baseHumans =
      humanMembers && humanMembers.length > 0 ? humanMembers : DEFAULT_TEAM_HUMAN_MEMBERS
    const customHumans = customMembers?.filter((m) => m.type === 'human') ?? []
    return Array.from(new Map([...baseHumans, ...customHumans].map((h) => [h.name, h])).values())
  }, [humanMembers, customMembers])

  const showAgentsSection = activeTab !== 'humans'
  const showHumansSection = activeTab !== 'agents'

  return (
    <aside className="flex flex-col w-64 shrink-0 border-l border-border bg-card/30 h-full min-h-0 overflow-hidden select-none">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Users className="size-3.5 text-primary" />
            Asignación de Equipo
          </span>
          <div className="flex items-center gap-1">
            {onRefreshAgents ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={onRefreshAgents}
                disabled={agentsLoading}
                title="Refrescar agentes CLI configurados"
                aria-label="Refrescar agentes"
              >
                <RefreshCw className={`size-3 ${agentsLoading ? 'animate-spin' : ''}`} />
              </Button>
            ) : null}
            <span className="text-3xs text-muted-foreground font-mono">
              {allAgents.length + allHumans.length}
            </span>
          </div>
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

        {!isReadOnly && onAddCustomMember ? (
          <TeamSidebarAddMemberForm onAddCustomMember={onAddCustomMember} />
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-sleek p-3 space-y-4">
        {showAgentsSection ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Sparkles className="size-3" /> Agentes CLI Configurados
              </span>
              <span className="text-3xs text-muted-foreground font-mono">{allAgents.length}</span>
            </div>

            {allAgents.length > 0 ? (
              <div className="space-y-1.5">
                {allAgents.map((agent) => (
                  <TeamSidebarMemberItem
                    key={agent.id}
                    member={agent}
                    isSelected={selectedFilterMember === agent.name}
                    isReadOnly={isReadOnly}
                    workload={workloadByAssignee?.[agent.name]}
                    onToggleFilter={(m) =>
                      onFilterChange(selectedFilterMember === m.name ? null : m.name)
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="p-2.5 rounded-xl border border-dashed border-border bg-secondary/15 space-y-2 text-center">
                <Terminal className="size-4 mx-auto text-muted-foreground" />
                <p className="text-3xs text-muted-foreground leading-relaxed">
                  No hay agentes CLI configurados en este equipo. Configura opencode, agy
                  (Antigravity), claude o codex para verlos aquí.
                </p>
                {onRefreshAgents ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={onRefreshAgents}
                    disabled={agentsLoading}
                  >
                    <RefreshCw className={`size-2.5 ${agentsLoading ? 'animate-spin' : ''}`} />
                    Refrescar
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {showHumansSection && allHumans.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <User className="size-3" /> Personas del Team
              </span>
              <span className="text-3xs text-muted-foreground font-mono">{allHumans.length}</span>
            </div>
            <div className="space-y-1.5">
              {allHumans.map((human) => (
                <TeamSidebarMemberItem
                  key={human.id}
                  member={human}
                  isSelected={selectedFilterMember === human.name}
                  isReadOnly={isReadOnly}
                  workload={workloadByAssignee?.[human.name]}
                  onToggleFilter={(m) =>
                    onFilterChange(selectedFilterMember === m.name ? null : m.name)
                  }
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {!isReadOnly ? (
        <div className="p-2 border-t border-border bg-secondary/20 text-center">
          <p className="text-3xs text-muted-foreground leading-relaxed">
            <strong>Drag & Drop</strong>: Arrastra un agente sobre una tarjeta para ejecutarlo al
            instante.
          </p>
        </div>
      ) : null}
    </aside>
  )
}
