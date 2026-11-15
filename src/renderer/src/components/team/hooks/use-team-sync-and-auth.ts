import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TeamSyncRuntimeStatus } from '../../../../../shared/teamwork/team-ipc-types'
import type {
  TeamSyncSettings,
  TeamUserProfile
} from '../../../../../shared/teamwork/team-workspace-types'
import { getTeamsTeamApi } from '../storage/team-web-relay-api'

const FALLBACK_USER: TeamUserProfile = {
  userId: 'local-owner',
  email: 'owner@local.orca',
  displayName: 'Equipo Local',
  authMethod: 'local',
  authenticatedAt: 0
}

const FALLBACK_SYNC_STATUS: TeamSyncRuntimeStatus = {
  settings: {
    mode: 'local',
    relayUrl: '',
    hostPort: 4789,
    autoConnect: false
  },
  hostingActive: false,
  hostingUrl: null,
  connectedPeers: 0,
  activeRooms: 0
}

export function useTeamSyncAndAuth() {
  const [user, setUser] = useState<TeamUserProfile>(FALLBACK_USER)
  const [syncStatus, setSyncStatus] = useState<TeamSyncRuntimeStatus>(FALLBACK_SYNC_STATUS)

  const refreshSyncAndAuth = useCallback(async () => {
    const teamApi = getTeamsTeamApi()
    if (!teamApi) {
      return
    }
    try {
      const [loadedUser, loadedSync] = await Promise.all([
        teamApi.getCurrentUser(),
        teamApi.getSyncStatus()
      ])
      setUser(loadedUser)
      setSyncStatus(loadedSync)
    } catch {
      // Keep local fallback when runtime API is unavailable.
    }
  }, [])

  useEffect(() => {
    void refreshSyncAndAuth()
  }, [refreshSyncAndAuth])

  const updateProfile = useCallback(
    async (input: { displayName: string; email: string }): Promise<TeamUserProfile> => {
      const teamApi = getTeamsTeamApi()
      if (!teamApi) {
        const next = { ...user, ...input, authenticatedAt: Date.now() }
        setUser(next)
        return next
      }
      const next = await teamApi.updateUserProfile(input)
      setUser(next)
      return next
    },
    [user]
  )

  const requestMagicCode = useCallback(async (email: string, displayName?: string) => {
    const teamApi = getTeamsTeamApi()
    if (!teamApi) {
      throw new Error('Servicio de autenticación no disponible')
    }
    return teamApi.requestMagicLinkCode(email, displayName)
  }, [])

  const verifyMagicCode = useCallback(
    async (email: string, code: string, displayName?: string): Promise<TeamUserProfile> => {
      const teamApi = getTeamsTeamApi()
      if (!teamApi) {
        throw new Error('Servicio de autenticación no disponible')
      }
      const verified = await teamApi.verifyMagicLinkCode(email, code, displayName)
      setUser(verified)
      return verified
    },
    []
  )

  const configureSync = useCallback(
    async (settings: Partial<TeamSyncSettings>): Promise<TeamSyncRuntimeStatus> => {
      const teamApi = getTeamsTeamApi()
      if (!teamApi) {
        const merged: TeamSyncRuntimeStatus = {
          ...syncStatus,
          settings: { ...syncStatus.settings, ...settings }
        }
        setSyncStatus(merged)
        return merged
      }
      const updated = await teamApi.configureSync(settings)
      setSyncStatus(updated)
      return updated
    },
    [syncStatus]
  )

  const effectiveRelayUrl = useMemo(() => {
    if (syncStatus.settings.mode === 'host' && syncStatus.hostingActive) {
      return syncStatus.hostingUrl
    }
    if (syncStatus.settings.mode === 'remote' && syncStatus.settings.relayUrl.trim()) {
      return syncStatus.settings.relayUrl.trim()
    }
    return null
  }, [syncStatus])

  return {
    user,
    syncStatus,
    effectiveRelayUrl,
    syncToken: syncStatus.settings.roomSecret,
    refreshSyncAndAuth,
    updateProfile,
    requestMagicCode,
    verifyMagicCode,
    configureSync
  }
}
