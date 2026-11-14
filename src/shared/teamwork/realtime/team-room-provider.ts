import type { CollaboratorPresence } from './team-crdt-types'
import type { TeamBoardCRDT } from './team-crdt-board'

export class TeamRoomProvider {
  private readonly presences = new Map<string, CollaboratorPresence>()
  private readonly presenceListeners = new Set<(presences: CollaboratorPresence[]) => void>()
  private readonly peers = new Set<TeamRoomProvider>()
  private cleanupDocSubscription?: () => void

  constructor(
    public readonly roomId: string,
    public readonly crdt: TeamBoardCRDT,
    public readonly localUserId: string
  ) {
    this.setupDocSync()
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

    // Sync full state initially between peers
    const localUpdate = this.crdt.encodeStateAsUpdate()
    const peerUpdate = peer.crdt.encodeStateAsUpdate()

    peer.crdt.applyUpdate(localUpdate, this)
    this.crdt.applyUpdate(peerUpdate, peer)

    // Exchange existing presences
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
    if (this.cleanupDocSubscription) {
      this.cleanupDocSubscription()
    }
    for (const peer of this.peers) {
      peer.peers.delete(this)
    }
    this.peers.clear()
    this.presenceListeners.clear()
    this.presences.clear()
  }

  private setupDocSync(): void {
    this.crdt.doc.on('update', (update: Uint8Array, origin: unknown) => {
      for (const peer of this.peers) {
        if (peer !== origin) {
          peer.crdt.applyUpdate(update, this)
        }
      }
    })
  }

  private notifyPresenceChange(): void {
    const list = this.getPresences()
    for (const listener of this.presenceListeners) {
      listener(list)
    }
  }
}
