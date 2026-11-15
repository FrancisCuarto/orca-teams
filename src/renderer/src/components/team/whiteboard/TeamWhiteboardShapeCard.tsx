import React from 'react'
import type { TeamWhiteboardItem } from '../../../../../shared/teamwork/team-kanban-types'
import { FONT_SIZE_CLASSES, resolveItemSwatch } from './whiteboard-types'

type Props = {
  item: TeamWhiteboardItem
  posX: number
  posY: number
  width: number
  height: number
  isSelected: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onResizeMouseDown: (e: React.MouseEvent) => void
  onUpdate: (updates: Partial<TeamWhiteboardItem>) => void
}

export function TeamWhiteboardShapeCard({
  item,
  posX,
  posY,
  width,
  height,
  isSelected,
  onMouseDown,
  onResizeMouseDown,
  onUpdate
}: Props): React.JSX.Element {
  const swatch = resolveItemSwatch(item)
  const stroke = item.strokeColor ?? swatch.strokeHex
  const strokeWidth = item.strokeWidth ?? 2
  const fillStyle = item.fillStyle ?? 'tinted'
  const fill =
    fillStyle === 'solid'
      ? swatch.solidHex
      : fillStyle === 'outline'
        ? 'transparent'
        : swatch.tintedHex
  const fontClass = FONT_SIZE_CLASSES[item.fontSize ?? 'sm']
  const textColorClass =
    fillStyle === 'solid' ? 'text-white placeholder:text-white/60' : 'text-foreground'
  const kind = item.shapeKind ?? 'rect'
  const selectionRing = isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''

  return (
    <div
      data-whiteboard-item="true"
      data-testid={`whiteboard-item-${item.id}`}
      onMouseDown={onMouseDown}
      style={{
        transform: `translate(${posX}px, ${posY}px)`,
        width: `${width}px`,
        height: `${height}px`,
        zIndex: (item.zIndex ?? 0) + 10
      }}
      className={`group absolute rounded-xl cursor-grab active:cursor-grabbing ${selectionRing}`}
    >
      <div className="relative w-full h-full flex items-center justify-center p-4">
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
        >
          {kind === 'ellipse' ? (
            <ellipse
              cx={width / 2}
              cy={height / 2}
              rx={Math.max(4, width / 2 - strokeWidth)}
              ry={Math.max(4, height / 2 - strokeWidth)}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          ) : kind === 'diamond' ? (
            <polygon
              points={`${width / 2},${strokeWidth} ${width - strokeWidth},${height / 2} ${width / 2},${
                height - strokeWidth
              } ${strokeWidth},${height / 2}`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          ) : (
            <rect
              x={strokeWidth / 2}
              y={strokeWidth / 2}
              width={Math.max(8, width - strokeWidth)}
              height={Math.max(8, height - strokeWidth)}
              rx={12}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          )}
        </svg>

        <textarea
          value={item.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder="Etiqueta..."
          rows={2}
          className={`relative z-10 w-4/5 bg-transparent text-center font-medium resize-none focus:outline-hidden select-text ${fontClass} ${textColorClass}`}
        />

        <div
          data-testid={`resize-handle-${item.id}`}
          onMouseDown={onResizeMouseDown}
          title="Redimensionar"
          className={`absolute -bottom-1.5 -right-1.5 z-20 size-3.5 rounded-xs bg-primary border border-background cursor-nwse-resize shadow-xs transition-opacity ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        />
      </div>
    </div>
  )
}
