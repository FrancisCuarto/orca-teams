import type React from 'react'
import { useState, useRef, useCallback } from 'react'
import type {
  TeamWhiteboardItem,
  WhiteboardPoint,
  WhiteboardShapeKind
} from '../../../../../shared/teamwork/team-kanban-types'
import { findSnapTargetId } from './whiteboard-geometry'
import type { WhiteboardPreviewOverride, WhiteboardTool } from './whiteboard-types'
import type { DrawingPreview } from './TeamWhiteboardSvgLayer'
import { useWhiteboardShortcuts } from './use-whiteboard-shortcuts'
import {
  createArrowItem,
  createFreehandDrawItem,
  createShapeItem
} from './whiteboard-session-commit'

type DragSession =
  | {
      kind: 'move'
      itemId: string
      mouseX: number
      mouseY: number
      initialX: number
      initialY: number
      width: number
      height: number
    }
  | {
      kind: 'resize'
      itemId: string
      mouseX: number
      mouseY: number
      x: number
      y: number
      initialW: number
      initialH: number
    }
  | {
      kind: 'pan'
      mouseX: number
      mouseY: number
      initialPanX: number
      initialPanY: number
      moved: boolean
    }
  | { kind: 'draw'; points: WhiteboardPoint[] }
  | { kind: 'arrow'; start: WhiteboardPoint; fromId?: string }
  | { kind: 'shape'; shapeKind: WhiteboardShapeKind; start: WhiteboardPoint }

type Options = {
  canvasRef: React.RefObject<HTMLDivElement | null>
  items: TeamWhiteboardItem[]
  zoom: number
  pan: { x: number; y: number }
  activeTool: WhiteboardTool
  activeShapeKind: WhiteboardShapeKind
  selectedItemId: string | null
  readOnly?: boolean
  onSelectItem: (id: string | null) => void
  onSelectTool: (tool: WhiteboardTool) => void
  onPanChange: (next: { x: number; y: number }, commit: boolean) => void
  onZoomAt: (nextZoom: number, nextPan?: { x: number; y: number }) => void
  onCommitItems: (items: TeamWhiteboardItem[]) => void
  onCursorMove?: (x: number, y: number) => void
  onUndo: () => void
  onRedo: () => void
  onDuplicateSelected: () => void
  onDeleteSelected: () => void
}

