import type {
  TeamKanbanBoard,
  TeamKanbanCard,
  TeamKanbanColumn,
  TeamWhiteboard,
  TeamWhiteboardItem
} from '../team-kanban-types'

export type CollaboratorPresence = {
  userId: string
  displayName: string
  avatarUrl?: string
  color: string
  activeCardId?: string
  lastSeen: number
}

export type BoardRoomMessage = {
  type: 'sync-update' | 'presence-heartbeat' | 'presence-leave'
  roomId: string
  senderId: string
  payload?: Uint8Array
  presence?: CollaboratorPresence
}

export type TeamBoardCRDTEvents = {
  onBoardChange: (board: TeamKanbanBoard) => void
  onPresenceChange: (presences: CollaboratorPresence[]) => void
}

export type ITeamBoardCRDT = {
  readonly docId: string
  getBoard(): TeamKanbanBoard
  initializeFromBoard(board: TeamKanbanBoard): void
  upsertCard(card: TeamKanbanCard): void
  deleteCard(cardId: string): void
  moveCard(cardId: string, targetColumnId: string, newIndex?: number): void
  setColumns(columns: TeamKanbanColumn[]): void
  encodeStateAsUpdate(): Uint8Array
  applyUpdate(update: Uint8Array, origin?: unknown): void
  destroy(): void
}

export type WhiteboardCursorPresence = {
  userId: string
  displayName: string
  color: string
  x: number
  y: number
  lastSeen: number
}

export type ITeamWhiteboardCRDT = {
  readonly docId: string
  getWhiteboard(): TeamWhiteboard
  initializeFromWhiteboard(whiteboard: TeamWhiteboard): void
  upsertItem(item: TeamWhiteboardItem): void
  moveItem(itemId: string, x: number, y: number): void
  updateItemContent(itemId: string, content: string): void
  deleteItem(itemId: string): void
  setViewport(viewport: { x: number; y: number; zoom: number }): void
  encodeStateAsUpdate(): Uint8Array
  applyUpdate(update: Uint8Array, origin?: unknown): void
  destroy(): void
}
