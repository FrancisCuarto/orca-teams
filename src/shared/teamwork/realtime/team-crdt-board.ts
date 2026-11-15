import * as Y from 'yjs'
import {
  isTeamKanbanPriority,
  type TeamKanbanAssignee,
  type TeamKanbanBoard,
  type TeamKanbanCard,
  type TeamKanbanChecklistItem,
  type TeamKanbanColumn
} from '../team-kanban-types'
import type { ITeamBoardCRDT } from './team-crdt-types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim()
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed)
        result.push(trimmed)
      }
    }
  }
  return result
}

function readAssignee(value: unknown): TeamKanbanAssignee | undefined {
  if (!isRecord(value) || (value.type !== 'human' && value.type !== 'agent')) {
    return undefined
  }
  if (typeof value.name !== 'string') {
    return undefined
  }
  const skills = Array.isArray(value.skills)
    ? value.skills.filter((s): s is string => typeof s === 'string')
    : undefined
  return {
    type: value.type,
    name: value.name,
    ...(typeof value.avatar === 'string' ? { avatar: value.avatar } : {}),
    ...(typeof value.agentType === 'string' ? { agentType: value.agentType } : {}),
    ...(typeof value.model === 'string' ? { model: value.model } : {}),
    ...(skills ? { skills } : {})
  }
}

function readChecklist(value: unknown): TeamKanbanChecklistItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  const items: TeamKanbanChecklistItem[] = []
  for (const entry of value) {
    if (
      isRecord(entry) &&
      typeof entry.id === 'string' &&
      typeof entry.text === 'string' &&
      typeof entry.done === 'boolean'
    ) {
      items.push({ id: entry.id, text: entry.text, done: entry.done })
    }
  }
  return items
}

export function normalizeKanbanCardForCRDT(card: TeamKanbanCard): TeamKanbanCard {
  const linkedNoteIds = readStringArray(card.linkedNoteIds)
  const sourceWhiteboardElementId =
    typeof card.sourceWhiteboardElementId === 'string' && card.sourceWhiteboardElementId.trim()
      ? card.sourceWhiteboardElementId.trim()
      : undefined
  const normalized: TeamKanbanCard = {
    id: card.id,
    title: card.title,
    description: card.description,
    columnId: card.columnId,
    priority: card.priority,
    labels: [...card.labels],
    checklist: card.checklist.map((item) => ({ ...item })),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt
  }
  if (card.assignee) {
    normalized.assignee = {
      ...card.assignee,
      ...(card.assignee.skills ? { skills: [...card.assignee.skills] } : {})
    }
  }
  if (linkedNoteIds.length > 0) {
    normalized.linkedNoteIds = linkedNoteIds
  }
  if (sourceWhiteboardElementId) {
    normalized.sourceWhiteboardElementId = sourceWhiteboardElementId
  }
  if (card.branchOrWorktree !== undefined) {
    normalized.branchOrWorktree = card.branchOrWorktree
  }
  if (card.isolateWorktree !== undefined) {
    normalized.isolateWorktree = card.isolateWorktree
  }
  if (card.requiresApproval !== undefined) {
    normalized.requiresApproval = card.requiresApproval
  }
  if (card.estimatePoints !== undefined) {
    normalized.estimatePoints = card.estimatePoints
  }
  if (card.blockedReason !== undefined) {
    normalized.blockedReason = card.blockedReason
  }
  if (card.dueDate !== undefined) {
    normalized.dueDate = card.dueDate
  }
  return normalized
}

export function readKanbanCardFromMap(raw: unknown): TeamKanbanCard | null {
  if (
    !isRecord(raw) ||
    typeof raw.id !== 'string' ||
    typeof raw.title !== 'string' ||
    typeof raw.columnId !== 'string'
  ) {
    return null
  }
  const priority =
    typeof raw.priority === 'string' && isTeamKanbanPriority(raw.priority) ? raw.priority : 'medium'
  const assignee = readAssignee(raw.assignee)
  const linkedNoteIds = readStringArray(raw.linkedNoteIds)
  const sourceWhiteboardElementId =
    typeof raw.sourceWhiteboardElementId === 'string' && raw.sourceWhiteboardElementId.trim()
      ? raw.sourceWhiteboardElementId.trim()
      : undefined

  return {
    id: raw.id,
    title: raw.title,
    description: typeof raw.description === 'string' ? raw.description : '',
    columnId: raw.columnId,
    priority,
    ...(assignee ? { assignee } : {}),
    labels: readStringArray(raw.labels),
    checklist: readChecklist(raw.checklist),
    ...(linkedNoteIds.length > 0 ? { linkedNoteIds } : {}),
    ...(sourceWhiteboardElementId ? { sourceWhiteboardElementId } : {}),
    ...(typeof raw.branchOrWorktree === 'string'
      ? { branchOrWorktree: raw.branchOrWorktree }
      : {}),
    ...(typeof raw.isolateWorktree === 'boolean' ? { isolateWorktree: raw.isolateWorktree } : {}),
    ...(typeof raw.requiresApproval === 'boolean'
      ? { requiresApproval: raw.requiresApproval }
      : {}),
    ...(typeof raw.estimatePoints === 'number' ? { estimatePoints: raw.estimatePoints } : {}),
    ...(typeof raw.blockedReason === 'string' ? { blockedReason: raw.blockedReason } : {}),
    ...(typeof raw.dueDate === 'string' ? { dueDate: raw.dueDate } : {}),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
  }
}

