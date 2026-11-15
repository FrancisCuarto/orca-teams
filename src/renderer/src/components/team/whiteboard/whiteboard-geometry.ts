import type {
  TeamWhiteboardItem,
  WhiteboardPoint
} from '../../../../../shared/teamwork/team-kanban-types'
import { getItemBounds, isBoxItem, type WhiteboardPreviewOverride } from './whiteboard-types'

const SNAP_PADDING = 16

export function findSnapTargetId(
  worldPt: WhiteboardPoint,
  items: TeamWhiteboardItem[],
  preview?: WhiteboardPreviewOverride | null,
  excludeId?: string
): string | undefined {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (!item || !isBoxItem(item) || item.id === excludeId) {
      continue
    }
    const b = getItemBounds(item, preview)
    if (
      worldPt.x >= b.x - SNAP_PADDING &&
      worldPt.x <= b.x + b.width + SNAP_PADDING &&
      worldPt.y >= b.y - SNAP_PADDING &&
      worldPt.y <= b.y + b.height + SNAP_PADDING
    ) {
      return item.id
    }
  }
  return undefined
}

export function computeEdgeAnchor(
  box: { x: number; y: number; width: number; height: number },
  targetCenter: WhiteboardPoint
): WhiteboardPoint {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const dx = targetCenter.x - cx
  const dy = targetCenter.y - cy
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx, y: cy }
  }
  const halfW = Math.max(1, box.width / 2)
  const halfH = Math.max(1, box.height / 2)
  const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH)
  return {
    x: Math.round(cx + dx * scale),
    y: Math.round(cy + dy * scale)
  }
}

export function resolveArrowEndpoints(
  arrow: TeamWhiteboardItem,
  items: TeamWhiteboardItem[],
  preview?: WhiteboardPreviewOverride | null
): { start: WhiteboardPoint; end: WhiteboardPoint } {
  const bounds = getItemBounds(arrow, preview)
  const p0 = arrow.points?.[0]
  const p1 = arrow.points?.[1]

  let start: WhiteboardPoint = p0
    ? { x: bounds.x + p0.x, y: bounds.y + p0.y }
    : { x: bounds.x, y: bounds.y }
  let end: WhiteboardPoint = p1
    ? { x: bounds.x + p1.x, y: bounds.y + p1.y }
    : {
        x: arrow.endX ?? bounds.x + bounds.width,
        y: arrow.endY ?? bounds.y + bounds.height
      }

  const fromItem = arrow.fromId ? items.find((i) => i.id === arrow.fromId) : undefined
  const toItem = arrow.toId ? items.find((i) => i.id === arrow.toId) : undefined

  const fromBounds = fromItem ? getItemBounds(fromItem, preview) : null
  const toBounds = toItem ? getItemBounds(toItem, preview) : null

  const fromCenter = fromBounds
    ? { x: fromBounds.x + fromBounds.width / 2, y: fromBounds.y + fromBounds.height / 2 }
    : start
  const toCenter = toBounds
    ? { x: toBounds.x + toBounds.width / 2, y: toBounds.y + toBounds.height / 2 }
    : end

  if (fromBounds) {
    start = computeEdgeAnchor(fromBounds, toCenter)
  }
  if (toBounds) {
    end = computeEdgeAnchor(toBounds, fromCenter)
  }
  return { start, end }
}

export function pointsToSmoothSvgPath(points: WhiteboardPoint[], offsetX = 0, offsetY = 0): string {
  if (points.length === 0) {
    return ''
  }
  const first = points[0]
  if (!first) {
    return ''
  }
  if (points.length === 1) {
    const x = first.x + offsetX
    const y = first.y + offsetY
    return `M ${x} ${y} L ${x + 0.5} ${y + 0.5}`
  }
  const segments: string[] = [`M ${first.x + offsetX} ${first.y + offsetY}`]
  for (let i = 1; i < points.length - 1; i += 1) {
    const curr = points[i]
    const next = points[i + 1]
    if (!curr || !next) {
      continue
    }
    const midX = (curr.x + next.x) / 2 + offsetX
    const midY = (curr.y + next.y) / 2 + offsetY
    segments.push(`Q ${curr.x + offsetX} ${curr.y + offsetY} ${midX} ${midY}`)
  }
  const last = points.at(-1)
  if (last) {
    segments.push(`L ${last.x + offsetX} ${last.y + offsetY}`)
  }
  return segments.join(' ')
}

export function normalizePointsBoundingBox(worldPoints: WhiteboardPoint[]): {
  x: number
  y: number
  width: number
  height: number
  points: WhiteboardPoint[]
} {
  if (worldPoints.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1, points: [] }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const pt of worldPoints) {
    if (pt.x < minX) {
      minX = pt.x
    }
    if (pt.y < minY) {
      minY = pt.y
    }
    if (pt.x > maxX) {
      maxX = pt.x
    }
    if (pt.y > maxY) {
      maxY = pt.y
    }
  }
  const x = Math.round(minX)
  const y = Math.round(minY)
  const width = Math.max(12, Math.round(maxX - minX))
  const height = Math.max(12, Math.round(maxY - minY))
  const points = worldPoints.map((pt) => ({
    x: Math.round(pt.x - x),
    y: Math.round(pt.y - y)
  }))
  return { x, y, width, height, points }
}

export function computeFitViewport(
  items: TeamWhiteboardItem[],
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; zoom: number } {
  if (items.length === 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return { x: 0, y: 0, zoom: 1 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const item of items) {
    if (item.x < minX) {
      minX = item.x
    }
    if (item.y < minY) {
      minY = item.y
    }
    if (item.x + item.width > maxX) {
      maxX = item.x + item.width
    }
    if (item.y + item.height > maxY) {
      maxY = item.y + item.height
    }
  }
  const padding = 80
  const contentW = Math.max(100, maxX - minX)
  const contentH = Math.max(100, maxY - minY)
  const scaleX = (canvasWidth - padding * 2) / contentW
  const scaleY = (canvasHeight - padding * 2) / contentH
  const zoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.25), 1.5)
  const roundedZoom = Math.round(zoom * 100) / 100
  const centerX = minX + contentW / 2
  const centerY = minY + contentH / 2
  return {
    x: Math.round(canvasWidth / 2 - centerX * roundedZoom),
    y: Math.round(canvasHeight / 2 - centerY * roundedZoom),
    zoom: roundedZoom
  }
}
