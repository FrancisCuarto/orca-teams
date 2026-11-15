import type * as Y from 'yjs'
import type { CollaboratorPresence } from './team-crdt-types'

export type CRDTSyncableDoc = {
  readonly doc: Y.Doc
  encodeStateAsUpdate(): Uint8Array
  applyUpdate(update: Uint8Array, origin?: unknown): void
}

export type TeamRoomTransportStatus = 'connected' | 'syncing' | 'offline'

export type TeamRoomTransportHandlers = {
  onRemoteUpdate: (update: Uint8Array) => void
  onRemotePresence: (presence: CollaboratorPresence) => void
  onRemotePresenceLeave?: (userId: string) => void
  onStatusChange?: (status: TeamRoomTransportStatus) => void
  getInitialState: () => Uint8Array
}

export type TeamRoomTransport = {
  connect(handlers: TeamRoomTransportHandlers): () => void
  sendUpdate(update: Uint8Array): void
  sendPresence(presence: CollaboratorPresence): void
}

export class TeamRoomProvider {
  private readonly presences = new Map<string, CollaboratorPresence>()
  private readonly presenceListeners = new Set<(presences: CollaboratorPresence[]) => void>()
  private readonly statusListeners = new Set<(status: TeamRoomTransportStatus) => void>()
  private readonly peers = new Set<TeamRoomProvider>()
  private cleanupDocSubscription?: () => void
  private cleanupTransport?: () => void
  private status: TeamRoomTransportStatus = 'connected'

  constructor(
    public readonly roomId: string,
    public readonly crdt: CRDTSyncableDoc,
    public readonly localUserId: string,
    private readonly transport?: TeamRoomTransport
  ) {
    this.setupDocSync()
    if (this.transport) {
      this.status = 'syncing'
      this.cleanupTransport = this.transport.connect({
        onRemoteUpdate: (update) => {
          this.crdt.applyUpdate(update, this)
        },
        onRemotePresence: (presence) => {
          this.receiveRemotePresence(presence)
        },
        onRemotePresenceLeave: (userId) => {
          if (this.presences.delete(userId)) {
            this.notifyPresenceChange()
          }
        },
        onStatusChange: (nextStatus) => {
          this.status = nextStatus
          for (const listener of this.statusListeners) {
            listener(nextStatus)
          }
        },
        getInitialState: () => this.crdt.encodeStateAsUpdate()
      })
    }
  }

  getStatus(): TeamRoomTransportStatus {
    return this.status
  }

  onStatusChange(listener: (status: TeamRoomTransportStatus) => void): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  updatePresence(presence: Omit<CollaboratorPresence, 'lastSeen'>): void {
    const fullPresence: CollaboratorPresence = {
      ...presence,
      lastSeen: Date.now()
    }
    this.presences.set(presence.userId, fullPresence)
    this.notifyPresenceChange()

    for (const peer of this.peers) {
      peer.receiveRemotePresence(fullPresence)
    }
    this.transport?.sendPresence(fullPresence)
  }

  getPresences(): CollaboratorPresence[] {
    return Array.from(this.presences.values())
  }

  onPresenceChange(listener: (presences: CollaboratorPresence[]) => void): () => void {
    this.presenceListeners.add(listener)
    listener(this.getPresences())
    return () => {
      this.presenceListeners.delete(listener)
    }
  }

  cleanStalePresences(timeoutMs = 30000): void {
    const now = Date.now()
    let changed = false
    for (const [userId, p] of this.presences.entries()) {
      if (userId !== this.localUserId && now - p.lastSeen > timeoutMs) {
        this.presences.delete(userId)
        changed = true
      }
    }
    if (changed) {
      this.notifyPresenceChange()
    }
  }

  connectPeer(peer: TeamRoomProvider): () => void {
    if (peer === this || this.peers.has(peer)) {
      return () => {}
    }

    this.peers.add(peer)
    peer.peers.add(this)

    const localUpdate = this.crdt.encodeStateAsUpdate()
    const peerUpdate = peer.crdt.encodeStateAsUpdate()

    peer.crdt.applyUpdate(localUpdate, this)
    this.crdt.applyUpdate(peerUpdate, peer)

    for (const p of this.getPresences()) {
      peer.receiveRemotePresence(p)
    }
    for (const p of peer.getPresences()) {
      this.receiveRemotePresence(p)
    }

    return () => {
      this.peers.delete(peer)
      peer.peers.delete(this)
    }
  }

  receiveRemotePresence(presence: CollaboratorPresence): void {
    this.presences.set(presence.userId, presence)
    this.notifyPresenceChange()
  }

  destroy(): void {
    this.cleanupTransport?.()
    this.cleanupTransport = undefined
    this.cleanupDocSubscription?.()
    this.cleanupDocSubscription = undefined
    for (const peer of this.peers) {
      peer.peers.delete(this)
    }
    this.peers.clear()
    this.presenceListeners.clear()
    this.statusListeners.clear()
    this.presences.clear()
  }

  private setupDocSync(): void {
    const handler = (update: Uint8Array, origin: unknown): void => {
      for (const peer of this.peers) {
        if (peer !== origin) {
          peer.crdt.applyUpdate(update, this)
        }
      }
      if (origin !== this) {
        this.transport?.sendUpdate(update)
      }
    }
    this.crdt.doc.on('update', handler)
    this.cleanupDocSubscription = () => {
      this.crdt.doc.off('update', handler)
    }
  }

  private notifyPresenceChange(): void {
    const list = this.getPresences()
    for (const listener of this.presenceListeners) {
      listener(list)
    }
  }
}