export class TeamBoardCRDT implements ITeamBoardCRDT {
  public readonly doc: Y.Doc
  private readonly cardsMap: Y.Map<unknown>
  private readonly columnsArray: Y.Array<TeamKanbanColumn>
  private readonly metadataMap: Y.Map<unknown>
  private readonly changeListeners = new Set<(board: TeamKanbanBoard) => void>()
  private readonly observer: () => void

  constructor(
    public readonly docId: string,
    existingDoc?: Y.Doc
  ) {
    this.doc = existingDoc ?? new Y.Doc()
    this.cardsMap = this.doc.getMap<unknown>('cards')
    this.columnsArray = this.doc.getArray<TeamKanbanColumn>('columns')
    this.metadataMap = this.doc.getMap<unknown>('metadata')

    this.observer = (): void => {
      const board = this.getBoard()
      for (const listener of this.changeListeners) {
        listener(board)
      }
    }

    this.cardsMap.observe(this.observer)
    this.columnsArray.observe(this.observer)
    this.metadataMap.observe(this.observer)
  }

  getBoard(): TeamKanbanBoard {
    const cards: Record<string, TeamKanbanCard> = {}
    this.cardsMap.forEach((raw, cardId) => {
      const parsed = readKanbanCardFromMap(raw)
      if (parsed) {
        cards[cardId] = parsed
      }
    })
    const columns = this.columnsArray.toArray()
    const metadata = this.metadataMap.toJSON()

    const title = typeof metadata.title === 'string' ? metadata.title : 'Tablero'
    const description = typeof metadata.description === 'string' ? metadata.description : undefined
    const projectId = typeof metadata.projectId === 'string' ? metadata.projectId : undefined
    const sprintGoal = typeof metadata.sprintGoal === 'string' ? metadata.sprintGoal : undefined
    const updatedAt = typeof metadata.updatedAt === 'number' ? metadata.updatedAt : Date.now()
    const createdAt = typeof metadata.createdAt === 'number' ? metadata.createdAt : updatedAt

    return {
      id: this.docId,
      projectId,
      title,
      description,
      sprintGoal,
      columns,
      cards,
      createdAt,
      updatedAt
    }
  }

  initializeFromBoard(board: TeamKanbanBoard): void {
    if (this.columnsArray.length > 0 || this.cardsMap.size > 0) {
      return
    }

    this.doc.transact(() => {
      this.metadataMap.set('title', board.title)
      if (board.description) {
        this.metadataMap.set('description', board.description)
      }
      if (board.projectId) {
        this.metadataMap.set('projectId', board.projectId)
      }
      if (board.sprintGoal) {
        this.metadataMap.set('sprintGoal', board.sprintGoal)
      }
      this.metadataMap.set('createdAt', board.createdAt ?? board.updatedAt)
      this.metadataMap.set('updatedAt', board.updatedAt)

      this.columnsArray.delete(0, this.columnsArray.length)
      this.columnsArray.push(board.columns)

      for (const [cardId, card] of Object.entries(board.cards)) {
        this.cardsMap.set(cardId, normalizeKanbanCardForCRDT(card))
      }
    })
  }

  upsertCard(card: TeamKanbanCard): void {
    this.doc.transact(() => {
      const existing = readKanbanCardFromMap(this.cardsMap.get(card.id))
      const nextCard = normalizeKanbanCardForCRDT({
        ...card,
        ...(existing?.sourceWhiteboardElementId && !card.sourceWhiteboardElementId
          ? { sourceWhiteboardElementId: existing.sourceWhiteboardElementId }
          : {}),
        updatedAt: Date.now()
      })
      this.cardsMap.set(card.id, nextCard)
      this.metadataMap.set('updatedAt', Date.now())

      const isNew = !existing
      const targetColId = nextCard.columnId

      if (isNew) {
        const columns = this.columnsArray.toArray()
        const updated = columns.map((col) => {
          if (col.id === targetColId && !col.cardIds.includes(card.id)) {
            return { ...col, cardIds: [...col.cardIds, card.id] }
          }
          return col
        })
        this.replaceColumns(updated)
      } else if (existing.columnId !== targetColId) {
        this.moveCardInColumns(card.id, existing.columnId, targetColId)
      }
    })
  }

