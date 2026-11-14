import { describe, expect, it, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { TeamExecutionService } from './team-execution-service'
import { TeamAgentDispatchService } from './team-agent-dispatch-service'
import { TEAMS_DATABASE_SCHEMA } from './team-schema'
import type { TeamKanbanCard } from './team-kanban-types'

function createSampleAgentCard(): TeamKanbanCard {
  return {
    id: 'card-agent-1',
    title: 'Crear endpoint de métricas',
    description: 'Implementar /api/metrics en Prometheus format',
    columnId: 'col-todo',
    priority: 'high',
    assignee: {
      type: 'agent',
      name: 'Codex',
      model: 'claude-3-5-sonnet',
      agentType: 'orchestration',
      skills: ['ponytail-5']
    },
    labels: ['backend', 'metrics'],
    checklist: [
      { id: 'chk-1', text: 'Escribir tests', done: false },
      { id: 'chk-2', text: 'Documentar endpoint', done: false }
    ],
    branchOrWorktree: 'feat/metrics-endpoint',
    createdAt: 1000,
    updatedAt: 1000
  }
}

describe('TeamAgentDispatchService', () => {
  let db: DatabaseSync
  let executionService: TeamExecutionService
  let dispatchService: TeamAgentDispatchService

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    db.exec(TEAMS_DATABASE_SCHEMA)
    executionService = new TeamExecutionService(db)
    dispatchService = new TeamAgentDispatchService(executionService)
  })

  it('rechaza despachar tarjetas sin asignación a agentes', () => {
    const card: TeamKanbanCard = {
      ...createSampleAgentCard(),
      assignee: { type: 'human', name: 'Francis' }
    }

    expect(() =>
      dispatchService.dispatchCardToAgent({
        card,
        projectId: 'proj-1',
        actorUserId: 'user-owner'
      })
    ).toThrow('La tarjeta no tiene un agente asignado válido')
  })

  it('despacha la tarjeta generando prompt estructurado y registro encolado', () => {
    const card = createSampleAgentCard()
    const record = dispatchService.dispatchCardToAgent({
      card,
      projectId: 'proj-1',
      actorUserId: 'user-owner'
    })

    expect(record.status).toBe('queued')
    expect(record.taskId).toBe(card.id)
    expect(record.model).toBe('claude-3-5-sonnet')
    expect(record.branchOrWorktree).toBe('feat/metrics-endpoint')
    expect(record.prompt).toContain('# Tarea: Crear endpoint de métricas')
    expect(record.prompt).toContain('Reglas Ponytail 5')
    expect(record.logs).toHaveLength(1)
  })

  it('garantiza idempotencia si se despacha la misma tarjeta sin cambios', () => {
    const card = createSampleAgentCard()
    const first = dispatchService.dispatchCardToAgent({
      card,
      projectId: 'proj-1',
      actorUserId: 'user-owner'
    })

    const second = dispatchService.dispatchCardToAgent({
      card,
      projectId: 'proj-1',
      actorUserId: 'user-owner'
    })

    expect(first.id).toBe(second.id)
    expect(first.idempotencyKey).toBe(second.idempotencyKey)
  })

  it('gestiona el ciclo de vida completo: inicio, logs y finalización exitosa', () => {
    const card = createSampleAgentCard()
    const record = dispatchService.dispatchCardToAgent({
      card,
      projectId: 'proj-1',
      actorUserId: 'user-owner'
    })

    // Iniciar ejecución
    const running = dispatchService.startExecution(record.id)
    expect(running.status).toBe('running')

    // Agregar logs en vivo
    dispatchService.appendLog(record.id, 'info', 'Compilando código y ejecutando tests...')
    dispatchService.appendLog(record.id, 'warn', 'Deprecación detectada en librería externa')

    // Completar ejecución
    dispatchService.completeExecution(
      record.id,
      'Endpoint /api/metrics implementado y suite de pruebas pasando al 100%.'
    )

    const completed = dispatchService.getExecution(record.id)
    expect(completed?.status).toBe('completed')
    expect(completed?.outputSummary).toContain('Endpoint /api/metrics implementado')
    expect(completed?.logs).toHaveLength(5)
    expect(completed?.completedAt).toBeDefined()
  })

  it('permite cancelar una ejecución en curso', () => {
    const card = createSampleAgentCard()
    const record = dispatchService.dispatchCardToAgent({
      card,
      projectId: 'proj-1',
      actorUserId: 'user-owner'
    })

    dispatchService.startExecution(record.id)
    dispatchService.cancelExecution(record.id)

    const cancelled = dispatchService.getExecution(record.id)
    expect(cancelled?.status).toBe('cancelled')
    const lastLog = cancelled?.logs.at(-1)
    expect(lastLog?.level).toBe('warn')
    expect(lastLog?.message).toContain('cancelada por el usuario')
  })

  it('permite registrar fallos de ejecución con mensaje de error', () => {
    const card = createSampleAgentCard()
    const record = dispatchService.dispatchCardToAgent({
      card,
      projectId: 'proj-1',
      actorUserId: 'user-owner'
    })

    dispatchService.startExecution(record.id)
    dispatchService.failExecution(record.id, 'Error de compilación en metrics.ts:14')

    const failed = dispatchService.getExecution(record.id)
    expect(failed?.status).toBe('failed')
    expect(failed?.error).toContain('Error de compilación en metrics.ts:14')
  })

  it('recupera la última ejecución asociada a una tarjeta', () => {
    const card = createSampleAgentCard()
    const record = dispatchService.dispatchCardToAgent({
      card,
      projectId: 'proj-1',
      actorUserId: 'user-owner'
    })

    const retrieved = dispatchService.getLatestExecutionForCard(card.id)
    expect(retrieved?.id).toBe(record.id)
  })
})
