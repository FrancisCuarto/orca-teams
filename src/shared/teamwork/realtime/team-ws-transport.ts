import type { CollaboratorPresence } from './team-crdt-types'
import type { TeamRoomTransport, TeamRoomTransportHandlers } from './team-room-provider'
import {
  decodeUint8ArrayBase64,
  encodeUint8ArrayBase64,
  parseTeamSyncWireMessage,
  type TeamSyncWireMessage
} from './team-ws-wire-protocol'

export {
  decodeUint8ArrayBase64,
  encodeUint8ArrayBase64,
  parseTeamSyncWireMessage,
  type TeamSyncWireMessage
}

export type TeamWebSocketLike = {
  readyState: number
  onopen: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
  send(data: string): void
  close(): void
}

const WS_OPEN = 1

export class TeamWebSocketTransport implements TeamRoomTransport {
  private ws: TeamWebSocketLike | null = null
  private handlers: TeamRoomTransportHandlers | null = null
  private pendingUpdates: Uint8Array[] = []
  private latestPresence: CollaboratorPresence | null = null
  private disposed = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly options: {
      url: string
      roomId: string
      userId: string
      token?: string
      createSocket?: (url: string) => TeamWebSocketLike
    }
  ) {}

  connect(handlers: TeamRoomTransportHandlers): () => void {
    this.handlers = handlers
    this.disposed = false
    this.openSocket()

    return () => {
      this.disposed = true
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
      if (this.ws && this.ws.readyState === WS_OPEN) {
        this.sendRaw({
          type: 'presence-leave',
          roomId: this.options.roomId,
          userId: this.options.userId
        })
      }
      this.ws?.close()
      this.ws = null
      this.handlers = null
      this.pendingUpdates = []
    }
  }

  sendUpdate(update: Uint8Array): void {
    if (this.ws && this.ws.readyState === WS_OPEN) {
      this.sendRaw({
        type: 'sync-update',
        roomId: this.options.roomId,
        senderId: this.options.userId,
        payloadBase64: encodeUint8ArrayBase64(update)
      })
      return
    }
    this.pendingUpdates.push(update)
    if (this.pendingUpdates.length > 200) {
      this.pendingUpdates.shift()
    }
  }

  sendPresence(presence: CollaboratorPresence): void {
    this.latestPresence = presence
    if (this.ws && this.ws.readyState === WS_OPEN) {
      this.sendRaw({
        type: 'presence',
        roomId: this.options.roomId,
        presence
      })
    }
  }

  private openSocket(): void {
    if (this.disposed) {
      return
    }
    const wsFactory =
      this.options.createSocket ??
      ((targetUrl: string): TeamWebSocketLike => {
        if (typeof WebSocket === 'undefined') {
          throw new Error('WebSocket no disponible en este entorno')
        }
        const nativeWs = new WebSocket(targetUrl)
        const adapter: TeamWebSocketLike = {
          get readyState() {
            return nativeWs.readyState
          },
          onopen: null,
          onmessage: null,
          onclose: null,
          onerror: null,
          send(data: string) {
            nativeWs.send(data)
          },
          close() {
            nativeWs.close()
          }
        }
        nativeWs.onopen = (ev) => adapter.onopen?.(ev)
        nativeWs.onmessage = (ev) => adapter.onmessage?.({ data: ev.data })
        nativeWs.onclose = (ev) => adapter.onclose?.(ev)
        nativeWs.onerror = (ev) => adapter.onerror?.(ev)
        return adapter
      })

    this.handlers?.onStatusChange?.('syncing')
    let socket: TeamWebSocketLike
    try {
      socket = wsFactory(this.options.url)
    } catch {
      this.handlers?.onStatusChange?.('offline')
      this.scheduleReconnect()
      return
    }
    this.ws = socket

    socket.onopen = () => {
      if (this.disposed) {
        socket.close()
        return
      }
      this.reconnectAttempts = 0
      this.handlers?.onStatusChange?.('connected')
      this.sendRaw({
        type: 'join',
        roomId: this.options.roomId,
        userId: this.options.userId,
        ...(this.options.token ? { token: this.options.token } : {})
      })

      const initialState = this.handlers?.getInitialState()
      if (initialState && initialState.byteLength > 0) {
        this.sendRaw({
          type: 'sync-state',
          roomId: this.options.roomId,
          senderId: this.options.userId,
          payloadBase64: encodeUint8ArrayBase64(initialState)
        })
      }

      if (this.pendingUpdates.length > 0) {
        for (const update of this.pendingUpdates) {
          this.sendRaw({
            type: 'sync-update',
            roomId: this.options.roomId,
            senderId: this.options.userId,
            payloadBase64: encodeUint8ArrayBase64(update)
          })
        }
        this.pendingUpdates = []
      }

      if (this.latestPresence) {
        this.sendRaw({
          type: 'presence',
          roomId: this.options.roomId,
          presence: this.latestPresence
        })
      }
    }

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return
      }
      const msg = parseTeamSyncWireMessage(event.data)
      if (!msg || msg.roomId !== this.options.roomId) {
        return
      }
      if (
        (msg.type === 'sync-state' || msg.type === 'sync-update') &&
        msg.senderId !== this.options.userId
      ) {
        this.handlers?.onRemoteUpdate(decodeUint8ArrayBase64(msg.payloadBase64))
      } else if (msg.type === 'presence' && msg.presence.userId !== this.options.userId) {
        this.handlers?.onRemotePresence(msg.presence)
      } else if (msg.type === 'presence-leave' && msg.userId !== this.options.userId) {
        this.handlers?.onRemotePresenceLeave?.(msg.userId)
      }
    }

    socket.onerror = () => {
      this.handlers?.onStatusChange?.('offline')
    }

    socket.onclose = () => {
      if (this.ws === socket) {
        this.ws = null
      }
      if (!this.disposed) {
        this.handlers?.onStatusChange?.('offline')
        this.scheduleReconnect()
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) {
      return
    }
    const delayMs = Math.min(1000 * 2 ** this.reconnectAttempts, 10_000)
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSocket()
    }, delayMs)
  }

  private sendRaw(msg: TeamSyncWireMessage): void {
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      return
    }
    this.ws.send(JSON.stringify(msg))
  }
}
