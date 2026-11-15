import React, { useState, useRef, useCallback, useMemo } from 'react'
import type {
  TeamWhiteboard,
  TeamWhiteboardItem,
  WhiteboardShapeKind
} from '../../../../../shared/teamwork/team-kanban-types'
import type { WhiteboardCursorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { TeamWhiteboardToolbar } from './TeamWhiteboardToolbar'
import { TeamWhiteboardCardItem } from './TeamWhiteboardCardItem'
import { TeamWhiteboardCursor } from './TeamWhiteboardCursor'
import { TeamWhiteboardSvgLayer } from './TeamWhiteboardSvgLayer'
import { TeamWhiteboardPropertiesBar } from './TeamWhiteboardPropertiesBar'
import { useWhiteboardHistory } from './use-whiteboard-history'
import { useWhiteboardInteractions } from './use-whiteboard-interactions'
import { useWhiteboardActions } from './use-whiteboard-actions'
import { computeFitViewport } from './whiteboard-geometry'
import { getItemBounds, getMaxZIndex, isBoxItem, type WhiteboardTool } from './whiteboard-types'

type Props = {
  whiteboard: TeamWhiteboard
  remoteCursors?: WhiteboardCursorPresence[]
  readOnly?: boolean
  canCreateTask?: boolean
  onCursorMove?: (x: number, y: number) => void
  onChange: (updated: TeamWhiteboard) => void
  onCreateTask?: (item: TeamWhiteboardItem) => void
}

const EMPTY_CURSORS: WhiteboardCursorPresence[] = []
const DOT_GRID_BG =
  'radial-gradient(circle, var(--color-border, rgba(255,255,255,0.1)) 1px, transparent 1px)'

export function TeamWhiteboardView({
  whiteboard,
  remoteCursors = EMPTY_CURSORS,
  readOnly = false,
  canCreateTask = true,
  onCursorMove,
  onChange,
  onCreateTask
}: Props): React.JSX.Element {
  const isDark = useDocumentDarkTheme()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(whiteboard.viewport?.zoom ?? 1)
  const [pan, setPan] = useState({ x: whiteboard.viewport?.x ?? 0, y: whiteboard.viewport?.y ?? 0 })
  const [activeTool, setActiveTool] = useState<WhiteboardTool>('select')
  const [activeShapeKind, setActiveShapeKind] = useState<WhiteboardShapeKind>('rect')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [mermaidEditMode, setMermaidEditMode] = useState<Record<string, boolean>>({})

  const history = useWhiteboardHistory()

  const mutateBoard = useCallback(
    (updates: Partial<TeamWhiteboard>) => {
      if (readOnly) {
        return
      }
      onChange({ ...whiteboard, ...updates, updatedAt: Date.now() })
    },
    [onChange, readOnly, whiteboard]
  )

  const commitItems = useCallback(
    (nextItems: TeamWhiteboardItem[]) => {
      if (readOnly) {
        return
      }
      history.recordSnapshot(whiteboard.items)
      mutateBoard({ items: nextItems })
    },
    [history, mutateBoard, readOnly, whiteboard.items]
  )

  const commitViewport = useCallback(
    (next: { x: number; y: number; zoom: number }) => {
      setZoom(next.zoom)
      setPan({ x: next.x, y: next.y })
      if (!readOnly) {
        mutateBoard({ viewport: next })
      }
    },
    [mutateBoard, readOnly]
  )

  const handleUndo = useCallback(() => {
    if (readOnly) {
      return
    }
    const prev = history.undo(whiteboard.items)
    if (prev) {
      mutateBoard({ items: prev })
    }
  }, [history, mutateBoard, readOnly, whiteboard.items])

  const handleRedo = useCallback(() => {
    if (readOnly) {
      return
    }
    const next = history.redo(whiteboard.items)
    if (next) {
      mutateBoard({ items: next })
    }
  }, [history, mutateBoard, readOnly, whiteboard.items])

  const selectedItem = useMemo(
    () => whiteboard.items.find((item) => item.id === selectedItemId) ?? null,
    [selectedItemId, whiteboard.items]
  )

  const actions = useWhiteboardActions({
    whiteboard,
    isDark,
    zoom,
    pan,
    selectedItem,
    selectedItemId,
    onSelectItem: setSelectedItemId,
    onSelectTool: setActiveTool,
    onCommitItems: commitItems,
    onMutateBoard: mutateBoard,
    onCreateTask: canCreateTask && !readOnly ? onCreateTask : undefined
  })

  const interactions = useWhiteboardInteractions({
    canvasRef,
    items: whiteboard.items,
    zoom,
    pan,
    activeTool: readOnly && (activeTool === 'draw' || activeTool === 'arrow' || activeTool === 'shape') ? 'select' : activeTool,
    activeShapeKind,
    selectedItemId,
    readOnly,
    onSelectItem: setSelectedItemId,
    onSelectTool: (tool) => {
      if (readOnly && (tool === 'draw' || tool === 'arrow' || tool === 'shape')) {
        return
      }
      setActiveTool(tool)
    },
    onPanChange: (nextPan, commit) => {
      setPan(nextPan)
      if (commit && !readOnly) {
        mutateBoard({ viewport: { ...nextPan, zoom } })
      }
    },
    onZoomAt: (nextZoom, nextPan) => {
      commitViewport({ x: nextPan?.x ?? pan.x, y: nextPan?.y ?? pan.y, zoom: nextZoom })
    },
    onCommitItems: commitItems,
    onCursorMove,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onDuplicateSelected: actions.duplicateSelected,
    onDeleteSelected: () => {
      if (!readOnly && selectedItemId) {
        actions.deleteItem(selectedItemId)
      }
    }
  })

  const cursorClass =
    interactions.isPanning || activeTool === 'pan' || interactions.isSpaceHeld
      ? interactions.isPanning
        ? 'cursor-grabbing'
        : 'cursor-grab'
      : activeTool === 'draw' || activeTool === 'arrow' || activeTool === 'shape'
        ? 'cursor-crosshair'
        : 'cursor-default'

  const handleDeleteSelected = () => {
    if (selectedItemId) {
      actions.deleteItem(selectedItemId)
    }
  }

  return (
    <div
      ref={canvasRef}
      onMouseMove={interactions.onCanvasMouseMove}
      onMouseUp={interactions.onCanvasMouseUp}
      onMouseLeave={interactions.onCanvasMouseUp}
      onWheel={interactions.onCanvasWheel}
      className="relative flex flex-1 w-full h-full min-h-0 overflow-hidden bg-background/95 select-none"
    >
      <TeamWhiteboardToolbar
        activeTool={activeTool}
        activeShapeKind={activeShapeKind}
        zoom={zoom}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        readOnly={readOnly}
        onSelectTool={(tool, shapeKind) => {
          if (readOnly && (tool === 'draw' || tool === 'arrow' || tool === 'shape')) {
            return
          }
          setActiveTool(tool)
          if (shapeKind) {
            setActiveShapeKind(shapeKind)
          }
        }}
        onAddSticky={actions.addSticky}
        onAddSpec={actions.addSpec}
        onAddMermaid={actions.addMermaid}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoom={(delta) =>
          commitViewport({
            ...pan,
            zoom: Math.min(Math.max(Math.round((zoom + delta) * 100) / 100, 0.25), 2.5)
          })
        }
        onFitView={() => {
          const rect = canvasRef.current?.getBoundingClientRect()
          commitViewport(
            computeFitViewport(whiteboard.items, rect?.width ?? 1000, rect?.height ?? 650)
          )
        }}
        onExportSvg={actions.exportSvg}
        onCopyMarkdown={() => {
          void actions.copyMarkdown()
        }}
      />

      <div
        data-testid="whiteboard-canvas"
        onMouseDown={interactions.onCanvasMouseDown}
        className={`w-full h-full relative overflow-hidden ${cursorClass}`}
        style={{
          backgroundImage: DOT_GRID_BG,
          backgroundSize: `${Math.max(12, 24 * zoom)}px ${Math.max(12, 24 * zoom)}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`
        }}
      >
        <div
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <TeamWhiteboardSvgLayer
            items={whiteboard.items}
            selectedItemId={selectedItemId}
            previewOverride={interactions.previewOverride}
            drawingPreview={interactions.drawingPreview}
            onSelectAndDragItem={interactions.onItemMouseDown}
          />
          {remoteCursors.map((cursor) => (
            <TeamWhiteboardCursor key={cursor.userId} cursor={cursor} />
          ))}
          {whiteboard.items.filter(isBoxItem).map((item) => {
            const bounds = getItemBounds(item, interactions.previewOverride)
            return (
              <TeamWhiteboardCardItem
                key={item.id}
                item={item}
                posX={bounds.x}
                posY={bounds.y}
                width={bounds.width}
                height={bounds.height}
                isDark={isDark}
                isSelected={selectedItemId === item.id}
                isMermaidEdit={Boolean(mermaidEditMode[item.id])}
                readOnly={readOnly}
                onToggleMermaidEdit={() =>
                  setMermaidEditMode((p) => ({ ...p, [item.id]: !p[item.id] }))
                }
                onMouseDown={(e) => interactions.onItemMouseDown(e, item)}
                onResizeMouseDown={(e) => interactions.onResizeMouseDown(e, item)}
                onUpdate={(updates) => actions.updateItem(item.id, updates)}
                onDelete={() => actions.deleteItem(item.id)}
                onCycleColor={() => actions.cycleColor(item)}
                onCreateTask={
                  canCreateTask && !readOnly
                    ? () => {
                        void actions.createTaskForItem(item)
                      }
                    : undefined
                }
              />
            )
          })}
        </div>
      </div>

      {!readOnly && selectedItem && (
        <TeamWhiteboardPropertiesBar
          item={selectedItem}
          onUpdate={(updates) => actions.updateItem(selectedItem.id, updates, true)}
          onDuplicate={actions.duplicateSelected}
          onBringToFront={() =>
            actions.updateItem(
              selectedItem.id,
              { zIndex: getMaxZIndex(whiteboard.items) + 1 },
              true
            )
          }
          onDelete={handleDeleteSelected}
          onCreateTask={
            canCreateTask
              ? () => {
                  void actions.createTaskForItem(selectedItem)
                }
              : undefined
          }
        />
      )}

      <div className="absolute bottom-3 left-4 z-20 flex items-center gap-3 px-2.5 py-1 rounded-lg bg-card/85 backdrop-blur-xs border border-border text-3xs font-mono text-muted-foreground">
        <span>X: {interactions.cursorCoords.x}</span>
        <span>Y: {interactions.cursorCoords.y}</span>
        <span>{whiteboard.items.length} elem.</span>
        <span>{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  )
}
