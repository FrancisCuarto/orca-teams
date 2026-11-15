import { arrayMove } from '@dnd-kit/sortable'
import type {
  TeamKanbanAssignee,
  TeamKanbanBoard,
  TeamKanbanCard,
  TeamWhiteboardItem
} from '../../../../../shared/teamwork/team-kanban-types'
import type { TeamReviewRequest } from '../../../../../shared/teamwork/team-workspace-types'

export type BoardSprintMetrics = {
  totalCards: number
  completedCards: number
  blockedCards: number
  totalPoints: number
  completedPoints: number
  agentCards: number
  humanCards: number
  workloadByAssignee: Record<string, { count: number; points: number }>
}

export function upsertKanbanCard(
  board: TeamKanbanBoard,
  savedCard: TeamKanbanCard
): {
  nextBoard: TeamKanbanBoard
  isNew: boolean
} {
  const isNew = !board.cards[savedCard.id]
  const currentCards = { ...board.cards, [savedCard.id]: savedCard }

  let updatedColumns = [...board.columns]
  if (isNew) {
    updatedColumns = updatedColumns.map((col) =>
      col.id === savedCard.columnId ? { ...col, cardIds: [...col.cardIds, savedCard.id] } : col
    )
  } else {
    const oldCard = board.cards[savedCard.id]
    if (oldCard && oldCard.columnId !== savedCard.columnId) {
      updatedColumns = updatedColumns.map((col) => {
        if (col.id === oldCard.columnId) {
          return { ...col, cardIds: col.cardIds.filter((id) => id !== savedCard.id) }
        }
        if (col.id === savedCard.columnId) {
          return { ...col, cardIds: [...col.cardIds, savedCard.id] }
        }
        return col
      })
    }
  }

  return {
    isNew,
    nextBoard: {
      ...board,
      columns: updatedColumns,
      cards: currentCards,
      updatedAt: Date.now()
    }
  }
}

export function deleteKanbanCard(board: TeamKanbanBoard, cardId: string): TeamKanbanBoard {
  const updatedCards = { ...board.cards }
  delete updatedCards[cardId]

  return {
    ...board,
    columns: board.columns.map((col) => ({
      ...col,
      cardIds: col.cardIds.filter((id) => id !== cardId)
    })),
    cards: updatedCards,
    updatedAt: Date.now()
  }
}

export function moveKanbanCardAcrossColumns(
  board: TeamKanbanBoard,
  activeId: string,
  overId: string
): TeamKanbanBoard | null {
  const activeCardItem = board.cards[activeId]
  if (!activeCardItem) {
    return null
  }

  const sourceColumn = board.columns.find((col) => col.cardIds.includes(activeId))
  const targetColumn =
    board.columns.find((col) => col.id === overId) ??
    board.columns.find((col) => col.cardIds.includes(overId))

  if (!sourceColumn || !targetColumn || sourceColumn.id === targetColumn.id) {
    return null
  }

  return moveKanbanCardToColumn(board, activeId, targetColumn.id)
}

export function moveKanbanCardToColumn(
  board: TeamKanbanBoard,
  cardId: string,
  targetColumnId: string
): TeamKanbanBoard | null {
  const activeCardItem = board.cards[cardId]
  if (!activeCardItem) {
    return null
  }

  const sourceColumn = board.columns.find((col) => col.cardIds.includes(cardId))
  const targetColumn = board.columns.find((col) => col.id === targetColumnId)

  if (!sourceColumn || !targetColumn || sourceColumn.id === targetColumn.id) {
    return null
  }

  const updatedSource = {
    ...sourceColumn,
    cardIds: sourceColumn.cardIds.filter((id) => id !== cardId)
  }
  const updatedTarget = {
    ...targetColumn,
    cardIds: [...targetColumn.cardIds, cardId]
  }
  const updatedCard: TeamKanbanCard = {
    ...activeCardItem,
    columnId: targetColumn.id,
    updatedAt: Date.now()
  }

  return {
    ...board,
    columns: board.columns.map((col) =>
      col.id === sourceColumn.id ? updatedSource : col.id === targetColumn.id ? updatedTarget : col
    ),
    cards: { ...board.cards, [cardId]: updatedCard },
    updatedAt: Date.now()
  }
}

