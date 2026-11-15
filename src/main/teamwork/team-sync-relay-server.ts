import { createServer, type Server as HttpServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import * as Y from 'yjs'
import { WebSocketServer, type WebSocket } from 'ws'
import type { TeamSyncRuntimeStatus } from '../../shared/teamwork/team-ipc-types'
import { canAccessProject } from '../../shared/teamwork/team-rbac-policy'
import type { TeamRole, TeamSyncSettings } from '../../shared/teamwork/team-workspace-types'
import {
  decodeUint8ArrayBase64,
  encodeUint8ArrayBase64,
  parseTeamSyncWireMessage,
  type TeamSyncWireMessage
} from '../../shared/teamwork/realtime/team-ws-transport'
import type { TeamHostDatabase } from './team-host-database'

const SYNC_SETTINGS_FILE = 'orca-team-sync.json'
const DEFAULT_HOST_PORT = 4789

type RoomClient = {
  socket: WebSocket
  userId: string
  role: TeamRole | null
}

function parseRoomScope(roomId: string): { projectId?: string; teamId?: string } {
  const projectMatch = /^project:([^:]+):/.exec(roomId)
  if (projectMatch?.[1]) {
    return { projectId: projectMatch[1] }
  }
  const teamMatch = /^team:([^:]+):/.exec(roomId)
  if (teamMatch?.[1]) {
    return { teamId: teamMatch[1] }
  }
  return {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function defaultSyncSettings(): TeamSyncSettings {
  return {
    mode: 'local',
    relayUrl: '',
    hostPort: DEFAULT_HOST_PORT,
    autoConnect: false
  }
}

function resolveLanAddress(): string {
  const ifaces = networkInterfaces()
  for (const entries of Object.values(ifaces)) {
    if (!entries) {
      continue
    }
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address
      }
    }
  }
  return '127.0.0.1'
}

export class TeamSyncRelayServer {
  private httpServer: HttpServer | null = null
  private wss: WebSocketServer | null = null
  private readonly rooms = new Map<string, Set<RoomClient>>()
  private readonly roomDocs = new Map<string, Y.Doc>()
  private settings: TeamSyncSettings = defaultSyncSettings()
  private hostingUrl: string | null = null
  private lastError: string | undefined

  constructor(
    private readonly db: TeamHostDatabase,
    private readonly userDataDir?: string
  ) {}

  private settingsPath(): string {
    return path.join(this.userDataDir ?? app.getPath('userData'), SYNC_SETTINGS_FILE)
  }

  async loadSettings(): Promise<TeamSyncSettings> {
    try {
      const raw = await readFile(this.settingsPath(), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (isRecord(parsed)) {
        const mode = parsed.mode === 'host' || parsed.mode === 'remote' ? parsed.mode : 'local'
        this.settings = {
          mode,
          relayUrl: typeof parsed.relayUrl === 'string' ? parsed.relayUrl : '',
          hostPort:
            typeof parsed.hostPort === 'number' && parsed.hostPort > 0
              ? parsed.hostPort
              : DEFAULT_HOST_PORT,
          roomSecret: typeof parsed.roomSecret === 'string' ? parsed.roomSecret : undefined,
          autoConnect: Boolean(parsed.autoConnect)
        }
      }
    } catch {
      this.settings = defaultSyncSettings()
    }
    return { ...this.settings }
  }

  async configure(partial: Partial<TeamSyncSettings>): Promise<TeamSyncRuntimeStatus> {
    const current = await this.loadSettings()
    const next: TeamSyncSettings = {
      ...current,
      ...partial,
      relayUrl: (partial.relayUrl ?? current.relayUrl).trim(),
      hostPort: partial.hostPort ?? current.hostPort ?? DEFAULT_HOST_PORT
    }
    this.settings = next
    const filePath = this.settingsPath()
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(next, null, 2), 'utf8')

    if (next.mode === 'host') {
      await this.startHosting(next.hostPort, next.roomSecret)
      if (!next.relayUrl && this.hostingUrl) {
        this.settings.relayUrl = this.hostingUrl
        await writeFile(filePath, JSON.stringify(this.settings, null, 2), 'utf8')
      }
    } else {
      await this.stopHosting()
    }

    return this.getStatus()
  }

  async initializeFromPersistedSettings(): Promise<void> {
    const cfg = await this.loadSettings()
    if (cfg.mode === 'host' && cfg.autoConnect) {
      await this.startHosting(cfg.hostPort, cfg.roomSecret)
    }
  }

  async startHosting(port = DEFAULT_HOST_PORT, roomSecret?: string): Promise<string> {
    await this.stopHosting()
    this.lastError = undefined

    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          service: 'orca-teams-sync-relay',
          rooms: this.rooms.size,
          peers: this.countPeers()
        })
      )
    })

    const wss = new WebSocketServer({ server })
    wss.on('connection', (socket) => {
      let joinedRoomId: string | null = null
      let joinedUserId: string | null = null
      let joinedRole: TeamRole | null = null

      socket.on('message', (data) => {
        const text = typeof data === 'string' ? data : data.toString('utf8')
        const msg = parseTeamSyncWireMessage(text)
        if (!msg) {
          return
        }

        if (msg.type === 'join') {
          if (roomSecret?.trim() && msg.token !== roomSecret.trim()) {
            socket.close(4001, 'Unauthorized')
            return
          }
          const access = this.resolveSocketAccess(msg.roomId, msg.userId)
          if (!access.allowed) {
            socket.close(4003, 'Forbidden')
            return
          }
          joinedRoomId = msg.roomId
          joinedUserId = msg.userId
          joinedRole = access.role
          const clients = this.rooms.get(msg.roomId) ?? new Set<RoomClient>()
          clients.add({ socket, userId: msg.userId, role: access.role })
          this.rooms.set(msg.roomId, clients)

          const doc = this.getOrLoadRoomDoc(msg.roomId)
          const state = Y.encodeStateAsUpdate(doc)
          if (state.byteLength > 0) {
            const initMsg: TeamSyncWireMessage = {
              type: 'sync-state',
              roomId: msg.roomId,
              senderId: '__relay__',
              payloadBase64: encodeUint8ArrayBase64(state)
            }
            socket.send(JSON.stringify(initMsg))
          }
          return
        }

        if (msg.type === 'sync-state' || msg.type === 'sync-update') {
          const actorId = joinedUserId ?? msg.senderId
          const latestAccess = this.resolveSocketAccess(msg.roomId, actorId)
          const effectiveRole = latestAccess.role ?? joinedRole
          if (!latestAccess.allowed || effectiveRole === 'viewer') {
            return
          }
          const doc = this.getOrLoadRoomDoc(msg.roomId)
          const update = decodeUint8ArrayBase64(msg.payloadBase64)
          Y.applyUpdate(doc, update)
          this.db.saveSyncSnapshot(msg.roomId, encodeUint8ArrayBase64(Y.encodeStateAsUpdate(doc)))
          this.broadcastToRoom(msg.roomId, socket, msg)
          return
        }

        if (msg.type === 'presence' || msg.type === 'presence-leave') {
          this.broadcastToRoom(msg.roomId, socket, msg)
        }
      })

      socket.on('close', () => {
        if (!joinedRoomId) {
          return
        }
        const clients = this.rooms.get(joinedRoomId)
        if (clients) {
          for (const client of clients) {
            if (client.socket === socket) {
              clients.delete(client)
            }
          }
          if (clients.size === 0) {
            this.rooms.delete(joinedRoomId)
          }
        }
        if (joinedUserId) {
          this.broadcastToRoom(joinedRoomId, socket, {
            type: 'presence-leave',
            roomId: joinedRoomId,
            userId: joinedUserId
          })
        }
      })
    })

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '0.0.0.0', () => {
          server.off('error', reject)
          resolve()
        })
      })
      const addr = server.address()
      const boundPort = typeof addr === 'object' && addr ? addr.port : port
      this.httpServer = server
      this.wss = wss
      this.hostingUrl = `ws://${resolveLanAddress()}:${boundPort}`
      return this.hostingUrl
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err)
      wss.close()
      server.close()
      throw err
    }
  }

  async stopHosting(): Promise<void> {
    for (const clients of this.rooms.values()) {
      for (const client of clients) {
        client.socket.close()
      }
    }
    this.rooms.clear()
    if (this.wss) {
      await new Promise<void>((resolve) => this.wss?.close(() => resolve()))
      this.wss = null
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer?.close(() => resolve()))
      this.httpServer = null
    }
    this.hostingUrl = null
  }

  getStatus(): TeamSyncRuntimeStatus {
    return {
      settings: { ...this.settings },
      hostingActive: Boolean(this.httpServer && this.wss),
      hostingUrl: this.hostingUrl,
      connectedPeers: this.countPeers(),
      activeRooms: this.rooms.size,
      ...(this.lastError ? { lastError: this.lastError } : {})
    }
  }

  private resolveSocketAccess(
    roomId: string,
    userId: string
  ): { role: TeamRole | null; allowed: boolean } {
    const scope = parseRoomScope(roomId)
    if (scope.projectId) {
      const project = this.db.getProject?.(scope.projectId) ?? null
      if (project) {
        const role = this.db.getTeamMemberRole?.(project.teamId, userId) ?? null
        if (project.visibility === 'private') {
          const isExplicit = this.db.isExplicitProjectMember?.(project.id, userId) ?? false
          return {
            role,
            allowed: canAccessProject(project, role, isExplicit)
          }
        }
        return { role, allowed: true }
      }
    }

    if (scope.teamId) {
      const role = this.db.getTeamMemberRole?.(scope.teamId, userId) ?? null
      return { role, allowed: true }
    }

    if (typeof this.db.getWorkspaceSnapshot === 'function') {
      const snapshot = this.db.getWorkspaceSnapshot()
      if (snapshot.teams.length === 1) {
        const role = this.db.getTeamMemberRole?.(snapshot.teams[0].id, userId) ?? null
        if (role) {
          return { role, allowed: true }
        }
      }
    }

    return { role: null, allowed: true }
  }

  private getOrLoadRoomDoc(roomId: string): Y.Doc {
    const existing = this.roomDocs.get(roomId)
    if (existing) {
      return existing
    }
    const doc = new Y.Doc()
    const snapshot = this.db.getSyncSnapshot(roomId)
    if (snapshot) {
      try {
        Y.applyUpdate(doc, decodeUint8ArrayBase64(snapshot))
      } catch {
        // Ignore corrupted snapshot and start fresh doc.
      }
    }
    this.roomDocs.set(roomId, doc)
    return doc
  }

  private broadcastToRoom(roomId: string, sender: WebSocket, msg: TeamSyncWireMessage): void {
    const clients = this.rooms.get(roomId)
    if (!clients) {
      return
    }
    const serialized = JSON.stringify(msg)
    for (const client of clients) {
      if (client.socket !== sender && client.socket.readyState === 1) {
        client.socket.send(serialized)
      }
    }
  }

  private countPeers(): number {
    let total = 0
    for (const clients of this.rooms.values()) {
      total += clients.size
    }
    return total
  }
}
