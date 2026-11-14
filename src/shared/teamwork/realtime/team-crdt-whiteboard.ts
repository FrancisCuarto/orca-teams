import * as Y from 'yjs'
import type {
  TeamWhiteboard,
  TeamWhiteboardItem,
  WhiteboardColor,
  WhiteboardFillStyle,
  WhiteboardFontSize,
  WhiteboardItemType,
  WhiteboardPoint,
  WhiteboardShapeKind
} from '../team-kanban-types'
import type { ITeamWhiteboardCRDT } from './team-crdt-types'

const ITEM_TYPES = new Set<string>(['sticky', 'mermaid', 'text', 'spec', 'shape', 'draw', 'arrow'])
const ITEM_COLORS = new Set<string>(['yellow', 'blue', 'green', 'pink', 'purple', 'orange'])
const SHAPE_KINDS = new Set<string>(['rect', 'ellipse', 'diamond'])
const FILL_STYLES = new Set<string>(['tinted', 'solid', 'outline'])
const FONT_SIZES = new Set<string>(['sm', 'md', 'lg'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function isWhiteboardItemType(v: unknown): v is WhiteboardItemType {
  return typeof v === 'string' && ITEM_TYPES.has(v)
}
function isWhiteboardColor(v: unknown): v is WhiteboardColor {
  return typeof v === 'string' && ITEM_COLORS.has(v)
}
function isWhiteboardShapeKind(v: unknown): v is WhiteboardShapeKind {
  return typeof v === 'string' && SHAPE_KINDS.has(v)
}
function isWhiteboardFillStyle(v: unknown): v is WhiteboardFillStyle {
  return typeof v === 'string' && FILL_STYLES.has(v)
}
function isWhiteboardFontSize(v: unknown): v is WhiteboardFontSize {
  return typeof v === 'string' && FONT_SIZES.has(v)
}

function readPoints(value: unknown): WhiteboardPoint[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const points: WhiteboardPoint[] = []
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.x === 'number' && typeof entry.y === 'number') {
      points.push({ x: entry.x, y: entry.y })
    }
  }
  return points
}

export function readWhiteboardItemFromMap(raw: unknown): TeamWhiteboardItem | null {
  if (
    !isRecord(raw) ||
    typeof raw.id !== 'string' ||
    !isWhiteboardItemType(raw.type) ||
    typeof raw.x !== 'number' ||
    typeof raw.y !== 'number' ||
    typeof raw.width !== 'number' ||
    typeof raw.height !== 'number' ||
    typeof raw.content !== 'string'
  ) {
    return null
  }
  const points = readPoints(raw.points)
  return {
    id: raw.id,
    type: raw.type,
    x: raw.x,
    y: raw.y,
    width: raw.width,
    height: raw.height,
    content: raw.content,
    ...(isWhiteboardColor(raw.color) ? { color: raw.color } : {}),
    ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
    ...(isWhiteboardShapeKind(raw.shapeKind) ? { shapeKind: raw.shapeKind } : {}),
    ...(typeof raw.strokeColor === 'string' ? { strokeColor: raw.strokeColor } : {}),
    ...(typeof raw.strokeWidth === 'number' ? { strokeWidth: raw.strokeWidth } : {}),
    ...(isWhiteboardFillStyle(raw.fillStyle) ? { fillStyle: raw.fillStyle } : {}),
    ...(points ? { points } : {}),
    ...(typeof raw.fromId === 'string' ? { fromId: raw.fromId } : {}),
    ...(typeof raw.toId === 'string' ? { toId: raw.toId } : {}),
    ...(typeof raw.endX === 'number' ? { endX: raw.endX } : {}),
    ...(typeof raw.endY === 'number' ? { endY: raw.endY } : {}),
    ...(typeof raw.zIndex === 'number' ? { zIndex: raw.zIndex } : {}),
    ...(isWhiteboardFontSize(raw.fontSize) ? { fontSize: raw.fontSize } : {})
  }
}

export function writeWhiteboardItemToMap(itemsMap: Y.Map<unknown>, item: TeamWhiteboardItem): void {
  itemsMap.set(item.id, item)
}

export class TeamWhiteboardCRDT implements ITeamWhiteboardCRDT {
  public readonly doc: Y.Doc
  private readonly itemsMap: Y.Map<unknown>
  private readonly metadataMap: Y.Map<unknown>
  private readonly viewportMap: Y.Map<number>
  private readonly changeListeners = new Set<(wb: TeamWhiteboard) => void>()
  private readonly observer: () => void

  constructor(
    public readonly docId: string,
    existingDoc?: Y.Doc
  ) {
    this.doc = existingDoc ?? new Y.Doc()
    this.itemsMap = this.doc.getMap<unknown>('items')
    this.metadataMap = this.doc.getMap<unknown>('metadata')
    this.viewportMap = this.doc.getMap<number>('viewport')

    this.observer = (): void => {
      const wb = this.getWhiteboard()
      for (const listener of this.changeListeners) {
        listener(wb)
      }
    }
    this.doc.on('afterTransaction', this.observer)
  }

