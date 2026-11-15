import type {
  TeamWhiteboardItem,
  WhiteboardColor,
  WhiteboardFontSize,
  WhiteboardShapeKind
} from '../../../../../shared/teamwork/team-kanban-types'

export type WhiteboardTool =
  | 'select'
  | 'pan'
  | 'sticky'
  | 'text'
  | 'mermaid'
  | 'shape'
  | 'draw'
  | 'arrow'

export type WhiteboardPreviewOverride = {
  itemId: string
  x: number
  y: number
  width: number
  height: number
}

export type WhiteboardSwatch = {
  id: string
  label: string
  color?: WhiteboardColor
  strokeHex: string
  tintedHex: string
  solidHex: string
  dotClass: string
  cardBgClass: string
  cardBorderClass: string
}

export const WHITEBOARD_SWATCHES: WhiteboardSwatch[] = [
  {
    id: 'amber',
    label: 'Ámbar',
    color: 'yellow',
    strokeHex: '#f59e0b',
    tintedHex: 'rgba(245, 158, 11, 0.16)',
    solidHex: '#d97706',
    dotClass: 'bg-amber-500',
    cardBgClass: 'bg-amber-500/15',
    cardBorderClass: 'border-amber-500/45'
  },
  {
    id: 'blue',
    label: 'Azul',
    color: 'blue',
    strokeHex: '#3b82f6',
    tintedHex: 'rgba(59, 130, 246, 0.16)',
    solidHex: '#2563eb',
    dotClass: 'bg-blue-500',
    cardBgClass: 'bg-blue-500/15',
    cardBorderClass: 'border-blue-500/45'
  },
  {
    id: 'emerald',
    label: 'Esmeralda',
    color: 'green',
    strokeHex: '#10b981',
    tintedHex: 'rgba(16, 185, 129, 0.16)',
    solidHex: '#059669',
    dotClass: 'bg-emerald-500',
    cardBgClass: 'bg-emerald-500/15',
    cardBorderClass: 'border-emerald-500/45'
  },
  {
    id: 'pink',
    label: 'Rosa',
    color: 'pink',
    strokeHex: '#ec4899',
    tintedHex: 'rgba(236, 72, 153, 0.16)',
    solidHex: '#db2777',
    dotClass: 'bg-pink-500',
    cardBgClass: 'bg-pink-500/15',
    cardBorderClass: 'border-pink-500/45'
  },
  {
    id: 'purple',
    label: 'Púrpura',
    color: 'purple',
    strokeHex: '#8b5cf6',
    tintedHex: 'rgba(139, 92, 246, 0.16)',
    solidHex: '#7c3aed',
    dotClass: 'bg-purple-500',
    cardBgClass: 'bg-purple-500/15',
    cardBorderClass: 'border-purple-500/45'
  },
  {
    id: 'orange',
    label: 'Naranja',
    color: 'orange',
    strokeHex: '#f97316',
    tintedHex: 'rgba(249, 115, 22, 0.16)',
    solidHex: '#ea580c',
    dotClass: 'bg-orange-500',
    cardBgClass: 'bg-orange-500/15',
    cardBorderClass: 'border-orange-500/45'
  },
  {
    id: 'cyan',
    label: 'Cian',
    strokeHex: '#06b6d4',
    tintedHex: 'rgba(6, 182, 212, 0.16)',
    solidHex: '#0891b2',
    dotClass: 'bg-cyan-500',
    cardBgClass: 'bg-cyan-500/15',
    cardBorderClass: 'border-cyan-500/45'
  },
  {
    id: 'slate',
    label: 'Neutro',
    strokeHex: '#64748b',
    tintedHex: 'rgba(100, 116, 139, 0.18)',
    solidHex: '#475569',
    dotClass: 'bg-slate-500',
    cardBgClass: 'bg-slate-500/15',
    cardBorderClass: 'border-slate-500/45'
  }
]

export const FONT_SIZE_CLASSES: Record<WhiteboardFontSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base'
}

export const SHAPE_LABELS: Record<WhiteboardShapeKind, string> = {
  rect: 'Rectángulo',
  ellipse: 'Elipse',
  diamond: 'Rombo'
}

export function resolveItemSwatch(item: TeamWhiteboardItem): WhiteboardSwatch {
  if (item.strokeColor) {
    const byHex = WHITEBOARD_SWATCHES.find(
      (s) => s.strokeHex.toLowerCase() === item.strokeColor?.toLowerCase()
    )
    if (byHex) {
      return byHex
    }
  }
  if (item.color) {
    const byColor = WHITEBOARD_SWATCHES.find((s) => s.color === item.color)
    if (byColor) {
      return byColor
    }
  }
  return WHITEBOARD_SWATCHES[1] ?? WHITEBOARD_SWATCHES[0]
}

export function getMaxZIndex(items: TeamWhiteboardItem[]): number {
  let maxZ = 0
  for (const item of items) {
    if ((item.zIndex ?? 0) > maxZ) {
      maxZ = item.zIndex ?? 0
    }
  }
  return maxZ
}

export function isBoxItem(item: TeamWhiteboardItem): boolean {
  return item.type !== 'draw' && item.type !== 'arrow'
}

export function getItemBounds(
  item: TeamWhiteboardItem,
  preview?: WhiteboardPreviewOverride | null
): { x: number; y: number; width: number; height: number } {
  if (preview && preview.itemId === item.id) {
    return { x: preview.x, y: preview.y, width: preview.width, height: preview.height }
  }
  return { x: item.x, y: item.y, width: item.width, height: item.height }
}
