import { useState, useCallback } from 'react'
import type { TeamWhiteboardItem } from '../../../../../shared/teamwork/team-kanban-types'

const MAX_HISTORY_SNAPSHOTS = 40

export type WhiteboardHistoryState = {
  canUndo: boolean
  canRedo: boolean
  recordSnapshot: (items: TeamWhiteboardItem[]) => void
  undo: (currentItems: TeamWhiteboardItem[]) => TeamWhiteboardItem[] | null
  redo: (currentItems: TeamWhiteboardItem[]) => TeamWhiteboardItem[] | null
}

export function useWhiteboardHistory(): WhiteboardHistoryState {
  const [past, setPast] = useState<TeamWhiteboardItem[][]>([])
  const [future, setFuture] = useState<TeamWhiteboardItem[][]>([])

  const recordSnapshot = useCallback((items: TeamWhiteboardItem[]) => {
    setPast((prev) => [...prev.slice(-(MAX_HISTORY_SNAPSHOTS - 1)), items])
    setFuture([])
  }, [])

  const undo = useCallback(
    (currentItems: TeamWhiteboardItem[]): TeamWhiteboardItem[] | null => {
      const previous = past.at(-1)
      if (!previous) {
        return null
      }
      setPast((prev) => prev.slice(0, -1))
      setFuture((prev) => [...prev.slice(-(MAX_HISTORY_SNAPSHOTS - 1)), currentItems])
      return previous
    },
    [past]
  )

  const redo = useCallback(
    (currentItems: TeamWhiteboardItem[]): TeamWhiteboardItem[] | null => {
      const next = future.at(-1)
      if (!next) {
        return null
      }
      setFuture((prev) => prev.slice(0, -1))
      setPast((prev) => [...prev.slice(-(MAX_HISTORY_SNAPSHOTS - 1)), currentItems])
      return next
    },
    [future]
  )

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    recordSnapshot,
    undo,
    redo
  }
}
