import { ipcMain } from 'electron'
import type {
  TeamActivityEntry,
  TeamSyncSettings
} from '../../shared/teamwork/team-workspace-types'
import type { TeamAuthService } from '../teamwork/team-auth-service'
import type { TeamEmailService } from '../teamwork/team-email-service'
import type { TeamHostDatabase } from '../teamwork/team-host-database'
import type { TeamRelayHttpClient } from '../teamwork/team-relay-http-client'
import type { TeamSyncRelayServer } from '../teamwork/team-sync-relay-server'

export function registerTeamAuthSyncAndMailHandlers(deps: {
  db: TeamHostDatabase
  emailService: TeamEmailService
  authService: TeamAuthService
  syncServer: TeamSyncRelayServer
  getRemoteRelayClient?: () => Promise<TeamRelayHttpClient | null>
}): void {
  const { db, emailService, authService, syncServer, getRemoteRelayClient } = deps

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
    async (_event, options: { teamId: string; projectId?: string; limit?: number }) => {
      const remote = await getRemoteRelayClient?.()
      if (remote) {
        return remote.listActivity(options)
      }
      return db.listActivity(options)
    }
  )

  ipcMain.handle(
    'team:recordActivity',
    async (_event, entry: Omit<TeamActivityEntry, 'id' | 'createdAt'>) => {
      const remote = await getRemoteRelayClient?.()
      if (remote) {
        return remote.recordActivity(entry)
      }
      return db.recordActivity(entry)
    }
  )

  ipcMain.handle('team:getCurrentUser', () => authService.getCurrentUser())

  ipcMain.handle(
    'team:updateUserProfile',
    (_event, input: { displayName: string; email: string }) => authService.updateUserProfile(input)
  )

  ipcMain.handle('team:requestMagicLinkCode', async (_event, email: string, displayName?: string) => {
    const remote = await getRemoteRelayClient?.()
    if (remote) {
      return remote.requestMagicLinkCode(email, displayName)
    }
    return authService.requestMagicLinkCode(email, displayName)
  })

  ipcMain.handle(
    'team:verifyMagicLinkCode',
    async (_event, email: string, code: string, displayName?: string) => {
      const remote = await getRemoteRelayClient?.()
      if (remote) {
        const current = await authService.getCurrentUser()
        const profile = await remote.verifyMagicLinkCode(email, code, displayName, current.userId)
        await authService.saveExternalVerifiedProfile(profile)
        return profile
      }
      return authService.verifyMagicLinkCode(email, code, displayName)
    }
  )

  ipcMain.handle('team:getSyncStatus', async () => {
    await syncServer.loadSettings()
    return syncServer.getStatus()
  })

  ipcMain.handle('team:configureSync', (_event, settings: Partial<TeamSyncSettings>) =>
    syncServer.configure(settings)
  )
}
