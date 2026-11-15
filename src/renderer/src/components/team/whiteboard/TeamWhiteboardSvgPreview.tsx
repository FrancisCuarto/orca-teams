import React from 'react'
import type {
  WhiteboardPoint,
  WhiteboardShapeKind
} from '../../../../../shared/teamwork/team-kanban-types'
import { pointsToSmoothSvgPath } from './whiteboard-geometry'

export type DrawingPreview =
  | {
      kind: 'shape'
      shapeKind: WhiteboardShapeKind
      x: number
      y: number
      width: number
      height: number
    }
  | { kind: 'draw'; points: WhiteboardPoint[] }
  | { kind: 'arrow'; start: WhiteboardPoint; end: WhiteboardPoint; snapTargetId?: string }

type Props = {
  drawingPreview: DrawingPreview | null
  snapTargetBounds: { x: number; y: number; width: number; height: number } | null
}

export function TeamWhiteboardSvgPreview({
  drawingPreview,
  snapTargetBounds
}: Props): React.JSX.Element {
  return (
    <>
      {snapTargetBounds && (
        <rect
          x={snapTargetBounds.x - 4}
          y={snapTargetBounds.y - 4}
          width={snapTargetBounds.width + 8}
          height={snapTargetBounds.height + 8}
          rx={12}
          fill="none"
          stroke="var(--color-git-graph-lane-4)"
          strokeWidth={2}
          strokeDasharray="5 3"
        />
      )}

      {drawingPreview?.kind === 'draw' && (
        <path
          d={pointsToSmoothSvgPath(drawingPreview.points)}
          fill="none"
          stroke="var(--color-git-graph-ref)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {drawingPreview?.kind === 'arrow' && (
        <line
          x1={drawingPreview.start.x}
          y1={drawingPreview.start.y}
          x2={drawingPreview.end.x}
          y2={drawingPreview.end.y}
          stroke="var(--color-git-graph-ref)"
          strokeWidth={2}
          strokeDasharray="5 3"
          markerEnd="url(#wb-arrowhead-preview)"
        />
      )}

      {drawingPreview?.kind === 'shape' && (
        <g>
          {drawingPreview.shapeKind === 'ellipse' ? (
            <ellipse
              cx={drawingPreview.x + drawingPreview.width / 2}
              cy={drawingPreview.y + drawingPreview.height / 2}
              rx={drawingPreview.width / 2}
              ry={drawingPreview.height / 2}
              fill="var(--color-git-graph-ref)"
              fillOpacity={0.12}
              stroke="var(--color-git-graph-ref)"
              strokeWidth={2}
              strokeDasharray="5 3"
            />
          ) : drawingPreview.shapeKind === 'diamond' ? (
            <polygon
              points={`${drawingPreview.x + drawingPreview.width / 2},${drawingPreview.y} ${
                drawingPreview.x + drawingPreview.width
              },${drawingPreview.y + drawingPreview.height / 2} ${
                drawingPreview.x + drawingPreview.width / 2
              },${drawingPreview.y + drawingPreview.height} ${drawingPreview.x},${
                drawingPreview.y + drawingPreview.height / 2
              }`}
              fill="var(--color-git-graph-ref)"
              fillOpacity={0.12}
              stroke="var(--color-git-graph-ref)"
              strokeWidth={2}
              strokeDasharray="5 3"
            />
          ) : (
            <rect
              x={drawingPreview.x}
              y={drawingPreview.y}
              width={drawingPreview.width}
              height={drawingPreview.height}
              rx={10}
              fill="var(--color-git-graph-ref)"
              fillOpacity={0.12}
              stroke="var(--color-git-graph-ref)"
              strokeWidth={2}
              strokeDasharray="5 3"
            />
          )}
        </g>
      )}
    </>
  )
}
