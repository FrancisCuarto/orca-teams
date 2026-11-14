import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  FileText,
  FolderGit2,
  GitBranch,
  Kanban,
  Loader2,
  PenTool,
  RefreshCw,
  Users
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  TeamKanbanBoard,
  TeamNotesCollection,
  TeamTab,
  TeamWhiteboard
} from '../../../../shared/teamwork/team-kanban-types'
import {
  loadTeamBoard,
  loadTeamNotes,
  loadTeamWhiteboard,
  saveTeamBoard,
  saveTeamNotes,
  saveTeamWhiteboard
} from './storage/team-storage'
import {
  computeBoardSprintMetrics,
  extractActionItemsFromMarkdownToBoard
} from './kanban/team-kanban-board-mutations'
import { TeamKanbanBoardView } from './kanban/TeamKanbanBoardView'
import { TeamWhiteboardView } from './whiteboard/TeamWhiteboardView'
import { TeamNotesView } from './notes/TeamNotesView'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useActiveWorktree } from '@/store/workspaces/selection/use-selected-worktree'
import { useActiveRepo } from '@/store/repos/use-repository-catalog'

const DISK_SAVE_DEBOUNCE_MS = 350

export default function TeamPage(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<TeamTab>('kanban')
  const [board, setBoard] = useState<TeamKanbanBoard | null>(null)
  const [whiteboard, setWhiteboard] = useState<TeamWhiteboard | null>(null)
  const [notes, setNotes] = useState<TeamNotesCollection | null>(null)
  const [loading, setLoading] = useState(true)

  const activeWorktree = useActiveWorktree()
  const activeRepo = useActiveRepo()

  const requestSeqRef = useRef(0)
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const activeProject = useMemo(() => {
    const path = activeWorktree?.path ?? activeRepo?.path ?? null
    const connectionId = activeRepo?.connectionId ?? undefined
    const id =
      activeRepo?.id ??
      activeWorktree?.id ??
      (path ? path.replace(/[^a-zA-Z0-9_-]/g, '_') : 'global-workspace')
    const segments = path ? path.split(/[/\\]/).filter(Boolean) : []
    const name = activeRepo?.displayName ?? segments.at(-1) ?? 'Espacio Global'
    return { id, path, name, connectionId }
  }, [
    activeWorktree?.id,
    activeWorktree?.path,
    activeRepo?.id,
    activeRepo?.path,
    activeRepo?.displayName,
    activeRepo?.connectionId
  ])

  const boardMetrics = useMemo(() => (board ? computeBoardSprintMetrics(board) : null), [board])

  const clearPendingSaveTimers = useCallback(() => {
    for (const timer of Object.values(saveTimersRef.current)) {
      clearTimeout(timer)
    }
    saveTimersRef.current = {}
  }, [])

  useEffect(() => {
    return () => clearPendingSaveTimers()
  }, [clearPendingSaveTimers])

  const fetchProjectData = useCallback(async () => {
    const requestId = ++requestSeqRef.current
    clearPendingSaveTimers()
    setLoading(true)
    try {
      const [loadedBoard, loadedWhiteboard, loadedNotes] = await Promise.all([
        loadTeamBoard(
          activeProject.path,
          activeProject.id,
          'default-sprint',
          activeProject.connectionId
        ),
        loadTeamWhiteboard(activeProject.path, activeProject.id, activeProject.connectionId),
        loadTeamNotes(activeProject.path, activeProject.id, activeProject.connectionId)
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
  }, [activeProject.path, activeProject.id, activeProject.connectionId, clearPendingSaveTimers])

  useEffect(() => {
    void fetchProjectData()
  }, [fetchProjectData])

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
      void saveTeamBoard(
        updatedBoard,
        activeProject.path,
        activeProject.id,
        activeProject.connectionId,
        true
      )
      scheduleDiskPersist('board', () =>
        saveTeamBoard(
          updatedBoard,
          activeProject.path,
          activeProject.id,
          activeProject.connectionId,
          false
        )
      )
    },
    [activeProject.path, activeProject.id, activeProject.connectionId, scheduleDiskPersist]
  )

  const handleWhiteboardChange = useCallback(
    (updatedWhiteboard: TeamWhiteboard) => {
      setWhiteboard(updatedWhiteboard)
      void saveTeamWhiteboard(
        updatedWhiteboard,
        activeProject.path,
        activeProject.id,
        activeProject.connectionId,
        true
      )
      scheduleDiskPersist('whiteboard', () =>
        saveTeamWhiteboard(
          updatedWhiteboard,
          activeProject.path,
          activeProject.id,
          activeProject.connectionId,
          false
        )
      )
    },
    [activeProject.path, activeProject.id, activeProject.connectionId, scheduleDiskPersist]
  )

  const handleNotesChange = useCallback(
    (updatedNotes: TeamNotesCollection) => {
      setNotes(updatedNotes)
      void saveTeamNotes(
        updatedNotes,
        activeProject.path,
        activeProject.id,
        activeProject.connectionId,
        true
      )
      scheduleDiskPersist('notes', () =>
        saveTeamNotes(
          updatedNotes,
          activeProject.path,
          activeProject.id,
          activeProject.connectionId,
          false
        )
      )
    },
    [activeProject.path, activeProject.id, activeProject.connectionId, scheduleDiskPersist]
  )

  const handleExtractTasksToKanban = useCallback(
    (noteTitle: string, content: string) => {
      if (!board) {
        return
      }
      const { nextBoard, createdCount } = extractActionItemsFromMarkdownToBoard(
        board,
        noteTitle,
        content
      )
      if (createdCount === 0) {
        toast.info('No había tareas nuevas sin crear en el Kanban para esta nota')
        return
      }
      handleBoardChange(nextBoard)
      setActiveTab('kanban')
      toast.success(
        `${createdCount} ${createdCount === 1 ? 'tarea extraída' : 'tareas extraídas'} al Kanban`,
        {
          description: `Origen: ${noteTitle}`
        }
      )
    },
    [board, handleBoardChange]
  )

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden bg-background">
      {/* Teamwork Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10 text-primary border border-primary/20">
            <Users className="size-4" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-foreground tracking-tight">
                Team Collaboration Suite
              </h1>
              <Badge variant="outline">Git-Backed</Badge>
              <Badge variant="secondary">Ponytail 5 · ctx7</Badge>
            </div>
            <p className="text-2xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <FolderGit2 className="size-3 text-primary shrink-0" />
              <span>Proyecto actual:</span>
              <strong className="text-foreground font-semibold">{activeProject.name}</strong>
              {boardMetrics ? (
                <span className="text-muted-foreground">
                  · {boardMetrics.completedCards}/{boardMetrics.totalCards} tareas ·{' '}
                  {notes?.notes.length ?? 0} docs
                </span>
              ) : null}
            </p>
          </div>
        </div>

        {/* Sub-tab Switcher (Kanban, Pizarra, Notas) */}
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border">
          <Button
            size="xs"
            variant={activeTab === 'kanban' ? 'secondary' : 'ghost'}
            onClick={() => setActiveTab('kanban')}
          >
            <Kanban />
            Tablero Kanban
          </Button>

          <Button
            size="xs"
            variant={activeTab === 'whiteboard' ? 'secondary' : 'ghost'}
            onClick={() => setActiveTab('whiteboard')}
          >
            <PenTool />
            Pizarra Visual
          </Button>

          <Button
            size="xs"
            variant={activeTab === 'notes' ? 'secondary' : 'ghost'}
            onClick={() => setActiveTab('notes')}
          >
            <FileText />
            Notas & ADRs
          </Button>
        </div>

        {/* Actions & Repo Path Tag */}
        <div className="flex items-center gap-2">
          {activeProject.path ? (
            <span
              className="text-2xs font-mono text-muted-foreground flex items-center gap-1.5 bg-secondary/40 px-2 py-1 rounded border border-border"
              title={`Ruta del proyecto: ${activeProject.path}/.orca/team/`}
            >
              <GitBranch className="size-3 text-primary shrink-0" />
              <span className="max-w-[200px] truncate">{activeProject.name}/.orca/team/</span>
            </span>
          ) : (
            <span className="text-2xs text-muted-foreground bg-muted/40 px-2 py-1 rounded border border-border">
              Modo Local
            </span>
          )}

          <Button
            variant="ghost"
            size="icon-xs"
            onClick={fetchProjectData}
            disabled={loading}
            title="Recargar datos del disco"
          >
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeTab === 'kanban' && board ? (
          <TeamKanbanBoardView key={activeProject.id} board={board} onChange={handleBoardChange} />
        ) : activeTab === 'whiteboard' && whiteboard ? (
          <TeamWhiteboardView
            key={activeProject.id}
            whiteboard={whiteboard}
            onChange={handleWhiteboardChange}
          />
        ) : activeTab === 'notes' && notes ? (
          <TeamNotesView
            key={activeProject.id}
            notesCollection={notes}
            onChange={handleNotesChange}
            onExtractTasksToKanban={handleExtractTasksToKanban}
          />
        ) : null}
      </main>
    </div>
  )
}
