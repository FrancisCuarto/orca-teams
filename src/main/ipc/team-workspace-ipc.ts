import { ipcMain } from 'electron'
import type {
  TeamActivityEntry,
  TeamSyncSettings
} from '../../shared/teamwork/team-workspace-types'
import type { TeamAuthService } from '../teamwork/team-auth-service'
import type { TeamEmailService } from '../teamwork/team-email-service'
import type { TeamHostDatabase } from '../teamwork/team-host-database'
import type { TeamSyncRelayServer } from '../teamwork/team-sync-relay-server'

export function registerTeamAuthSyncAndMailHandlers(deps: {
  db: TeamHostDatabase
  emailService: TeamEmailService
  authService: TeamAuthService
  syncServer: TeamSyncRelayServer
}): void {
  const { db, emailService, authService, syncServer } = deps

  ipcMain.handle('team:getMailConfig', () => emailService.getMailConfig())

  ipcMain.handle(
    'team:saveMailConfig',
    (_event, input: Parameters<TeamEmailService['saveMailConfig']>[0]) =>
      emailService.saveMailConfig(input)
  )

  ipcMain.handle('team:testMailConfig', (_event, toEmail: string) =>
    emailService.testMailConfig(toEmail)
  )

  ipcMain.handle(
    'team:listActivity',
    (_event, options: { teamId: string; projectId?: string; limit?: number }) =>
      db.listActivity(options)
  )

  ipcMain.handle(
    'team:recordActivity',
    (_event, entry: Omit<TeamActivityEntry, 'id' | 'createdAt'>) => db.recordActivity(entry)
  )

  ipcMain.handle('team:getCurrentUser', () => authService.getCurrentUser())

  ipcMain.handle(
    'team:updateUserProfile',
    (_event, input: { displayName: string; email: string }) => authService.updateUserProfile(input)
  )

  ipcMain.handle('team:requestMagicLinkCode', (_event, email: string, displayName?: string) =>
    authService.requestMagicLinkCode(email, displayName)
  )

  ipcMain.handle(
    'team:verifyMagicLinkCode',
    (_event, email: string, code: string, displayName?: string) =>
      authService.verifyMagicLinkCode(email, code, displayName)
  )

  ipcMain.handle('team:getSyncStatus', async () => {
    await syncServer.loadSettings()
    return syncServer.getStatus()
  })

  ipcMain.handle('team:configureSync', (_event, settings: Partial<TeamSyncSettings>) =>
    syncServer.configure(settings)
  )
}
