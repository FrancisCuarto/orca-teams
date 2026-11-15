// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  createDefaultFactoryConfig,
  type FactoryRunRecord
} from '../../../../../shared/teamwork/team-factory-types'
import type { TeamKanbanBoard } from '../../../../../shared/teamwork/team-kanban-types'
import type { TeamApi } from '../../../../../shared/teamwork/team-ipc-types'
import { TeamKanbanBoardView } from '../kanban/TeamKanbanBoardView'

function makeSampleBoard(): TeamKanbanBoard {
  return {
    id: 'board-1',
    projectId: 'proj-1',
    title: 'Factory Board',
    columns: [
      { id: 'col-todo', title: 'Por Hacer', cardIds: ['card-1'] },
      { id: 'col-in-progress', title: 'En Progreso', cardIds: [] },
      { id: 'col-review', title: 'En Revisión', cardIds: [] },
      { id: 'col-done', title: 'Completado', cardIds: [] }
    ],
    cards: {
      'card-1': {
        id: 'card-1',
        title: 'Construir endpoint de métricas',
        description: 'Con tests y revisión de seguridad',
        columnId: 'col-todo',
        priority: 'high',
        assignee: {
          type: 'agent',
          name: 'Claude',
          agentType: 'claude',
          model: 'sonnet'
        },
        labels: ['backend'],
        checklist: [],
        createdAt: 1000,
        updatedAt: 1000
      }
    },
    createdAt: 1000,
    updatedAt: 1000
  }
}

describe('Software Factory Kanban UI integration', () => {
  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(window, 'api')
  })

  it('starts Software Factory from a Kanban card and renders live Human Gate approval UI', async () => {
    const waitingRun: FactoryRunRecord = {
      id: 'factory-run-1',
      cardId: 'card-1',
      cardTitle: 'Construir endpoint de métricas',
      projectId: 'proj-1',
      status: 'waiting_human',
      currentStage: 'human_gate',
      attempt: 1,
      maxRetries: 2,
      branchName: 'factory/metricas',
      brainNoteIds: ['adr-1'],
      specMarkdown: '# Spec\nEndpoint GET /metrics',
      stages: [
        {
          id: 's1',
          stage: 'spec',
          label: 'Spec Writer',
          attempt: 1,
          status: 'passed',
          startedAt: 1000,
          completedAt: 1010
        },
        {
          id: 's2',
          stage: 'build',
          label: 'Builder TDD',
          attempt: 1,
          status: 'passed',
          startedAt: 1010,
          completedAt: 1020
        },
        {
          id: 's3',
          stage: 'review',
          label: '4 Revisores',
          attempt: 1,
          status: 'passed',
          startedAt: 1020,
          completedAt: 1030
        }
      ],
      reviews: [
        {
          role: 'security',
          agentId: 'codex',
          model: 'gpt-5',
          status: 'pass',
          summary: 'Sin riesgos',
          findings: [],
          durationMs: 1000
        },
        {
          role: 'ux',
          agentId: 'claude',
          model: 'sonnet',
          status: 'pass',
          summary: 'Flujo claro',
          findings: [],
          durationMs: 1000
        },
        {
          role: 'ui',
          agentId: 'gemini',
          model: 'pro',
          status: 'pass',
          summary: 'OK',
          findings: [],
          durationMs: 1000
        },
        {
          role: 'code',
          agentId: 'claude',
          model: 'sonnet',
          status: 'pass',
          summary: 'Limpio',
          findings: [],
          durationMs: 1000
        }
      ],
      gateResult: {
        requiresHumanApproval: true,
        reasons: ['Se modificó archivo protegido auth/policy.ts'],
        checksPassed: true,
        diff: { filesChanged: 1, insertions: 20, deletions: 2, files: ['auth/policy.ts'] },
        checkResults: []
      },
      humanGate: {
        status: 'pending',
        reasons: ['Se modificó archivo protegido auth/policy.ts']
      },
      logs: [
        { timestamp: 1000, stage: 'human_gate', level: 'warn', message: 'Esperando aprobación' }
      ],
      startedAt: 1000,
      updatedAt: 1030
    }

    const api: TeamApi = {
      listConfiguredAgents: vi.fn(async () => []),
      startExecution: vi.fn(),
      cancelExecution: vi.fn(async () => null),
      getExecution: vi.fn(async () => null),
      getLatestExecutionForCard: vi.fn(async () => null),
      onExecutionEvent: vi.fn(() => () => {}),
      getFactoryConfig: vi.fn(async () => createDefaultFactoryConfig('proj-1')),
      saveFactoryConfig: vi.fn(async (cfg) => cfg),
      startFactoryRun: vi.fn(async () => waitingRun),
      cancelFactoryRun: vi.fn(async () => null),
      resolveFactoryHumanGate: vi.fn(async (): Promise<FactoryRunRecord | null> => ({
        ...waitingRun,
        status: 'completed',
        currentStage: 'completed',
        humanGate: { status: 'approved', reasons: [], decidedBy: 'usr-francis', decidedAt: 2000 }
      })),
      getFactoryRun: vi.fn(async () => waitingRun),
      getLatestFactoryRunForCard: vi.fn(async () => waitingRun),
      listFactoryRuns: vi.fn(async () => []),
      onFactoryEvent: vi.fn(() => () => {}),
      getWorkspaceSnapshot: vi.fn(async () => ({
        teams: [],
        projects: [],
        membersByTeam: {},
        invitationsByTeam: {}
      })),
      createTeam: vi.fn(),
      createProject: vi.fn(),
      sendInvitation: vi.fn(),
      resendInvitation: vi.fn(),
      acceptInvitation: vi.fn(),
      revokeInvitation: vi.fn(),
      getMailConfig: vi.fn(),
      saveMailConfig: vi.fn(),
      testMailConfig: vi.fn()
    }

    Object.defineProperty(window, 'api', {
      configurable: true,
      writable: true,
      value: { team: api }
    })

    const onChange = vi.fn()
    render(<TeamKanbanBoardView board={makeSampleBoard()} projectId="proj-1" onChange={onChange} />)

    const factoryCardBtns = screen.getAllByRole('button', { name: /factory/i })
    const cardTrigger = factoryCardBtns.find((btn) =>
      btn.getAttribute('title')?.includes('pipeline completo')
    )
    expect(cardTrigger).toBeDefined()
    fireEvent.click(cardTrigger!)

    await waitFor(() => {
      expect(api.startFactoryRun).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByText(/Revisión Humana Requerida/i)).toBeDefined()
    expect(screen.getByText(/Se modificó archivo protegido auth\/policy\.ts/i)).toBeDefined()

    const approveBtn = screen.getByRole('button', { name: /aprobar/i })
    fireEvent.click(approveBtn)

    await waitFor(() => {
      expect(api.resolveFactoryHumanGate).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'factory-run-1',
          decision: 'approve'
        })
      )
    })
  })
})
