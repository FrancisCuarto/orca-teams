// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeamKanbanCardAgentBadge } from './TeamKanbanCardAgentBadge'
import type { TeamKanbanCard } from '../../../../../shared/teamwork/team-kanban-types'

function createSampleCard(isAgent: boolean): TeamKanbanCard {
  return {
    id: 'card-1',
    title: 'Tarea Test',
    description: 'Desc',
    columnId: 'col-todo',
    priority: 'high',
    assignee: isAgent
      ? { type: 'agent', name: 'Codex', model: 'claude-3-5-sonnet', agentType: 'orchestration' }
      : { type: 'human', name: 'Francis' },
    labels: [],
    checklist: [],
    createdAt: 1000,
    updatedAt: 1000
  }
}

describe('TeamKanbanCardAgentBadge', () => {
  it('no renderiza nada si no hay assignee', () => {
    const card = { ...createSampleCard(false), assignee: undefined }
    const { container } = render(<TeamKanbanCardAgentBadge card={card} />)
    expect(container.firstChild).toBeNull()
  })

  it('renderiza badge para miembro humano sin botones de agente', () => {
    const card = createSampleCard(false)
    render(<TeamKanbanCardAgentBadge card={card} assignee={card.assignee} />)

    expect(screen.getByText('Francis')).toBeDefined()
    expect(screen.queryByText('Ejecutar')).toBeNull()
  })

  it('renderiza botón de ejecución rápida para agentes no en ejecución', () => {
    const card = createSampleCard(true)
    const onDispatch = vi.fn()

    render(
      <TeamKanbanCardAgentBadge card={card} assignee={card.assignee} onDispatchAgent={onDispatch} />
    )

    expect(screen.getByText('Codex')).toBeDefined()
    const execBtn = screen.getByText('Ejecutar')
    fireEvent.click(execBtn)
    expect(onDispatch).toHaveBeenCalledWith(card)
  })

  it('muestra badge animado de ejecución activa y llama a onViewExecution al hacer clic', () => {
    const card = createSampleCard(true)
    const onView = vi.fn()

    render(
      <TeamKanbanCardAgentBadge
        card={card}
        assignee={card.assignee}
        executionStatus="running"
        onViewExecution={onView}
      />
    )

    expect(screen.getByText(/running/i)).toBeDefined()
    const statusBtn = screen.getByTitle(/Ver logs de ejecución/i)
    fireEvent.click(statusBtn)
    expect(onView).toHaveBeenCalledWith(card)
  })

  it('muestra estado completado cuando la ejecución finaliza con éxito', () => {
    const card = createSampleCard(true)
    const onView = vi.fn()

    render(
      <TeamKanbanCardAgentBadge
        card={card}
        assignee={card.assignee}
        executionStatus="completed"
        onViewExecution={onView}
      />
    )

    expect(screen.getByText(/completed/i)).toBeDefined()
  })
})
