// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { TeamNotesView } from './TeamNotesView'
import type { TeamNotesCollection } from '../../../../../shared/teamwork/team-kanban-types'

function createSampleNotesCollection(): TeamNotesCollection {
  return {
    projectId: 'proj-ui-notes',
    notes: [
      {
        id: 'note-1',
        title: 'ADR 001: Persistencia Relacional',
        content: '# ADR 001\n\n- [ ] Crear migraciones de base de datos\n- [x] Diseñar esquema',
        category: 'adr',
        status: 'accepted',
        author: 'Francis',
        tags: ['DATABASE', 'SQLITE'],
        createdAt: 1000,
        updatedAt: 1000
      },
      {
        id: 'note-2',
        title: 'Spec: Arquitectura de Equipos',
        content: '# Spec\nDiseño modular del sistema.',
        category: 'spec',
        status: 'proposed',
        author: 'Antigravity',
        tags: ['ARCHITECTURE'],
        createdAt: 2000,
        updatedAt: 2000
      }
    ],
    updatedAt: 2000
  }
}

describe('TeamNotesView', () => {
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

  it('renderiza la lista de notas en el sidebar y el contenido de la nota activa', () => {
    const collection = createSampleNotesCollection()
    const onChange = vi.fn()

    render(<TeamNotesView notesCollection={collection} onChange={onChange} />)

    expect(screen.getByText('ADR 001: Persistencia Relacional')).toBeDefined()
    expect(screen.getByText('Spec: Arquitectura de Equipos')).toBeDefined()
    expect(screen.getByDisplayValue('ADR 001: Persistencia Relacional')).toBeDefined()
  })

  it('filtra notas cuando se escribe en el buscador', () => {
    const collection = createSampleNotesCollection()
    const onChange = vi.fn()

    render(<TeamNotesView notesCollection={collection} onChange={onChange} />)

    const searchInput = screen.getByPlaceholderText(/buscar notas/i)
    fireEvent.change(searchInput, { target: { value: 'Arquitectura' } })

    expect(screen.queryByText('ADR 001: Persistencia Relacional')).toBeNull()
    expect(screen.getByText('Spec: Arquitectura de Equipos')).toBeDefined()
  })

  it('permite alternar a modo previsualización', () => {
    const collection = createSampleNotesCollection()
    const onChange = vi.fn()

    render(<TeamNotesView notesCollection={collection} onChange={onChange} />)

    const previewBtn = screen.getByRole('button', { name: /vista previa/i })
    fireEvent.click(previewBtn)

    expect(screen.getByText('Crear migraciones de base de datos')).toBeDefined()
  })

  it('llama a onExtractTasksToKanban cuando hay tareas no completadas', () => {
    const collection = createSampleNotesCollection()
    const onExtract = vi.fn()
    const onChange = vi.fn()

    render(
      <TeamNotesView
        notesCollection={collection}
        onChange={onChange}
        onExtractTasksToKanban={onExtract}
      />
    )

    const extractBtn = screen.getByText('Extraer al Kanban')
    fireEvent.click(extractBtn)

    expect(onExtract).toHaveBeenCalledWith(
      'ADR 001: Persistencia Relacional',
      collection.notes[0]?.content
    )
  })

  it('copia la nota como Markdown con "Copiar MD" usando window.api.ui.writeClipboardText', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { writeClipboardText } }
    })
    const successSpy = vi.spyOn(toast, 'success')

    const collection = createSampleNotesCollection()
    render(<TeamNotesView notesCollection={collection} onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /copiar md/i }))

    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith(
        '# ADR 001: Persistencia Relacional\n\n# ADR 001\n\n- [ ] Crear migraciones de base de datos\n- [x] Diseñar esquema'
      )
      expect(successSpy).toHaveBeenCalled()
    })
  })

  it('copia el contexto para agente con "Copiar para Agente" haciendo fallback a navigator.clipboard.writeText', async () => {
    const writeClipboardText = vi.fn().mockRejectedValue(new Error('IPC unavailable'))
    const navWriteText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { writeClipboardText } }
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: navWriteText }
    })
    const successSpy = vi.spyOn(toast, 'success')

    const collection = createSampleNotesCollection()
    render(<TeamNotesView notesCollection={collection} onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /copiar para agente/i }))

    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledTimes(1)
      expect(navWriteText).toHaveBeenCalledWith(
        expect.stringContaining(
          '[CONTEXTO DE EQUIPO Y ARQUITECTURA: ADR 001: Persistencia Relacional]'
        )
      )
      expect(successSpy).toHaveBeenCalled()
    })
  })

  it('muestra toast.error si falla el portapapeles al copiar MD', async () => {
    const writeClipboardText = vi.fn().mockRejectedValue(new Error('IPC failed'))
    const navWriteText = vi.fn().mockRejectedValue(new Error('Clipboard blocked'))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { writeClipboardText } }
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: navWriteText }
    })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn().mockReturnValue(false)
    })
    const successSpy = vi.spyOn(toast, 'success')
    const errorSpy = vi.spyOn(toast, 'error')

    const collection = createSampleNotesCollection()
    render(<TeamNotesView notesCollection={collection} onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /copiar md/i }))

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled()
    })
    expect(successSpy).not.toHaveBeenCalled()
  })
})
