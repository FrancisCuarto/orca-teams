// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TeamInboxItem } from '../../../../../shared/teamwork/team-inbox-types'
import { TeamInboxPopover } from './TeamInboxPopover'

function createSampleInboxItems(): TeamInboxItem[] {
  return [
    {
      id: 'act-1',
      activityId: 'act-1',
      kind: 'approval',
      title: 'Aprobación requerida',
      summary: 'claude-code finalizó y espera aprobación humana',
      actorId: 'claude-code',
      actorName: 'claude-code',
      actorType: 'agent',
      targetTab: 'kanban',
      targetType: 'execution',
      targetId: 'exec-1',
      createdAt: 1700000000000,
      read: false
    },
    {
      id: 'act-2',
      activityId: 'act-2',
      kind: 'invitation',
      title: 'Invitación de equipo',
      summary: 'Invitó a francis@orca.run como admin',
      actorId: 'usr-alice',
      actorName: 'Alice',
      actorType: 'human',
      targetTab: 'activity',
      targetType: 'invitation',
      targetId: 'inv-1',
      createdAt: 1699999000000,
      read: true
    }
  ]
}

describe('TeamInboxPopover', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('muestra el contador de no leídos y permite marcar leído y saltar al tab', () => {
    const items = createSampleInboxItems()
    const onMarkAsRead = vi.fn()
    const onMarkAllAsRead = vi.fn()
    const onSelectTab = vi.fn()

    render(
      <TeamInboxPopover
        items={items}
        unreadCount={1}
        onMarkAsRead={onMarkAsRead}
        onMarkAllAsRead={onMarkAllAsRead}
        onSelectTab={onSelectTab}
      />
    )

    expect(screen.getByTestId('team-inbox-unread-badge').textContent).toBe('1')

    fireEvent.click(screen.getByTestId('team-inbox-trigger'))

    expect(screen.getByText('Aprobación requerida')).toBeDefined()
    expect(screen.getByText('Invitación de equipo')).toBeDefined()

    fireEvent.click(screen.getByTestId('team-inbox-item-act-1'))
    expect(onMarkAsRead).toHaveBeenCalledWith('act-1')
    expect(onSelectTab).toHaveBeenCalledWith('kanban', items[0])
  })

  it('permite marcar todas como leídas desde la cabecera del popover', () => {
    const items = createSampleInboxItems()
    const onMarkAllAsRead = vi.fn()

    render(
      <TeamInboxPopover
        items={items}
        unreadCount={1}
        onMarkAsRead={vi.fn()}
        onMarkAllAsRead={onMarkAllAsRead}
        onSelectTab={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('team-inbox-trigger'))
    fireEvent.click(screen.getByRole('button', { name: /leer todo/i }))

    expect(onMarkAllAsRead).toHaveBeenCalledTimes(1)
  })
})
