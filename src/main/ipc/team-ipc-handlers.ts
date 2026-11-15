import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import type {
  TeamApi,
  TeamApproveExecutionRequest,
  TeamExecutionEvent,
  TeamRejectExecutionRequest,
  TeamRequestExecutionChangesRequest,
  TeamSendInvitationRequest,
  TeamSendInvitationResult,
  TeamStartExecutionRequest
} from '../../shared/teamwork/team-ipc-types'
import type {
  AgentExecutionRecord,
  TeamActivityEntry
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
    const record = await runner.startExecution(request, broadcastExecutionEvent)
    recordSystemActivity({
      teamId: resolveTeamIdForProject(request.projectId),
      projectId: request.projectId,
      actorId: request.actorUserId,
      actorName: request.actorUserId,
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
    const updated = await runner.approveExecution(request)
    if (updated) {
      broadcastExecutionEvent({ type: 'updated', execution: updated })
      recordSystemActivity({
        teamId: resolveTeamIdForProject(updated.projectId),
        projectId: updated.projectId,
        actorId: request.actorUserId ?? 'local-owner',
        actorName: request.actorName ?? request.actorUserId ?? 'Equipo',
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
    const updated = await runner.rejectExecution(request)
    if (updated) {
      broadcastExecutionEvent({ type: 'updated', execution: updated })
      recordSystemActivity({
        teamId: resolveTeamIdForProject(updated.projectId),
        projectId: updated.projectId,
        actorId: request.actorUserId ?? 'local-owner',
        actorName: request.actorName ?? request.actorUserId ?? 'Equipo',
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

  ipcMain.handle('team:createProject', (_event, input: Parameters<TeamApi['createProject']>[0]) => {
    const project = db.createProject(input)
    recordSystemActivity({
      teamId: project.teamId,
      projectId: project.id,
      actorId: input.actorUserId ?? 'local-owner',
      actorName: input.actorUserId ?? 'Equipo',
      actorType: 'human',
      action: 'project.created',
      targetType: 'project',
      targetId: project.id,
      summary: `Creó el proyecto "${project.name}" (${project.visibility})`
    })
    return project
  })

  ipcMain.handle(
    'team:sendInvitation',
    async (_event, request: TeamSendInvitationRequest): Promise<TeamSendInvitationResult> => {
      const invitation = db.createAndPersistInvitation(request)
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
        actorId: request.invitedBy,
        actorName: request.inviterName ?? request.invitedBy,
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

  ipcMain.handle('team:revokeInvitation', (_event, invitationId: string, actorUserId: string) =>
    db.revokeInvitation(invitationId, actorUserId)
  )

  registerTeamAuthSyncAndMailHandlers({ db, emailService, authService, syncServer })
}