export function reorderKanbanCardInColumn(
  board: TeamKanbanBoard,
  activeId: string,
  overId: string
): TeamKanbanBoard | null {
  const sourceColumn = board.columns.find((col) => col.cardIds.includes(activeId))
  if (!sourceColumn) {
    return null
  }

  const oldIndex = sourceColumn.cardIds.indexOf(activeId)
  const newIndex = sourceColumn.cardIds.indexOf(overId)
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return null
  }

  const reorderedCardIds = arrayMove(sourceColumn.cardIds, oldIndex, newIndex)
  return {
    ...board,
    columns: board.columns.map((col) =>
      col.id === sourceColumn.id ? { ...col, cardIds: reorderedCardIds } : col
    ),
    updatedAt: Date.now()
  }
}

export function assignMemberToKanbanCard(
  board: TeamKanbanBoard,
  cardId: string,
  assignee: TeamKanbanAssignee
): { nextBoard: TeamKanbanBoard; targetCard: TeamKanbanCard } | null {
  const targetCard = board.cards[cardId]
  if (!targetCard) {
    return null
  }
  const updatedCard: TeamKanbanCard = {
    ...targetCard,
    assignee,
    updatedAt: Date.now()
  }
  return {
    targetCard,
    nextBoard: {
      ...board,
      cards: { ...board.cards, [targetCard.id]: updatedCard },
      updatedAt: Date.now()
    }
  }
}

export function toggleKanbanCardChecklistItem(
  board: TeamKanbanBoard,
  cardId: string,
  checklistItemId: string
): TeamKanbanBoard | null {
  const targetCard = board.cards[cardId]
  if (!targetCard) {
    return null
  }

  let changed = false
  const nextChecklist = targetCard.checklist.map((item) => {
    if (item.id === checklistItemId) {
      changed = true
      return { ...item, done: !item.done }
    }
    return item
  })

  if (!changed) {
    return null
  }

  const now = Date.now()
  return {
    ...board,
    cards: {
      ...board.cards,
      [cardId]: {
        ...targetCard,
        checklist: nextChecklist,
        updatedAt: now
      }
    },
    updatedAt: now
  }
}

export function extractActionItemsFromMarkdownToBoard(
  board: TeamKanbanBoard,
  noteTitle: string,
  markdown: string,
  targetColumnId?: string
): { nextBoard: TeamKanbanBoard; createdCount: number } {
  const destinationColumnId =
    targetColumnId && board.columns.some((col) => col.id === targetColumnId)
      ? targetColumnId
      : (board.columns[0]?.id ?? 'col-backlog')

  const existingTitles = new Set(
    Object.values(board.cards).map((card) => card.title.trim().toLowerCase())
  )

  const actionLines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- [ ] '))
    .map((line) => line.slice(6).trim())
    .filter(Boolean)

  let nextBoard = board
  let createdCount = 0
  const baseTime = Date.now()

  for (const [idx, taskTitle] of actionLines.entries()) {
    const normalized = taskTitle.toLowerCase()
    if (existingTitles.has(normalized)) {
      continue
    }
    existingTitles.add(normalized)
    createdCount += 1

    const newCard: TeamKanbanCard = {
      id: `card-note-${baseTime}-${idx}`,
      title: taskTitle,
      description: `Extraída desde la nota "${noteTitle}".`,
      columnId: destinationColumnId,
      priority: 'medium',
      labels: ['Desde Nota'],
      checklist: [],
      createdAt: baseTime + idx,
      updatedAt: baseTime + idx
    }
    nextBoard = upsertKanbanCard(nextBoard, newCard).nextBoard
  }

  return { nextBoard, createdCount }
}

export function resolveDoneColumnId(board: TeamKanbanBoard): string | undefined {
  return (
    board.columns.find((col) => col.id === 'col-done' || col.id === 'done')?.id ??
    board.columns.find((col) => {
      const lower = col.title.trim().toLowerCase()
      return lower === 'completado' || lower === 'done'
    })?.id ??
    board.columns.at(-1)?.id
  )
}

export function applyReviewRequestToKanbanCard(
  board: TeamKanbanBoard,
  cardId: string,
  reviewRequest: TeamReviewRequest
): { nextBoard: TeamKanbanBoard; movedToDone: boolean } {
  const existingCard = board.cards[cardId]
  if (!existingCard) {
    return { nextBoard: board, movedToDone: false }
  }
  const now = Date.now()
  const updatedCard: TeamKanbanCard = {
    ...existingCard,
    reviewRequest,
    updatedAt: now
  }
  let nextBoard: TeamKanbanBoard = {
    ...board,
    cards: { ...board.cards, [cardId]: updatedCard },
    updatedAt: now
  }

  let movedToDone = false
  if (reviewRequest.state === 'merged') {
    const doneColumnId = resolveDoneColumnId(nextBoard)
    if (doneColumnId && updatedCard.columnId !== doneColumnId) {
      const moved = moveKanbanCardToColumn(nextBoard, cardId, doneColumnId)
      if (moved) {
        nextBoard = moved
        movedToDone = true
      }
    }
  }

  return { nextBoard, movedToDone }
}

