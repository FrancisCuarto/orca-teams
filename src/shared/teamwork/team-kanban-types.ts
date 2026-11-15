export type TeamKanbanPriority = 'low' | 'medium' | 'high' | 'urgent'

export type TeamKanbanAssignee = {
  type: 'human' | 'agent'
  name: string
  avatar?: string
  agentType?: string
  model?: string
  skills?: string[]
}

export type ExtendedTeamMember = TeamKanbanAssignee & {
  id: string
  role: string
  status?: 'online' | 'busy' | 'away'
  color?: string
  defaultModel?: string
  defaultSkills?: string[]
}

export type TeamKanbanChecklistItem = {
  id: string
  text: string
  done: boolean
}

export type TeamKanbanCard = {
  id: string
  title: string
  description: string
  columnId: string
  priority: TeamKanbanPriority
  assignee?: TeamKanbanAssignee
  labels: string[]
  checklist: TeamKanbanChecklistItem[]
  branchOrWorktree?: string
  isolateWorktree?: boolean
  requiresApproval?: boolean
  estimatePoints?: number
  blockedReason?: string
  dueDate?: string
  createdAt: number
  updatedAt: number
}

export type TeamKanbanColumn = {
  id: string
  title: string
  color?: string
  wipLimit?: number
  cardIds: string[]
}

export type TeamKanbanBoard = {
  id: string
  projectId?: string
  title: string
  description?: string
  sprintGoal?: string
  columns: TeamKanbanColumn[]
  cards: Record<string, TeamKanbanCard>
  customMembers?: ExtendedTeamMember[]
  createdAt: number
  updatedAt: number
}

export type WhiteboardItemType = 'sticky' | 'mermaid' | 'text' | 'spec' | 'shape' | 'draw' | 'arrow'

export type WhiteboardColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'orange'

export type WhiteboardShapeKind = 'rect' | 'ellipse' | 'diamond'

export type WhiteboardFillStyle = 'tinted' | 'solid' | 'outline'

export type WhiteboardFontSize = 'sm' | 'md' | 'lg'

export type WhiteboardPoint = {
  x: number
  y: number
}

export type TeamWhiteboardItem = {
  id: string
  type: WhiteboardItemType
  x: number
  y: number
  width: number
  height: number
  content: string
  color?: WhiteboardColor
  title?: string
  shapeKind?: WhiteboardShapeKind
  strokeColor?: string
  strokeWidth?: number
  fillStyle?: WhiteboardFillStyle
  /**
   * Coordinates relative to the item's (x, y) bounding-box origin.
   * For 'draw', represents the freehand polyline points.
   * For 'arrow', represents [startPoint, endPoint] relative to (x, y).
   */
  points?: WhiteboardPoint[]
  fromId?: string
  toId?: string
  endX?: number
  endY?: number
  zIndex?: number
  fontSize?: WhiteboardFontSize
}

export type TeamWhiteboard = {
  id: string
  projectId: string
  title: string
  items: TeamWhiteboardItem[]
  viewport: { x: number; y: number; zoom: number }
  createdAt: number
  updatedAt: number
}

export type TeamNoteCategory = 'adr' | 'spec' | 'meeting' | 'general'

export type TeamNoteStatus = 'draft' | 'proposed' | 'accepted' | 'deprecated'

export type TeamNote = {
  id: string
  title: string
  content: string
  category: TeamNoteCategory
  status?: TeamNoteStatus
  author?: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export type TeamNotesCollection = {
  projectId: string
  notes: TeamNote[]
  updatedAt: number
}

export type TeamTab = 'kanban' | 'whiteboard' | 'notes' | 'activity'

export function isTeamKanbanPriority(value: string): value is TeamKanbanPriority {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'urgent'
}

export function isTeamNoteCategory(value: string): value is TeamNoteCategory {
  return value === 'adr' || value === 'spec' || value === 'meeting' || value === 'general'
}

export function isTeamNoteStatus(value: string): value is TeamNoteStatus {
  return value === 'draft' || value === 'proposed' || value === 'accepted' || value === 'deprecated'
}
