import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import type { TeamKanbanCard } from '../../shared/teamwork/team-kanban-types'
import type { TeamExecutionEvent } from '../../shared/teamwork/team-ipc-types'
import {
  buildAgentCliCommand,
  buildKanbanAgentPrompt,
  resolveAgentCommand,
  TeamAgentRunner
} from './team-agent-runner'

function makeCard(overrides: Partial<TeamKanbanCard> = {}): TeamKanbanCard {
  return {
    id: 'card-1',
    title: 'Implementar endpoints',
    description: 'Agregar soporte real de ejecución',
    columnId: 'todo',
    priority: 'high',
    assignee: {
      type: 'agent',
      name: 'Antigravity',
      agentType: 'antigravity',
      model: 'gemini-4-argon-medium',
      skills: ['ponytail-5']
    },
    labels: ['backend'],
    checklist: [{ id: 'c1', text: 'Pasar tests', done: false }],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides
  }
}

describe('team-agent-runner', () => {
  it('builds exact CLI arguments per agent command', () => {
    expect(buildAgentCliCommand('agy', 'fix bug', 'gemini-4-argon')).toEqual({
      bin: 'agy',
      args: [
        '-p',
        '--dangerously-skip-permissions',
        '--output-format',
        'text',
        '--model',
        'gemini-4-argon',
        'fix bug'
      ]
    })
    expect(buildAgentCliCommand('opencode', 'fix bug', 'opencode-go/glm-5.3')).toEqual({
      bin: 'opencode',
      args: ['run', '--auto', '--model', 'opencode-go/glm-5.3', 'fix bug']
    })
    expect(buildAgentCliCommand('claude', 'fix bug')).toEqual({
      bin: 'claude',
      args: ['-p', '--dangerously-skip-permissions', 'fix bug']
    })
    expect(buildAgentCliCommand('codex', 'fix bug', 'gpt-5.6')).toEqual({
      bin: 'codex',
      args: ['exec', '--full-auto', '--model', 'gpt-5.6', 'fix bug']
    })
    expect(buildAgentCliCommand('gemini', 'fix bug', 'gemini-2.5')).toEqual({
      bin: 'gemini',
      args: ['-p', 'fix bug', '--yolo', '--model', 'gemini-2.5']
    })
    expect(buildAgentCliCommand('aider', 'fix bug')).toEqual({
      bin: 'aider',
      args: ['--yes-always', '--message', 'fix bug']
    })
    expect(buildAgentCliCommand('goose', 'fix bug')).toEqual({
      bin: 'goose',
      args: ['run', '--text', 'fix bug']
    })
    expect(buildAgentCliCommand('custom-cli', 'fix bug')).toEqual({
      bin: 'custom-cli',
      args: ['fix bug']
    })
  })

  it('resolves commands from agent IDs cleanly', () => {
    expect(resolveAgentCommand('antigravity')).toBe('agy')
    expect(resolveAgentCommand('agent-antigravity')).toBe('agy')
    expect(resolveAgentCommand('openclaude')).toBe('claude')
    expect(resolveAgentCommand('agent-opencode')).toBe('opencode')
  })

  it('rejects cards without an assigned agent', async () => {
    const runner = new TeamAgentRunner()
    await expect(
      runner.startExecution(
        {
          card: makeCard({ assignee: { type: 'human', name: 'Francis' } }),
          projectId: 'proj-1',
          actorUserId: 'usr-1'
        },
        () => undefined
      )
    ).rejects.toThrow(/agente asignado/)
  })

  it('streams stdout/stderr logs and completes execution with real child process', async () => {
    const events: TeamExecutionEvent[] = []
    const runner = new TeamAgentRunner({
      hydrateShellPath: async () => undefined,
      resolveExecutable: async () => process.execPath,
      spawnProcess: (_bin, _args, opts) =>
        spawn(
          process.execPath,
          ['-e', "console.log('line one'); console.error('warn two'); console.log('done')"],
          { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] }
        )
    })

    const initial = await runner.startExecution(
      { card: makeCard(), projectId: 'proj-1', actorUserId: 'usr-1' },
      (ev) => events.push(ev)
    )
    expect(initial.status).toBe('running')

    await new Promise((resolve) => setTimeout(resolve, 250))
    const latest = runner.getExecution(initial.id)
    expect(latest?.status).toBe('completed')
    expect(latest?.logs.some((l) => l.message === 'line one')).toBe(true)
    expect(latest?.logs.some((l) => l.message === 'warn two' && l.level === 'warn')).toBe(true)
    expect(runner.getLatestExecutionForCard('card-1')?.id).toBe(initial.id)
    expect(events[0]?.type === 'updated' && events[0].execution.status).toBe('queued')
  })

  it('cancels a running process and transitions to cancelled', async () => {
    const runner = new TeamAgentRunner({
      hydrateShellPath: async () => undefined,
      resolveExecutable: async () => process.execPath,
      spawnProcess: (_bin, _args, opts) =>
        spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], {
          cwd: opts.cwd,
          stdio: ['ignore', 'pipe', 'pipe']
        })
    })

    const rec = await runner.startExecution(
      { card: makeCard({ id: 'card-cancel' }), projectId: 'proj-1', actorUserId: 'usr-1' },
      () => undefined
    )
    const cancelled = runner.cancelExecution(rec.id)
    expect(cancelled?.status).toBe('cancelled')
    runner.dispose()
  })

  it('collects structured git diff and truncates oversized diffs in getExecutionDiff', async () => {
    const tmpWorktree = process.cwd()
    const oversizedDiff = `diff --git a/src/app.ts b/src/app.ts\n@@ -1,1 +1,2 @@\n-old\n+${'x'.repeat(130_000)}\n`
    const runner = new TeamAgentRunner({
      hydrateShellPath: async () => undefined,
      resolveExecutable: async () => process.execPath,
      provisionWorktree: async () => ({
        isGitRepo: true,
        workDir: tmpWorktree,
        branch: 'orca-team/card-diff-test',
        baseBranch: 'main'
      }),
      runGitCommand: async (_cwd, args) => {
        if (args[0] === 'merge-base') {
          return { code: 0, stdout: 'abc123\n', stderr: '' }
        }
        if (args[0] === 'diff' && args[1] === '--numstat') {
          return { code: 0, stdout: '10\t2\tsrc/app.ts\n', stderr: '' }
        }
        if (args[0] === 'diff' && args[1] === '--name-status') {
          return { code: 0, stdout: 'M\tsrc/app.ts\n', stderr: '' }
        }
        if (args[0] === 'diff' && args[1] === '--no-color') {
          return { code: 0, stdout: oversizedDiff, stderr: '' }
        }
        if (args[0] === 'ls-files') {
          return { code: 0, stdout: '', stderr: '' }
        }
        return { code: 1, stdout: '', stderr: 'unexpected' }
      },
      spawnProcess: (_bin, _args, opts) =>
        spawn(process.execPath, ['-e', "console.log('done')"], {
          cwd: opts.cwd,
          stdio: ['ignore', 'pipe', 'pipe']
        })
    })

    const rec = await runner.startExecution(
      {
        card: makeCard({ id: 'card-diff', requiresApproval: true }),
        projectId: 'proj-1',
        projectPath: tmpWorktree,
        actorUserId: 'usr-1'
      },
      () => undefined
    )

    await new Promise((resolve) => setTimeout(resolve, 250))

    const diff = await runner.getExecutionDiff(rec.id)
    expect(diff.error).toBeUndefined()
    expect(diff.files).toEqual([
      { path: 'src/app.ts', status: 'modified', additions: 10, deletions: 2 }
    ])
    expect(diff.truncated).toBe(true)
    expect(diff.diff.length).toBeLessThanOrEqual(120_000)
  })

  it('validates status/feedback and re-launches in existing worktree on requestExecutionChanges', async () => {
    const tmpWorktree = process.cwd()
    const launchedCwds: string[] = []
    const launchedArgs: string[][] = []
    const runner = new TeamAgentRunner({
      hydrateShellPath: async () => undefined,
      resolveExecutable: async () => process.execPath,
      provisionWorktree: async () => ({
        isGitRepo: true,
        workDir: tmpWorktree,
        branch: 'orca-team/card-reprompt',
        baseBranch: 'main'
      }),
      inspectWorktreeChanges: async () => ['M src/app.ts'],
      spawnProcess: (_bin, args, opts) => {
        launchedCwds.push(opts.cwd)
        launchedArgs.push(args)
        return spawn(process.execPath, ['-e', "console.log('reprompt ok')"], {
          cwd: opts.cwd,
          stdio: ['ignore', 'pipe', 'pipe']
        })
      }
    })

    const started = await runner.startExecution(
      {
        card: makeCard({ id: 'card-reprompt', requiresApproval: true }),
        projectId: 'proj-1',
        projectPath: tmpWorktree,
        actorUserId: 'usr-1'
      },
      () => undefined
    )

    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(runner.getExecution(started.id)?.status).toBe('waiting_for_input')

    await expect(
      runner.requestExecutionChanges({ executionId: started.id, feedback: '   ' })
    ).rejects.toThrow(/instrucciones/i)

    const relaunched = await runner.requestExecutionChanges({
      executionId: started.id,
      feedback: 'Agrega validación para entradas vacías',
      actorName: 'Francis'
    })
    expect(relaunched?.status).toBe('running')
    expect(relaunched?.worktreePath).toBe(tmpWorktree)
    expect(relaunched?.branchOrWorktree).toBe('orca-team/card-reprompt')
    expect(relaunched?.prompt).toContain('Agrega validación para entradas vacías')
    expect(launchedCwds).toEqual([tmpWorktree, tmpWorktree])
    expect(launchedArgs[1]?.some((arg) => arg.includes('Agrega validación para entradas vacías'))).toBe(
      true
    )

    await new Promise((resolve) => setTimeout(resolve, 250))
    const finalRecord = runner.getExecution(started.id)
    expect(finalRecord?.status).toBe('waiting_for_input')
    expect(finalRecord?.approvalStatus).toBe('pending')
  })

  it('injects linkedNotesContext into prompt and logs attached notes count', async () => {
    const prompt = buildKanbanAgentPrompt({
      card: makeCard({ linkedNoteIds: ['note-adr-001'] }),
      projectId: 'proj-1',
      actorUserId: 'usr-1',
      linkedNotesContext: [
        {
          id: 'note-adr-001',
          title: 'ADR-001: Almacenamiento Git-Backed',
          content: 'Persistir todo bajo .orca/team/'
        }
      ]
    })

    expect(prompt).toContain('## Notas y ADRs Vinculados (Contexto de Arquitectura)')
    expect(prompt).toContain('### ADR-001: Almacenamiento Git-Backed')
    expect(prompt).toContain('Persistir todo bajo .orca/team/')

    const runner = new TeamAgentRunner({
      hydrateShellPath: async () => undefined,
      resolveExecutable: async () => process.execPath,
      spawnProcess: (_bin, _args, opts) =>
        spawn(process.execPath, ['-e', "console.log('ok')"], {
          cwd: opts.cwd,
          stdio: ['ignore', 'pipe', 'pipe']
        })
    })

    const rec = await runner.startExecution(
      {
        card: makeCard({ id: 'card-notes', linkedNoteIds: ['note-adr-001'] }),
        projectId: 'proj-1',
        actorUserId: 'usr-1',
        linkedNotesContext: [
          {
            id: 'note-adr-001',
            title: 'ADR-001: Almacenamiento Git-Backed',
            content: 'Persistir todo bajo .orca/team/'
          }
        ]
      },
      () => undefined
    )

    expect(rec.prompt).toContain('ADR-001: Almacenamiento Git-Backed')
    expect(rec.logs.some((l) => l.message.includes('1 nota/ADR vinculada'))).toBe(true)
    runner.dispose()
  })
})
