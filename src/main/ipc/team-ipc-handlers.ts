import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import type { FactoryConfig } from '../../shared/teamwork/team-factory-types'
import type {
  TeamAddCardCommentRequest,
  TeamApi,
  TeamApproveExecutionRequest,
  TeamExecutionEvent,
  TeamFactoryEvent,
  TeamRejectExecutionRequest,
  TeamRequestExecutionChangesRequest,
  TeamResolveFactoryGateRequest,
  TeamSendInvitationRequest,
  TeamSendInvitationResult,
  TeamStartExecutionRequest,
  TeamStartFactoryRunRequest
} from '../../shared/teamwork/team-ipc-types'
import {
  canAccessProject,
  getTeamPermissions
} from '../../shared/teamwork/team-rbac-policy'
import type {
  AgentExecutionRecord,
  TeamActivityEntry,
  TeamRole
} from '../../shared/teamwork/team-workspace-types'
import type { ClaudeAccountService } from '../claude-accounts/service'
import type { CodexAccountService } from '../codex-accounts/service'
import { listConfiguredTeamAgents } from '../teamwork/team-agent-discovery'
import { TeamAgentRunner } from '../teamwork/team-agent-runner'
import { TeamAuthService } from '../teamwork/team-auth-service'
import { buildTeamJoinUrl } from '../teamwork/team-deep-link'
import { TeamEmailService } from '../teamwork/team-email-service'
import { TeamFactoryRunner } from '../teamwork/team-factory-runner'
import { TeamHostDatabase } from '../teamwork/team-host-database'
import { slugify } from '../teamwork/team-host-database-queries'
import { TeamRelayHttpClient } from '../teamwork/team-relay-http-client'
import { TeamSyncRelayServer } from '../teamwork/team-sync-relay-server'
import { registerTeamAuthSyncAndMailHandlers } from './team-workspace-ipc'

export type TeamIpcDeps = {
  claudeAccounts: ClaudeAccountService
  codexAccounts: CodexAccountService
}

function broadcastExecutionEvent(event: TeamExecutionEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('team:executionEvent', event)
    }
  }
}

function broadcastFactoryEvent(event: TeamFactoryEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('team:factoryEvent', event)
    }
  }
}

function buildJoinUrl(token: string): string {
  return buildTeamJoinUrl(token)
}

function notifyExecutionOutcome(record: AgentExecutionRecord): void {
  if (!Notification.isSupported()) {
    return
  }
  const titleByStatus: Record<string, string> = {
    completed: `Agente ${record.agentId} completó la tarea`,
    failed: `Agente ${record.agentId} falló en la tarea`,
    waiting_for_input: `Aprobación requerida (${record.agentId})`
  }
  const title = titleByStatus[record.status]
  if (!title) {
    return
  }
  const body =
    record.status === 'failed'
      ? record.error || 'Revisar logs de ejecución en Orca Teams'
      : record.branchOrWorktree
        ? `Rama: ${record.branchOrWorktree}`
        : record.outputSummary?.slice(0, 120) || 'Abrir Orca Teams para ver detalles'
  new Notification({ title, body }).show()
}

