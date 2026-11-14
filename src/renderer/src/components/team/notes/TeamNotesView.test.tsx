// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
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
  afterEach(() => {
    cleanup()
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
})
