import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { TeamBoardCRDT } from '../../shared/teamwork/realtime/team-crdt-board'
import { TeamRoomProvider } from '../../shared/teamwork/realtime/team-room-provider'
import {
  TeamWebSocketTransport,
  type TeamWebSocketLike
} from '../../shared/teamwork/realtime/team-ws-transport'
import { TeamHostDatabase } from './team-host-database'
import { TeamSyncRelayServer } from './team-sync-relay-server'

function createNodeSocket(url: string): TeamWebSocketLike {
  const ws = new WebSocket(url)
  const adapter: TeamWebSocketLike = {
    get readyState() {
      return ws.readyState
    },
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send(data: string) {
      ws.send(data)
    },
    close() {
      ws.close()
    }
  }
  ws.on('open', () => adapter.onopen?.(undefined))
  ws.on('message', (data) => adapter.onmessage?.({ data: data.toString('utf8') }))
  ws.on('close', () => adapter.onclose?.(undefined))
  ws.on('error', (err) => adapter.onerror?.(err))
  return adapter
}

async function waitFor(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for sync condition')
    }
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('TeamSyncRelayServer', () => {
  const cleanups: (() => Promise<void> | void)[] = []

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop()
      await fn?.()
    }
  })

  it('syncs CRDT state over WebSocket and hydrates late joiners from SQLite snapshot', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'orca-relay-test-'))
    const db = new TeamHostDatabase(path.join(dir, 'teams.db'))
    const server = new TeamSyncRelayServer(db, dir)
    cleanups.push(async () => {
      await server.stopHosting()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    })

    const rawUrl = await server.startHosting(0, 'secret-123')
    const port = rawUrl.split(':').at(-1)
    const wsUrl = `ws://127.0.0.1:${port}`
    const roomId = 'project:proj-1:board:b1'

    const crdtA = new TeamBoardCRDT('b1')
    crdtA.initializeFromBoard({
      id: 'b1',
      projectId: 'proj-1',
      title: 'Relay Board',
      columns: [{ id: 'col-1', title: 'Todo', cardIds: [] }],
      cards: {},
      createdAt: 1,
      updatedAt: 1
    })
    const roomA = new TeamRoomProvider(
      roomId,
      crdtA,
      'user-a',
      new TeamWebSocketTransport({
        url: wsUrl,
        roomId,
        userId: 'user-a',
        token: 'secret-123',
        createSocket: createNodeSocket
      })
    )
    cleanups.push(() => {
      roomA.destroy()
      crdtA.destroy()
    })

    const crdtB = new TeamBoardCRDT('b1')
    const roomB = new TeamRoomProvider(
      roomId,
      crdtB,
      'user-b',
      new TeamWebSocketTransport({
        url: wsUrl,
        roomId,
        userId: 'user-b',
        token: 'secret-123',
        createSocket: createNodeSocket
      })
    )
    cleanups.push(() => {
      roomB.destroy()
      crdtB.destroy()
    })

    await waitFor(() => roomA.getStatus() === 'connected' && roomB.getStatus() === 'connected')

    crdtA.upsertCard({
      id: 'card-ws-1',
      title: 'Sincronizada por Relay',
      description: 'Real WS',
      columnId: 'col-1',
      priority: 'urgent',
      labels: ['sync'],
      checklist: [],
      createdAt: 2,
      updatedAt: 2
    })

    await waitFor(() => crdtB.getBoard().cards['card-ws-1']?.title === 'Sincronizada por Relay')

    // Disconnect B and connect a brand-new late joiner C; C should receive persisted SQLite snapshot.
    roomB.destroy()
    const crdtC = new TeamBoardCRDT('b1')
    const roomC = new TeamRoomProvider(
      roomId,
      crdtC,
      'user-c',
      new TeamWebSocketTransport({
        url: wsUrl,
        roomId,
        userId: 'user-c',
        token: 'secret-123',
        createSocket: createNodeSocket
      })
    )
    cleanups.push(() => {
      roomC.destroy()
      crdtC.destroy()
    })

    await waitFor(() => crdtC.getBoard().cards['card-ws-1']?.title === 'Sincronizada por Relay')
    expect(crdtC.getBoard().cards['card-ws-1']?.priority).toBe('urgent')
  })
})
