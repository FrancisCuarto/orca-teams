import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TeamHostDatabase } from './team-host-database'
import { relayUrlToHttpBaseUrl, TeamRelayHttpClient } from './team-relay-http-client'
import { TeamSyncRelayServer } from './team-sync-relay-server'

describe('TeamSyncRelayServer HTTP API & TeamRelayHttpClient', () => {
  const cleanups: (() => Promise<void> | void)[] = []

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop()
      await fn?.()
    }
  })

  it('converts ws:// and wss:// relay URLs to http:// and https:// base URLs', () => {
    expect(relayUrlToHttpBaseUrl('ws://192.168.1.20:4789/')).toBe('http://192.168.1.20:4789')
    expect(relayUrlToHttpBaseUrl('wss://relay.orca.dev/ws/')).toBe('https://relay.orca.dev/ws')
    expect(relayUrlToHttpBaseUrl('https://relay.orca.dev')).toBe('https://relay.orca.dev')
    expect(() => relayUrlToHttpBaseUrl('')).toThrow()
    expect(() => relayUrlToHttpBaseUrl('ftp://invalid')).toThrow()
  })

  it('serves workspace, teams, projects, invitations, auth, and activity endpoints with Bearer auth', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'orca-relay-http-test-'))
    const db = new TeamHostDatabase(path.join(dir, 'teams.db'))
    const server = new TeamSyncRelayServer(db, dir)
    cleanups.push(async () => {
      await server.stopHosting()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    })

    const rawUrl = await server.startHosting(0, 'team-secret-42')
    const port = rawUrl.split(':').at(-1)
    const wsUrl = `ws://127.0.0.1:${port}`

    const unauthClient = new TeamRelayHttpClient({ relayUrl: wsUrl })
    const health = await unauthClient.getHealth()
    expect(health.ok).toBe(true)
    expect(health.authRequired).toBe(true)

    await expect(unauthClient.getWorkspaceSnapshot()).rejects.toThrow(/Unauthorized/i)

    const client = new TeamRelayHttpClient({ relayUrl: wsUrl, roomSecret: 'team-secret-42' })
    const initialSnapshot = await client.getWorkspaceSnapshot()
    expect(initialSnapshot.teams.length).toBeGreaterThanOrEqual(1)

    const createdTeam = await client.createTeam({
      name: 'Cloud Relay Team',
      description: 'Remote sync test',
      ownerId: 'local-owner'
    })
    expect(createdTeam.name).toBe('Cloud Relay Team')

    const createdProject = await client.createProject({
      teamId: createdTeam.id,
      name: 'Relay API',
      visibility: 'team',
      actorUserId: 'local-owner'
    })
    expect(createdProject.teamId).toBe(createdTeam.id)

    const inviteRes = await client.sendInvitation({
      teamId: createdTeam.id,
      teamName: createdTeam.name,
      email: 'alice@remote.dev',
      role: 'member',
      invitedBy: 'local-owner',
      inviterName: 'Host Owner'
    })
    expect(inviteRes.invitation.email).toBe('alice@remote.dev')
    expect(inviteRes.joinUrl).toContain(`token=${inviteRes.invitation.token}`)

    const acceptedMember = await client.acceptInvitation(
      inviteRes.invitation.token,
      'usr-alice',
      'Alice Remote',
      'alice@remote.dev'
    )
    expect(acceptedMember.userId).toBe('usr-alice')
    expect(acceptedMember.role).toBe('member')

    const secondInvite = await client.sendInvitation({
      teamId: createdTeam.id,
      teamName: createdTeam.name,
      email: 'bob@remote.dev',
      role: 'viewer',
      invitedBy: 'local-owner'
    })
    await client.revokeInvitation(secondInvite.invitation.id, 'local-owner')

    const codeRes = await client.requestMagicLinkCode('alice@remote.dev', 'Alice Remote')
    expect(codeRes.devCode).toMatch(/^\d{6}$/)
    const verified = await client.verifyMagicLinkCode(
      'alice@remote.dev',
      codeRes.devCode ?? '',
      'Alice Verified',
      'usr-alice'
    )
    expect(verified.userId).toBe('usr-alice')
    expect(verified.displayName).toBe('Alice Verified')
    expect(verified.authMethod).toBe('magic-link')

    const activity = await client.recordActivity({
      teamId: createdTeam.id,
      projectId: createdProject.id,
      actorId: 'usr-alice',
      actorName: 'Alice Verified',
      actorType: 'human',
      action: 'card.moved',
      targetType: 'card',
      targetId: 'card-1',
      summary: 'Movió tarjeta a En Progreso'
    })
    expect(activity.summary).toBe('Movió tarjeta a En Progreso')

    const feed = await client.listActivity({
      teamId: createdTeam.id,
      projectId: createdProject.id
    })
    expect(feed.some((entry) => entry.id === activity.id)).toBe(true)
  })
})
