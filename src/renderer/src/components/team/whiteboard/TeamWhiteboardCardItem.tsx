import React from 'react'
import { Code, Eye, Move, Palette, Trash2 } from 'lucide-react'
import MermaidBlock from '@/components/editor/MermaidBlock'
import { Button } from '@/components/ui/button'
import type {
  TeamWhiteboardItem,
  WhiteboardColor
} from '../../../../../shared/teamwork/team-kanban-types'

const COLOR_CLASSES: Record<WhiteboardColor, { bg: string; border: string }> = {
  yellow: { bg: 'bg-amber-500/15', border: 'border-amber-500/40' },
  blue: { bg: 'bg-blue-500/15', border: 'border-blue-500/40' },
  green: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/40' },
  pink: { bg: 'bg-pink-500/15', border: 'border-pink-500/40' },
  purple: { bg: 'bg-purple-500/15', border: 'border-purple-500/40' },
  orange: { bg: 'bg-orange-500/15', border: 'border-orange-500/40' }
}

type Props = {
  item: TeamWhiteboardItem
  posX: number
  posY: number
  isDark: boolean
  isMermaidEdit: boolean
  onToggleMermaidEdit: () => void
  onMouseDown: (e: React.MouseEvent) => void
  onUpdate: (updates: Partial<TeamWhiteboardItem>) => void
  onDelete: () => void
  onCycleColor: () => void
}

export function TeamWhiteboardCardItem({
  item,
  posX,
  posY,
  isDark,
  isMermaidEdit,
  onToggleMermaidEdit,
  onMouseDown,
  onUpdate,
  onDelete,
  onCycleColor
}: Props): React.JSX.Element {
  const isMermaid = item.type === 'mermaid'
  const colorClass = COLOR_CLASSES[item.color ?? 'yellow'] ?? COLOR_CLASSES.yellow

  return (
    <div
      data-whiteboard-item="true"
      onMouseDown={onMouseDown}
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
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Título..."
            className="bg-transparent text-xs font-semibold text-foreground focus:outline-hidden w-full"
          />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isMermaid && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onCycleColor}
              title="Cambiar color de la tarjeta"
            >
              <Palette />
            </Button>
          )}

          {isMermaid && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onToggleMermaidEdit}
              title={isMermaidEdit ? 'Ver Renderizado' : 'Editar Código Mermaid'}
            >
              {isMermaidEdit ? <Eye /> : <Code />}
            </Button>
          )}

          <Button size="icon-xs" variant="ghost" onClick={onDelete} title="Eliminar Elemento">
            <Trash2 />
          </Button>
        </div>
      </div>

      {/* Item Card Content */}
      <div className="flex flex-col flex-1 p-3 select-text">
        {isMermaid ? (
          isMermaidEdit ? (
            <textarea
              value={item.content}
              onChange={(e) => onUpdate({ content: e.target.value })}
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
            onChange={(e) => onUpdate({ content: e.target.value })}
            rows={5}
            className="w-full flex-1 bg-transparent text-xs leading-relaxed text-foreground resize-none focus:outline-hidden placeholder:text-muted-foreground/60"
            placeholder="Escribe tu nota aquí..."
          />
        )}
      </div>
    </div>
  )
}
