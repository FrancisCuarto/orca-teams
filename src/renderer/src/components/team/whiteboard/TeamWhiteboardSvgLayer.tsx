import React from 'react'
import type { TeamWhiteboardItem } from '../../../../../shared/teamwork/team-kanban-types'
import { pointsToSmoothSvgPath, resolveArrowEndpoints } from './whiteboard-geometry'
import {
  getItemBounds,
  resolveItemSwatch,
  WHITEBOARD_SWATCHES,
  type WhiteboardPreviewOverride
} from './whiteboard-types'
import { TeamWhiteboardSvgPreview, type DrawingPreview } from './TeamWhiteboardSvgPreview'

export type { DrawingPreview }

type Props = {
  items: TeamWhiteboardItem[]
  selectedItemId: string | null
  previewOverride: WhiteboardPreviewOverride | null
  drawingPreview: DrawingPreview | null
  onSelectAndDragItem: (e: React.MouseEvent, item: TeamWhiteboardItem) => void
}

function markerIdForHex(hex: string): string {
  return `wb-arrowhead-${hex.replace(/[^a-zA-Z0-9]/g, '')}`
}

export function TeamWhiteboardSvgLayer({
  items,
  selectedItemId,
  previewOverride,
  drawingPreview,
  onSelectAndDragItem
}: Props): React.JSX.Element {
  const drawItems = items.filter((item) => item.type === 'draw')
  const arrowItems = items.filter((item) => item.type === 'arrow')

  const snapTargetBounds =
    drawingPreview?.kind === 'arrow' && drawingPreview.snapTargetId
      ? (() => {
          const target = items.find((i) => i.id === drawingPreview.snapTargetId)
          return target ? getItemBounds(target, previewOverride) : null
        })()
      : null

  return (
    <svg
      data-testid="whiteboard-svg-layer"
      className="absolute top-0 left-0 w-px h-px overflow-visible pointer-events-none z-20"
    >
      <defs>
        <marker
          id="wb-arrowhead-preview"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="var(--color-git-graph-ref)" />
        </marker>
        {WHITEBOARD_SWATCHES.map((swatch) => (
          <marker
            key={swatch.id}
            id={markerIdForHex(swatch.strokeHex)}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={swatch.strokeHex} />
          </marker>
        ))}
      </defs>

      {drawItems.map((item) => {
        const b = getItemBounds(item, previewOverride)
        const stroke = item.strokeColor ?? resolveItemSwatch(item).strokeHex
        const sw = item.strokeWidth ?? 3
        const d = pointsToSmoothSvgPath(item.points ?? [], b.x, b.y)
        const isSelected = selectedItemId === item.id

        return (
          <g key={item.id} data-whiteboard-item="true" data-testid={`whiteboard-item-${item.id}`}>
            {isSelected && (
              <rect
                x={b.x - 6}
                y={b.y - 6}
                width={b.width + 12}
                height={b.height + 12}
                rx={6}
                fill="none"
                stroke="var(--color-git-graph-ref)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
            )}
            <path
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(14, sw + 10)}
              strokeLinecap="round"
              className="pointer-events-auto cursor-move"
              onMouseDown={(e) => onSelectAndDragItem(e, item)}
            />
          </g>
        )
      })}

      {arrowItems.map((item) => {
        const { start, end } = resolveArrowEndpoints(item, items, previewOverride)
        const stroke = item.strokeColor ?? resolveItemSwatch(item).strokeHex
        const sw = item.strokeWidth ?? 2
        const isSelected = selectedItemId === item.id
        const midX = (start.x + end.x) / 2
        const midY = (start.y + end.y) / 2

        return (
          <g key={item.id} data-whiteboard-item="true" data-testid={`whiteboard-item-${item.id}`}>
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={stroke}
              strokeWidth={sw}
              markerEnd={`url(#${markerIdForHex(stroke)})`}
            />
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="transparent"
              strokeWidth={16}
              className="pointer-events-auto cursor-move"
              onMouseDown={(e) => onSelectAndDragItem(e, item)}
            />
            {(item.content || item.title) && (
              <g transform={`translate(${midX}, ${midY})`}>
                <rect
                  x={-40}
                  y={-11}
                  width={80}
                  height={20}
                  rx={6}
                  fill="var(--color-card)"
                  stroke={stroke}
                  strokeWidth={1}
                />
                <text x={0} y={3} textAnchor="middle" fontSize={10} fill="var(--color-foreground)">
                  {(item.content || item.title || '').slice(0, 14)}
                </text>
              </g>
            )}
            {isSelected && (
              <>
                <circle
                  cx={start.x}
                  cy={start.y}
                  r={4.5}
                  fill="var(--color-git-graph-ref)"
                  stroke="var(--color-destructive-foreground)"
                  strokeWidth={1.5}
                />
                <circle
                  cx={end.x}
                  cy={end.y}
                  r={4.5}
                  fill="var(--color-git-graph-ref)"
                  stroke="var(--color-destructive-foreground)"
                  strokeWidth={1.5}
                />
              </>
            )}
          </g>
        )
      })}

      <TeamWhiteboardSvgPreview
        drawingPreview={drawingPreview}
        snapTargetBounds={snapTargetBounds}
      />
    </svg>
  )
}
