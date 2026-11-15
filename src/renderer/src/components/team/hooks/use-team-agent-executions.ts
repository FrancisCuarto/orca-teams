import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TeamStartExecutionRequest } from '../../../../../shared/teamwork/team-ipc-types'
import type {
  AgentExecutionRecord,
  AgentExecutionStatus
} from '../../../../../shared/teamwork/team-workspace-types'

function getTeamApi() {
  if (typeof window === 'undefined') {
    return undefined
  }
  return window.api?.team
}

export type UseTeamAgentExecutionsResult = {
  executionsByCard: Map<string, AgentExecutionRecord>
  executionsById: Map<string, AgentExecutionRecord>
  cardStatuses: Record<string, AgentExecutionStatus>
  startCardExecution: (request: TeamStartExecutionRequest) => Promise<AgentExecutionRecord | null>
  cancelExecution: (executionId: string) => Promise<AgentExecutionRecord | null>
  getLatestForCard: (cardId: string) => AgentExecutionRecord | null
  hydrateLatestForCard: (cardId: string) => Promise<AgentExecutionRecord | null>
}

export function useTeamAgentExecutions(): UseTeamAgentExecutionsResult {
  const [executionsByCard, setExecutionsByCard] = useState<Map<string, AgentExecutionRecord>>(
    () => new Map()
  )
  const [executionsById, setExecutionsById] = useState<Map<string, AgentExecutionRecord>>(
    () => new Map()
  )

  const recordExecution = useCallback((execution: AgentExecutionRecord) => {
    setExecutionsById((prev) => {
      const next = new Map(prev)
      next.set(execution.id, execution)
      return next
    })
    setExecutionsByCard((prev) => {
      const next = new Map(prev)
      next.set(execution.taskId, execution)
      return next
    })
  }, [])

  const removeExecution = useCallback((executionId: string) => {
    setExecutionsById((prev) => {
      const existing = prev.get(executionId)
      if (!existing) {
        return prev
      }
      const next = new Map(prev)
      next.delete(executionId)
      return next
    })
    setExecutionsByCard((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const [cardId, record] of next.entries()) {
        if (record.id === executionId) {
          next.delete(cardId)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  useEffect(() => {
    const teamApi = getTeamApi()
    if (!teamApi?.onExecutionEvent) {
      return
    }
    return teamApi.onExecutionEvent((event) => {
      if (event.type === 'updated') {
        recordExecution(event.execution)
      } else if (event.type === 'removed') {
        removeExecution(event.executionId)
      }
    })
  }, [recordExecution, removeExecution])

  const startCardExecution = useCallback(
    async (request: TeamStartExecutionRequest): Promise<AgentExecutionRecord | null> => {
      const teamApi = getTeamApi()
      if (!teamApi?.startExecution) {
        return null
      }
      const execution = await teamApi.startExecution(request)
      recordExecution(execution)
      return execution
    },
    [recordExecution]
  )

  const cancelExecution = useCallback(
    async (executionId: string): Promise<AgentExecutionRecord | null> => {
      const teamApi = getTeamApi()
      if (!teamApi?.cancelExecution) {
        return null
      }
      const updated = await teamApi.cancelExecution(executionId)
      if (updated) {
        recordExecution(updated)
      }
      return updated
    },
    [recordExecution]
  )

  const getLatestForCard = useCallback(
    (cardId: string): AgentExecutionRecord | null => executionsByCard.get(cardId) ?? null,
    [executionsByCard]
  )

  const hydrateLatestForCard = useCallback(
    async (cardId: string): Promise<AgentExecutionRecord | null> => {
      const teamApi = getTeamApi()
      if (!teamApi?.getLatestExecutionForCard) {
        return executionsByCard.get(cardId) ?? null
      }
      const execution = await teamApi.getLatestExecutionForCard(cardId)
      if (execution) {
        recordExecution(execution)
      }
      return execution
    },
    [executionsByCard, recordExecution]
  )

  const cardStatuses = useMemo(() => {
    const result: Record<string, AgentExecutionStatus> = {}
    for (const [cardId, record] of executionsByCard.entries()) {
      result[cardId] = record.status
    }
    return result
  }, [executionsByCard])

  return {
    executionsByCard,
    executionsById,
    cardStatuses,
    startCardExecution,
    cancelExecution,
    getLatestForCard,
    hydrateLatestForCard
  }
}
