import React, { useState, useCallback, useMemo } from 'react'
import { FileText, Kanban, Loader2, PenTool, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { TeamTab } from '../../../../shared/teamwork/team-kanban-types'
import type { Project, Team, TeamRole } from '../../../../shared/teamwork/team-workspace-types'
import {
  computeBoardSprintMetrics,
  extractActionItemsFromMarkdownToBoard
} from './kanban/team-kanban-board-mutations'
import { TeamKanbanBoardView } from './kanban/TeamKanbanBoardView'
import { TeamWhiteboardConnectedView } from './whiteboard/TeamWhiteboardConnectedView'
import { TeamNotesConnectedView } from './notes/TeamNotesConnectedView'
import { TeamProjectSelector } from './workspace/TeamProjectSelector'
import { Button } from '@/components/ui/button'
import { useActiveWorktree } from '@/store/workspaces/selection/use-selected-worktree'
import { useActiveRepo } from '@/store/repos/use-repository-catalog'
import { useTeamWorkspaceData } from './hooks/use-team-workspace-data'

const INITIAL_STATIC_EPOCH = 1700000000

export default function TeamPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TeamTab>('kanban')

  const activeWorktree = useActiveWorktree()
  const activeRepo = useActiveRepo()

  const defaultTeam: Team = useMemo(
    () => ({
      id: 'team-orca-core',
      name: 'Orca Core Team',
      slug: 'orca-core',
      ownerId: 'usr-francis',
      description: 'Equipo central de desarrollo',
      createdAt: INITIAL_STATIC_EPOCH,
      updatedAt: INITIAL_STATIC_EPOCH
    }),
    []
  )

  const defaultProject: Project = useMemo(() => {
    const path = activeWorktree?.path ?? activeRepo?.path ?? null
    const segments = path ? path.split(/[/\\]/).filter(Boolean) : []
    const name = activeRepo?.displayName ?? segments.at(-1) ?? 'Main Workspace'
    const id = activeRepo?.id ?? activeWorktree?.id ?? 'proj-default'
    return {
      id,
      teamId: defaultTeam.id,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      visibility: 'team',
      createdAt: INITIAL_STATIC_EPOCH,
      updatedAt: INITIAL_STATIC_EPOCH
    }
  }, [
    activeWorktree?.path,
    activeWorktree?.id,
    activeRepo?.path,
    activeRepo?.id,
    activeRepo?.displayName,
    defaultTeam.id
  ])

  const [teams, setTeams] = useState<Team[]>([defaultTeam])
  const [activeTeamId, setActiveTeamId] = useState<string>(defaultTeam.id)
  const [projects, setProjects] = useState<Project[]>([defaultProject])
  const [activeProjectId, setActiveProjectId] = useState<string>(defaultProject.id)
  const [userRole] = useState<TeamRole>('owner')

  const activeTeam = useMemo(
    () => teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null,
    [teams, activeTeamId]
  )

  const currentProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null,
    [projects, activeProjectId]
  )

  const {
    board,
    whiteboard,
    notes,
    loading,
    refetch,
    handleBoardChange,
    handleWhiteboardChange,
    handleNotesChange
  } = useTeamWorkspaceData({
    projectId: currentProject?.id ?? 'proj-default',
    projectPath: activeWorktree?.path ?? activeRepo?.path ?? null,
    connectionId: activeRepo?.connectionId ?? undefined
  })

  const boardMetrics = useMemo(() => (board ? computeBoardSprintMetrics(board) : null), [board])

  const handleCreateTeam = useCallback((newTeam: Omit<Team, 'createdAt' | 'updatedAt'>) => {
    const now = Date.now()
    const fullTeam: Team = { ...newTeam, createdAt: now, updatedAt: now }
    setTeams((prev) => [...prev, fullTeam])
    setActiveTeamId(fullTeam.id)
    toast.success(`Equipo '${fullTeam.name}' creado con éxito`)
  }, [])

  const handleCreateProject = useCallback((newProj: Omit<Project, 'createdAt' | 'updatedAt'>) => {
    const now = Date.now()
    const fullProj: Project = { ...newProj, createdAt: now, updatedAt: now }
    setProjects((prev) => [...prev, fullProj])
    setActiveProjectId(fullProj.id)
    toast.success(`Proyecto '${fullProj.name}' creado con éxito`)
  }, [])

  const handleInviteMember = useCallback(
    async (email: string, role: TeamRole): Promise<string> => {
      const token = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      toast.success(`Invitación enviada a ${email} como ${role.toUpperCase()}`)
      return `https://orca.run/join?team=${activeTeam?.slug ?? 'orca'}&token=${token}`
    },
    [activeTeam?.slug]
  )

  const handleExtractTasksToKanban = useCallback(
    (noteTitle: string, content: string) => {
      if (!board) {
        return
      }
      const { nextBoard, createdCount } = extractActionItemsFromMarkdownToBoard(
        board,
        noteTitle,
        content
      )
      if (createdCount === 0) {
        toast.info('No había tareas nuevas sin crear en el Kanban para esta nota')
        return
      }
      handleBoardChange(nextBoard)
      setActiveTab('kanban')
      toast.success(
        `${createdCount} ${createdCount === 1 ? 'tarea extraída' : 'tareas extraídas'} al Kanban`,
        { description: `Origen: ${noteTitle}` }
      )
    },
    [board, handleBoardChange]
  )

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden bg-background">
      {/* Top Workspace Selector Bar */}
      <TeamProjectSelector
        teams={teams}
        activeTeam={activeTeam}
        projects={projects}
        activeProject={currentProject}
        userRole={userRole}
        onSelectTeam={setActiveTeamId}
        onSelectProject={setActiveProjectId}
        onCreateTeam={handleCreateTeam}
        onCreateProject={handleCreateProject}
        onInviteMember={handleInviteMember}
      />

      {/* Sub-tab Switcher & Status Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 border-b border-border bg-card/30">
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border">
          <Button
            size="xs"
            variant={activeTab === 'kanban' ? 'secondary' : 'ghost'}
            onClick={() => setActiveTab('kanban')}
          >
            <Kanban className="w-3.5 h-3.5" />
            Tablero Kanban
          </Button>

          <Button
            size="xs"
            variant={activeTab === 'whiteboard' ? 'secondary' : 'ghost'}
            onClick={() => setActiveTab('whiteboard')}
          >
            <PenTool className="w-3.5 h-3.5" />
            Pizarra Visual
          </Button>

          <Button
            size="xs"
            variant={activeTab === 'notes' ? 'secondary' : 'ghost'}
            onClick={() => setActiveTab('notes')}
          >
            <FileText className="w-3.5 h-3.5" />
            Notas & ADRs
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {boardMetrics && (
            <span className="text-2xs text-muted-foreground mr-1">
              {boardMetrics.completedCards}/{boardMetrics.totalCards} tareas ·{' '}
              {notes?.notes.length ?? 0} docs
            </span>
          )}

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={refetch}
            disabled={loading}
            title="Recargar datos del proyecto"
          >
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeTab === 'kanban' && board ? (
          <TeamKanbanBoardView
            key={currentProject?.id}
            board={board}
            onChange={handleBoardChange}
          />
        ) : activeTab === 'whiteboard' && whiteboard ? (
          <TeamWhiteboardConnectedView
            key={currentProject?.id}
            whiteboardId={currentProject?.id ?? 'wb-default'}
            projectId={currentProject?.id ?? 'proj-default'}
            initialWhiteboard={whiteboard}
            currentUser={{
              userId: 'usr-francis',
              displayName: 'Francis (Lead)',
              color: '#10b981'
            }}
            onPersist={handleWhiteboardChange}
          />
        ) : activeTab === 'notes' && notes ? (
          <TeamNotesConnectedView
            key={currentProject?.id}
            projectId={currentProject?.id ?? 'proj-default'}
            initialNotes={notes}
            currentUser={{
              userId: 'usr-francis',
              displayName: 'Francis (Lead)',
              color: '#8b5cf6'
            }}
            onPersist={handleNotesChange}
            onExtractTasksToKanban={handleExtractTasksToKanban}
          />
        ) : null}
      </main>
    </div>
  )
}
