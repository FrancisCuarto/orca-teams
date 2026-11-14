import { getIntlLocale } from '@/i18n/i18n'
import type { TeamNoteCategory } from '../../../../../shared/teamwork/team-kanban-types'

export const NOTE_CATEGORY_META: Record<
  TeamNoteCategory,
  { label: string; className: string; bg: string }
> = {
  adr: {
    label: 'ADR',
    className: 'text-amber-400 border-amber-500/30',
    bg: 'bg-amber-500/10'
  },
  spec: {
    label: 'Especificación',
    className: 'text-blue-400 border-blue-500/30',
    bg: 'bg-blue-500/10'
  },
  meeting: {
    label: 'Reunión',
    className: 'text-purple-400 border-purple-500/30',
    bg: 'bg-purple-500/10'
  },
  general: {
    label: 'General',
    className: 'text-emerald-400 border-emerald-500/30',
    bg: 'bg-emerald-500/10'
  }
}

export function getTeamNoteTemplate(category: TeamNoteCategory): {
  title: string
  content: string
} {
  const today = new Date().toLocaleDateString(getIntlLocale())
  switch (category) {
    case 'adr':
      return {
        title: 'ADR-XXX: Título de la Decisión de Arquitectura',
        content: `# ADR: Título de la Decisión

## Estado
Propuesto

## Contexto
¿Cuál es el problema o necesidad de arquitectura que enfrentamos?

## Decisión
¿Qué solución decidimos adoptar y por qué?

## Consecuencias
- **Positivas**: 
- **Desventajas / Riesgos**: `
      }
    case 'spec':
      return {
        title: 'Especificación: Nueva Funcionalidad',
        content: `# Especificación Técnica

## Objetivos
1. 

## Alcance y Requerimientos
- Criterio 1
- Criterio 2

## Flujo de Implementación
Detalles técnicos para los desarrolladores y agentes.`
      }
    case 'meeting':
      return {
        title: `Minuta de Reunión - ${today}`,
        content: `# Minuta de Reunión

**Fecha**: ${today}
**Participantes**: 

## Puntos Tratados
1. 

## Acciones y Asignaciones
- [ ] Tarea 1 (Responsable)`
      }
    case 'general':
      return {
        title: 'Nota en Blanco',
        content: '# Título de la Nota\n\nEscribe aquí tus ideas, notas o especificaciones...'
      }
  }
}
