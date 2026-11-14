import React, { useState, useRef, useCallback } from 'react'
import { ClipboardCopy } from 'lucide-react'
import { toast } from 'sonner'
import type {
  TeamWhiteboard,
  TeamWhiteboardItem,
  WhiteboardColor
} from '../../../../../shared/teamwork/team-kanban-types'
import type { WhiteboardCursorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'
import { TeamWhiteboardToolbar } from './TeamWhiteboardToolbar'
import { TeamWhiteboardCardItem } from './TeamWhiteboardCardItem'
import { TeamWhiteboardCursor } from './TeamWhiteboardCursor'

type Props = {
  whiteboard: TeamWhiteboard
  remoteCursors?: WhiteboardCursorPresence[]
  onCursorMove?: (x: number, y: number) => void
  onChange: (updated: TeamWhiteboard) => void
}

type PointerStart = {
  mouseX: number
  mouseY: number
  initialX: number
  initialY: number
}

const EMPTY_CURSORS: WhiteboardCursorPresence[] = []
const COLOR_CYCLE: WhiteboardColor[] = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange']
const DEFAULT_MERMAID =
  'graph TD\n  A[Cliente / Vista] --> B[API / Store]\n  B --> C[Lógica de Negocio]\n  C --> D[Base de Datos / Git]'

export function TeamWhiteboardView({
  whiteboard,
  remoteCursors = EMPTY_CURSORS,
  onCursorMove,
  onChange
}: Props): React.JSX.Element {
  const isDark = useDocumentDarkTheme()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(whiteboard.viewport?.zoom ?? 1)
  const [pan, setPan] = useState({ x: whiteboard.viewport?.x ?? 0, y: whiteboard.viewport?.y ?? 0 })
  const [mermaidEditMode, setMermaidEditMode] = useState<Record<string, boolean>>({})
  const [dragState, setDragState] = useState<{ itemId: string; x: number; y: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  const itemDragStartRef = useRef<(PointerStart & { itemId: string }) | null>(null)
  const panStartRef = useRef<PointerStart | null>(null)
  const panMovedRef = useRef(false)

  const mutateBoard = useCallback(
    (updates: Partial<TeamWhiteboard>) => {
      onChange({ ...whiteboard, ...updates, updatedAt: Date.now() })
    },
    [onChange, whiteboard]
  )

  const commitViewport = (next: { x: number; y: number; zoom: number }) => {
    setZoom(next.zoom)
    setPan({ x: next.x, y: next.y })
    mutateBoard({ viewport: next })
  }

  const handleZoom = (delta: number) => {
    const next = Math.min(Math.max(zoom + delta, 0.5), 2)
    if (next !== zoom) {
      commitViewport({ ...pan, zoom: next })
    }
  }

  const handleResetView = () => commitViewport({ x: 0, y: 0, zoom: 1 })

  const addItem = (item: Omit<TeamWhiteboardItem, 'x' | 'y'>) => {
    const offset = (whiteboard.items.length % 5) * 24
    const x = Math.round((100 - pan.x) / zoom) + offset
    const y = Math.round((100 - pan.y) / zoom) + offset
    mutateBoard({ items: [...whiteboard.items, { ...item, x, y }] })
  }

  const handleAddSticky = (color: WhiteboardColor = 'yellow') =>
    addItem({
      id: `sticky-${Date.now()}`,
      type: 'sticky',
      title: 'Nueva Nota',
      content: 'Escribe tu idea o nota de diseño aquí...',
      color,
      width: 250,
      height: 180
    })

  const handleAddSpec = () =>
    addItem({
      id: `text-${Date.now()}`,
      type: 'text',
      title: 'Especificación de Arquitectura',
      content:
        '## Objetivo\n¿Qué componente o flujo describe esta tarjeta?\n\n## Decisiones clave\n- Restricciones técnicas\n- Dependencias\n\n## Pendientes\n- [ ] Definir interfaces\n- [ ] Validar con el equipo',
      color: 'blue',
      width: 330,
      height: 280
    })

  const handleAddMermaid = (template?: { label: string; mermaid: string }) =>
    addItem({
      id: `mermaid-${Date.now()}`,
      type: 'mermaid',
      title: template?.label ?? 'Diagrama de Arquitectura',
      content: template?.mermaid ?? DEFAULT_MERMAID,
      width: 480,
      height: 340
    })

  const handleDeleteItem = (id: string) => {
    mutateBoard({ items: whiteboard.items.filter((item) => item.id !== id) })
  }

  const handleUpdateItem = (id: string, updates: Partial<TeamWhiteboardItem>) => {
    mutateBoard({
      items: whiteboard.items.map((item) => (item.id === id ? { ...item, ...updates } : item))
    })
  }

  const cycleItemColor = (item: TeamWhiteboardItem) => {
    const next = COLOR_CYCLE[(COLOR_CYCLE.indexOf(item.color ?? 'yellow') + 1) % COLOR_CYCLE.length]
    handleUpdateItem(item.id, { color: next })
  }

  const handleCopyForAgent = () => {
    const sections = [...whiteboard.items]
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((item) =>
        item.type === 'mermaid'
          ? `## ${item.title ?? 'Diagrama'}\n\n\`\`\`mermaid\n${item.content}\n\`\`\``
          : `## ${item.title ?? item.type}\n\n${item.content}`
      )
    void navigator.clipboard.writeText(
      `[PIZARRA DE EQUIPO: ${whiteboard.title}]\n\n${sections.join('\n\n')}`
    )
    toast.success('Pizarra copiada como Markdown estructurado para el Agente', {
      description: 'Pégala en tu chat de agente para guiar la implementación de la arquitectura.',
      icon: <ClipboardCopy className="size-4 text-git-graph-lane-1" />
    })
  }

  const startItemDrag = (e: React.MouseEvent, it: TeamWhiteboardItem) => {
    if (e.target instanceof Element && e.target.closest('button, input, textarea')) {
      return
    }
    e.stopPropagation()
    const { clientX: mouseX, clientY: mouseY } = e
    itemDragStartRef.current = { itemId: it.id, mouseX, mouseY, initialX: it.x, initialY: it.y }
    setDragState({ itemId: it.id, x: it.x, y: it.y })
  }

  const startCanvasPan = (e: React.MouseEvent) => {
    if (e.target instanceof Element && e.target.closest('[data-whiteboard-item="true"]')) {
      return
    }
    setIsPanning(true)
    const { clientX: mouseX, clientY: mouseY } = e
    panStartRef.current = { mouseX, mouseY, initialX: pan.x, initialY: pan.y }
  }

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (onCursorMove && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect()
        const canvasX = Math.round((e.clientX - rect.left - pan.x) / zoom)
        const canvasY = Math.round((e.clientY - rect.top - pan.y) / zoom)
        onCursorMove(canvasX, canvasY)
      }

      const drag = itemDragStartRef.current
      if (drag) {
        const dx = (e.clientX - drag.mouseX) / zoom
        const dy = (e.clientY - drag.mouseY) / zoom
        setDragState({
          itemId: drag.itemId,
          x: Math.round(drag.initialX + dx),
          y: Math.round(drag.initialY + dy)
        })
        return
      }

      const start = panStartRef.current
      if (start) {
        panMovedRef.current = true
        setPan({
          x: Math.round(start.initialX + (e.clientX - start.mouseX)),
          y: Math.round(start.initialY + (e.clientY - start.mouseY))
        })
      }
    },
    [zoom, pan, onCursorMove]
  )

  const stopInteraction = useCallback(() => {
    if (itemDragStartRef.current && dragState) {
      const { itemId, x, y } = dragState
      mutateBoard({
        items: whiteboard.items.map((it) => (it.id === itemId ? { ...it, x, y } : it))
      })
    } else if (panMovedRef.current) {
      mutateBoard({ viewport: { x: pan.x, y: pan.y, zoom } })
    }
    itemDragStartRef.current = null
    panStartRef.current = null
    panMovedRef.current = false
    setDragState(null)
    setIsPanning(false)
  }, [dragState, whiteboard, pan, zoom, mutateBoard])

  return (
    <div
      ref={canvasRef}
      className="relative flex flex-1 w-full h-full min-h-0 overflow-hidden bg-background/95 select-none"
      onMouseMove={onMouseMove}
      onMouseUp={stopInteraction}
      onMouseLeave={stopInteraction}
    >
      <TeamWhiteboardToolbar
        zoom={zoom}
        onAddSticky={handleAddSticky}
        onAddSpec={handleAddSpec}
        onAddMermaid={handleAddMermaid}
        onZoom={handleZoom}
        onResetView={handleResetView}
        onCopyForAgent={handleCopyForAgent}
      />

      <div
        onMouseDown={startCanvasPan}
        className={`w-full h-full relative overflow-hidden ${
          isPanning ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        style={{
          backgroundImage:
            'radial-gradient(circle, var(--color-border, rgba(255,255,255,0.08)) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          backgroundPosition: `${pan.x}px ${pan.y}px`
        }}
      >
        <div
          className="absolute inset-0 origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
          }}
        >
          {/* Remote Collaborators Cursors */}
          {remoteCursors.map((cursor) => (
            <TeamWhiteboardCursor key={cursor.userId} cursor={cursor} />
          ))}

          {/* Whiteboard Items */}
          {whiteboard.items.map((item) => {
            const posX = dragState?.itemId === item.id ? dragState.x : item.x
            const posY = dragState?.itemId === item.id ? dragState.y : item.y
            return (
              <TeamWhiteboardCardItem
                key={item.id}
                item={item}
                posX={posX}
                posY={posY}
                isDark={isDark}
                isMermaidEdit={Boolean(mermaidEditMode[item.id])}
                onToggleMermaidEdit={() =>
                  setMermaidEditMode((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                }
                onMouseDown={(e) => startItemDrag(e, item)}
                onUpdate={(updates) => handleUpdateItem(item.id, updates)}
                onDelete={() => handleDeleteItem(item.id)}
                onCycleColor={() => cycleItemColor(item)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
