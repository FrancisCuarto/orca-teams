import { describe, expect, it } from 'vitest'
import type {
  ExtendedTeamMember,
  TeamKanbanBoard,
  TeamKanbanCard,
  TeamNotesCollection
} from '../../../../../shared/teamwork/team-kanban-types'
import {
  collectBoardAssignees,
  collectBoardLabels,
  countMyPendingCards,
  DEFAULT_TEAM_KANBAN_FILTER_STATE,
  filterKanbanCards,
  hasActiveKanbanFilters,
  searchTeamWorkspace
} from './team-kanban-filters'

const MEMBERS: ExtendedTeamMember[] = [
  {
    id: 'usr-francis',
    name: 'Francis (Lead)',
    type: 'human',
    role: 'OWNER'
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    type: 'agent',
    agentType: 'opencode',
    role: 'Agent CLI'
  }
]

const CARDS: TeamKanbanCard[] = [
  {
    id: 'card-1',
    title: 'Implementar OAuth2 y RBAC',
    description: 'Endpoints de autenticación y refresh tokens',
    columnId: 'col-backlog',
    priority: 'high',
    assignee: { type: 'human', name: 'Francis (Lead)' },
    labels: ['Backend', 'Security'],
    checklist: [{ id: 'c1', text: 'Diagrama secuencia', done: false }],
    branchOrWorktree: 'feat/oauth2',
    createdAt: 1000,
    updatedAt: 1000
  },
  {
    id: 'card-2',
    title: 'Optimizar bundle de Vite',
    description: 'Reducir dependencias pesadas',
    columnId: 'col-in-progress',
    priority: 'medium',
    assignee: { type: 'agent', name: 'OpenCode', agentType: 'opencode' },
    labels: ['Performance', 'Build'],
    checklist: [],
    createdAt: 2000,
    updatedAt: 2000
  },
  {
    id: 'card-3',
    title: 'Definir estrategia de caché',
    description: 'Evaluar caché local en SQLite',
    columnId: 'col-todo',
    priority: 'urgent',
    labels: ['Backend'],
    checklist: [],
    blockedReason: 'Esperando benchmark',
    createdAt: 3000,
    updatedAt: 3000
  }
]

const SAMPLE_BOARD: TeamKanbanBoard = {
  id: 'board-1',
  projectId: 'proj-1',
  title: 'Sprint 1',
  columns: [
    { id: 'col-backlog', title: 'Backlog', cardIds: ['card-1'] },
    { id: 'col-todo', title: 'Por Hacer', cardIds: ['card-3'] },
    { id: 'col-in-progress', title: 'En Progreso', cardIds: ['card-2'] }
  ],
  cards: {
    'card-1': CARDS[0],
    'card-2': CARDS[1],
    'card-3': CARDS[2]
  },
  createdAt: 1000,
  updatedAt: 1000
}

const SAMPLE_NOTES: TeamNotesCollection = {
  projectId: 'proj-1',
  updatedAt: 2000,
  notes: [
    {
      id: 'note-1',
      title: 'ADR-001: Autenticación OAuth2',
      content: 'Decisión sobre tokens JWT y RBAC por proyecto.',
      category: 'adr',
      status: 'accepted',
      author: 'Francis (Lead)',
      tags: ['Security', 'OAuth2'],
      createdAt: 1000,
      updatedAt: 1000
    },
    {
      id: 'note-2',
      title: 'Spec: Cola de Agentes',
      content: 'Protocolo de aprobación waiting_for_input antes de merge.',
      category: 'spec',
      status: 'proposed',
      author: 'OpenCode',
      tags: ['Agents'],
      createdAt: 2000,
      updatedAt: 2000
    }
  ]
}

describe('team-kanban-filters', () => {
  it('filters cards by query, priority, label, and assignee including unassigned', () => {
    const context = {
      currentUserId: 'usr-francis',
      currentUserName: 'Francis (Lead)',
      pendingApprovalCardIds: new Set<string>(),
      members: MEMBERS
    }

    expect(
      filterKanbanCards(
        CARDS,
        { ...DEFAULT_TEAM_KANBAN_FILTER_STATE, query: 'oauth' },
        context
      ).map((c) => c.id)
    ).toEqual(['card-1'])

    expect(
      filterKanbanCards(
        CARDS,
        { ...DEFAULT_TEAM_KANBAN_FILTER_STATE, priority: 'urgent' },
        context
      ).map((c) => c.id)
    ).toEqual(['card-3'])

    expect(
      filterKanbanCards(
        CARDS,
        { ...DEFAULT_TEAM_KANBAN_FILTER_STATE, label: 'backend' },
        context
      ).map((c) => c.id)
    ).toEqual(['card-1', 'card-3'])

    expect(
      filterKanbanCards(
        CARDS,
        { ...DEFAULT_TEAM_KANBAN_FILTER_STATE, assigneeId: 'unassigned' },
        context
      ).map((c) => c.id)
    ).toEqual(['card-3'])

    expect(
      filterKanbanCards(
        CARDS,
        { ...DEFAULT_TEAM_KANBAN_FILTER_STATE, assigneeId: 'opencode' },
        context
      ).map((c) => c.id)
    ).toEqual(['card-2'])
  })

  it('counts and filters "Mis pendientes" by current user assignment or waiting_for_input approval', () => {
    const context = {
      currentUserId: 'usr-francis',
      currentUserName: 'Francis (Lead)',
      pendingApprovalCardIds: new Set(['card-2']),
      members: MEMBERS
    }

    expect(countMyPendingCards(CARDS, context)).toBe(2)
    expect(
      filterKanbanCards(
        CARDS,
        { ...DEFAULT_TEAM_KANBAN_FILTER_STATE, onlyMyPending: true },
        context
      ).map((c) => c.id)
    ).toEqual(['card-1', 'card-2'])
  })

  it('collects unique sorted labels, assignees, and detects active filters', () => {
    expect(collectBoardLabels(CARDS)).toEqual(['Backend', 'Build', 'Performance', 'Security'])
    expect(collectBoardAssignees(CARDS, MEMBERS)).toEqual([
      { value: 'usr-francis', label: 'Francis (Lead)', kind: 'human' },
      { value: 'opencode', label: 'OpenCode (IA)', kind: 'agent' }
    ])
    expect(hasActiveKanbanFilters(DEFAULT_TEAM_KANBAN_FILTER_STATE)).toBe(false)
    expect(
      hasActiveKanbanFilters({ ...DEFAULT_TEAM_KANBAN_FILTER_STATE, onlyMyPending: true })
    ).toBe(true)
  })

  it('searches across Kanban cards and Notes/ADRs with column context', () => {
    const oauthResult = searchTeamWorkspace(SAMPLE_BOARD, SAMPLE_NOTES, 'OAuth2')
    expect(oauthResult.totalCount).toBe(2)
    expect(oauthResult.cards.map((m) => m.card.id)).toEqual(['card-1'])
    expect(oauthResult.cards[0]?.columnTitle).toBe('Backlog')
    expect(oauthResult.notes.map((m) => m.note.id)).toEqual(['note-1'])

    const emptyResult = searchTeamWorkspace(SAMPLE_BOARD, SAMPLE_NOTES, '   ')
    expect(emptyResult).toEqual({ cards: [], notes: [], totalCount: 0 })
  })
})
