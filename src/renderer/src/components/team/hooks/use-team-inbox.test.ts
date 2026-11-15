// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { TeamActivityEntry } from '../../../../../shared/teamwork/team-workspace-types'
import { useTeamInbox } from './use-team-inbox'

function createSampleActivities(): TeamActivityEntry[] {
  return [
    {
      id: 'act-assign-1',
      teamId: 'team-1',
      projectId: 'proj-1',
      actorId: 'usr-alice',
      actorName: 'Alice',
      actorType: 'human',
      action: 'card.assigned',
      targetType: 'card',
      targetId: 'card-42',
      summary: 'Alice asignó la tarjeta "Auth JWT" a Francis',
      metadata: { assigneeId: 'usr-francis' },
      createdAt: 4000
    },
    {
      id: 'act-mention-1',
      teamId: 'team-1',
      projectId: 'proj-1',
      actorId: 'usr-bob',
      actorName: 'Bob',
      actorType: 'human',
      action: 'note.commented',
      targetType: 'note',
      targetId: 'note-1',
      summary: 'Revisa el ADR @francis antes del merge',
      createdAt: 3000
    },
    {
      id: 'act-invite-1',
      teamId: 'team-1',
      actorId: 'usr-alice',
      actorName: 'Alice',
      actorType: 'human',
      action: 'invitation.sent',
      targetType: 'invitation',
      targetId: 'inv-9',
      summary: 'Invitó a francis@orca.run como admin',
      createdAt: 2000
    },
    {
      id: 'act-approval-1',
      teamId: 'team-1',
      projectId: 'proj-1',
      actorId: 'claude-code',
      actorName: 'claude-code',
      actorType: 'agent',
      action: 'execution.waiting_for_input',
      targetType: 'execution',
      targetId: 'exec-7',
      summary: 'claude-code finalizó y espera aprobación humana (feat/auth)',
      createdAt: 5000
    },
    {
      id: 'act-other-1',
      teamId: 'team-1',
      projectId: 'proj-1',
      actorId: 'usr-bob',
      actorName: 'Bob',
      actorType: 'human',
      action: 'card.assigned',
      targetType: 'card',
      targetId: 'card-99',
      summary: 'Bob asignó tarjeta a Alice',
      metadata: { assigneeId: 'usr-alice' },
      createdAt: 6000
    }
  ]
}

describe('useTeamInbox', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('filtra asignaciones, menciones, invitaciones y aprobaciones para el usuario actual', () => {
    const activities = createSampleActivities()
    const { result } = renderHook(() =>
      useTeamInbox({
        teamId: 'team-1',
        projectId: 'proj-1',
        currentUser: {
          userId: 'usr-francis',
          displayName: 'Francis',
          email: 'francis@orca.run'
        },
        activities
      })
    )

    expect(result.current.items).toHaveLength(4)
    expect(result.current.unreadCount).toBe(4)
    expect(result.current.items.map((i) => i.id)).toEqual([
      'act-approval-1',
      'act-assign-1',
      'act-mention-1',
      'act-invite-1'
    ])
    expect(result.current.items[0]?.targetTab).toBe('kanban')
    expect(result.current.items[1]?.targetTab).toBe('kanban')
    expect(result.current.items[2]?.targetTab).toBe('notes')
    expect(result.current.items[3]?.targetTab).toBe('activity')
  })

  it('persiste markAsRead y markAllAsRead por usuario en localStorage', () => {
    const activities = createSampleActivities()
    const { result, unmount } = renderHook(() =>
      useTeamInbox({
        teamId: 'team-1',
        projectId: 'proj-1',
        currentUser: {
          userId: 'usr-francis',
          displayName: 'Francis',
          email: 'francis@orca.run'
        },
        activities
      })
    )

    act(() => {
      result.current.markAsRead('act-assign-1')
    })

    expect(result.current.unreadCount).toBe(3)
    expect(result.current.items.find((i) => i.id === 'act-assign-1')?.read).toBe(true)

    unmount()

    const { result: remounted } = renderHook(() =>
      useTeamInbox({
        teamId: 'team-1',
        projectId: 'proj-1',
        currentUser: {
          userId: 'usr-francis',
          displayName: 'Francis',
          email: 'francis@orca.run'
        },
        activities
      })
    )

    expect(remounted.current.unreadCount).toBe(3)
    expect(remounted.current.items.find((i) => i.id === 'act-assign-1')?.read).toBe(true)

    act(() => {
      remounted.current.markAllAsRead()
    })

    expect(remounted.current.unreadCount).toBe(0)
    expect(remounted.current.items.every((i) => i.read)).toBe(true)
  })
})
