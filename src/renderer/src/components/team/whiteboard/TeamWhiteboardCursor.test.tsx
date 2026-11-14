// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TeamWhiteboardCursor } from './TeamWhiteboardCursor'
import { TeamWhiteboardView } from './TeamWhiteboardView'
import type { TeamWhiteboard } from '../../../../../shared/teamwork/team-kanban-types'
import type { WhiteboardCursorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'

function createSampleWhiteboard(): TeamWhiteboard {
  return {
    id: 'wb-ui-1',
    projectId: 'proj-ui',
    title: 'Lienzo de Arquitectura',
    items: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: 1000,
    updatedAt: 1000
  }
}

describe('TeamWhiteboardCursor', () => {
  it('renderiza el cursor con nombre y coordenadas', () => {
    const cursor: WhiteboardCursorPresence = {
      userId: 'user-bob',
      displayName: 'Bob (Architect)',
      color: '#ec4899',
      x: 350,
      y: 280,
      lastSeen: Date.now()
    }

    render(<TeamWhiteboardCursor cursor={cursor} />)

    expect(screen.getByText('Bob (Architect)')).toBeDefined()
    const container = screen.getByTestId('remote-cursor-user-bob')
    expect(container.style.transform).toBe('translate(350px, 280px)')
  })

  it('renderiza cursores remotos concurrentes dentro de TeamWhiteboardView', () => {
    const wb = createSampleWhiteboard()
    const onChange = vi.fn()

    const cursors: WhiteboardCursorPresence[] = [
      {
        userId: 'user-alice',
        displayName: 'Alice (Frontend)',
        color: '#3b82f6',
        x: 120,
        y: 200,
        lastSeen: Date.now()
      },
      {
        userId: 'user-charlie',
        displayName: 'Charlie (Backend)',
        color: '#f59e0b',
        x: 450,
        y: 350,
        lastSeen: Date.now()
      }
    ]

    render(<TeamWhiteboardView whiteboard={wb} remoteCursors={cursors} onChange={onChange} />)

    expect(screen.getByText('Alice (Frontend)')).toBeDefined()
    expect(screen.getByText('Charlie (Backend)')).toBeDefined()
  })
})
