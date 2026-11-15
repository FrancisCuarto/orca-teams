import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TeamAgentRunner } from './team-agent-runner'
import { TeamAuthService } from './team-auth-service'
import { TeamEmailService } from './team-email-service'
import { TeamHostDatabase } from './team-host-database'

function spawnShortProcess() {
  return spawn(process.execPath, ['-e', 'console.log("Trabajo completado")'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
}

describe('TeamAuthService, TeamActivityService & Approval Gate', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('issues and verifies a magic-link code and records team activity', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'orca-auth-test-'))
    tempDirs.push(dir)
    const db = new TeamHostDatabase(path.join(dir, 'teams.db'))
    const email = new TeamEmailService({ userDataDir: dir, resolveExecutable: async () => null })
    const auth = new TeamAuthService(db, email, dir)

    const challenge = await auth.requestMagicLinkCode('ana@equipo.dev', 'Ana')
    expect(challenge.devCode).toMatch(/^\d{6}$/)

    await expect(auth.verifyMagicLinkCode('ana@equipo.dev', '000000')).rejects.toThrow()

    const profile = await auth.verifyMagicLinkCode('ana@equipo.dev', challenge.devCode!, 'Ana Dev')
    expect(profile.email).toBe('ana@equipo.dev')
    expect(profile.displayName).toBe('Ana Dev')
    expect(profile.authMethod).toBe('magic-link')

    db.recordActivity({
      teamId: 'team-local',
      projectId: 'proj-default',
      actorId: profile.userId,
      actorName: profile.displayName,
      actorType: 'human',
      action: 'auth.verified',
      targetType: 'member',
      summary: 'Ana verificó su cuenta'
    })
    const feed = db.listActivity({ teamId: 'team-local', projectId: 'proj-default' })
    expect(feed).toHaveLength(1)
    expect(feed[0]?.actorName).toBe('Ana Dev')
    db.close()
  })

  it('pauses in waiting_for_input when requiresApproval is true and merges on approval', async () => {
    let mergedBranch = ''
    const runner = new TeamAgentRunner({
      hydrateShellPath: async () => undefined,
      resolveExecutable: async () => '/usr/bin/claude',
      getFallbackHomeDir: () => tmpdir(),
      provisionWorktree: async () => ({
        isGitRepo: true,
        workDir: tmpdir(),
        branch: 'orca-team/card-1-demo',
        baseBranch: 'main'
      }),
      inspectWorktreeChanges: async () => ['M src/index.ts'],
      mergeWorktreeToBase: async (opts) => {
        mergedBranch = opts.branch
        return { merged: true, changedFiles: ['M src/index.ts'], message: 'Merged cleanly' }
      },
      spawnProcess: () => spawnShortProcess()
    })

    const events: string[] = []
    const started = await runner.startExecution(
      {
        card: {
          id: 'card-1',
          title: 'Demo approval',
          description: 'Test',
          columnId: 'col-in-progress',
          priority: 'high',
          assignee: { type: 'agent', name: 'Claude', agentType: 'claude' },
          labels: [],
          checklist: [],
          requiresApproval: true,
          isolateWorktree: true,
          createdAt: 1,
          updatedAt: 1
        },
        projectId: 'proj-1',
        projectPath: tmpdir(),
        actorUserId: 'usr-1'
      },
      (ev) => {
        if (ev.type === 'updated') {
          events.push(ev.execution.status)
        }
      }
    )

    const deadline = Date.now() + 3000
    while (
      runner.getExecution(started.id)?.status !== 'waiting_for_input' &&
      Date.now() < deadline
    ) {
      await new Promise((r) => setTimeout(r, 20))
    }
    const pending = runner.getExecution(started.id)
    expect(pending?.status).toBe('waiting_for_input')
    expect(pending?.approvalStatus).toBe('pending')
    expect(pending?.changedFiles).toEqual(['M src/index.ts'])

    const approved = await runner.approveExecution({
      executionId: started.id,
      mergeToBase: true,
      actorName: 'Lead'
    })
    expect(approved?.status).toBe('completed')
    expect(approved?.approvalStatus).toBe('approved')
    expect(mergedBranch).toBe('orca-team/card-1-demo')
  })
})
