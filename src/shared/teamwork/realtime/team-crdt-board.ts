import * as Y from 'yjs'
import {
  isTeamCardComment,
  type TeamCardComment,
  type TeamKanbanBoard,
  type TeamKanbanCard,
  type TeamKanbanColumn
} from '../team-kanban-types'
import type { ITeamBoardCRDT } from './team-crdt-types'

function stripCardComments(card: TeamKanbanCard): TeamKanbanCard {
  if (!('comments' in card) || card.comments === undefined) {
    return card
  }
  const copy = { ...card }
  delete copy.comments
  return copy
}

export class TeamBoardCRDT implements ITeamBoardCRDT {
  public readonly doc: Y.Doc
  private readonly cardsMap: Y.Map<TeamKanbanCard>
  private readonly commentsMap: Y.Map<TeamCardComment>
  private readonly columnsArray: Y.Array<TeamKanbanColumn>
  private readonly metadataMap: Y.Map<unknown>
  private readonly changeListeners = new Set<(board: TeamKanbanBoard) => void>()
  private readonly observer: () => void

  constructor(
    public readonly docId: string,
    existingDoc?: Y.Doc
  ) {
    this.doc = existingDoc ?? new Y.Doc()
    this.cardsMap = this.doc.getMap<TeamKanbanCard>('cards')
    this.commentsMap = this.doc.getMap<TeamCardComment>('comments')
    this.columnsArray = this.doc.getArray<TeamKanbanColumn>('columns')
    this.metadataMap = this.doc.getMap<unknown>('metadata')

    this.observer = (): void => {
      const board = this.getBoard()
      for (const listener of this.changeListeners) {
        listener(board)
      }
    }

    this.cardsMap.observe(this.observer)
    this.commentsMap.observe(this.observer)
    this.columnsArray.observe(this.observer)
    this.metadataMap.observe(this.observer)
  }

  getBoard(): TeamKanbanBoard {
    const commentsByCard = new Map<string, TeamCardComment[]>()
    this.commentsMap.forEach((rawComment) => {
      if (!isTeamCardComment(rawComment)) {
        return
      }
      const list = commentsByCard.get(rawComment.cardId) ?? []
      list.push(rawComment)
      commentsByCard.set(rawComment.cardId, list)
    })

    for (const [cardId, list] of commentsByCard.entries()) {
      list.sort((a, b) => a.createdAt - b.createdAt)
      commentsByCard.set(cardId, list)
    }

    const cards: Record<string, TeamKanbanCard> = {}
    this.cardsMap.forEach((card, cardId) => {
      const crdtComments = commentsByCard.get(cardId)
      if (crdtComments && crdtComments.length > 0) {
        cards[cardId] = { ...card, comments: crdtComments }
      } else if (card.comments && card.comments.length > 0) {
        cards[cardId] = card
      } else {
        cards[cardId] = stripCardComments(card)
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
        this.cardsMap.set(cardId, stripCardComments(card))
        if (card.comments) {
          for (const comment of card.comments) {
            this.commentsMap.set(comment.id, comment)
          }
        }
      }
    })
  }

  upsertCard(card: TeamKanbanCard): void {
    this.doc.transact(() => {
      const existing = this.cardsMap.get(card.id)
      this.cardsMap.set(card.id, { ...stripCardComments(card), updatedAt: Date.now() })
      if (card.comments) {
        for (const comment of card.comments) {
          if (!this.commentsMap.has(comment.id)) {
            this.commentsMap.set(comment.id, comment)
          }
        }
      }
      this.metadataMap.set('updatedAt', Date.now())

      const isNew = !existing
      const targetColId = card.columnId

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
      for (const [commentId, comment] of Array.from(this.commentsMap.entries())) {
        if (comment.cardId === cardId) {
          this.commentsMap.delete(commentId)
        }
      }
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
      const card = this.cardsMap.get(cardId)
      if (!card) {
        return
      }

      const updatedCard = { ...card, columnId: targetColumnId, updatedAt: Date.now() }
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

  addCardComment(comment: TeamCardComment): void {
    this.doc.transact(() => {
      this.commentsMap.set(comment.id, comment)
      this.metadataMap.set('updatedAt', Date.now())
    })
  }

  deleteCardComment(commentId: string): void {
    this.doc.transact(() => {
      this.commentsMap.delete(commentId)
      this.metadataMap.set('updatedAt', Date.now())
    })
  }

  getCardComments(cardId: string): TeamCardComment[] {
    const result: TeamCardComment[] = []
    this.commentsMap.forEach((rawComment) => {
      if (isTeamCardComment(rawComment) && rawComment.cardId === cardId) {
        result.push(rawComment)
      }
    })
    return result.sort((a, b) => a.createdAt - b.createdAt)
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
      for (const [commentId, comment] of Array.from(this.commentsMap.entries())) {
        if (!nextCardIds.has(comment.cardId)) {
          this.commentsMap.delete(commentId)
        }
      }
      for (const [cardId, card] of Object.entries(board.cards)) {
        const cleanCard = stripCardComments(card)
        const current = this.cardsMap.get(cardId)
        if (!current || JSON.stringify(current) !== JSON.stringify(cleanCard)) {
          this.cardsMap.set(cardId, cleanCard)
        }
        if (card.comments) {
          for (const comment of card.comments) {
            const currentComment = this.commentsMap.get(comment.id)
            if (!currentComment || JSON.stringify(currentComment) !== JSON.stringify(comment)) {
              this.commentsMap.set(comment.id, comment)
            }
          }
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
    this.commentsMap.unobserve(this.observer)
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
