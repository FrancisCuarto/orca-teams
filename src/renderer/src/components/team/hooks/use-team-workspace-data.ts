import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import type {
  TeamKanbanBoard,
  TeamNotesCollection,
  TeamWhiteboard
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  loadTeamBoard,
  loadTeamNotes,
  loadTeamWhiteboard,
  saveTeamBoard,
  saveTeamNotes,
  saveTeamWhiteboard
} from '../storage/team-storage'

const DISK_SAVE_DEBOUNCE_MS = 350

export function useTeamWorkspaceData(options: {
  projectId: string
  projectPath?: string | null
  connectionId?: string
}): {
  board: TeamKanbanBoard | null
  whiteboard: TeamWhiteboard | null
  notes: TeamNotesCollection | null
  loading: boolean
  refetch: () => Promise<void>
  handleBoardChange: (updated: TeamKanbanBoard) => void
  handleWhiteboardChange: (updated: TeamWhiteboard) => void
  handleNotesChange: (updated: TeamNotesCollection) => void
} {
  const { projectId, projectPath, connectionId } = options
  const [board, setBoard] = useState<TeamKanbanBoard | null>(null)
  const [whiteboard, setWhiteboard] = useState<TeamWhiteboard | null>(null)
  const [notes, setNotes] = useState<TeamNotesCollection | null>(null)
  const [loading, setLoading] = useState(true)

  const requestSeqRef = useRef(0)
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const clearPendingSaveTimers = useCallback(() => {
    for (const timer of Object.values(saveTimersRef.current)) {
      clearTimeout(timer)
    }
    saveTimersRef.current = {}
  }, [])

  useEffect(() => {
    return () => clearPendingSaveTimers()
  }, [clearPendingSaveTimers])

  const refetch = useCallback(async () => {
    const requestId = ++requestSeqRef.current
    clearPendingSaveTimers()
    setLoading(true)
    try {
      const [loadedBoard, loadedWhiteboard, loadedNotes] = await Promise.all([
        loadTeamBoard(projectPath, projectId, 'default-sprint', connectionId),
        loadTeamWhiteboard(projectPath, projectId, connectionId),
        loadTeamNotes(projectPath, projectId, connectionId)
      ])
      if (requestSeqRef.current !== requestId) {
        return
      }
      setBoard(loadedBoard)
      setWhiteboard(loadedWhiteboard)
      setNotes(loadedNotes)
    } catch (err) {
      if (requestSeqRef.current !== requestId) {
        return
      }
      console.error('Error cargando datos del proyecto:', err)
      toast.error('Error al cargar datos del proyecto')
    } finally {
      if (requestSeqRef.current === requestId) {
        setLoading(false)
      }
    }
  }, [projectPath, projectId, connectionId, clearPendingSaveTimers])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const scheduleDiskPersist = useCallback((key: string, persistFn: () => Promise<void>) => {
    if (saveTimersRef.current[key]) {
      clearTimeout(saveTimersRef.current[key])
    }
    saveTimersRef.current[key] = setTimeout(() => {
      delete saveTimersRef.current[key]
      void persistFn()
    }, DISK_SAVE_DEBOUNCE_MS)
  }, [])

  const handleBoardChange = useCallback(
    (updatedBoard: TeamKanbanBoard) => {
      setBoard(updatedBoard)
      void saveTeamBoard(updatedBoard, projectPath, projectId, connectionId, true)
      scheduleDiskPersist('board', () =>
        saveTeamBoard(updatedBoard, projectPath, projectId, connectionId, false)
      )
    },
    [projectPath, projectId, connectionId, scheduleDiskPersist]
  )

  const handleWhiteboardChange = useCallback(
    (updatedWhiteboard: TeamWhiteboard) => {
      setWhiteboard(updatedWhiteboard)
      void saveTeamWhiteboard(updatedWhiteboard, projectPath, projectId, connectionId, true)
      scheduleDiskPersist('whiteboard', () =>
        saveTeamWhiteboard(updatedWhiteboard, projectPath, projectId, connectionId, false)
      )
    },
    [projectPath, projectId, connectionId, scheduleDiskPersist]
  )

  const handleNotesChange = useCallback(
    (updatedNotes: TeamNotesCollection) => {
      setNotes(updatedNotes)
      void saveTeamNotes(updatedNotes, projectPath, projectId, connectionId, true)
      scheduleDiskPersist('notes', () =>
        saveTeamNotes(updatedNotes, projectPath, projectId, connectionId, false)
      )
    },
    [projectPath, projectId, connectionId, scheduleDiskPersist]
  )

  return {
    board,
    whiteboard,
    notes,
    loading,
    refetch,
    handleBoardChange,
    handleWhiteboardChange,
    handleNotesChange
  }
}
