import { describe, expect, it, vi } from 'vitest'
import type { TeamKanbanCard } from '../../shared/teamwork/team-kanban-types'
import {
  buildKanbanCardsFromExternalIssues,
  fetchGitHubIssues,
  fetchLinearIssues,
  type ExternalTeamIssue
} from './team-issue-importer'

describe('team-issue-importer', () => {
  describe('fetchGitHubIssues', () => {
    it('ejecuta gh issue list asíncronamente con runProcess y mapea issues válidos', async () => {
      const runProcessFn = vi.fn(async () => ({
        code: 0,
        signal: null,
        stdout: JSON.stringify([
          {
            number: 42,
            title: 'Soporte para importación desde GitHub',
            body: 'Detalle del issue',
            url: 'https://github.com/orca/teams/issues/42',
            labels: [{ name: 'high' }, { name: 'enhancement' }],
            state: 'OPEN'
          },
          {
            number: 'invalid',
            title: 'Entrada corrupta'
          }
        ]),
        stderr: '',
        timedOut: false
      }))

      const issues = await fetchGitHubIssues({
        repoPath: '/repo/orca',
        limit: 15,
        hydrateShellPath: async () => undefined,
        resolveExecutable: async () => '/usr/local/bin/gh',
        runProcessFn
      })

      expect(runProcessFn).toHaveBeenCalledWith({
        program: '/usr/local/bin/gh',
        args: ['issue', 'list', '--json', 'number,title,body,url,labels,state', '--limit', '15'],
        cwd: '/repo/orca',
        timeoutMs: 20_000
      })

      expect(issues).toEqual([
        {
          provider: 'github',
          id: '42',
          key: '#42',
          title: 'Soporte para importación desde GitHub',
          description: 'Detalle del issue',
          url: 'https://github.com/orca/teams/issues/42',
          labels: ['high', 'enhancement'],
          priority: 'high',
          state: 'OPEN'
        }
      ])
    })

    it('propaga error cuando gh CLI falla con código distinto de 0', async () => {
      const runProcessFn = vi.fn(async () => ({
        code: 1,
        signal: null,
        stdout: '',
        stderr: 'gh: not logged into any GitHub hosts',
        timedOut: false
      }))

      await expect(
        fetchGitHubIssues({
          repoPath: '/repo/orca',
          hydrateShellPath: async () => undefined,
          resolveExecutable: async () => 'gh',
          runProcessFn
        })
      ).rejects.toThrow('gh: not logged into any GitHub hosts')
    })
  })

  describe('fetchLinearIssues', () => {
    it('consulta GraphQL de Linear con fetch y mapea prioridades y etiquetas', async () => {
      const fetchFn = vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              issues: {
                nodes: [
                  {
                    id: 'lin-uuid-1',
                    identifier: 'ENG-101',
                    title: 'Sincronizar tablero CRDT',
                    description: 'Revisar reconexión WebSocket',
                    url: 'https://linear.app/orca/issue/ENG-101',
                    priority: 1,
                    state: { name: 'Todo', type: 'unstarted' },
                    labels: { nodes: [{ name: 'realtime' }, { name: 'sync' }] }
                  }
                ]
              }
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )

      const issues = await fetchLinearIssues({
        apiKey: 'lin_api_test_123',
        teamKey: 'eng',
        limit: 20,
        fetchFn
      })

      expect(fetchFn).toHaveBeenCalledTimes(1)
      expect(issues).toEqual([
        {
          provider: 'linear',
          id: 'lin-uuid-1',
          key: 'ENG-101',
          title: 'Sincronizar tablero CRDT',
          description: 'Revisar reconexión WebSocket',
          url: 'https://linear.app/orca/issue/ENG-101',
          labels: ['realtime', 'sync'],
          priority: 'urgent',
          state: 'Todo'
        }
      ])
    })

    it('lanza error claro cuando la API key es inválida (401)', async () => {
      const fetchFn = vi.fn(async () => new Response('Unauthorized', { status: 401 }))

      await expect(
        fetchLinearIssues({ apiKey: 'bad-key', fetchFn })
      ).rejects.toThrow('API key de Linear inválida o sin permisos.')
    })
  })

  describe('buildKanbanCardsFromExternalIssues', () => {
    it('convierte issues seleccionados omitiendo duplicados por externalIssueRef', () => {
      const existingCards: Record<string, TeamKanbanCard> = {
        'card-1': {
          id: 'card-1',
          title: 'Existente',
          description: '',
          columnId: 'col-backlog',
          priority: 'medium',
          labels: [],
          checklist: [],
          externalIssueRef: {
            provider: 'github',
            id: '42',
            key: '#42',
            url: 'https://github.com/orca/teams/issues/42'
          },
          createdAt: 1000,
          updatedAt: 1000
        }
      }

      const incoming: ExternalTeamIssue[] = [
        {
          provider: 'github',
          id: '42',
          key: '#42',
          title: 'Duplicado',
          description: 'Debe omitirse',
          url: 'https://github.com/orca/teams/issues/42',
          labels: ['bug'],
          priority: 'high',
          state: 'OPEN'
        },
        {
          provider: 'linear',
          id: 'lin-99',
          key: 'ENG-99',
          title: 'Nuevo issue Linear',
          description: 'Implementar importador',
          url: 'https://linear.app/orca/issue/ENG-99',
          labels: ['frontend', 'frontend'],
          priority: 'urgent',
          state: 'In Progress'
        }
      ]

      const cards = buildKanbanCardsFromExternalIssues(incoming, {
        existingCards,
        targetColumnId: 'col-todo',
        now: 5000
      })

      expect(cards).toHaveLength(1)
      expect(cards[0]).toMatchObject({
        title: 'Nuevo issue Linear',
        description: 'Implementar importador',
        columnId: 'col-todo',
        priority: 'urgent',
        labels: ['frontend'],
        externalIssueRef: {
          provider: 'linear',
          id: 'lin-99',
          key: 'ENG-99',
          url: 'https://linear.app/orca/issue/ENG-99'
        }
      })
    })
  })
})
