import * as Y from 'yjs'
import type { TeamWhiteboard, TeamWhiteboardItem } from '../team-kanban-types'
import type { ITeamWhiteboardCRDT } from './team-crdt-types'

export class TeamWhiteboardCRDT implements ITeamWhiteboardCRDT {
  public readonly doc: Y.Doc
  private readonly itemsMap: Y.Map<TeamWhiteboardItem>
  private readonly metadataMap: Y.Map<unknown>
  private readonly viewportMap: Y.Map<number>
  private readonly changeListeners = new Set<(wb: TeamWhiteboard) => void>()
  private readonly observer: () => void

  constructor(
    public readonly docId: string,
    existingDoc?: Y.Doc
  ) {
    this.doc = existingDoc ?? new Y.Doc()
    this.itemsMap = this.doc.getMap<TeamWhiteboardItem>('items')
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
    const rawItems = this.itemsMap.toJSON() as Record<string, TeamWhiteboardItem>
    const items = Object.values(rawItems).sort((a, b) => a.y - b.y || a.x - b.x)
    const metadata = this.metadataMap.toJSON()

    const title = typeof metadata.title === 'string' ? metadata.title : 'Pizarra de Arquitectura'
    const projectId = typeof metadata.projectId === 'string' ? metadata.projectId : 'default'
    const createdAt = typeof metadata.createdAt === 'number' ? metadata.createdAt : Date.now()
    const updatedAt = typeof metadata.updatedAt === 'number' ? metadata.updatedAt : Date.now()

    const x = this.viewportMap.get('x') ?? 0
    const y = this.viewportMap.get('y') ?? 0
    const zoom = this.viewportMap.get('zoom') ?? 1

    return {
      id: this.docId,
      projectId,
      title,
      items,
      viewport: { x, y, zoom },
      createdAt,
      updatedAt
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
        this.itemsMap.set(item.id, item)
      }
    })
  }

  upsertItem(item: TeamWhiteboardItem): void {
    this.doc.transact(() => {
      this.itemsMap.set(item.id, item)
      this.metadataMap.set('updatedAt', Date.now())
    })
  }

  moveItem(itemId: string, x: number, y: number): void {
    this.doc.transact(() => {
      const existing = this.itemsMap.get(itemId)
      if (existing) {
        this.itemsMap.set(itemId, { ...existing, x, y })
        this.metadataMap.set('updatedAt', Date.now())
      }
    })
  }

  updateItemContent(itemId: string, content: string): void {
    this.doc.transact(() => {
      const existing = this.itemsMap.get(itemId)
      if (existing) {
        this.itemsMap.set(itemId, { ...existing, content })
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