export function registerTeamHandlers(deps: TeamIpcDeps): void {
  const db = new TeamHostDatabase()
  const emailService = new TeamEmailService()
  const authService = new TeamAuthService(db, emailService)
  const syncServer = new TeamSyncRelayServer(db, { authService, emailService })

  const getRemoteRelayClient = async (): Promise<TeamRelayHttpClient | null> => {
    const settings = await syncServer.loadSettings()
    if (settings.mode === 'remote' && settings.relayUrl.trim()) {
      return new TeamRelayHttpClient({
        relayUrl: settings.relayUrl,
        roomSecret: settings.roomSecret
      })
    }
    return null
  }

  const recordSystemActivity = (entry: Omit<TeamActivityEntry, 'id' | 'createdAt'>): void => {
    try {
      db.recordActivity(entry)
    } catch {
      // Activity logging must never break primary mutations.
    }
  }

  const resolveTeamIdForProject = (projectId: string): string => {
    const snapshot = db.getWorkspaceSnapshot()
    const proj = snapshot.projects.find((p) => p.id === projectId)
    return proj?.teamId ?? snapshot.teams[0]?.id ?? 'team-local'
  }

  const resolveActorUserId = async (explicitActorId?: string): Promise<string> => {
    const trimmed = explicitActorId?.trim()
    if (trimmed) {
      return trimmed
    }
    const currentUser = await authService.getCurrentUser()
    return currentUser.userId
  }

  const requireTeamRole = (teamId: string, actorUserId: string): TeamRole => {
    const role = db.getTeamMemberRole(teamId, actorUserId)
    if (!role) {
      throw new Error('Acceso denegado: el usuario no es miembro de este equipo')
    }
    return role
  }

  const requireProjectPermission = (
    projectId: string,
    actorUserId: string,
    permission: 'canDispatchAgents' | 'canApproveExecutions',
    errorMessage: string
  ): void => {
    const project = projectId ? db.getProject(projectId) : null
    const teamId = project?.teamId ?? resolveTeamIdForProject(projectId)
    const role = requireTeamRole(teamId, actorUserId)
    const permissions = getTeamPermissions(role)
    if (!permissions[permission]) {
      throw new Error(errorMessage)
    }
    if (project) {
      const isExplicit = db.isExplicitProjectMember(project.id, actorUserId)
      if (!canAccessProject(project, role, isExplicit)) {
        throw new Error('Acceso denegado: no tienes visibilidad sobre este proyecto privado')
      }
    }
  }

  const runner = new TeamAgentRunner({
    getFallbackHomeDir: () => app.getPath('home'),
    onPersistExecution: (record) => db.upsertExecution(record),
    onLookupPersistedExecution: (id) => db.getExecution(id),
    onLookupLatestForCard: (cardId) => db.getLatestExecutionForCard(cardId),
    onNotifyOutcome: (record) => {
      notifyExecutionOutcome(record)
      recordSystemActivity({
        teamId: resolveTeamIdForProject(record.projectId),
        projectId: record.projectId,
        actorId: record.agentId,
        actorName: record.agentId,
        actorType: 'agent',
        action: `execution.${record.status}`,
        targetType: 'execution',
        targetId: record.id,
        summary:
          record.status === 'waiting_for_input'
            ? `${record.agentId} finalizó y espera aprobación humana (${record.branchOrWorktree ?? record.taskId})`
            : record.status === 'completed'
              ? `${record.agentId} completó ejecución en ${record.branchOrWorktree ?? 'workspace'}`
              : `${record.agentId} terminó con estado ${record.status}`
      })
    }
  })
  const factoryRunner = new TeamFactoryRunner({
    getFallbackHomeDir: () => app.getPath('home'),
    loadConfig: (projectId) => db.getFactoryConfig(projectId),
    onPersistRun: (run) => db.upsertFactoryRun(run),
    onLookupRun: (runId) => db.getFactoryRun(runId),
    onLookupLatestForCard: (cardId) => db.getLatestFactoryRunForCard(cardId),
    onListRuns: (projectId) => db.listFactoryRuns(projectId)
  })

  void syncServer.initializeFromPersistedSettings().catch(() => undefined)

  app.once('will-quit', () => {
    runner.dispose()
    factoryRunner.dispose()
    void syncServer.stopHosting()
    db.close()
  })

  ipcMain.handle('team:listConfiguredAgents', (_event, options?: { refresh?: boolean }) =>
    listConfiguredTeamAgents({
      claudeAccounts: deps.claudeAccounts,
      codexAccounts: deps.codexAccounts,
      refresh: options?.refresh
    })
  )

  ipcMain.handle('team:startExecution', async (_event, request: TeamStartExecutionRequest) => {
    const actorUserId = await resolveActorUserId(request.actorUserId)
    requireProjectPermission(
      request.projectId,
      actorUserId,
      'canDispatchAgents',
      'Permisos insuficientes: tu rol no permite despachar agentes'
    )
    const record = await runner.startExecution(
      { ...request, actorUserId },
      broadcastExecutionEvent
    )
    recordSystemActivity({
      teamId: resolveTeamIdForProject(request.projectId),
      projectId: request.projectId,
      actorId: actorUserId,
      actorName: actorUserId,
      actorType: 'human',
      action: 'execution.started',
      targetType: 'card',
      targetId: request.card.id,
      summary: `Despachó "${request.card.title}" a ${record.agentId}`
    })
    return record
  })

  ipcMain.handle('team:cancelExecution', (_event, executionId: string) =>
    runner.cancelExecution(executionId)
  )

  ipcMain.handle('team:approveExecution', async (_event, request: TeamApproveExecutionRequest) => {
    const existing = runner.getExecution(request.executionId)
    const actorUserId = await resolveActorUserId(request.actorUserId)
    requireProjectPermission(
      existing?.projectId ?? '',
      actorUserId,
      'canApproveExecutions',
      'Permisos insuficientes: tu rol no permite aprobar ejecuciones'
    )
    const updated = await runner.approveExecution({ ...request, actorUserId })
    if (updated) {
      broadcastExecutionEvent({ type: 'updated', execution: updated })
      recordSystemActivity({
        teamId: resolveTeamIdForProject(updated.projectId),
        projectId: updated.projectId,
        actorId: actorUserId,
        actorName: request.actorName ?? actorUserId,
        actorType: 'human',
        action: 'execution.approved',
        targetType: 'execution',
        targetId: updated.id,
        summary: request.mergeToBase
          ? `Aprobó y fusionó cambios de ${updated.agentId} (${updated.branchOrWorktree ?? updated.taskId})`
          : `Aprobó cambios de ${updated.agentId}`
      })
    }
    return updated
  })

  ipcMain.handle('team:rejectExecution', async (_event, request: TeamRejectExecutionRequest) => {
    const existing = runner.getExecution(request.executionId)
    const actorUserId = await resolveActorUserId(request.actorUserId)
    requireProjectPermission(
      existing?.projectId ?? '',
      actorUserId,
      'canApproveExecutions',
      'Permisos insuficientes: tu rol no permite rechazar ejecuciones'
    )
    const updated = await runner.rejectExecution({ ...request, actorUserId })
    if (updated) {
      broadcastExecutionEvent({ type: 'updated', execution: updated })
      recordSystemActivity({
        teamId: resolveTeamIdForProject(updated.projectId),
        projectId: updated.projectId,
        actorId: actorUserId,
        actorName: request.actorName ?? actorUserId,
        actorType: 'human',
        action: 'execution.rejected',
        targetType: 'execution',
        targetId: updated.id,
        summary: `Rechazó ejecución de ${updated.agentId}${request.discardWorktree ? ' y descartó worktree' : ''}`
      })
    }
    return updated
  })

  ipcMain.handle('team:getExecutionDiff', (_event, executionId: string) =>
    runner.getExecutionDiff(executionId)
  )

  ipcMain.handle(
    'team:requestExecutionChanges',
    async (_event, request: TeamRequestExecutionChangesRequest) => {
      const updated = await runner.requestExecutionChanges(request, broadcastExecutionEvent)
      if (updated) {
        broadcastExecutionEvent({ type: 'updated', execution: updated })
        const preview = request.feedback.trim().slice(0, 120)
        recordSystemActivity({
          teamId: resolveTeamIdForProject(updated.projectId),
          projectId: updated.projectId,
          actorId: request.actorUserId ?? 'local-owner',
          actorName: request.actorName ?? request.actorUserId ?? 'Equipo',
          actorType: 'human',
          action: 'execution.changes_requested',
          targetType: 'execution',
          targetId: updated.id,
          summary: `Solicitó correcciones a ${updated.agentId}: ${preview}`
        })
      }
      return updated
    }
  )

  ipcMain.handle('team:getExecution', (_event, executionId: string) =>
    runner.getExecution(executionId)
  )

  ipcMain.handle('team:getLatestExecutionForCard', (_event, cardId: string) =>
    runner.getLatestExecutionForCard(cardId)
  )

  ipcMain.handle('team:getFactoryConfig', (_event, projectId: string) =>
    db.getFactoryConfig(projectId)
  )

  ipcMain.handle('team:saveFactoryConfig', (_event, config: FactoryConfig) =>
    db.saveFactoryConfig(config)
  )

  ipcMain.handle('team:startFactoryRun', (_event, request: TeamStartFactoryRunRequest) =>
    factoryRunner.startRun(request, broadcastFactoryEvent)
  )

  ipcMain.handle('team:cancelFactoryRun', (_event, runId: string) => factoryRunner.cancelRun(runId))

  ipcMain.handle('team:resolveFactoryHumanGate', (_event, request: TeamResolveFactoryGateRequest) =>
    factoryRunner.resolveHumanGate(request)
  )

  ipcMain.handle('team:getFactoryRun', (_event, runId: string) => factoryRunner.getRun(runId))

  ipcMain.handle('team:getLatestFactoryRunForCard', (_event, cardId: string) =>
    factoryRunner.getLatestRunForCard(cardId)
  )

  ipcMain.handle('team:listFactoryRuns', (_event, projectId: string) =>
    factoryRunner.listRuns(projectId)
  )

  ipcMain.handle('team:getWorkspaceSnapshot', async () => {
    const remote = await getRemoteRelayClient()
    if (remote) {
      return remote.getWorkspaceSnapshot()
    }
    return db.getWorkspaceSnapshot()
  })

  ipcMain.handle('team:createTeam', async (_event, input: Parameters<TeamApi['createTeam']>[0]) => {
    const remote = await getRemoteRelayClient()
    if (remote) {
      return remote.createTeam(input)
    }
    const team = db.createTeam(input)
    recordSystemActivity({
      teamId: team.id,
      actorId: team.ownerId,
      actorName: team.ownerId,
      actorType: 'human',
      action: 'team.created',
      targetType: 'team',
      targetId: team.id,
      summary: `Creó el equipo "${team.name}"`
    })
    return team
  })

  ipcMain.handle(
    'team:createProject',
    async (_event, input: Parameters<TeamApi['createProject']>[0]) => {
      const remote = await getRemoteRelayClient()
      if (remote) {
        return remote.createProject(input)
      }
      const actorUserId = await resolveActorUserId(input.actorUserId)
      const role = requireTeamRole(input.teamId, actorUserId)
      if (!getTeamPermissions(role).canCreateProject) {
        throw new Error('Permisos insuficientes: tu rol no permite crear proyectos')
      }
      const project = db.createProject({ ...input, actorUserId })
      recordSystemActivity({
        teamId: project.teamId,
        projectId: project.id,
        actorId: actorUserId,
        actorName: actorUserId,
        actorType: 'human',
        action: 'project.created',
        targetType: 'project',
        targetId: project.id,
        summary: `Creó el proyecto "${project.name}" (${project.visibility})`
      })
      return project
    }
  )

  ipcMain.handle(
    'team:sendInvitation',
    async (_event, request: TeamSendInvitationRequest): Promise<TeamSendInvitationResult> => {
      const remote = await getRemoteRelayClient()
      if (remote) {
        return remote.sendInvitation(request)
      }
      const actorUserId = await resolveActorUserId(request.invitedBy)
      const role = requireTeamRole(request.teamId, actorUserId)
      if (!getTeamPermissions(role).canManageMembers) {
        throw new Error('Permisos insuficientes: se requiere rol admin u owner para invitar')
      }
      const invitation = db.createAndPersistInvitation({ ...request, invitedBy: actorUserId })
      const joinUrl = buildJoinUrl(invitation.token)
      const mail = await emailService.sendInvitationEmail({
        toEmail: invitation.email,
        teamName: request.teamName,
        role: invitation.role,
        joinUrl,
        token: invitation.token,
        inviterName: request.inviterName
      })
      recordSystemActivity({
        teamId: request.teamId,
        actorId: actorUserId,
        actorName: request.inviterName ?? actorUserId,
        actorType: 'human',
        action: 'invitation.sent',
        targetType: 'invitation',
        targetId: invitation.id,
        summary: `Invitó a ${invitation.email} como ${invitation.role}`
      })
      return {
        invitation,
        joinUrl,
        emailSent: mail.sent,
        ...(mail.transportUsed ? { transportUsed: mail.transportUsed } : {}),
        ...(mail.error ? { error: mail.error } : {}),
        ...(mail.needsMailConfig ? { needsMailConfig: true } : {})
      }
    }
  )

  ipcMain.handle(
    'team:resendInvitation',
    async (
      _event,
      invitationId: string,
      inviterName?: string
    ): Promise<TeamSendInvitationResult> => {
      const remote = await getRemoteRelayClient()
      if (remote) {
        return remote.resendInvitation(invitationId, inviterName)
      }
      const invitation = db.getInvitationById(invitationId)
      if (!invitation) {
        throw new Error('Invitación no encontrada')
      }
      if (invitation.status !== 'pending' || Date.now() > invitation.expiresAt) {
        throw new Error('La invitación ya no está pendiente o ha expirado')
      }
      const team = db.getTeam(invitation.teamId)
      const joinUrl = buildJoinUrl(invitation.token)
      const mail = await emailService.sendInvitationEmail({
        toEmail: invitation.email,
        teamName: team?.name ?? invitation.teamId,
        role: invitation.role,
        joinUrl,
        token: invitation.token,
        inviterName
      })
      return {
        invitation,
        joinUrl,
        emailSent: mail.sent,
        ...(mail.transportUsed ? { transportUsed: mail.transportUsed } : {}),
        ...(mail.error ? { error: mail.error } : {}),
        ...(mail.needsMailConfig ? { needsMailConfig: true } : {})
      }
    }
  )

  ipcMain.handle(
    'team:acceptInvitation',
    async (_event, token: string, userId: string, displayName?: string, email?: string) => {
      const remote = await getRemoteRelayClient()
      if (remote) {
        const currentUser = await authService.getCurrentUser()
        let resolvedUserId =
          userId.trim() && userId.trim() !== 'local-owner' ? userId.trim() : currentUser.userId
        if (!resolvedUserId || resolvedUserId === 'local-owner') {
          const hint = email?.split('@')[0] || displayName || randomUUID().slice(0, 8)
          resolvedUserId = `usr-${slugify(hint, 'member')}-${randomUUID().slice(0, 4)}`
        }
        const member = await remote.acceptInvitation(
          token,
          resolvedUserId,
          displayName || currentUser.displayName,
          email || currentUser.email
        )
        if (currentUser.userId === 'local-owner') {
          await authService.saveExternalVerifiedProfile({
            userId: member.userId,
            email: member.email || email || currentUser.email,
            displayName: member.displayName || displayName || currentUser.displayName,
            authMethod: currentUser.authMethod,
            authenticatedAt: Date.now()
          })
        }
        return member
      }
      const member = db.acceptInvitation(token, userId, displayName, email)
      recordSystemActivity({
        teamId: member.teamId,
        actorId: member.userId,
        actorName: member.displayName,
        actorType: 'human',
        action: 'member.joined',
        targetType: 'member',
        targetId: member.userId,
        summary: `${member.displayName} se unió al equipo con rol ${member.role}`
      })
      return member
    }
  )

  ipcMain.handle(
    'team:revokeInvitation',
    async (_event, invitationId: string, actorUserId: string) => {
      const remote = await getRemoteRelayClient()
      if (remote) {
        return remote.revokeInvitation(invitationId, actorUserId)
      }
      const invitation = db.getInvitationById(invitationId)
      if (!invitation) {
        throw new Error('Invitación no encontrada')
      }
      const resolvedActorId = await resolveActorUserId(actorUserId)
      const role = requireTeamRole(invitation.teamId, resolvedActorId)
      if (!getTeamPermissions(role).canManageMembers) {
        throw new Error(
          'Permisos insuficientes: se requiere rol admin u owner para revocar invitaciones'
        )
      }
      db.revokeInvitation(invitationId, resolvedActorId)
    }
  )

  ipcMain.handle('team:listCardComments', (_event, cardId: string) => db.listCardComments(cardId))

  ipcMain.handle('team:addCardComment', (_event, request: TeamAddCardCommentRequest) => {
    const comment = db.addCardComment(request)
    recordSystemActivity({
      teamId: resolveTeamIdForProject(comment.projectId),
      projectId: comment.projectId,
      actorId: comment.authorId,
      actorName: comment.authorName,
      actorType: comment.authorType,
      action: 'comment.added',
      targetType: 'card',
      targetId: comment.cardId,
      summary:
        comment.mentions.length > 0
          ? `Comentó en tarjeta (${comment.mentions.map((m) => `@${m.token}`).join(', ')}): "${comment.body.slice(0, 80)}"`
          : `Comentó en tarjeta: "${comment.body.slice(0, 80)}"`,
      metadata: {
        commentId: comment.id,
        cardId: comment.cardId,
        mentions: comment.mentions.map((m) => m.token)
      }
    })
    return comment
  })

  ipcMain.handle('team:deleteCardComment', (_event, commentId: string) =>
    db.deleteCardComment(commentId)
  )

  registerTeamAuthSyncAndMailHandlers({
    db,
    emailService,
    authService,
    syncServer,
    getRemoteRelayClient
  })
}
