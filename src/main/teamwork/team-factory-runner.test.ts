import { describe, expect, it } from 'vitest'
import { createDefaultFactoryConfig } from '../../shared/teamwork/team-factory-types'
import type { TeamKanbanCard } from '../../shared/teamwork/team-kanban-types'
import { TeamHostDatabase } from './team-host-database'
import { TeamFactoryRunner } from './team-factory-runner'

function makeCard(overrides: Partial<TeamKanbanCard> = {}): TeamKanbanCard {
  return {
    id: 'card-factory-1',
    title: 'Agregar filtro de estado',
    description: 'Permitir filtrar tarjetas por estado activo',
    columnId: 'col-todo',
    priority: 'high',
    assignee: {
      type: 'agent',
      name: 'Claude Code',
      agentType: 'claude',
      model: 'claude-sonnet'
    },
    labels: ['ui'],
    checklist: [{ id: 'chk-1', text: 'Tests unitarios', done: false }],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides
  }
}

async function waitForRunTerminalOrGate(runner: TeamFactoryRunner, runId: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const current = runner.getRun(runId)
    if (
      current &&
      (current.status === 'completed' ||
        current.status === 'waiting_human' ||
        current.status === 'failed' ||
        current.status === 'cancelled')
    ) {
      return
    }
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('TeamFactoryRunner', () => {
  it('runs Spec -> Builder -> Checks -> 4 Parallel Reviewers -> Approver retry loop -> Auto-complete', async () => {
    const db = new TeamHostDatabase(':memory:')
    const config = createDefaultFactoryConfig('proj-1', 'claude', 'sonnet')
    config.maxRetries = 1
    config.checkCommands = [{ name: 'typecheck', command: 'echo ok' }]
    db.saveFactoryConfig(config)

    let buildAttempts = 0
    const seenPrompts: string[] = []
    let proposedSpecTitle = ''

    const runner = new TeamFactoryRunner({
      loadConfig: (projectId) => db.getFactoryConfig(projectId),
      onPersistRun: (run) => db.upsertFactoryRun(run),
      onLookupRun: (runId) => db.getFactoryRun(runId),
      onLookupLatestForCard: (cardId) => db.getLatestFactoryRunForCard(cardId),
      onListRuns: (projectId) => db.listFactoryRuns(projectId),
      prepareWorkspace: async () => ({
        workingDir: '/tmp/fake-worktree',
        isGitRepo: true,
        isIsolatedWorktree: true,
        branchName: 'factory/card-1',
        baseRef: 'HEAD'
      }),
      loadBrain: async () => ({
        noteIds: ['adr-1'],
        markdown: '### [ADR · accepted] Usar Zustand slices'
      }),
      proposeBrainNote: async ({ card }) => {
        proposedSpecTitle = card.title
        return `factory-spec-${card.id}`
      },
      runChecks: async ({ checkCommands }) =>
        checkCommands.map((c) => ({
          name: c.name,
          command: c.command,
          passed: true,
          exitCode: 0,
          output: 'ok',
          durationMs: 5
        })),
      collectDiff: async () => ({
        summary: {
          filesChanged: 1,
          insertions: 18,
          deletions: 2,
          files: ['src/renderer/FilterBar.tsx']
        },
        patch: '+ export function FilterBar() {}'
      }),
      executeAgentStep: async ({ prompt }) => {
        seenPrompts.push(prompt)
        if (prompt.includes('Rol: Spec Writer')) {
          return { ok: true, output: '# Spec\nImplementar FilterBar con TDD', durationMs: 10 }
        }
        if (prompt.includes('Rol: Builder TDD')) {
          buildAttempts += 1
          return { ok: true, output: 'Implementado y tests verdes', durationMs: 10 }
        }
        if (prompt.includes('Rol: Revisor Independiente')) {
          if (buildAttempts === 1 && prompt.includes('Consistencia de Código')) {
            return {
              ok: true,
              output: JSON.stringify({
                status: 'fail',
                summary: 'Falta test de borde',
                findings: [{ severity: 'medium', file: 'FilterBar.tsx', message: 'Agregar test' }]
              }),
              durationMs: 10
            }
          }
          return {
            ok: true,
            output: JSON.stringify({ status: 'pass', summary: 'Sin problemas', findings: [] }),
            durationMs: 10
          }
        }
        if (prompt.includes('Rol: Aprobador')) {
          if (buildAttempts === 1) {
            return {
              ok: true,
              output: JSON.stringify({
                approved: false,
                summary: 'Code reviewer pidió test',
                fixInstructions: 'Agrega test de borde en FilterBar.test.tsx'
              }),
              durationMs: 10
            }
          }
          return {
            ok: true,
            output: JSON.stringify({ approved: true, summary: 'Listo para producción' }),
            durationMs: 10
          }
        }
        return { ok: false, output: '', error: 'Unknown prompt', durationMs: 5 }
      }
    })

    const initial = await runner.startRun({
      card: makeCard(),
      projectId: 'proj-1',
      projectPath: '/tmp/repo',
      actorUserId: 'usr-1'
    })

    await waitForRunTerminalOrGate(runner, initial.id)
    const finalRun = runner.getRun(initial.id)

    expect(finalRun?.status).toBe('completed')
    expect(finalRun?.attempt).toBe(2)
    expect(buildAttempts).toBe(2)
    expect(finalRun?.reviews).toHaveLength(4)
    expect(finalRun?.brainNoteIds).toEqual(['adr-1'])
    expect(proposedSpecTitle).toBe('Agregar filtro de estado')
    expect(seenPrompts.some((p) => p.includes('Agrega test de borde en FilterBar.test.tsx'))).toBe(
      true
    )
    expect(db.getLatestFactoryRunForCard('card-factory-1')?.status).toBe('completed')
    db.close()
  })

  it('escalates to waiting_human on protected paths and completes after manual approval', async () => {
    const db = new TeamHostDatabase(':memory:')
    const runner = new TeamFactoryRunner({
      loadConfig: (projectId) => db.getFactoryConfig(projectId),
      onPersistRun: (run) => db.upsertFactoryRun(run),
      onLookupRun: (runId) => db.getFactoryRun(runId),
      prepareWorkspace: async () => ({
        workingDir: '/tmp/fake-wt',
        isGitRepo: true,
        isIsolatedWorktree: true,
        branchName: 'factory/schema',
        baseRef: 'HEAD'
      }),
      loadBrain: async () => ({ noteIds: [], markdown: '' }),
      proposeBrainNote: async () => null,
      runChecks: async () => [],
      collectDiff: async () => ({
        summary: {
          filesChanged: 1,
          insertions: 12,
          deletions: 0,
          files: ['src/shared/teamwork/team-schema.ts']
        },
        patch: '+ CREATE TABLE...'
      }),
      executeAgentStep: async ({ prompt }) => {
        if (prompt.includes('Rol: Spec Writer')) {
          return { ok: true, output: '# Spec DB', durationMs: 5 }
        }
        if (prompt.includes('Rol: Builder TDD')) {
          return { ok: true, output: 'Done', durationMs: 5 }
        }
        if (prompt.includes('Rol: Revisor Independiente')) {
          return {
            ok: true,
            output: '{"status":"pass","summary":"OK","findings":[]}',
            durationMs: 5
          }
        }
        return { ok: true, output: '{"approved":true,"summary":"OK"}', durationMs: 5 }
      }
    })

    const started = await runner.startRun({
      card: makeCard({ id: 'card-db', title: 'Actualizar esquema SQL' }),
      projectId: 'proj-1',
      actorUserId: 'usr-1'
    })
    await waitForRunTerminalOrGate(runner, started.id)

    const waiting = runner.getRun(started.id)
    expect(waiting?.status).toBe('waiting_human')
    expect(waiting?.humanGate?.status).toBe('pending')
    expect(waiting?.humanGate?.reasons[0]).toContain('team-schema.ts')

    const approved = runner.resolveHumanGate({
      runId: started.id,
      decision: 'approve',
      actorUserId: 'francis',
      comment: 'Migración verificada'
    })
    expect(approved?.status).toBe('completed')
    expect(approved?.humanGate?.status).toBe('approved')
    expect(approved?.humanGate?.decidedBy).toBe('francis')
    db.close()
  })
})
