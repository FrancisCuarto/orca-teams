// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { TeamWhiteboardView } from './TeamWhiteboardView'
import { buildWhiteboardMarkdown, buildWhiteboardSvg } from './whiteboard-export'
import type { TeamWhiteboard } from '../../../../../shared/teamwork/team-kanban-types'

function createSampleBoard(): TeamWhiteboard {
  return {
    id: 'wb-pro-1',
    projectId: 'proj-pro',
    title: 'Arquitectura Pro',
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: 1000,
    updatedAt: 1000,
    items: [
      {
        id: 'card-a',
        type: 'sticky',
        title: 'API Gateway',
        content: 'Autenticación y rate limit',
        color: 'yellow',
        x: 100,
        y: 100,
        width: 200,
        height: 140,
        zIndex: 1
      },
      {
        id: 'card-b',
        type: 'shape',
        shapeKind: 'diamond',
        content: 'Auth Service',
        color: 'blue',
        strokeColor: '#3b82f6',
        strokeWidth: 2,
        fillStyle: 'tinted',
        x: 420,
        y: 110,
        width: 180,
        height: 120,
        zIndex: 2
      }
    ]
  }
}

describe('TeamWhiteboardView Pro', () => {
  const originalApiDescriptor = Object.getOwnPropertyDescriptor(window, 'api')
  const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    if (originalApiDescriptor) {
      Object.defineProperty(window, 'api', originalApiDescriptor)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor)
    } else {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })

  it('muestra la barra contextual al seleccionar un elemento y permite duplicar y eliminar', () => {
    const wb = createSampleBoard()
    const onChange = vi.fn()
    render(<TeamWhiteboardView whiteboard={wb} onChange={onChange} />)

    fireEvent.mouseDown(screen.getByTestId('whiteboard-item-card-a'))
    expect(screen.getByTestId('whiteboard-properties-bar')).toBeDefined()

    fireEvent.click(screen.getByTitle(/duplicar/i))
    expect(onChange).toHaveBeenCalled()
    const duplicatedCall = onChange.mock.calls.at(-1)?.[0]
    expect(duplicatedCall?.items).toHaveLength(3)
  })

  it('permite dibujar un trazo libre con Lápiz y una forma con Rectángulo', () => {
    const wb = createSampleBoard()
    const onChange = vi.fn()
    render(<TeamWhiteboardView whiteboard={wb} onChange={onChange} />)

    const canvas = screen.getByTestId('whiteboard-canvas')

    // Freehand draw
    fireEvent.click(screen.getByRole('button', { name: 'Lápiz' }))
    fireEvent.mouseDown(canvas, { clientX: 50, clientY: 50 })
    fireEvent.mouseMove(canvas, { clientX: 80, clientY: 70 })
    fireEvent.mouseMove(canvas, { clientX: 120, clientY: 95 })
    fireEvent.mouseUp(canvas, { clientX: 120, clientY: 95 })

    const afterDraw = onChange.mock.calls[0]?.[0]
    const drawItem = afterDraw?.items.find((i: { type: string }) => i.type === 'draw')
    expect(drawItem).toBeDefined()
    expect(drawItem?.points?.length).toBeGreaterThanOrEqual(2)

    // Shape draw
    fireEvent.click(screen.getByRole('button', { name: 'Rectángulo' }))
    fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20 })
    fireEvent.mouseMove(canvas, { clientX: 160, clientY: 110 })
    fireEvent.mouseUp(canvas, { clientX: 160, clientY: 110 })

    const afterShape = onChange.mock.calls[1]?.[0]
    const shapeItem = afterShape?.items.find(
      (i: { type: string; shapeKind?: string }) => i.type === 'shape' && i.shapeKind === 'rect'
    )
    expect(shapeItem).toBeDefined()
    expect(shapeItem?.width).toBe(140)
  })

  it('dibuja una flecha con snap automático entre dos elementos', () => {
    const wb = createSampleBoard()
    const onChange = vi.fn()
    render(<TeamWhiteboardView whiteboard={wb} onChange={onChange} />)

    const canvas = screen.getByTestId('whiteboard-canvas')
    fireEvent.click(screen.getByRole('button', { name: 'Flecha' }))
    fireEvent.mouseDown(canvas, { clientX: 180, clientY: 160 })
    fireEvent.mouseMove(canvas, { clientX: 480, clientY: 170 })
    fireEvent.mouseUp(canvas, { clientX: 480, clientY: 170 })

    const updated = onChange.mock.calls[0]?.[0]
    const arrow = updated?.items.find((i: { type: string }) => i.type === 'arrow')
    expect(arrow).toBeDefined()
    expect(arrow?.fromId).toBe('card-a')
    expect(arrow?.toId).toBe('card-b')
  })

  it('redimensiona un elemento desde su tirador inferior derecho', () => {
    const wb = createSampleBoard()
    const onChange = vi.fn()
    render(<TeamWhiteboardView whiteboard={wb} onChange={onChange} />)

    const handle = screen.getByTestId('resize-handle-card-a')
    fireEvent.mouseDown(handle, { clientX: 300, clientY: 240 })
    fireEvent.mouseMove(screen.getByTestId('whiteboard-canvas'), { clientX: 360, clientY: 290 })
    fireEvent.mouseUp(screen.getByTestId('whiteboard-canvas'), { clientX: 360, clientY: 290 })

    const updated = onChange.mock.calls[0]?.[0]
    const resized = updated?.items.find((i: { id: string }) => i.id === 'card-a')
    expect(resized?.width).toBe(260)
    expect(resized?.height).toBe(190)
  })

  it('copia Markdown con copyTextToClipboard y exporta SVG válido', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { writeClipboardText } }
    })
    const successSpy = vi.spyOn(toast, 'success')
    const onCreateTask = vi.fn()

    const wb = createSampleBoard()
    wb.items.push({
      id: 'arrow-1',
      type: 'arrow',
      x: 300,
      y: 160,
      width: 120,
      height: 10,
      content: 'JWT',
      fromId: 'card-a',
      toId: 'card-b',
      points: [
        { x: 0, y: 5 },
        { x: 120, y: 5 }
      ]
    })

    render(<TeamWhiteboardView whiteboard={wb} onChange={vi.fn()} onCreateTask={onCreateTask} />)

    fireEvent.click(screen.getByRole('button', { name: /copiar md/i }))
    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith(expect.stringContaining('# Arquitectura Pro'))
      expect(successSpy).toHaveBeenCalled()
    })

    const md = buildWhiteboardMarkdown(wb)
    expect(md).toContain('**API Gateway**')
    expect(md).toContain('(JWT)')

    const svg = buildWhiteboardSvg(wb, true)
    expect(svg).toContain('<svg')
    expect(svg).toContain('<polygon')
    expect(svg).toContain('marker-end=')

    fireEvent.mouseDown(screen.getByTestId('whiteboard-item-card-a'))
    fireEvent.click(screen.getAllByRole('button', { name: /crear tarea/i })[0])
    expect(onCreateTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'card-a' }))
  })
})
