import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import type {
  TeamApi,
  TeamApproveExecutionRequest,
  TeamExecutionEvent,
  TeamRejectExecutionRequest,
  TeamSendInvitationRequest,
  TeamSendInvitationResult,
  TeamStartExecutionRequest
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
import { TeamEmailService } from '../teamwork/team-email-service'
import { TeamHostDatabase } from '../teamwork/team-host-database'
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

function buildJoinUrl(token: string): string {
  return `orca://team/join?token=${encodeURIComponent(token)}`
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
  const syncServer = new TeamSyncRelayServer(db)

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

  void syncServer.initializeFromPersistedSettings().catch(() => undefined)

  app.once('will-quit', () => {
    runner.dispose()
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

  ipcMain.handle('team:getExecution', (_event, executionId: string) =>
    runner.getExecution(executionId)
  )

  ipcMain.handle('team:getLatestExecutionForCard', (_event, cardId: string) =>
    runner.getLatestExecutionForCard(cardId)
  )

  ipcMain.handle('team:getWorkspaceSnapshot', () => db.getWorkspaceSnapshot())

  ipcMain.handle('team:createTeam', (_event, input: Parameters<TeamApi['createTeam']>[0]) => {
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
    (_event, token: string, userId: string, displayName?: string, email?: string) => {
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

  registerTeamAuthSyncAndMailHandlers({ db, emailService, authService, syncServer })
}
