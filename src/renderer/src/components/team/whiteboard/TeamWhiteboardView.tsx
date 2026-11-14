import React, { useState, useRef, useCallback } from 'react'
import {
  ClipboardCopy,
  Code,
  Eye,
  FileText,
  Minus,
  Move,
  Palette,
  Plus,
  RotateCcw,
  StickyNote,
  Trash2,
  Workflow
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  TeamWhiteboard,
  TeamWhiteboardItem,
  WhiteboardColor
} from '../../../../../shared/teamwork/team-kanban-types'
import MermaidBlock from '@/components/editor/MermaidBlock'
import { Button } from '@/components/ui/button'
import { useDocumentDarkTheme } from '@/hooks/use-document-dark-theme'

type Props = {
  whiteboard: TeamWhiteboard
  onChange: (updated: TeamWhiteboard) => void
}

type PointerStart = {
  mouseX: number
  mouseY: number
  initialX: number
  initialY: number
}

const COLOR_CLASSES: Record<WhiteboardColor, { bg: string; border: string }> = {
  yellow: { bg: 'bg-amber-500/15', border: 'border-amber-500/40' },
  blue: { bg: 'bg-blue-500/15', border: 'border-blue-500/40' },
  green: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40' },
  pink: { bg: 'bg-pink-500/15', border: 'border-pink-500/40' },
  purple: { bg: 'bg-purple-500/15', border: 'border-purple-500/40' },
  orange: { bg: 'bg-orange-500/15', border: 'border-orange-500/40' }
}

const COLOR_CYCLE: WhiteboardColor[] = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange']

const SWATCH_COLORS: { color: WhiteboardColor; className: string }[] = [
  { color: 'green', className: 'bg-emerald-500 border-emerald-400' },
  { color: 'blue', className: 'bg-blue-500 border-blue-400' },
  { color: 'pink', className: 'bg-pink-500 border-pink-400' },
  { color: 'purple', className: 'bg-purple-500 border-purple-400' }
]

const DEFAULT_MERMAID =
  'graph TD\n  A[Cliente / Vista] --> B[API / Store]\n  B --> C[Lógica de Negocio]\n  C --> D[Base de Datos / Git]'

// Presets that drop a prebuilt architecture diagram onto the canvas.
const ARCHITECTURE_TEMPLATES: { id: string; label: string; mermaid: string }[] = [
  {
    id: 'multi-agent-flow',
    label: 'Multi-Agente',
    mermaid:
      'graph TD\n  U[Usuario] --> OC[OpenCode: Agente Codificador]\n  U --> AG[Antigravity: Agente Arquitecto]\n  AG -->|Especificación| OC\n  OC -->|Pull Request| REV[Revisión Humana]\n  REV -->|Aprobado| MAIN[Rama main]'
  },
  {
    id: 'c4-layers',
    label: 'C4 Capas',
    mermaid:
      'graph TB\n  U[Usuario] --> APP[Orca]\n  subgraph Contenedores\n    APP --> R[Renderer Electron]\n    APP --> M[Proceso Main]\n  end\n  subgraph Componentes\n    M --> K[Módulo Kanban] & N[Módulo Notas] & P[Módulo Pizarra]\n  end'
  },
  {
    id: 'auth-sequence',
    label: 'Secuencia Auth',
    mermaid:
      'sequenceDiagram\n  actor U as Usuario\n  participant R as Renderer\n  participant M as Main\n  participant S as Sistema Operativo\n  U->>R: Introduce credenciales\n  R->>M: Solicita inicio de sesión\n  M->>S: Guarda el token de forma segura\n  S-->>M: Confirmación\n  M-->>R: Sesión activa\n  R-->>U: Acceso concedido'
  }
]

