// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamAgentExecutionModal } from './TeamAgentExecutionModal'
import type { AgentExecutionRecord } from '../../../../../shared/teamwork/team-workspace-types'

function createSampleExecution(status: AgentExecutionRecord['status']): AgentExecutionRecord {
  return {
    id: 'exec-test-1',
    taskId: 'card-1',
    projectId: 'proj-1',
    agentId: 'Codex',
    agentType: 'orchestration',
    model: 'claude-3-5-sonnet',
    status,
    prompt: '# Prompt test',
    branchOrWorktree: 'feat/test-branch',
    idempotencyKey: 'key-1',
    logs: [
      { timestamp: 1000, level: 'info', message: 'Iniciando tarea agéntica...' },
      { timestamp: 2000, level: 'warn', message: 'Advertencia detectada.' },
      { timestamp: 3000, level: 'error', message: 'Fallo temporal recuperado.' }
    ],
    outputSummary: status === 'completed' ? 'Cambios aplicados con éxito.' : undefined,
    createdAt: 1000,
    updatedAt: 3000
  }
}

describe('TeamAgentExecutionModal', () => {
  it('no renderiza nada si execution es null', () => {
    const { container } = render(
      <TeamAgentExecutionModal
        open={true}
        cardTitle="Tarjeta Test"
        execution={null}
        onOpenChange={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renderiza metadatos del agente, rama y logs en streaming', () => {
    const execution = createSampleExecution('running')
    render(
      <TeamAgentExecutionModal
        open={true}
        cardTitle="Crear endpoint"
        execution={execution}
        onOpenChange={vi.fn()}
      />
    )

    expect(screen.getByText('Ejecución Agéntica: Crear endpoint')).toBeDefined()
    expect(screen.getByText('Codex')).toBeDefined()
    expect(screen.getByText('(claude-3-5-sonnet)')).toBeDefined()
    expect(screen.getByText('feat/test-branch')).toBeDefined()
    expect(screen.getByText('Iniciando tarea agéntica...')).toBeDefined()
    expect(screen.getByText('Advertencia detectada.')).toBeDefined()
    expect(screen.getByText('Fallo temporal recuperado.')).toBeDefined()
  })

  it('muestra el resumen de salida cuando la ejecución está completada', () => {
    const execution = createSampleExecution('completed')
    render(
      <TeamAgentExecutionModal
        open={true}
        cardTitle="Crear endpoint"
        execution={execution}
        onOpenChange={vi.fn()}
      />
    )

    expect(screen.getByText('Resumen de Salida')).toBeDefined()
    expect(screen.getByText('Cambios aplicados con éxito.')).toBeDefined()
  })

  it('permite cancelar la ejecución en curso llamando onCancel', () => {
    const execution = createSampleExecution('running')
    const onCancel = vi.fn()

    render(
      <TeamAgentExecutionModal
        open={true}
        cardTitle="Crear endpoint"
        execution={execution}
        onOpenChange={vi.fn()}
        onCancel={onCancel}
      />
    )

    const cancelBtn = screen.getByText('Cancelar Ejecución')
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledWith('exec-test-1')
  })

  it('muestra la puerta de aprobación humana y dispara onApprove / onReject cuando waiting_for_input', () => {
    const execution: AgentExecutionRecord = {
      ...createSampleExecution('waiting_for_input'),
      worktreePath: '/tmp/repo/.orca/team-worktrees/card-1',
      baseBranch: 'main',
      approvalStatus: 'pending',
      changedFiles: ['M src/App.tsx']
    }
    const onApprove = vi.fn()
    const onReject = vi.fn()

    render(
      <TeamAgentExecutionModal
        open={true}
        cardTitle="Aprobar PR"
        execution={execution}
        onOpenChange={vi.fn()}
        onApprove={onApprove}
        onReject={onReject}
      />
    )

    expect(screen.getByText('M src/App.tsx')).toBeDefined()
    fireEvent.click(screen.getByText('Aprobar y Fusionar a main'))
    expect(onApprove).toHaveBeenCalledWith('exec-test-1', true)

    fireEvent.click(screen.getByText('Rechazar y Descartar Worktree'))
    expect(onReject).toHaveBeenCalledWith('exec-test-1', true)
  })

  it('muestra la opción Aprobar y abrir PR/MR y el enlace con Actualizar estado', () => {
    const waitingExecution: AgentExecutionRecord = {
      ...createSampleExecution('waiting_for_input'),
      worktreePath: '/tmp/repo/.orca/team-worktrees/card-1',
      baseBranch: 'main',
      approvalStatus: 'pending'
    }
    const onApproveAndCreateReview = vi.fn()

    const { rerender } = render(
      <TeamAgentExecutionModal
        open={true}
        cardTitle="Aprobar PR"
        execution={waitingExecution}
        onOpenChange={vi.fn()}
        onApprove={vi.fn()}
        onApproveAndCreateReview={onApproveAndCreateReview}
      />
    )

    fireEvent.click(screen.getByText('Aprobar y abrir PR/MR'))
    expect(onApproveAndCreateReview).toHaveBeenCalledWith('exec-test-1')

    const withReviewExecution: AgentExecutionRecord = {
      ...createSampleExecution('completed'),
      approvalStatus: 'approved',
      reviewRequest: {
        provider: 'gitlab',
        number: 55,
        url: 'https://gitlab.com/org/repo/-/merge_requests/55',
        state: 'open'
      }
    }
    const onRefreshReviewRequest = vi.fn()

    rerender(
      <TeamAgentExecutionModal
        open={true}
        cardTitle="Aprobar PR"
        execution={withReviewExecution}
        onOpenChange={vi.fn()}
        onRefreshReviewRequest={onRefreshReviewRequest}
      />
    )

    expect(screen.getByText('GitLab MR #55')).toBeDefined()
    expect(screen.getByText('Abierto')).toBeDefined()
    const link = screen.getByRole('link', {
      name: /gitlab\.com\/org\/repo\/-\/merge_requests\/55/i
    })
    expect(link.getAttribute('href')).toBe('https://gitlab.com/org/repo/-/merge_requests/55')

    fireEvent.click(screen.getByText('Actualizar estado'))
    expect(onRefreshReviewRequest).toHaveBeenCalledWith('exec-test-1')
  })
})
