import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import type { TeamKanbanCard } from '../../shared/teamwork/team-kanban-types'
import type { TeamExecutionEvent } from '../../shared/teamwork/team-ipc-types'
import { buildAgentCliCommand, resolveAgentCommand, TeamAgentRunner } from './team-agent-runner'

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
})
