import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildTeamInboxItems,
  parseTeamInboxReadState,
  type TeamInboxItem,
  type TeamInboxReadState,
  type TeamInboxTargetUser
} from '../../../../../shared/teamwork/team-inbox-types'
import type { TeamActivityEntry } from '../../../../../shared/teamwork/team-workspace-types'
import { getTeamPreloadApi } from './use-team-workspace-registry-actions'

const INBOX_STORAGE_PREFIX = 'orca.teams.inbox.read:'
const MAX_PERSISTED_READ_IDS = 500
const DEFAULT_POLL_INTERVAL_MS = 30000

function getStorageKey(userId: string): string {
  return `${INBOX_STORAGE_PREFIX}${userId}`
}

function readPersistedState(userId: string): TeamInboxReadState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { readIds: [] }
  }
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId))
    if (!raw) {
      return { readIds: [] }
    }
    const parsed: unknown = JSON.parse(raw)
    return parseTeamInboxReadState(parsed)
  } catch {
    return { readIds: [] }
  }
}

function writePersistedState(userId: string, state: TeamInboxReadState): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  try {
    const trimmedIds = state.readIds.slice(-MAX_PERSISTED_READ_IDS)
    const payload: TeamInboxReadState =
      state.markedAllReadAt !== undefined
        ? { readIds: trimmedIds, markedAllReadAt: state.markedAllReadAt }
        : { readIds: trimmedIds }
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(payload))
  } catch {
    // Ignore storage quota / security errors in restricted environments.
  }
}

export type UseTeamInboxOptions = {
  teamId: string
  projectId?: string
  currentUser: TeamInboxTargetUser
  activities?: readonly TeamActivityEntry[]
  pollIntervalMs?: number
}

export type UseTeamInboxReturn = {
  items: TeamInboxItem[]
  unreadCount: number
  loading: boolean
  markAsRead: (itemId: string) => void
  markAllAsRead: () => void
  refresh: () => Promise<void>
}

export function useTeamInbox({
  teamId,
  projectId,
  currentUser,
  activities: providedActivities,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
}: UseTeamInboxOptions): UseTeamInboxReturn {
  const [fetchedActivities, setFetchedActivities] = useState<TeamActivityEntry[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [readStateByUser, setReadStateByUser] = useState<Record<string, TeamInboxReadState>>(() => ({
    [currentUser.userId]: readPersistedState(currentUser.userId)
  }))

  const refresh = useCallback(async () => {
    if (providedActivities !== undefined) {
      return
    }
    const teamApi = getTeamPreloadApi()
    if (!teamApi?.listActivity) {
      return
    }
    setLoading(true)
    try {
      const entries = await teamApi.listActivity({ teamId, projectId, limit: 100 })
      setFetchedActivities(entries)
    } catch {
      // Keep previously loaded activity entries when IPC fails transiently.
    } finally {
      setLoading(false)
    }
  }, [teamId, projectId, providedActivities])

  useEffect(() => {
    if (providedActivities !== undefined) {
      return
    }
    void refresh()
    if (pollIntervalMs <= 0) {
      return
    }
    const timer = setInterval(() => {
      void refresh()
    }, pollIntervalMs)
    return () => {
      clearInterval(timer)
    }
  }, [providedActivities, pollIntervalMs, refresh])

  const targetUser = useMemo<TeamInboxTargetUser>(
    () => ({
      userId: currentUser.userId,
      displayName: currentUser.displayName,
      email: currentUser.email
    }),
    [currentUser.userId, currentUser.displayName, currentUser.email]
  )

  const activeReadState = useMemo(
    () => readStateByUser[targetUser.userId] ?? readPersistedState(targetUser.userId),
    [readStateByUser, targetUser.userId]
  )

  const sourceActivities = providedActivities ?? fetchedActivities

  const items = useMemo(
    () => buildTeamInboxItems(sourceActivities, targetUser, activeReadState),
    [sourceActivities, targetUser, activeReadState]
  )

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items])

  const markAsRead = useCallback(
    (itemId: string) => {
      setReadStateByUser((prev) => {
        const current = prev[currentUser.userId] ?? readPersistedState(currentUser.userId)
        if (current.readIds.includes(itemId)) {
          return prev
        }
        const next: TeamInboxReadState = {
          ...current,
          readIds: [...current.readIds, itemId]
        }
        writePersistedState(currentUser.userId, next)
        return { ...prev, [currentUser.userId]: next }
      })
    },
    [currentUser.userId]
  )

  const markAllAsRead = useCallback(() => {
    const latestItemTimestamp = items.reduce(
      (maxTs, item) => (item.createdAt > maxTs ? item.createdAt : maxTs),
      0
    )
    const markedAllReadAt = Math.max(Date.now(), latestItemTimestamp)
    setReadStateByUser((prev) => {
      const current = prev[currentUser.userId] ?? readPersistedState(currentUser.userId)
      const mergedIds = new Set(current.readIds)
      for (const item of items) {
        mergedIds.add(item.id)
      }
      const next: TeamInboxReadState = {
        readIds: Array.from(mergedIds),
        markedAllReadAt
      }
      writePersistedState(currentUser.userId, next)
      return { ...prev, [currentUser.userId]: next }
    })
  }, [currentUser.userId, items])

  return {
    items,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    refresh
  }
}