export function TeamWhiteboardView({ whiteboard, onChange }: Props): React.JSX.Element {
  const isDark = useDocumentDarkTheme()
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
    [zoom]
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
      className="relative flex flex-1 w-full h-full min-h-0 overflow-hidden bg-background/95 select-none"
      onMouseMove={onMouseMove}
      onMouseUp={stopInteraction}
      onMouseLeave={stopInteraction}
    >
      {/* Top Floating Whiteboard Toolbar */}
      <div className="absolute top-4 left-6 z-20 flex flex-wrap items-center gap-2 max-w-[calc(100%-16rem)] bg-card/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-border shadow-floating">
        <span className="text-xs font-semibold text-foreground mr-1">Pizarra:</span>

        <Button size="xs" variant="outline" onClick={() => handleAddSticky('yellow')}>
          <StickyNote className="text-git-graph-lane-1" />+ Nota
        </Button>

        {SWATCH_COLORS.map(({ color, className }) => (
          <button
            key={color}
            type="button"
            onClick={() => handleAddSticky(color)}
            className={`size-4 rounded-full border transition-transform hover:scale-125 ${className}`}
            title={`Añadir nota ${color}`}
          />
        ))}

        <Button size="xs" variant="outline" onClick={handleAddSpec}>
          <FileText className="text-git-graph-lane-2" />+ Spec
        </Button>

        <Button size="xs" variant="outline" onClick={() => handleAddMermaid()}>
          <Workflow />+ Diagrama Mermaid
        </Button>

        <span className="text-2xs font-medium text-muted-foreground">Plantillas:</span>
        {ARCHITECTURE_TEMPLATES.map((template) => (
          <Button
            key={template.id}
            size="xs"
            variant="ghost"
            onClick={() => handleAddMermaid(template)}
          >
            {template.label}
          </Button>
        ))}

        <div className="flex items-center gap-1">
          <Button size="icon-xs" variant="ghost" onClick={() => handleZoom(-0.15)} title="Alejar">
            <Minus />
          </Button>
          <span className="text-2xs font-mono text-muted-foreground w-9 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button size="icon-xs" variant="ghost" onClick={() => handleZoom(0.15)} title="Acercar">
            <Plus />
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={handleResetView} title="Reiniciar Vista">
            <RotateCcw />
          </Button>
        </div>
      </div>

      {/* Agent Export */}
      <div className="absolute top-4 right-6 z-20 bg-card/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-border shadow-floating">
        <Button size="xs" variant="outline" onClick={handleCopyForAgent} title="Copiar pizarra">
          <ClipboardCopy className="text-git-graph-lane-1" />
          Copiar para Agente
        </Button>
      </div>

      {/* Infinite Canvas Container */}
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
          {whiteboard.items.map((item) => {
            const isMermaid = item.type === 'mermaid'
            const showMermaidCode = Boolean(mermaidEditMode[item.id])
            const colorClass = COLOR_CLASSES[item.color ?? 'yellow'] ?? COLOR_CLASSES.yellow
            const posX = dragState?.itemId === item.id ? dragState.x : item.x
            const posY = dragState?.itemId === item.id ? dragState.y : item.y

            return (
              <div
                key={item.id}
                data-whiteboard-item="true"
                onMouseDown={(e) => startItemDrag(e, item)}
                style={{
                  transform: `translate(${posX}px, ${posY}px)`,
                  width: `${item.width}px`,
                  minHeight: `${item.height}px`
                }}
                className={`absolute z-10 flex flex-col rounded-xl border backdrop-blur-md shadow-floating transition-shadow cursor-grab active:cursor-grabbing ${
                  isMermaid ? 'bg-card/90 border-border' : `${colorClass.bg} ${colorClass.border}`
                }`}
              >
                {/* Item Card Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Move className="size-3 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={item.title ?? ''}
                      onChange={(e) => handleUpdateItem(item.id, { title: e.target.value })}
                      placeholder="Título..."
                      className="bg-transparent text-xs font-semibold text-foreground focus:outline-hidden w-full"
                    />
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!isMermaid && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => cycleItemColor(item)}
                        title="Cambiar color de la tarjeta"
                      >
                        <Palette />
                      </Button>
                    )}

                    {isMermaid && (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() =>
                          setMermaidEditMode((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                        }
                        title={showMermaidCode ? 'Ver Renderizado' : 'Editar Código Mermaid'}
                      >
                        {showMermaidCode ? <Eye /> : <Code />}
                      </Button>
                    )}

                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleDeleteItem(item.id)}
                      title="Eliminar Elemento"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>

                {/* Item Card Content */}
                <div className="flex flex-col flex-1 p-3 select-text">
                  {isMermaid ? (
                    showMermaidCode ? (
                      <textarea
                        value={item.content}
                        onChange={(e) => handleUpdateItem(item.id, { content: e.target.value })}
                        rows={8}
                        className="w-full h-full p-2 text-xs font-mono bg-muted/60 text-foreground rounded border border-border resize-y focus:outline-hidden"
                        placeholder="graph TD..."
                      />
                    ) : (
                      <div className="w-full overflow-auto scrollbar-sleek max-h-[400px] flex items-center justify-center p-2 rounded bg-muted/20">
                        <MermaidBlock content={item.content} isDark={isDark} />
                      </div>
                    )
                  ) : (
                    <textarea
                      value={item.content}
                      onChange={(e) => handleUpdateItem(item.id, { content: e.target.value })}
                      rows={5}
                      className="w-full flex-1 bg-transparent text-xs leading-relaxed text-foreground resize-none focus:outline-hidden placeholder:text-muted-foreground/60"
                      placeholder="Escribe tu nota aquí..."
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
