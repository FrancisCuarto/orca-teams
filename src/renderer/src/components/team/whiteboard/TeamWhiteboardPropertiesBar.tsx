import React from 'react'
import { BringToFront, CopyPlus, KanbanSquare, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  TeamWhiteboardItem,
  WhiteboardFillStyle,
  WhiteboardFontSize,
  WhiteboardShapeKind
} from '../../../../../shared/teamwork/team-kanban-types'
import { resolveItemSwatch, WHITEBOARD_SWATCHES } from './whiteboard-types'

const STROKE_WIDTHS = [2, 4, 6] as const
const FILL_STYLES: { id: WhiteboardFillStyle; label: string }[] = [
  { id: 'tinted', label: 'Suave' },
  { id: 'solid', label: 'Sólido' },
  { id: 'outline', label: 'Borde' }
]
const FONT_SIZES: { id: WhiteboardFontSize; label: string }[] = [
  { id: 'sm', label: 'S' },
  { id: 'md', label: 'M' },
  { id: 'lg', label: 'L' }
]
const SHAPE_KINDS: { id: WhiteboardShapeKind; label: string }[] = [
  { id: 'rect', label: 'Rect' },
  { id: 'ellipse', label: 'Elipse' },
  { id: 'diamond', label: 'Rombo' }
]

type Props = {
  item: TeamWhiteboardItem
  onUpdate: (updates: Partial<TeamWhiteboardItem>) => void
  onDuplicate: () => void
  onBringToFront: () => void
  onDelete: () => void
  onCreateTask?: () => void
}

export function TeamWhiteboardPropertiesBar({
  item,
  onUpdate,
  onDuplicate,
  onBringToFront,
  onDelete,
  onCreateTask
}: Props): React.JSX.Element {
  const activeSwatch = resolveItemSwatch(item)
  const activeStrokeWidth = item.strokeWidth ?? (item.type === 'draw' ? 3 : 2)
  const activeFill = item.fillStyle ?? 'tinted'
  const activeFontSize = item.fontSize ?? 'sm'
  const supportsText =
    item.type === 'sticky' || item.type === 'text' || item.type === 'spec' || item.type === 'shape'
  const supportsTask = item.type !== 'draw' && item.type !== 'arrow'

  return (
    <div
      data-testid="whiteboard-properties-bar"
      onMouseDown={(e) => e.stopPropagation()}
      className="absolute bottom-12 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-2 bg-card/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-border shadow-floating"
    >
      {/* 8 Color Swatches */}
      <div className="flex items-center gap-1 pr-2 border-r border-border">
        {WHITEBOARD_SWATCHES.map((swatch) => {
          const isSelected = activeSwatch.id === swatch.id
          return (
            <button
              key={swatch.id}
              type="button"
              onClick={() =>
                onUpdate({
                  strokeColor: swatch.strokeHex,
                  ...(swatch.color ? { color: swatch.color } : {})
                })
              }
              title={`Color ${swatch.label}`}
              aria-label={`Color ${swatch.label}`}
              className={`size-4 rounded-full transition-transform hover:scale-110 ${swatch.dotClass} ${
                isSelected
                  ? 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-110'
                  : ''
              }`}
            />
          )
        })}
      </div>

      {/* Stroke Width */}
      <div className="flex items-center gap-0.5 pr-2 border-r border-border">
        {STROKE_WIDTHS.map((width) => (
          <Button
            key={width}
            size="xs"
            variant={activeStrokeWidth === width ? 'secondary' : 'ghost'}
            onClick={() => onUpdate({ strokeWidth: width })}
            title={`Grosor ${width}px`}
          >
            {width}px
          </Button>
        ))}
      </div>

      {/* Shape Kind & Fill Style */}
      {item.type === 'shape' && (
        <>
          <div className="flex items-center gap-0.5 pr-2 border-r border-border">
            {SHAPE_KINDS.map((kind) => (
              <Button
                key={kind.id}
                size="xs"
                variant={(item.shapeKind ?? 'rect') === kind.id ? 'secondary' : 'ghost'}
                onClick={() => onUpdate({ shapeKind: kind.id })}
              >
                {kind.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 pr-2 border-r border-border">
            {FILL_STYLES.map((style) => (
              <Button
                key={style.id}
                size="xs"
                variant={activeFill === style.id ? 'secondary' : 'ghost'}
                onClick={() => onUpdate({ fillStyle: style.id })}
              >
                {style.label}
              </Button>
            ))}
          </div>
        </>
      )}

      {/* Font Size */}
      {supportsText && (
        <div className="flex items-center gap-0.5 pr-2 border-r border-border">
          {FONT_SIZES.map((fs) => (
            <Button
              key={fs.id}
              size="xs"
              variant={activeFontSize === fs.id ? 'secondary' : 'ghost'}
              onClick={() => onUpdate({ fontSize: fs.id })}
              title={`Tamaño de texto ${fs.label}`}
            >
              {fs.label}
            </Button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button size="icon-xs" variant="ghost" onClick={onDuplicate} title="Duplicar (Ctrl+D)">
          <CopyPlus className="size-3.5" />
        </Button>
        <Button size="icon-xs" variant="ghost" onClick={onBringToFront} title="Traer al frente">
          <BringToFront className="size-3.5" />
        </Button>
        {supportsTask && onCreateTask && (
          <Button
            size="xs"
            variant="outline"
            onClick={onCreateTask}
            title="Crear tarea desde elemento"
          >
            <KanbanSquare className="size-3.5 text-git-graph-lane-2 mr-1" />
            Crear Tarea
          </Button>
        )}
        <Button size="icon-xs" variant="ghost" onClick={onDelete} title="Eliminar (Supr)">
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  )
}
