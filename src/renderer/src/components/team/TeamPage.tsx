import React, { useState, useCallback, useMemo } from 'react'
import { Activity, FileText, Kanban, Loader2, PenTool, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { TeamTab } from '../../../../shared/teamwork/team-kanban-types'
import type { TeamRole } from '../../../../shared/teamwork/team-workspace-types'
import {
  computeBoardSprintMetrics,
  extractActionItemsFromMarkdownToBoard
} from './kanban/team-kanban-board-mutations'
import { TeamActivityView } from './activity/TeamActivityView'
import { TeamKanbanConnectedView } from './kanban/TeamKanbanConnectedView'
import { TeamWhiteboardConnectedView } from './whiteboard/TeamWhiteboardConnectedView'
import { TeamNotesConnectedView } from './notes/TeamNotesConnectedView'
import { TeamProjectSelector } from './workspace/TeamProjectSelector'
import { Button } from '@/components/ui/button'
import { useActiveWorktree } from '@/store/workspaces/selection/use-selected-worktree'
import { useActiveRepo } from '@/store/repos/use-repository-catalog'
import { useTeamSyncAndAuth } from './hooks/use-team-sync-and-auth'
import { useTeamWorkspaceData } from './hooks/use-team-workspace-data'
import { useTeamWorkspaceRegistry } from './hooks/use-team-workspace-registry'

export default function TeamPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TeamTab>('kanban')
  const activeWorktree = useActiveWorktree()
  const activeRepo = useActiveRepo()
  const projectPath = activeWorktree?.path ?? activeRepo?.path ?? null

  const syncAndAuth = useTeamSyncAndAuth()
  const registry = useTeamWorkspaceRegistry({
    activeWorktreeId: activeWorktree?.id,
    activeWorktreePath: activeWorktree?.path,
    activeRepoId: activeRepo?.id,
    activeRepoPath: activeRepo?.path,
    activeRepoDisplayName: activeRepo?.displayName
  })

  const activeProjectId = registry.currentProject?.id ?? 'proj-default'

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
    projectId: activeProjectId,
    projectPath,
    connectionId: activeRepo?.connectionId ?? undefined
  })

  const boardMetrics = useMemo(() => (board ? computeBoardSprintMetrics(board) : null), [board])

  const currentUserIdentity = useMemo(
    () => ({
      userId: syncAndAuth.user.userId,
      displayName: syncAndAuth.user.displayName,
      avatarUrl: syncAndAuth.user.avatarUrl
    }),
    [syncAndAuth.user.userId, syncAndAuth.user.displayName, syncAndAuth.user.avatarUrl]
  )

  const handleInviteMember = useCallback(
    async (email: string, role: TeamRole) => {
      const result = await registry.handleSendInvitation(email, role)
      if (result.emailSent) {
        toast.success(`Invitación enviada por correo a ${email} vía ${result.transportUsed}`)
      } else {
        toast.warning(
          `Invitación guardada para ${email}, pero no se pudo enviar por email: ${result.error ?? 'Configura SMTP o Resend'}`
        )
      }
      return result
    },
    [registry]
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
      <TeamProjectSelector
        teams={registry.teams}
        activeTeam={registry.activeTeam}
        projects={registry.projects}
        activeProject={registry.currentProject}
        members={registry.activeMembers}
        pendingInvitations={registry.activePendingInvitations}
        mailConfig={registry.mailConfig}
        userRole={registry.userRole}
        currentUser={syncAndAuth.user}
        syncStatus={syncAndAuth.syncStatus}
        onSelectTeam={registry.setActiveTeamId}
        onSelectProject={registry.setActiveProjectId}
        onCreateTeam={registry.handleCreateTeam}
        onCreateProject={registry.handleCreateProject}
        onInviteMember={handleInviteMember}
        onResendInvitation={registry.handleResendInvitation}
        onRevokeInvitation={registry.handleRevokeInvitation}
        onAcceptInvitation={registry.handleAcceptInvitation}
        onSaveMailConfig={registry.handleSaveMailConfig}
        onTestMailConfig={registry.handleTestMailConfig}
        onUpdateProfile={syncAndAuth.updateProfile}
        onRequestMagicCode={syncAndAuth.requestMagicCode}
        onVerifyMagicCode={syncAndAuth.verifyMagicCode}
        onConfigureSync={syncAndAuth.configureSync}
      />

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
          <Button
            size="xs"
            variant={activeTab === 'activity' ? 'secondary' : 'ghost'}
            onClick={() => setActiveTab('activity')}
          >
            <Activity className="w-3.5 h-3.5" />
            Actividad
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

      <main className="flex flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeTab === 'kanban' && board ? (
          <TeamKanbanConnectedView
            key={activeProjectId}
            teamId={registry.activeTeam?.id ?? 'team-local'}
            projectId={activeProjectId}
            projectPath={projectPath}
            initialBoard={board}
            currentUser={{ ...currentUserIdentity, color: '#3b82f6' }}
            humanMembers={registry.humanMembers}
            relayUrl={syncAndAuth.effectiveRelayUrl}
            syncToken={syncAndAuth.syncToken}
            onPersist={handleBoardChange}
          />
        ) : activeTab === 'whiteboard' && whiteboard ? (
          <TeamWhiteboardConnectedView
            key={activeProjectId}
            whiteboardId={activeProjectId}
            projectId={activeProjectId}
            initialWhiteboard={whiteboard}
            currentUser={{ ...currentUserIdentity, color: '#10b981' }}
            relayUrl={syncAndAuth.effectiveRelayUrl}
            syncToken={syncAndAuth.syncToken}
            onPersist={handleWhiteboardChange}
          />
        ) : activeTab === 'notes' && notes ? (
          <TeamNotesConnectedView
            key={activeProjectId}
            projectId={activeProjectId}
            initialNotes={notes}
            currentUser={{ ...currentUserIdentity, color: '#8b5cf6' }}
            relayUrl={syncAndAuth.effectiveRelayUrl}
            syncToken={syncAndAuth.syncToken}
            onPersist={handleNotesChange}
            onExtractTasksToKanban={handleExtractTasksToKanban}
          />
        ) : activeTab === 'activity' ? (
          <TeamActivityView
            key={activeProjectId}
            teamId={registry.activeTeam?.id ?? 'team-local'}
            projectId={activeProjectId}
          />
        ) : null}
      </main>
    </div>
  )
}
