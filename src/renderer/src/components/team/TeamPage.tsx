import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { Activity, Eye, FileText, Kanban, Loader2, Lock, PenTool, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type {
  TeamKanbanCard,
  TeamNote,
  TeamTab,
  TeamWhiteboardItem
} from '../../../../shared/teamwork/team-kanban-types'
import type { TeamRole } from '../../../../shared/teamwork/team-workspace-types'
import type { CollaboratorPresence } from '../../../../shared/teamwork/realtime/team-crdt-types'
import {
  computeBoardSprintMetrics,
  convertWhiteboardElementsToBoard,
  extractActionItemsFromMarkdownToBoard
} from './kanban/team-kanban-board-mutations'
import { TeamActivityView } from './activity/TeamActivityView'
import { TeamInboxPopover } from './activity/TeamInboxPopover'
import { TeamKanbanConnectedView } from './kanban/TeamKanbanConnectedView'
import { TeamWhiteboardConnectedView } from './whiteboard/TeamWhiteboardConnectedView'
import { TeamNotesConnectedView } from './notes/TeamNotesConnectedView'
import { TeamCollaboratorsStrip } from './workspace/TeamCollaboratorsStrip'
import { TeamProjectSelector } from './workspace/TeamProjectSelector'
import { TeamWorkspaceSearch } from './workspace/TeamWorkspaceSearch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useActiveWorktree } from '@/store/workspaces/selection/use-selected-worktree'
import { useActiveRepo } from '@/store/repos/use-repository-catalog'
import { useTeamDeepLinkJoinStore } from './hooks/team-deep-link-store'
import { useTeamInbox } from './hooks/use-team-inbox'
import { useTeamSyncAndAuth } from './hooks/use-team-sync-and-auth'
import { useTeamWorkspaceData } from './hooks/use-team-workspace-data'
import { useTeamWorkspaceRegistry } from './hooks/use-team-workspace-registry'
import { getTeamPreloadApi } from './hooks/use-team-workspace-registry-actions'

const EMPTY_NOTES: TeamNote[] = []

export default function TeamPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TeamTab>('kanban')
  const [activePeers, setActivePeers] = useState<CollaboratorPresence[]>([])
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null)
  const [focusedNoteId, setFocusedNoteId] = useState<string | undefined>(undefined)
  const activeWorktree = useActiveWorktree()
  const activeRepo = useActiveRepo()
  const projectPath = activeWorktree?.path ?? activeRepo?.path ?? null

  const pendingJoin = useTeamDeepLinkJoinStore((s) => s.pendingJoin)
  const setPendingJoin = useTeamDeepLinkJoinStore((s) => s.setPendingJoin)

  const syncAndAuth = useTeamSyncAndAuth()
  const registry = useTeamWorkspaceRegistry({
    activeWorktreeId: activeWorktree?.id,
    activeWorktreePath: activeWorktree?.path,
    activeRepoId: activeRepo?.id,
    activeRepoPath: activeRepo?.path,
    activeRepoDisplayName: activeRepo?.displayName,
    currentUser: syncAndAuth.user,
    currentUserId: syncAndAuth.user.userId
  })

  useEffect(() => {
    const teamApi = getTeamPreloadApi()
    if (!teamApi) {
      return
    }
    const unsub = teamApi.onDeepLinkJoin?.((payload) => {
      setPendingJoin(payload)
    })
    void teamApi.consumePendingDeepLinkJoin?.().then((payload) => {
      if (payload) {
        setPendingJoin(payload)
      }
    })
    return () => {
      unsub?.()
    }
  }, [setPendingJoin])

  const permissions = registry.permissions
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

  const inbox = useTeamInbox({
    teamId: registry.activeTeam?.id ?? 'team-local',
    projectId: activeProjectId,
    currentUser: {
      userId: syncAndAuth.user.userId,
      displayName: syncAndAuth.user.displayName,
      email: syncAndAuth.user.email
    }
  })

  const handleSelectTeam = useCallback(
    (teamId: string) => {
      setFocusedCardId(null)
      setFocusedNoteId(undefined)
      registry.setActiveTeamId(teamId)
    },
    [registry]
  )

  const handleSelectProject = useCallback(
    (projectId: string) => {
      setFocusedCardId(null)
      setFocusedNoteId(undefined)
      registry.setActiveProjectId(projectId)
    },
    [registry]
  )

  const handleJumpToCard = useCallback((card: TeamKanbanCard) => {
    setFocusedCardId(card.id)
    setActiveTab('kanban')
  }, [])

  const handleJumpToNote = useCallback((note: TeamNote) => {
    setFocusedNoteId(note.id)
    setActiveTab('notes')
  }, [])

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
      if (!permissions.canEditBoard) {
        toast.error('Modo solo lectura: no tienes permisos para modificar el tablero')
        return
      }
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
    [board, handleBoardChange, permissions.canEditBoard]
  )

  const handleConvertWhiteboardToKanban = useCallback(
    (elements: readonly TeamWhiteboardItem[]) => {
      if (!permissions.canEditBoard) {
        toast.error('Modo solo lectura: no tienes permisos para modificar el tablero')
        return
      }
      if (!board) {
        return
      }
      const { nextBoard, createdCount, skippedDuplicateCount, createdCards } =
        convertWhiteboardElementsToBoard(board, elements)
      if (createdCount === 0) {
        if (skippedDuplicateCount > 0) {
          toast.info('Este elemento de pizarra ya tiene una tarjeta creada en el Kanban')
        } else {
          toast.info('El elemento seleccionado no contiene texto convertible a tarjeta Kanban')
        }
        return
      }
      handleBoardChange(nextBoard)
      setActiveTab('kanban')
      const originLabel = createdCards[0]?.title
      toast.success(
        `${createdCount} ${createdCount === 1 ? 'tarjeta creada' : 'tarjetas creadas'} en el Kanban`,
        originLabel ? { description: `Origen: ${originLabel}` } : undefined
      )
    },
    [board, handleBoardChange, permissions.canEditBoard]
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
        permissions={permissions}
        projectMembersByProject={registry.projectMembersByProject}
        currentUser={syncAndAuth.user}
        syncStatus={syncAndAuth.syncStatus}
        onSelectTeam={handleSelectTeam}
        onSelectProject={handleSelectProject}
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
        pendingJoinToken={pendingJoin?.token ?? null}
        onClearPendingJoin={() => setPendingJoin(null)}
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

        <div className="flex items-center gap-2.5">
          <TeamWorkspaceSearch
            board={board}
            notes={notes}
            onSelectCard={handleJumpToCard}
            onSelectNote={handleJumpToNote}
          />
          {permissions.isReadOnly ? (
            <Badge
              variant="outline"
              data-testid="team-readonly-badge"
              className="text-3xs gap-1 border-amber-500/40 text-amber-500 bg-amber-500/10"
            >
              <Eye className="w-3 h-3" />
              Solo lectura (Viewer)
            </Badge>
          ) : null}
          <TeamCollaboratorsStrip
            currentUser={{ ...currentUserIdentity, color: '#3b82f6' }}
            peers={activePeers}
          />
          {boardMetrics && registry.currentProject && (
            <span className="text-2xs text-muted-foreground mr-1">
              {boardMetrics.completedCards}/{boardMetrics.totalCards} tareas ·{' '}
              {notes?.notes.length ?? 0} docs
            </span>
          )}
          <TeamInboxPopover
            items={inbox.items}
            unreadCount={inbox.unreadCount}
            loading={inbox.loading}
            onMarkAsRead={inbox.markAsRead}
            onMarkAllAsRead={inbox.markAllAsRead}
            onSelectTab={(tab) => setActiveTab(tab)}
            onRefresh={() => {
              void inbox.refresh()
            }}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              void refetch()
              void inbox.refresh()
            }}
            disabled={loading}
            title="Recargar datos del proyecto"
          >
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </header>

      <main className="flex flex-1 min-h-0 overflow-hidden">
        {!registry.currentProject ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <Lock className="size-6 text-amber-500" />
            <p className="text-sm font-medium text-foreground">No hay proyectos visibles</p>
            <p className="text-xs max-w-sm">
              Los proyectos privados de este equipo requieren invitación explícita o rol admin/owner.
            </p>
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeTab === 'kanban' && board ? (
          <TeamKanbanConnectedView
            key={activeProjectId}
            projectId={activeProjectId}
            projectPath={projectPath}
            initialBoard={board}
            currentUser={{ ...currentUserIdentity, color: '#3b82f6' }}
            userRole={registry.userRole}
            permissions={permissions}
            humanMembers={registry.humanMembers}
            availableNotes={notes?.notes ?? EMPTY_NOTES}
            relayUrl={syncAndAuth.effectiveRelayUrl}
            syncToken={syncAndAuth.syncToken}
            selectedCardId={focusedCardId}
            onSelectedCardIdChange={setFocusedCardId}
            onPersist={handleBoardChange}
            onPeersChange={setActivePeers}
          />
        ) : activeTab === 'whiteboard' && whiteboard ? (
          <TeamWhiteboardConnectedView
            key={activeProjectId}
            whiteboardId={activeProjectId}
            projectId={activeProjectId}
            initialWhiteboard={whiteboard}
            currentUser={{ ...currentUserIdentity, color: '#10b981' }}
            userRole={registry.userRole}
            permissions={permissions}
            relayUrl={syncAndAuth.effectiveRelayUrl}
            syncToken={syncAndAuth.syncToken}
            onPersist={handleWhiteboardChange}
            onPeersChange={setActivePeers}
            onConvertToKanban={handleConvertWhiteboardToKanban}
            onCreateTask={(item) => handleConvertWhiteboardToKanban([item])}
          />
        ) : activeTab === 'notes' && notes ? (
          <TeamNotesConnectedView
            key={activeProjectId}
            projectId={activeProjectId}
            initialNotes={notes}
            currentUser={{ ...currentUserIdentity, color: '#8b5cf6' }}
            userRole={registry.userRole}
            permissions={permissions}
            relayUrl={syncAndAuth.effectiveRelayUrl}
            syncToken={syncAndAuth.syncToken}
            selectedNoteId={focusedNoteId}
            onSelectNoteId={(noteId) => setFocusedNoteId(noteId ?? undefined)}
            onPersist={handleNotesChange}
            onPeersChange={setActivePeers}
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
