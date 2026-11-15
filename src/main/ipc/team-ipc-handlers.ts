import { app, BrowserWindow, ipcMain } from 'electron'
import type { FactoryConfig } from '../../shared/teamwork/team-factory-types'
import type {
  TeamApi,
  TeamExecutionEvent,
  TeamFactoryEvent,
  TeamMailConfigInput,
  TeamResolveFactoryGateRequest,
  TeamSendInvitationRequest,
  TeamSendInvitationResult,
  TeamStartExecutionRequest,
  TeamStartFactoryRunRequest
} from '../../shared/teamwork/team-ipc-types'
import type { ClaudeAccountService } from '../claude-accounts/service'
import type { CodexAccountService } from '../codex-accounts/service'
import { listConfiguredTeamAgents } from '../teamwork/team-agent-discovery'
import { TeamAgentRunner } from '../teamwork/team-agent-runner'
import { TeamEmailService } from '../teamwork/team-email-service'
import { TeamFactoryRunner } from '../teamwork/team-factory-runner'
import { TeamHostDatabase } from '../teamwork/team-host-database'

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
  return `orca://team/join?token=${encodeURIComponent(token)}`
}

export function registerTeamHandlers(deps: TeamIpcDeps): void {
  const db = new TeamHostDatabase()
  const emailService = new TeamEmailService()
  const runner = new TeamAgentRunner({
    getFallbackHomeDir: () => app.getPath('home'),
    onPersistExecution: (record) => db.upsertExecution(record),
    onLookupPersistedExecution: (id) => db.getExecution(id),
    onLookupLatestForCard: (cardId) => db.getLatestExecutionForCard(cardId)
  })
  const factoryRunner = new TeamFactoryRunner({
    getFallbackHomeDir: () => app.getPath('home'),
    loadConfig: (projectId) => db.getFactoryConfig(projectId),
    onPersistRun: (run) => db.upsertFactoryRun(run),
    onLookupRun: (runId) => db.getFactoryRun(runId),
    onLookupLatestForCard: (cardId) => db.getLatestFactoryRunForCard(cardId),
    onListRuns: (projectId) => db.listFactoryRuns(projectId)
  })

  app.once('will-quit', () => {
    runner.dispose()
    factoryRunner.dispose()
    db.close()
  })

  ipcMain.handle('team:listConfiguredAgents', (_event, options?: { refresh?: boolean }) =>
    listConfiguredTeamAgents({
      claudeAccounts: deps.claudeAccounts,
      codexAccounts: deps.codexAccounts,
      refresh: options?.refresh
    })
  )

  ipcMain.handle('team:startExecution', (_event, request: TeamStartExecutionRequest) =>
    runner.startExecution(request, broadcastExecutionEvent)
  )

  ipcMain.handle('team:cancelExecution', (_event, executionId: string) =>
    runner.cancelExecution(executionId)
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

  ipcMain.handle('team:getWorkspaceSnapshot', () => db.getWorkspaceSnapshot())

  ipcMain.handle('team:createTeam', (_event, input: Parameters<TeamApi['createTeam']>[0]) =>
    db.createTeam(input)
  )

  ipcMain.handle('team:createProject', (_event, input: Parameters<TeamApi['createProject']>[0]) =>
    db.createProject(input)
  )

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
    (_event, token: string, userId: string, displayName?: string, email?: string) =>
      db.acceptInvitation(token, userId, displayName, email)
  )

  ipcMain.handle('team:revokeInvitation', (_event, invitationId: string, actorUserId: string) =>
    db.revokeInvitation(invitationId, actorUserId)
  )

  ipcMain.handle('team:getMailConfig', () => emailService.getMailConfig())

  ipcMain.handle('team:saveMailConfig', (_event, input: TeamMailConfigInput) =>
    emailService.saveMailConfig(input)
  )

  ipcMain.handle('team:testMailConfig', (_event, toEmail: string) =>
    emailService.testMailConfig(toEmail)
  )
}