export function isConvertibleWhiteboardElement(item: TeamWhiteboardItem): boolean {
  if (item.type === 'sticky' || item.type === 'text' || item.type === 'spec') {
    return Boolean(item.title?.trim() || item.content.trim())
  }
  if (item.type === 'shape') {
    return item.content.trim().length > 0
  }
  return false
}

function buildCardTitleAndDescriptionFromWhiteboardItem(item: TeamWhiteboardItem): {
  title: string
  description: string
} {
  const trimmedTitle = item.title?.trim() ?? ''
  const trimmedContent = item.content.trim()
  const contentLines = trimmedContent
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .filter(Boolean)

  if (trimmedTitle) {
    return {
      title: trimmedTitle,
      description: trimmedContent || `Convertida desde elemento de pizarra (${item.type}).`
    }
  }

  const firstLine = contentLines[0] ?? `Elemento de pizarra (${item.type})`
  const title = firstLine.length > 100 ? `${firstLine.slice(0, 97)}...` : firstLine
  return {
    title,
    description: trimmedContent
  }
}

export function convertWhiteboardElementsToBoard(
  board: TeamKanbanBoard,
  elements: readonly TeamWhiteboardItem[],
  targetColumnId?: string
): {
  nextBoard: TeamKanbanBoard
  createdCount: number
  skippedDuplicateCount: number
  createdCards: TeamKanbanCard[]
} {
  const destinationColumnId =
    targetColumnId && board.columns.some((col) => col.id === targetColumnId)
      ? targetColumnId
      : (board.columns[0]?.id ?? 'col-backlog')

  const existingSourceIds = new Set(
    Object.values(board.cards)
      .map((card) => card.sourceWhiteboardElementId)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
  )

  let nextBoard = board
  let createdCount = 0
  let skippedDuplicateCount = 0
  const createdCards: TeamKanbanCard[] = []
  const baseTime = Date.now()

  for (const [idx, item] of elements.entries()) {
    if (!isConvertibleWhiteboardElement(item)) {
      continue
    }
    if (existingSourceIds.has(item.id)) {
      skippedDuplicateCount += 1
      continue
    }
    existingSourceIds.add(item.id)
    createdCount += 1

    const { title, description } = buildCardTitleAndDescriptionFromWhiteboardItem(item)
    const newCard: TeamKanbanCard = {
      id: `card-wb-${baseTime}-${idx}`,
      title,
      description,
      columnId: destinationColumnId,
      priority: 'medium',
      labels: ['Desde Pizarra'],
      checklist: [],
      sourceWhiteboardElementId: item.id,
      createdAt: baseTime + idx,
      updatedAt: baseTime + idx
    }
    nextBoard = upsertKanbanCard(nextBoard, newCard).nextBoard
    createdCards.push(newCard)
  }

  return { nextBoard, createdCount, skippedDuplicateCount, createdCards }
}

export function computeBoardSprintMetrics(board: TeamKanbanBoard): BoardSprintMetrics {
  const doneColumnId =
    board.columns.find((col) => col.id === 'col-done')?.id ?? board.columns.at(-1)?.id
  const workloadByAssignee: Record<string, { count: number; points: number }> = {}

  let totalCards = 0
  let completedCards = 0
  let blockedCards = 0
  let totalPoints = 0
  let completedPoints = 0
  let agentCards = 0
  let humanCards = 0

  for (const card of Object.values(board.cards)) {
    totalCards += 1
    const points = card.estimatePoints ?? 0
    totalPoints += points

    const isDone = doneColumnId !== undefined && card.columnId === doneColumnId
    if (isDone) {
      completedCards += 1
      completedPoints += points
    }

    if (card.blockedReason?.trim()) {
      blockedCards += 1
    }

    if (card.assignee) {
      if (card.assignee.type === 'agent') {
        agentCards += 1
      } else {
        humanCards += 1
      }

      if (!isDone) {
        const existing = workloadByAssignee[card.assignee.name] ?? { count: 0, points: 0 }
        workloadByAssignee[card.assignee.name] = {
          count: existing.count + 1,
          points: existing.points + points
        }
      }
    }
  }

  return {
    totalCards,
    completedCards,
    blockedCards,
    totalPoints,
    completedPoints,
    agentCards,
    humanCards,
    workloadByAssignee
  }
}
