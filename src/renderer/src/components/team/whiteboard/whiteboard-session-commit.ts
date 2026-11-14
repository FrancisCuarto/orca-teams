import type {
  TeamWhiteboardItem,
  WhiteboardPoint,
  WhiteboardShapeKind
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  findSnapTargetId,
  normalizePointsBoundingBox,
  resolveArrowEndpoints
} from './whiteboard-geometry'
import { getMaxZIndex } from './whiteboard-types'

export function createFreehandDrawItem(
  points: WhiteboardPoint[],
  existingItems: TeamWhiteboardItem[]
): TeamWhiteboardItem | null {
  if (points.length < 2) {
    return null
  }
  const box = normalizePointsBoundingBox(points)
  return {
    id: `draw-${Date.now()}`,
    type: 'draw',
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    content: '',
    strokeColor: '#3b82f6',
    strokeWidth: 3,
    points: box.points,
    zIndex: getMaxZIndex(existingItems) + 1
  }
}

export function createArrowItem(
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  fromId: string | undefined,
  existingItems: TeamWhiteboardItem[]
): TeamWhiteboardItem | null {
  const toId = findSnapTargetId(end, existingItems, null, fromId)
  if (Math.hypot(end.x - start.x, end.y - start.y) < 12 && !(fromId && toId)) {
    return null
  }
  const box = normalizePointsBoundingBox([start, end])
  const draft: TeamWhiteboardItem = {
    id: `arrow-${Date.now()}`,
    type: 'arrow',
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    content: '',
    strokeColor: '#3b82f6',
    strokeWidth: 2,
    points: box.points,
    endX: end.x,
    endY: end.y,
    ...(fromId ? { fromId } : {}),
    ...(toId ? { toId } : {}),
    zIndex: getMaxZIndex(existingItems) + 1
  }
  const resolved = resolveArrowEndpoints(draft, existingItems)
  const finalBox = normalizePointsBoundingBox([resolved.start, resolved.end])
  return {
    ...draft,
    x: finalBox.x,
    y: finalBox.y,
    width: finalBox.width,
    height: finalBox.height,
    points: finalBox.points
  }
}

export function createShapeItem(
  shapeKind: WhiteboardShapeKind,
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  existingItems: TeamWhiteboardItem[]
): TeamWhiteboardItem {
  const draggedW = Math.abs(end.x - start.x)
  const draggedH = Math.abs(end.y - start.y)
  const useDefault = draggedW < 16 && draggedH < 16
  const width = useDefault ? 180 : Math.max(80, draggedW)
  const height = useDefault ? 110 : Math.max(60, draggedH)
  const x = useDefault ? Math.round(start.x - width / 2) : Math.min(start.x, end.x)
  const y = useDefault ? Math.round(start.y - height / 2) : Math.min(start.y, end.y)
  return {
    id: `shape-${Date.now()}`,
    type: 'shape',
    shapeKind,
    x,
    y,
    width,
    height,
    content: '',
    color: 'blue',
    strokeColor: '#3b82f6',
    strokeWidth: 2,
    fillStyle: 'tinted',
    fontSize: 'sm',
    zIndex: getMaxZIndex(existingItems) + 1
  }
}
