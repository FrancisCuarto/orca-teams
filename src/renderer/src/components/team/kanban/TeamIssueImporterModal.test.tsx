// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TeamApi } from '../../../../../shared/teamwork/team-ipc-types'
import type {
  ExternalTeamIssue,
  TeamKanbanCard,
  TeamKanbanColumn
} from '../../../../../shared/teamwork/team-kanban-types'
import { TeamIssueImporterModal } from './TeamIssueImporterModal'

function installFetchExternalIssuesMock(fetchExternalIssues: TeamApi['fetchExternalIssues']): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: {
      team: {
        fetchExternalIssues
      }
    }
  })
}

const SAMPLE_COLUMNS: TeamKanbanColumn[] = [
  { id: 'col-backlog', title: 'Backlog', cardIds: [] },
  { id: 'col-todo', title: 'Por Hacer', cardIds: [] }
]

describe('TeamIssueImporterModal', () => {
  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(window, 'api')
  })

  it('cambia entre GitHub y Linear, muestra badges de duplicados e importa seleccionados', async () => {
    const githubIssues: ExternalTeamIssue[] = [
      {
        provider: 'github',
        id: '10',
        key: '#10',
        title: 'Issue ya importado',
        description: 'Ya existe en tablero',
        url: 'https://github.com/orca/teams/issues/10',
        labels: ['bug'],
        priority: 'high',
        state: 'OPEN'
      },
      {
        provider: 'github',
        id: '11',
        key: '#11',
        title: 'Nuevo issue de GitHub',
        description: 'Pendiente de importar',
        url: 'https://github.com/orca/teams/issues/11',
        labels: ['feature'],
        priority: 'medium',
        state: 'OPEN'
      }
    ]

    const linearIssues: ExternalTeamIssue[] = [
      {
        provider: 'linear',
        id: 'lin-55',
        key: 'ENG-55',
        title: 'Tarea de Linear',
        description: 'Integrar SDK',
        url: 'https://linear.app/orca/issue/ENG-55',
        labels: ['api'],
        priority: 'urgent',
        state: 'Todo'
      }
    ]

    const fetchMock = vi.fn(async (req: Parameters<TeamApi['fetchExternalIssues']>[0]) =>
      req.provider === 'github' ? githubIssues : linearIssues
    )
    installFetchExternalIssuesMock(fetchMock)

    const existingCards: Record<string, TeamKanbanCard> = {
      'card-existing': {
        id: 'card-existing',
        title: 'Issue ya importado',
        description: '',
        columnId: 'col-backlog',
        priority: 'high',
        labels: [],
        checklist: [],
        externalIssueRef: {
          provider: 'github',
          id: '10',
          key: '#10',
          url: 'https://github.com/orca/teams/issues/10'
        },
        createdAt: 1000,
        updatedAt: 1000
      }
    }

    const onImport = vi.fn()
    const onClose = vi.fn()

    render(
      <TeamIssueImporterModal
        isOpen={true}
        columns={SAMPLE_COLUMNS}
        defaultColumnId="col-backlog"
        existingCards={existingCards}
        projectPath="/repo/orca"
        onClose={onClose}
        onImport={onImport}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Cargar issues/i }))

    await waitFor(() => {
      expect(screen.getByText('Issue ya importado')).toBeDefined()
      expect(screen.getByText('Nuevo issue de GitHub')).toBeDefined()
    })
    expect(screen.getByText('Ya importado')).toBeDefined()

    // Cambiar a Linear y probar input de API key
    fireEvent.click(screen.getByRole('button', { name: 'Linear' }))
    const apiKeyInput = screen.getByLabelText(/Linear API Key/i)
    fireEvent.change(apiKeyInput, { target: { value: 'lin_api_secret' } })
    fireEvent.click(screen.getByRole('button', { name: /Cargar issues/i }))

    await waitFor(() => {
      expect(screen.getByText('Tarea de Linear')).toBeDefined()
    })

    // Seleccionar columna destino e issue
    fireEvent.change(screen.getByLabelText('Columna destino'), {
      target: { value: 'col-todo' }
    })
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    fireEvent.click(screen.getByRole('button', { name: /Importar seleccionados/i }))

    expect(onImport).toHaveBeenCalledWith(linearIssues, 'col-todo')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
