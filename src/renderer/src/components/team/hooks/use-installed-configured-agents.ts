import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConfiguredTeamAgent } from '../../../../../shared/teamwork/team-ipc-types'
import {
  configuredAgentsToMemberEntries,
  configuredAgentToMemberEntry,
  type TeamMemberEntry
} from '../../../../../shared/teamwork/team-members'
import { getTeamsTeamApi } from '../storage/team-web-relay-api'

export { configuredAgentsToMemberEntries, configuredAgentToMemberEntry }
export type { TeamMemberEntry }

export type UseInstalledConfiguredAgentsResult = {
  agents: ConfiguredTeamAgent[]
  memberEntries: TeamMemberEntry[]
  loading: boolean
  error: string | null
  refreshAgents: () => Promise<ConfiguredTeamAgent[]>
}

export function useInstalledConfiguredAgents(): UseInstalledConfiguredAgentsResult {
  const [agents, setAgents] = useState<ConfiguredTeamAgent[]>([])
  const [loading, setLoading] = useState<boolean>(() => Boolean(getTeamsTeamApi()?.listConfiguredAgents))
  const [error, setError] = useState<string | null>(null)
  const requestSeqRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const fetchAgents = useCallback(async (refresh: boolean): Promise<ConfiguredTeamAgent[]> => {
    const teamApi = getTeamsTeamApi()
    if (!teamApi?.listConfiguredAgents) {
      if (mountedRef.current) {
        setAgents([])
        setLoading(false)
        setError(null)
      }
      return []
    }

    const requestId = ++requestSeqRef.current
    if (mountedRef.current) {
      setLoading(true)
      setError(null)
    }

    try {
      const result = await teamApi.listConfiguredAgents({ refresh })
      const configuredOnly = Array.isArray(result) ? result.filter((agent) => agent.configured) : []
      if (mountedRef.current && requestSeqRef.current === requestId) {
        setAgents(configuredOnly)
      }
      return configuredOnly
    } catch (err) {
      if (mountedRef.current && requestSeqRef.current === requestId) {
        setAgents([])
        setError(err instanceof Error ? err.message : 'Error al detectar agentes CLI configurados')
      }
      return []
    } finally {
      if (mountedRef.current && requestSeqRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void fetchAgents(false)
  }, [fetchAgents])

  const refreshAgents = useCallback(() => fetchAgents(true), [fetchAgents])
  const memberEntries = configuredAgentsToMemberEntries(agents)

  return {
    agents,
    memberEntries,
    loading,
    error,
    refreshAgents
  }
}
