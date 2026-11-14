import type {
  TeamKanbanBoard,
  TeamNotesCollection,
  TeamWhiteboard
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  createDefaultTeamKanbanBoard,
  createDefaultTeamNotes,
  createDefaultTeamWhiteboard
} from '../../../../../shared/teamwork/team-kanban-seed'

export type TeamStorageTarget = {
  repoPath?: string | null
  projectId?: string
  connectionId?: string
}

export function getLocalBoardStorageKey(projectId: string, boardId: string): string {
  return `orca-team-board:${projectId}:${boardId}`
}

export function getLocalWhiteboardStorageKey(projectId: string): string {
  return `orca-team-whiteboard:${projectId}`
}

export function getLocalNotesStorageKey(projectId: string): string {
  return `orca-team-notes:${projectId}`
}

function joinTeamPath(basePath: string, relativePath: string): string {
  const separator = basePath.includes('\\') && !basePath.includes('/') ? '\\' : '/'
  const trimmedBase = basePath.replace(/[\\/]+$/, '')
  const normalizedRel = relativePath.replace(/[/\\]+/g, separator)
  return `${trimmedBase}${separator}${normalizedRel}`
}

function parseStoredTeamEntity<T extends { projectId?: string }>(
  rawJson: string,
  projectId: string
): T | null {
  try {
    const raw: unknown = JSON.parse(rawJson)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return null
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: payload is a non-null JSON object persisted by saveTeamEntity for this entity key and hydrated with projectId below.
    const parsed = raw as T
    parsed.projectId = projectId
    return parsed
  } catch {
    return null
  }
}

async function loadTeamEntity<T extends { projectId?: string; updatedAt: number }>(options: {
  target: TeamStorageTarget
  localStorageKey: string
  relativeDir: string
  fileName: string
  createDefault: () => T
}): Promise<T> {
  const { target, localStorageKey, relativeDir, fileName, createDefault } = options
  const projectId = target.projectId ?? 'default-project'

  // 1. Try reading from Git-backed repository disk (.orca/team/...)
  if (target.repoPath && typeof window !== 'undefined' && Boolean(window.api?.fs)) {
    try {
      const dirPath = joinTeamPath(target.repoPath, `.orca/team/${relativeDir}`)
      const filePath = joinTeamPath(dirPath, fileName)
      const result = await window.api.fs.readFile({
        filePath,
        connectionId: target.connectionId
      })
      if (result && !result.isBinary && result.content) {
        const parsed = parseStoredTeamEntity<T>(result.content, projectId)
        if (parsed) {
          if (window.localStorage) {
            localStorage.setItem(localStorageKey, JSON.stringify(parsed))
          }
          return parsed
        }
      }
    } catch {
      // Fall through to local cache or seed if file does not exist yet
    }
  }

  // 2. Try reading from localStorage cache
  if (typeof window !== 'undefined' && window.localStorage) {
    const cached = localStorage.getItem(localStorageKey)
    if (cached) {
      const parsed = parseStoredTeamEntity<T>(cached, projectId)
      if (parsed) {
        return parsed
      }
    }
  }

  // 3. Fallback to default seed and cache it locally (persist to disk only when user edits or via initial seed)
  const defaultEntity = createDefault()
  await saveTeamEntity({
    entity: defaultEntity,
    target,
    localStorageKey,
    relativeDir,
    fileName
  })
  return defaultEntity
}

async function saveTeamEntity<T extends { projectId?: string; updatedAt: number }>(options: {
  entity: T
  target: TeamStorageTarget
  localStorageKey: string
  relativeDir: string
  fileName: string
  cacheOnly?: boolean
}): Promise<void> {
  const { entity, target, localStorageKey, relativeDir, fileName, cacheOnly = false } = options
  const projectId = target.projectId ?? 'default-project'
  const updatedEntity: T = {
    ...entity,
    projectId,
    updatedAt: Date.now()
  }
  const jsonContent = JSON.stringify(updatedEntity, null, 2)

  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(localStorageKey, jsonContent)
  }

  if (!cacheOnly && target.repoPath && typeof window !== 'undefined' && Boolean(window.api?.fs)) {
    try {
      const dirPath = joinTeamPath(target.repoPath, `.orca/team/${relativeDir}`)
      await window.api.fs.createDir({
        dirPath,
        connectionId: target.connectionId
      })
      const filePath = joinTeamPath(dirPath, fileName)
      await window.api.fs.writeFile({
        filePath,
        content: jsonContent,
        connectionId: target.connectionId
      })
    } catch (err) {
      console.warn(`Failed to persist ${relativeDir}/${fileName} to disk:`, err)
    }
  }
}

export function loadTeamBoard(
  repoPath?: string | null,
  projectId = 'default-project',
  boardId = 'default-sprint',
  connectionId?: string
): Promise<TeamKanbanBoard> {
  return loadTeamEntity({
    target: { repoPath, projectId, connectionId },
    localStorageKey: getLocalBoardStorageKey(projectId, boardId),
    relativeDir: 'boards',
    fileName: `${boardId}.json`,
    createDefault: () => createDefaultTeamKanbanBoard(boardId, projectId)
  })
}

export function saveTeamBoard(
  board: TeamKanbanBoard,
  repoPath?: string | null,
  projectId = 'default-project',
  connectionId?: string,
  cacheOnly = false
): Promise<void> {
  return saveTeamEntity({
    entity: board,
    target: { repoPath, projectId, connectionId },
    localStorageKey: getLocalBoardStorageKey(projectId, board.id),
    relativeDir: 'boards',
    fileName: `${board.id}.json`,
    cacheOnly
  })
}

export function loadTeamWhiteboard(
  repoPath?: string | null,
  projectId = 'default-project',
  connectionId?: string
): Promise<TeamWhiteboard> {
  return loadTeamEntity({
    target: { repoPath, projectId, connectionId },
    localStorageKey: getLocalWhiteboardStorageKey(projectId),
    relativeDir: 'whiteboard',
    fileName: 'whiteboard.json',
    createDefault: () => createDefaultTeamWhiteboard(projectId)
  })
}

export function saveTeamWhiteboard(
  whiteboard: TeamWhiteboard,
  repoPath?: string | null,
  projectId = 'default-project',
  connectionId?: string,
  cacheOnly = false
): Promise<void> {
  return saveTeamEntity({
    entity: whiteboard,
    target: { repoPath, projectId, connectionId },
    localStorageKey: getLocalWhiteboardStorageKey(projectId),
    relativeDir: 'whiteboard',
    fileName: 'whiteboard.json',
    cacheOnly
  })
}

export function loadTeamNotes(
  repoPath?: string | null,
  projectId = 'default-project',
  connectionId?: string
): Promise<TeamNotesCollection> {
  return loadTeamEntity({
    target: { repoPath, projectId, connectionId },
    localStorageKey: getLocalNotesStorageKey(projectId),
    relativeDir: 'notes',
    fileName: 'notes.json',
    createDefault: () => createDefaultTeamNotes(projectId)
  })
}

export function saveTeamNotes(
  notesCollection: TeamNotesCollection,
  repoPath?: string | null,
  projectId = 'default-project',
  connectionId?: string,
  cacheOnly = false
): Promise<void> {
  return saveTeamEntity({
    entity: notesCollection,
    target: { repoPath, projectId, connectionId },
    localStorageKey: getLocalNotesStorageKey(projectId),
    relativeDir: 'notes',
    fileName: 'notes.json',
    cacheOnly
  })
}
