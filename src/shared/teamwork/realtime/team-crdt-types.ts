import type { TeamKanbanBoard, TeamKanbanCard, TeamKanbanColumn } from '../team-kanban-types'

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