export function useWhiteboardInteractions(opts: Options) {
  const {
    canvasRef,
    items,
    zoom,
    pan,
    activeTool,
    activeShapeKind,
    selectedItemId,
    readOnly = false,
    onSelectItem,
    onSelectTool,
    onPanChange,
    onZoomAt,
    onCommitItems,
    onCursorMove,
    onUndo,
    onRedo,
    onDuplicateSelected,
    onDeleteSelected
  } = opts

  const [previewOverride, setPreviewOverride] = useState<WhiteboardPreviewOverride | null>(null)
  const [drawingPreview, setDrawingPreview] = useState<DrawingPreview | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [isSpaceHeld, setIsSpaceHeld] = useState(false)
  const [cursorCoords, setCursorCoords] = useState<WhiteboardPoint>({ x: 0, y: 0 })
  const sessionRef = useRef<DragSession | null>(null)

  useWhiteboardShortcuts({
    selectedItemId,
    readOnly,
    onSpaceChange: setIsSpaceHeld,
    onSelectItem,
    onSelectTool,
    onUndo,
    onRedo,
    onDuplicateSelected,
    onDeleteSelected
  })

  const toWorld = useCallback(
    (clientX: number, clientY: number): WhiteboardPoint => {
      const rect = canvasRef.current?.getBoundingClientRect()
      return {
        x: Math.round((clientX - (rect?.left ?? 0) - pan.x) / zoom),
        y: Math.round((clientY - (rect?.top ?? 0) - pan.y) / zoom)
      }
    },
    [canvasRef, pan.x, pan.y, zoom]
  )

  const onItemMouseDown = useCallback(
    (e: React.MouseEvent, item: TeamWhiteboardItem) => {
      if (e.button === 1 || isSpaceHeld || activeTool === 'pan') {
        return
      }
      if (readOnly) {
        e.stopPropagation()
        onSelectItem(item.id)
        return
      }
      if (activeTool === 'draw' || activeTool === 'arrow' || activeTool === 'shape') {
        return
      }
      if (e.target instanceof Element && e.target.closest('button, input, textarea')) {
        onSelectItem(item.id)
        return
      }
      e.stopPropagation()
      onSelectItem(item.id)
      sessionRef.current = {
        kind: 'move',
        itemId: item.id,
        mouseX: e.clientX,
        mouseY: e.clientY,
        initialX: item.x,
        initialY: item.y,
        width: item.width,
        height: item.height
      }
      setPreviewOverride({
        itemId: item.id,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height
      })
    },
    [activeTool, isSpaceHeld, onSelectItem, readOnly]
  )

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent, item: TeamWhiteboardItem) => {
      if (readOnly) {
        return
      }
      e.stopPropagation()
      onSelectItem(item.id)
      sessionRef.current = {
        kind: 'resize',
        itemId: item.id,
        mouseX: e.clientX,
        mouseY: e.clientY,
        x: item.x,
        y: item.y,
        initialW: item.width,
        initialH: item.height
      }
      setPreviewOverride({
        itemId: item.id,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height
      })
    },
    [onSelectItem, readOnly]
  )

  const onCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const worldPt = toWorld(e.clientX, e.clientY)
      setCursorCoords(worldPt)
      onCursorMove?.(worldPt.x, worldPt.y)
      if (e.button === 1 || isSpaceHeld || activeTool === 'pan') {
        setIsPanning(true)
        sessionRef.current = {
          kind: 'pan',
          mouseX: e.clientX,
          mouseY: e.clientY,
          initialPanX: pan.x,
          initialPanY: pan.y,
          moved: false
        }
        return
      }
      if (!readOnly && activeTool === 'draw') {
        e.stopPropagation()
        sessionRef.current = { kind: 'draw', points: [worldPt] }
        setDrawingPreview({ kind: 'draw', points: [worldPt] })
        return
      }
      if (!readOnly && activeTool === 'arrow') {
        e.stopPropagation()
        const fromId = findSnapTargetId(worldPt, items)
        sessionRef.current = { kind: 'arrow', start: worldPt, fromId }
        setDrawingPreview({ kind: 'arrow', start: worldPt, end: worldPt, snapTargetId: fromId })
        return
      }
      if (!readOnly && activeTool === 'shape') {
        e.stopPropagation()
        sessionRef.current = { kind: 'shape', shapeKind: activeShapeKind, start: worldPt }
        setDrawingPreview({
          kind: 'shape',
          shapeKind: activeShapeKind,
          x: worldPt.x,
          y: worldPt.y,
          width: 1,
          height: 1
        })
        return
      }
      if (e.target instanceof Element && e.target.closest('[data-whiteboard-item="true"]')) {
        return
      }
      onSelectItem(null)
      setIsPanning(true)
      sessionRef.current = {
        kind: 'pan',
        mouseX: e.clientX,
        mouseY: e.clientY,
        initialPanX: pan.x,
        initialPanY: pan.y,
        moved: false
      }
    },
    [activeShapeKind, activeTool, isSpaceHeld, items, onSelectItem, pan.x, pan.y, readOnly, toWorld]
  )

  const onCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const worldPt = toWorld(e.clientX, e.clientY)
      setCursorCoords(worldPt)
      onCursorMove?.(worldPt.x, worldPt.y)

      const s = sessionRef.current
      if (!s) {
        return
      }
      if (s.kind === 'move') {
        setPreviewOverride({
          itemId: s.itemId,
          x: Math.round(s.initialX + (e.clientX - s.mouseX) / zoom),
          y: Math.round(s.initialY + (e.clientY - s.mouseY) / zoom),
          width: s.width,
          height: s.height
        })
      } else if (s.kind === 'resize') {
        setPreviewOverride({
          itemId: s.itemId,
          x: s.x,
          y: s.y,
          width: Math.max(100, Math.round(s.initialW + (e.clientX - s.mouseX) / zoom)),
          height: Math.max(72, Math.round(s.initialH + (e.clientY - s.mouseY) / zoom))
        })
      } else if (s.kind === 'pan') {
        s.moved = true
        onPanChange(
          {
            x: Math.round(s.initialPanX + (e.clientX - s.mouseX)),
            y: Math.round(s.initialPanY + (e.clientY - s.mouseY))
          },
          false
        )
      } else if (s.kind === 'draw') {
        const last = s.points.at(-1)
        if (!last || Math.hypot(worldPt.x - last.x, worldPt.y - last.y) >= 3) {
          s.points.push(worldPt)
          setDrawingPreview({ kind: 'draw', points: [...s.points] })
        }
      } else if (s.kind === 'arrow') {
        setDrawingPreview({
          kind: 'arrow',
          start: s.start,
          end: worldPt,
          snapTargetId: findSnapTargetId(worldPt, items, null, s.fromId)
        })
      } else if (s.kind === 'shape') {
        setDrawingPreview({
          kind: 'shape',
          shapeKind: s.shapeKind,
          x: Math.min(s.start.x, worldPt.x),
          y: Math.min(s.start.y, worldPt.y),
          width: Math.max(1, Math.abs(worldPt.x - s.start.x)),
          height: Math.max(1, Math.abs(worldPt.y - s.start.y))
        })
      }
    },
    [items, onCursorMove, onPanChange, toWorld, zoom]
  )

  const onCanvasMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const s = sessionRef.current
      sessionRef.current = null
      setIsPanning(false)
      if (!s) {
        return
      }

      if ((s.kind === 'move' || s.kind === 'resize') && previewOverride) {
        onCommitItems(
          items.map((it) =>
            it.id === previewOverride.itemId
              ? {
                  ...it,
                  x: previewOverride.x,
                  y: previewOverride.y,
                  width: previewOverride.width,
                  height: previewOverride.height
                }
              : it
          )
        )
        setPreviewOverride(null)
        return
      }
      if (s.kind === 'pan') {
        if (s.moved) {
          onPanChange(pan, true)
        }
        return
      }
      setDrawingPreview(null)
      if (s.kind === 'draw') {
        const created = createFreehandDrawItem(s.points, items)
        if (created) {
          onCommitItems([...items, created])
          onSelectItem(created.id)
        }
      } else if (s.kind === 'arrow') {
        const created = createArrowItem(s.start, toWorld(e.clientX, e.clientY), s.fromId, items)
        if (created) {
          onCommitItems([...items, created])
          onSelectItem(created.id)
          onSelectTool('select')
        }
      } else if (s.kind === 'shape') {
        const created = createShapeItem(s.shapeKind, s.start, toWorld(e.clientX, e.clientY), items)
        onCommitItems([...items, created])
        onSelectItem(created.id)
        onSelectTool('select')
      }
    },
    [items, onCommitItems, onPanChange, onSelectItem, onSelectTool, pan, previewOverride, toWorld]
  )

  const onCanvasWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        return
      }
      e.preventDefault()
      const nextZoom = Math.min(
        Math.max(Math.round((zoom + (e.deltaY < 0 ? 0.12 : -0.12)) * 100) / 100, 0.25),
        2.5
      )
      if (nextZoom === zoom) {
        return
      }
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) {
        onZoomAt(nextZoom)
        return
      }
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      onZoomAt(nextZoom, {
        x: Math.round(mouseX - ((mouseX - pan.x) / zoom) * nextZoom),
        y: Math.round(mouseY - ((mouseY - pan.y) / zoom) * nextZoom)
      })
    },
    [canvasRef, onZoomAt, pan.x, pan.y, zoom]
  )

  return {
    previewOverride,
    drawingPreview,
    isPanning,
    isSpaceHeld,
    cursorCoords,
    onItemMouseDown,
    onResizeMouseDown,
    onCanvasMouseDown,
    onCanvasMouseMove,
    onCanvasMouseUp,
    onCanvasWheel
  }
}
