// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TeamAgentExecutionModal } from './kanban/TeamAgentExecutionModal'
import { TeamKanbanBoardView } from './kanban/TeamKanbanBoardView'
import { TeamNotesView } from './notes/TeamNotesView'
import { TeamWhiteboardView } from './whiteboard/TeamWhiteboardView'
import type {
  TeamKanbanBoard,
  TeamNotesCollection,
  TeamWhiteboard
} from '../../../../shared/teamwork/team-kanban-types'
import type { AgentExecutionRecord } from '../../../../shared/teamwork/team-workspace-types'

function createBoard(): TeamKanbanBoard {
  return {
    id: 'board-rbac',
    projectId: 'proj-rbac',
    title: 'RBAC Board',
    columns: [
      { id: 'col-todo', title: 'Por hacer', cardIds: ['card-agent'] },
      { id: 'col-done', title: 'Hecho', cardIds: [] }
    ],
    cards: {
      'card-agent': {
        id: 'card-agent',
        title: 'Automatizar pruebas',
        description: 'Detalles',
        columnId: 'col-todo',
        priority: 'high',
        labels: [],
        checklist: [],
        assignee: {
          name: 'Codex',
          type: 'agent',
          agentType: 'codex'
        },
        createdAt: 1000,
        updatedAt: 1000
      }
    },
    createdAt: 1000,
    updatedAt: 1000
  }
}

function createNotes(): TeamNotesCollection {
  return {
    projectId: 'proj-rbac',
    notes: [
      {
        id: 'note-1',
        title: 'Spec RBAC',
        content: '# Spec\n\n- [ ] Tarea pendiente',
        category: 'spec',
        tags: ['RBAC'],
        createdAt: 1000,
        updatedAt: 1000
      }
    ],
    updatedAt: 1000
  }
}

function createWhiteboard(): TeamWhiteboard {
  return {
    id: 'wb-rbac',
    projectId: 'proj-rbac',
    title: 'RBAC Whiteboard',
    viewport: { x: 0, y: 0, zoom: 1 },
    items: [
      {
        id: 'sticky-1',
        type: 'sticky',
        title: 'Nota',
        content: 'Contenido',
        color: 'yellow',
        x: 50,
        y: 50,
        width: 200,
        height: 140
      }
    ],
    createdAt: 1000,
    updatedAt: 1000
  }
}

describe('Team RBAC UI enforcement', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('disables board editing and agent dispatch controls for viewer role', () => {
    const onChange = vi.fn()
    render(<TeamKanbanBoardView board={createBoard()} userRole="viewer" onChange={onChange} />)

    const createBtn = screen.getByRole('button', { name: /nueva tarea/i })
    expect(createBtn.hasAttribute('disabled')).toBe(true)

    const runBtn = screen.getByRole('button', { name: /^ejecutar$/i })
    expect(runBtn.hasAttribute('disabled')).toBe(true)

    const factoryBtns = screen.getAllByRole('button', { name: /^factory$/i })
    expect(factoryBtns.length).toBeGreaterThanOrEqual(1)
    expect(factoryBtns.every((btn) => btn.hasAttribute('disabled'))).toBe(true)

    expect(screen.queryByRole('button', { name: /añadir columna/i })).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables execution approval and rejection buttons when canApproveExecutions is false', () => {
    const onApprove = vi.fn()
    const onReject = vi.fn()
    const execution: AgentExecutionRecord = {
      id: 'exec-rbac-1',
      taskId: 'card-agent',
      projectId: 'proj-rbac',
      agentId: 'Codex',
      agentType: 'codex',
      model: 'gpt-5',
      status: 'waiting_for_input',
      prompt: 'Run',
      worktreePath: '/tmp/wt',
      baseBranch: 'main',
      approvalStatus: 'pending',
      changedFiles: ['M src/app.ts'],
      logs: [],
      idempotencyKey: 'idem-rbac',
      createdAt: 1000,
      updatedAt: 1000
    }

    render(
      <TeamAgentExecutionModal
        open={true}
        cardTitle="Automatizar pruebas"
        execution={execution}
        canApproveExecutions={false}
        canDispatchAgents={false}
        onOpenChange={vi.fn()}
        onApprove={onApprove}
        onReject={onReject}
      />
    )

    const approveMergeBtn = screen.getByRole('button', { name: /aprobar y fusionar/i })
    const rejectBtn = screen.getByRole('button', { name: /rechazar/i })
    expect(approveMergeBtn.hasAttribute('disabled')).toBe(true)
    expect(rejectBtn.hasAttribute('disabled')).toBe(true)

    fireEvent.click(approveMergeBtn)
    fireEvent.click(rejectBtn)
    expect(onApprove).not.toHaveBeenCalled()
    expect(onReject).not.toHaveBeenCalled()
  })

  it('disables note creation, editing, and deletion in readOnly mode', () => {
    const onChange = vi.fn()
    render(
      <TeamNotesView
        notesCollection={createNotes()}
        readOnly={true}
        canExtractToKanban={false}
        onChange={onChange}
        onExtractTasksToKanban={vi.fn()}
      />
    )

    const addAdrBtn = screen.getByRole('button', { name: /\+ adr/i })
    expect(addAdrBtn.hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: /extraer al kanban/i })).toBeNull()

    const titleInput = screen.getByDisplayValue('Spec RBAC')
    expect(titleInput.hasAttribute('disabled')).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables whiteboard drawing tools and blocks canvas mutations in readOnly mode', () => {
    const onChange = vi.fn()
    render(
      <TeamWhiteboardView
        whiteboard={createWhiteboard()}
        readOnly={true}
        canCreateTask={false}
        onChange={onChange}
      />
    )

    const pencilBtn = screen.getByRole('button', { name: 'Lápiz' })
    const rectBtn = screen.getByRole('button', { name: 'Rectángulo' })
    expect(pencilBtn.hasAttribute('disabled')).toBe(true)
    expect(rectBtn.hasAttribute('disabled')).toBe(true)

    const canvas = screen.getByTestId('whiteboard-canvas')
    fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20 })
    fireEvent.mouseMove(canvas, { clientX: 80, clientY: 80 })
    fireEvent.mouseUp(canvas, { clientX: 80, clientY: 80 })

    expect(onChange).not.toHaveBeenCalled()
  })
})
