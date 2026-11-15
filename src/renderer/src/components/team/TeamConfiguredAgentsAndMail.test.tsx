// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TeamMembersSidebar } from './kanban/TeamMembersSidebar'
import { TeamMembersModal } from './workspace/TeamMembersModal'
import { TeamKanbanBoardView } from './kanban/TeamKanbanBoardView'
import type { TeamKanbanBoard } from '../../../../shared/teamwork/team-kanban-types'
import type { ConfiguredTeamAgent, TeamApi } from '../../../../shared/teamwork/team-ipc-types'
import type { AgentExecutionRecord } from '../../../../shared/teamwork/team-workspace-types'

function createSampleBoard(projectId: string): TeamKanbanBoard {
  return {
    id: `board-${projectId}`,
    projectId,
    title: 'Tablero Test',
    columns: [
      { id: 'col-todo', title: 'Por hacer', cardIds: [] },
      { id: 'col-in-progress', title: 'En progreso', cardIds: [] }
    ],
    cards: {},
    createdAt: 1000,
    updatedAt: 1000
  }
}

function installMockTeamApi(overrides: Partial<TeamApi>) {
  const noopUnsub = () => () => {}
  const api: TeamApi = {
    listConfiguredAgents: vi.fn(async () => []),
    startExecution: vi.fn(async (req): Promise<AgentExecutionRecord> => {
      const now = Date.now()
      return {
        id: 'exec-1',
        taskId: req.card.id,
        projectId: req.projectId,
        agentId: 'opencode',
        agentType: req.card.assignee?.agentType ?? 'opencode',
        model: req.card.assignee?.model ?? 'opencode-go/glm-5.3',
        status: 'running',
        prompt: 'test',
        logs: [{ timestamp: 1, level: 'info', message: 'Iniciado' }],
        idempotencyKey: `idem-${req.card.id}`,
        startedAt: now,
        createdAt: now,
        updatedAt: now
      }
    }),
    cancelExecution: vi.fn(async () => null),
    approveExecution: vi.fn(async () => null),
    rejectExecution: vi.fn(async () => null),
    getExecution: vi.fn(async () => null),
    getLatestExecutionForCard: vi.fn(async () => null),
    onExecutionEvent: vi.fn(noopUnsub),
    getFactoryConfig: vi.fn(),
    saveFactoryConfig: vi.fn(),
    startFactoryRun: vi.fn(),
    cancelFactoryRun: vi.fn(async () => null),
    resolveFactoryHumanGate: vi.fn(async () => null),
    getFactoryRun: vi.fn(async () => null),
    getLatestFactoryRunForCard: vi.fn(async () => null),
    listFactoryRuns: vi.fn(async () => []),
    onFactoryEvent: vi.fn(noopUnsub),
    onDeepLinkJoin: vi.fn(noopUnsub),
    consumePendingDeepLinkJoin: vi.fn(async () => null),
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
    testMailConfig: vi.fn(),
    listActivity: vi.fn(async () => []),
    recordActivity: vi.fn(),
    getCurrentUser: vi.fn(),
    updateUserProfile: vi.fn(),
    requestMagicLinkCode: vi.fn(),
    verifyMagicLinkCode: vi.fn(),
    getSyncStatus: vi.fn(),
    configureSync: vi.fn(),
    listCardComments: vi.fn(async () => []),
    addCardComment: vi.fn(async (req) => ({
      id: req.id ?? 'cmt-mock',
      cardId: req.cardId,
      projectId: req.projectId,
      authorId: req.authorId,
      authorName: req.authorName,
      authorType: req.authorType ?? 'human',
      body: req.body,
      mentions: req.mentions ?? [],
      createdAt: req.createdAt ?? Date.now()
    })),
    deleteCardComment: vi.fn(async () => true),
    ...overrides
  }
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: { team: api, ui: { writeClipboardText: vi.fn(async () => true) } }
  })
  return api
}

describe('Teams configured agents, immediate execution & honest email UI', () => {
  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(window, 'api')
  })

  it('muestra estado vacío honesto en el panel cuando no hay agentes instalados/configurados', () => {
    render(
      <TeamMembersSidebar
        selectedFilterMember={null}
        workloadByAssignee={{}}
        installedAgents={[]}
        humanMembers={[]}
        onFilterChange={vi.fn()}
      />
    )
    expect(screen.getByText(/no hay agentes cli configurados en este equipo/i)).toBeDefined()
    expect(screen.queryByText('Codex')).toBeNull()
  })

  it('ejecuta inmediatamente el agente configurado al asignarlo desde la tarjeta Kanban', async () => {
    const configuredAgent: ConfiguredTeamAgent = {
      id: 'opencode',
      name: 'OpenCode',
      role: 'Agent CLI',
      command: 'opencode',
      color: '#10b981',
      configured: true,
      configSource: '~/.config/opencode/cli.json',
      models: ['opencode-go/glm-5.3'],
      defaultModel: 'opencode-go/glm-5.3',
      defaultSkills: ['Code']
    }
    const api = installMockTeamApi({
      listConfiguredAgents: vi.fn(async () => [configuredAgent])
    })

    const board = createSampleBoard('proj-1')
    render(<TeamKanbanBoardView board={board} projectId="proj-1" onChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('OpenCode')).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /nueva tarea/i }))
    fireEvent.change(screen.getByPlaceholderText(/implementar arquitectura limpia/i), {
      target: { value: 'Implementar auth OAuth' }
    })

    fireEvent.click(screen.getByRole('button', { name: /agente ia/i }))
    const agentSelect = screen.getByLabelText(/agente ia/i)
    fireEvent.change(agentSelect, { target: { value: 'OpenCode' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar tarea/i }))

    await waitFor(() => {
      expect(api.startExecution).toHaveBeenCalledTimes(1)
    })
  })

  it('avisa honestamente cuando el email de invitación NO se envió y despliega la config SMTP', async () => {
    const onInviteMember = vi.fn(async () => ({
      invitation: {
        id: 'inv-1',
        teamId: 't-1',
        email: 'dev@empresa.com',
        role: 'member' as const,
        token: 'inv-abc123',
        invitedBy: 'usr-francis',
        status: 'pending' as const,
        expiresAt: Date.now() + 86400_000,
        createdAt: Date.now()
      },
      joinUrl: 'orca://team/join?token=inv-abc123',
      emailSent: false,
      needsMailConfig: true,
      error: 'No hay servidor SMTP configurado'
    }))

    render(
      <TeamMembersModal
        open={true}
        teamName="Core"
        members={[]}
        userRole="owner"
        onOpenChange={vi.fn()}
        onInviteMember={onInviteMember}
        onSaveMailConfig={vi.fn()}
        onTestMailConfig={vi.fn()}
      />
    )

    fireEvent.change(screen.getByPlaceholderText(/correo@equipo\.com/i), {
      target: { value: 'dev@empresa.com' }
    })
    fireEvent.click(screen.getByRole('button', { name: /^invitar$/i }))

    await waitFor(() => {
      expect(screen.getByText(/el correo no se envió/i)).toBeDefined()
      expect(screen.getByText(/transporte de correo/i)).toBeDefined()
    })
  })
})
