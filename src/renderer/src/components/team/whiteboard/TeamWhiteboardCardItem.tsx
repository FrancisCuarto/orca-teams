import React from 'react'
import { Code, Eye, KanbanSquare, Move, Palette, Trash2 } from 'lucide-react'
import MermaidBlock from '@/components/editor/MermaidBlock'
import { Button } from '@/components/ui/button'
import type { TeamWhiteboardItem } from '../../../../../shared/teamwork/team-kanban-types'
import { FONT_SIZE_CLASSES, resolveItemSwatch } from './whiteboard-types'
import { TeamWhiteboardShapeCard } from './TeamWhiteboardShapeCard'

type Props = {
  item: TeamWhiteboardItem
  posX: number
  posY: number
  width: number
  height: number
  isDark: boolean
  isSelected: boolean
  isMermaidEdit: boolean
  readOnly?: boolean
  onToggleMermaidEdit: () => void
  onMouseDown: (e: React.MouseEvent) => void
  onResizeMouseDown: (e: React.MouseEvent) => void
  onUpdate: (updates: Partial<TeamWhiteboardItem>) => void
  onDelete: () => void
  onCycleColor: () => void
  onCreateTask?: () => void
}

export function TeamWhiteboardCardItem({
  item,
  posX,
  posY,
  width,
  height,
  isDark,
  isSelected,
  isMermaidEdit,
  readOnly = false,
  onToggleMermaidEdit,
  onMouseDown,
  onResizeMouseDown,
  onUpdate,
  onDelete,
  onCycleColor,
  onCreateTask
}: Props): React.JSX.Element {
  if (item.type === 'shape') {
    return (
      <TeamWhiteboardShapeCard
        item={item}
        posX={posX}
        posY={posY}
        width={width}
        height={height}
        isSelected={isSelected}
        readOnly={readOnly}
        onMouseDown={onMouseDown}
        onResizeMouseDown={onResizeMouseDown}
        onUpdate={onUpdate}
      />
    )
  }

  const isMermaid = item.type === 'mermaid'
  const swatch = resolveItemSwatch(item)
  const fontClass = FONT_SIZE_CLASSES[item.fontSize ?? 'sm']
  const selectionRing = isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''

  return (
    <div
      data-whiteboard-item="true"
      data-testid={`whiteboard-item-${item.id}`}
      onMouseDown={onMouseDown}
      style={{
        transform: `translate(${posX}px, ${posY}px)`,
        width: `${width}px`,
        minHeight: `${height}px`,
        zIndex: (item.zIndex ?? 0) + 10,
        ...(item.strokeColor && !isMermaid ? { borderColor: item.strokeColor } : {})
      }}
      className={`group absolute flex flex-col rounded-xl border backdrop-blur-md shadow-floating transition-shadow ${
        readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      } ${selectionRing} ${
        isMermaid ? 'bg-card/90 border-border' : `${swatch.cardBgClass} ${swatch.cardBorderClass}`
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Move className="size-3 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={item.title ?? ''}
            readOnly={readOnly}
            onChange={(e) => {
              if (!readOnly) {
                onUpdate({ title: e.target.value })
              }
            }}
            placeholder="Título..."
            className="bg-transparent text-xs font-semibold text-foreground focus:outline-hidden w-full"
          />
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {!readOnly && onCreateTask && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onCreateTask}
              title="Crear Tarea"
              aria-label="Crear Tarea"
            >
              <KanbanSquare className="size-3.5 text-git-graph-lane-2" />
            </Button>
          )}
          {!readOnly && !isMermaid && (
            <Button size="icon-xs" variant="ghost" onClick={onCycleColor} title="Cambiar color">
              <Palette className="size-3.5" />
            </Button>
          )}
          {isMermaid && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onToggleMermaidEdit}
              title={isMermaidEdit ? 'Ver Renderizado' : 'Editar Código Mermaid'}
            >
              {isMermaidEdit ? <Eye className="size-3.5" /> : <Code className="size-3.5" />}
            </Button>
          )}
          {!readOnly ? (
            <Button size="icon-xs" variant="ghost" onClick={onDelete} title="Eliminar Elemento">
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col flex-1 p-3 select-text">
        {isMermaid ? (
          isMermaidEdit ? (
            <textarea
              value={item.content}
              readOnly={readOnly}
              onChange={(e) => {
                if (!readOnly) {
                  onUpdate({ content: e.target.value })
                }
              }}
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
            readOnly={readOnly}
            onChange={(e) => {
              if (!readOnly) {
                onUpdate({ content: e.target.value })
              }
            }}
            rows={5}
            className={`w-full flex-1 bg-transparent leading-relaxed text-foreground resize-none focus:outline-hidden placeholder:text-muted-foreground/60 ${fontClass}`}
            placeholder="Escribe tu nota aquí..."
          />
        )}
      </div>

      {!readOnly ? (
        <div
          data-testid={`resize-handle-${item.id}`}
          onMouseDown={onResizeMouseDown}
          title="Redimensionar"
          className={`absolute -bottom-1.5 -right-1.5 z-20 size-3.5 rounded-xs bg-primary border border-background cursor-nwse-resize shadow-xs transition-opacity ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        />
      ) : null}
    </div>
  )
}