  getWhiteboard(): TeamWhiteboard {
    const items: TeamWhiteboardItem[] = []
    this.itemsMap.forEach((raw) => {
      const parsed = readWhiteboardItemFromMap(raw)
      if (parsed) {
        items.push(parsed)
      }
    })
    items.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.y - b.y || a.x - b.x)

    const metadata = this.metadataMap.toJSON()
    return {
      id: this.docId,
      projectId: typeof metadata.projectId === 'string' ? metadata.projectId : 'default',
      title: typeof metadata.title === 'string' ? metadata.title : 'Pizarra de Arquitectura',
      items,
      viewport: {
        x: this.viewportMap.get('x') ?? 0,
        y: this.viewportMap.get('y') ?? 0,
        zoom: this.viewportMap.get('zoom') ?? 1
      },
      createdAt: typeof metadata.createdAt === 'number' ? metadata.createdAt : Date.now(),
      updatedAt: typeof metadata.updatedAt === 'number' ? metadata.updatedAt : Date.now()
    }
  }

  initializeFromWhiteboard(wb: TeamWhiteboard): void {
    if (this.itemsMap.size > 0) {
      return
    }
    this.doc.transact(() => {
      this.metadataMap.set('title', wb.title)
      this.metadataMap.set('projectId', wb.projectId)
      this.metadataMap.set('createdAt', wb.createdAt)
      this.metadataMap.set('updatedAt', wb.updatedAt)
      this.viewportMap.set('x', wb.viewport?.x ?? 0)
      this.viewportMap.set('y', wb.viewport?.y ?? 0)
      this.viewportMap.set('zoom', wb.viewport?.zoom ?? 1)
      for (const item of wb.items) {
        writeWhiteboardItemToMap(this.itemsMap, item)
      }
    })
  }

  upsertItem(item: TeamWhiteboardItem): void {
    this.doc.transact(() => {
      writeWhiteboardItemToMap(this.itemsMap, item)
      this.metadataMap.set('updatedAt', Date.now())
    })
  }

  moveItem(itemId: string, x: number, y: number): void {
    this.doc.transact(() => {
      const existing = readWhiteboardItemFromMap(this.itemsMap.get(itemId))
      if (existing) {
        writeWhiteboardItemToMap(this.itemsMap, { ...existing, x, y })
        this.metadataMap.set('updatedAt', Date.now())
      }
    })
  }

  resizeItem(itemId: string, width: number, height: number): void {
    this.doc.transact(() => {
      const existing = readWhiteboardItemFromMap(this.itemsMap.get(itemId))
      if (existing) {
        writeWhiteboardItemToMap(this.itemsMap, {
          ...existing,
          width: Math.max(20, width),
          height: Math.max(20, height)
        })
        this.metadataMap.set('updatedAt', Date.now())
      }
    })
  }

  bringItemToFront(itemId: string): void {
    this.doc.transact(() => {
      const existing = readWhiteboardItemFromMap(this.itemsMap.get(itemId))
      if (!existing) {
        return
      }
      let maxZ = 0
      this.itemsMap.forEach((raw) => {
        const parsed = readWhiteboardItemFromMap(raw)
        if (parsed && (parsed.zIndex ?? 0) > maxZ) {
          maxZ = parsed.zIndex ?? 0
        }
      })
      writeWhiteboardItemToMap(this.itemsMap, { ...existing, zIndex: maxZ + 1 })
      this.metadataMap.set('updatedAt', Date.now())
    })
  }

  updateItemContent(itemId: string, content: string): void {
    this.doc.transact(() => {
      const existing = readWhiteboardItemFromMap(this.itemsMap.get(itemId))
      if (existing) {
        writeWhiteboardItemToMap(this.itemsMap, { ...existing, content })
        this.metadataMap.set('updatedAt', Date.now())
      }
    })
  }

  deleteItem(itemId: string): void {
    this.doc.transact(() => {
      this.itemsMap.delete(itemId)
      this.metadataMap.set('updatedAt', Date.now())
    })
  }

  setViewport(viewport: { x: number; y: number; zoom: number }): void {
    this.doc.transact(() => {
      this.viewportMap.set('x', viewport.x)
      this.viewportMap.set('y', viewport.y)
      this.viewportMap.set('zoom', viewport.zoom)
      this.metadataMap.set('updatedAt', Date.now())
    })
  }

  subscribe(listener: (wb: TeamWhiteboard) => void): () => void {
    this.changeListeners.add(listener)
    return () => {
      this.changeListeners.delete(listener)
    }
  }

  encodeStateAsUpdate(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc)
  }

  applyUpdate(update: Uint8Array, origin?: unknown): void {
    Y.applyUpdate(this.doc, update, origin)
  }

  destroy(): void {
    this.changeListeners.clear()
    this.doc.off('afterTransaction', this.observer)
    this.doc.destroy()
  }
}
