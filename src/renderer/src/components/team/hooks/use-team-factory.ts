import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createDefaultFactoryConfig,
  type FactoryConfig,
  type FactoryRunRecord,
  type FactoryRunStatus
} from '../../../../../shared/teamwork/team-factory-types'
import type {
  TeamResolveFactoryGateRequest,
  TeamStartFactoryRunRequest
} from '../../../../../shared/teamwork/team-ipc-types'

function getTeamApi() {
  if (typeof window === 'undefined') {
    return undefined
  }
  return window.api?.team
}

export type UseTeamFactoryResult = {
  factoryConfig: FactoryConfig
  factoryRunsByCard: Map<string, FactoryRunRecord>
  factoryRunsById: Map<string, FactoryRunRecord>
  factoryStatuses: Record<string, FactoryRunStatus>
  activeRunCount: number
  waitingHumanCount: number
  saveFactoryConfig: (config: FactoryConfig) => Promise<FactoryConfig>
  startFactoryRun: (request: TeamStartFactoryRunRequest) => Promise<FactoryRunRecord | null>
  cancelFactoryRun: (runId: string) => Promise<FactoryRunRecord | null>
  resolveHumanGate: (request: TeamResolveFactoryGateRequest) => Promise<FactoryRunRecord | null>
  hydrateFactoryRunForCard: (cardId: string) => Promise<FactoryRunRecord | null>
}

export function useTeamFactory(projectId: string): UseTeamFactoryResult {
  const [factoryConfig, setFactoryConfig] = useState<FactoryConfig>(() =>
    createDefaultFactoryConfig(projectId)
  )
  const [factoryRunsById, setFactoryRunsById] = useState<Map<string, FactoryRunRecord>>(
    () => new Map()
  )
  const [factoryRunsByCard, setFactoryRunsByCard] = useState<Map<string, FactoryRunRecord>>(
    () => new Map()
  )

  const recordRun = useCallback((run: FactoryRunRecord) => {
    setFactoryRunsById((prev) => {
      const next = new Map(prev)
      next.set(run.id, run)
      return next
    })
    setFactoryRunsByCard((prev) => {
      const existing = prev.get(run.cardId)
      if (existing && existing.id !== run.id && existing.startedAt > run.startedAt) {
        return prev
      }
      const next = new Map(prev)
      next.set(run.cardId, run)
      return next
    })
  }, [])

  useEffect(() => {
    const teamApi = getTeamApi()
    let cancelled = false
    setFactoryConfig(createDefaultFactoryConfig(projectId))
    if (!teamApi?.getFactoryConfig || !teamApi?.listFactoryRuns) {
      return
    }
    void Promise.all([teamApi.getFactoryConfig(projectId), teamApi.listFactoryRuns(projectId)])
      .then(([cfg, runs]) => {
        if (cancelled) {
          return
        }
        if (cfg) {
          setFactoryConfig(cfg)
        }
        if (Array.isArray(runs)) {
          for (const run of runs) {
            recordRun(run)
          }
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [projectId, recordRun])

  useEffect(() => {
    const teamApi = getTeamApi()
    if (!teamApi?.onFactoryEvent) {
      return
    }
    return teamApi.onFactoryEvent((event) => {
      if (event.type === 'updated') {
        recordRun(event.run)
      }
    })
  }, [recordRun])

  const saveFactoryConfig = useCallback(async (config: FactoryConfig): Promise<FactoryConfig> => {
    const teamApi = getTeamApi()
    if (!teamApi?.saveFactoryConfig) {
      setFactoryConfig(config)
      return config
    }
    const saved = await teamApi.saveFactoryConfig(config)
    setFactoryConfig(saved)
    return saved
  }, [])

  const startFactoryRun = useCallback(
    async (request: TeamStartFactoryRunRequest): Promise<FactoryRunRecord | null> => {
      const teamApi = getTeamApi()
      if (!teamApi?.startFactoryRun) {
        return null
      }
      const run = await teamApi.startFactoryRun(request)
      recordRun(run)
      return run
    },
    [recordRun]
  )

  const cancelFactoryRun = useCallback(
    async (runId: string): Promise<FactoryRunRecord | null> => {
      const teamApi = getTeamApi()
      if (!teamApi?.cancelFactoryRun) {
        return null
      }
      const run = await teamApi.cancelFactoryRun(runId)
      if (run) {
        recordRun(run)
      }
      return run
    },
    [recordRun]
  )

  const resolveHumanGate = useCallback(
    async (request: TeamResolveFactoryGateRequest): Promise<FactoryRunRecord | null> => {
      const teamApi = getTeamApi()
      if (!teamApi?.resolveFactoryHumanGate) {
        return null
      }
      const run = await teamApi.resolveFactoryHumanGate(request)
      if (run) {
        recordRun(run)
      }
      return run
    },
    [recordRun]
  )

  const hydrateFactoryRunForCard = useCallback(
    async (cardId: string): Promise<FactoryRunRecord | null> => {
      const teamApi = getTeamApi()
      if (!teamApi?.getLatestFactoryRunForCard) {
        return factoryRunsByCard.get(cardId) ?? null
      }
      const run = await teamApi.getLatestFactoryRunForCard(cardId)
      if (run) {
        recordRun(run)
      }
      return run
    },
    [factoryRunsByCard, recordRun]
  )

  const { factoryStatuses, activeRunCount, waitingHumanCount } = useMemo(() => {
    const statuses: Record<string, FactoryRunStatus> = {}
    let active = 0
    let waiting = 0
    for (const [cardId, run] of factoryRunsByCard.entries()) {
      statuses[cardId] = run.status
      if (run.status === 'queued' || run.status === 'running') {
        active += 1
      } else if (run.status === 'waiting_human') {
        waiting += 1
      }
    }
    return { factoryStatuses: statuses, activeRunCount: active, waitingHumanCount: waiting }
  }, [factoryRunsByCard])

  return {
    factoryConfig,
    factoryRunsByCard,
    factoryRunsById,
    factoryStatuses,
    activeRunCount,
    waitingHumanCount,
    saveFactoryConfig,
    startFactoryRun,
    cancelFactoryRun,
    resolveHumanGate,
    hydrateFactoryRunForCard
  }
}