  deleteCard(cardId: string): void {
    this.doc.transact(() => {
      this.cardsMap.delete(cardId)
      this.metadataMap.set('updatedAt', Date.now())

      const columns = this.columnsArray.toArray()
      const updated = columns.map((col) => ({
        ...col,
        cardIds: col.cardIds.filter((id) => id !== cardId)
      }))
      this.replaceColumns(updated)
    })
  }

  moveCard(cardId: string, targetColumnId: string, newIndex?: number): void {
    this.doc.transact(() => {
      const card = readKanbanCardFromMap(this.cardsMap.get(cardId))
      if (!card) {
        return
      }

      const updatedCard = normalizeKanbanCardForCRDT({
        ...card,
        columnId: targetColumnId,
        updatedAt: Date.now()
      })
      this.cardsMap.set(cardId, updatedCard)
      this.metadataMap.set('updatedAt', Date.now())

      const columns = this.columnsArray.toArray()
      const updated = columns.map((col) => {
        const filtered = col.cardIds.filter((id) => id !== cardId)
        if (col.id === targetColumnId) {
          if (newIndex !== undefined && newIndex >= 0 && newIndex <= filtered.length) {
            filtered.splice(newIndex, 0, cardId)
          } else {
            filtered.push(cardId)
          }
        }
        return { ...col, cardIds: filtered }
      })
      this.replaceColumns(updated)
    })
  }

  setColumns(columns: TeamKanbanColumn[]): void {
    this.doc.transact(() => {
      this.replaceColumns(columns)
      this.metadataMap.set('updatedAt', Date.now())
    })
  }

  syncFromBoard(board: TeamKanbanBoard): void {
    this.doc.transact(() => {
      this.metadataMap.set('title', board.title)
      if (board.description !== undefined) {
        this.metadataMap.set('description', board.description)
      }
      if (board.projectId !== undefined) {
        this.metadataMap.set('projectId', board.projectId)
      }
      if (board.sprintGoal !== undefined) {
        this.metadataMap.set('sprintGoal', board.sprintGoal)
      }
      this.metadataMap.set('updatedAt', board.updatedAt || Date.now())

      const nextCardIds = new Set(Object.keys(board.cards))
      for (const existingId of Array.from(this.cardsMap.keys())) {
        if (!nextCardIds.has(existingId)) {
          this.cardsMap.delete(existingId)
        }
      }
      for (const [cardId, card] of Object.entries(board.cards)) {
        const current = readKanbanCardFromMap(this.cardsMap.get(cardId))
        const normalized = normalizeKanbanCardForCRDT(card)
        if (!current || JSON.stringify(current) !== JSON.stringify(normalized)) {
          this.cardsMap.set(cardId, normalized)
        }
      }

      this.replaceColumns(board.columns)
    })
  }

  subscribe(callback: (board: TeamKanbanBoard) => void): () => void {
    this.changeListeners.add(callback)
    return () => {
      this.changeListeners.delete(callback)
    }
  }

  encodeStateAsUpdate(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc)
  }

  applyUpdate(update: Uint8Array, origin?: unknown): void {
    Y.applyUpdate(this.doc, update, origin)
  }

  destroy(): void {
    this.cardsMap.unobserve(this.observer)
    this.columnsArray.unobserve(this.observer)
    this.metadataMap.unobserve(this.observer)
    this.changeListeners.clear()
    this.doc.destroy()
  }

  private replaceColumns(newColumns: TeamKanbanColumn[]): void {
    this.columnsArray.delete(0, this.columnsArray.length)
    this.columnsArray.push(newColumns)
  }

  private moveCardInColumns(cardId: string, sourceColId: string, targetColId: string): void {
    const columns = this.columnsArray.toArray()
    const updated = columns.map((col) => {
      if (col.id === sourceColId) {
        return { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) }
      }
      if (col.id === targetColId && !col.cardIds.includes(cardId)) {
        return { ...col, cardIds: [...col.cardIds, cardId] }
      }
      return col
    })
    this.replaceColumns(updated)
  }
}
