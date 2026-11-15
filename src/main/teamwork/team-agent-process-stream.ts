import type { ChildProcess } from 'node:child_process'
import { statSync } from 'node:fs'
import type {
  AgentExecutionLog,
  AgentExecutionRecord
} from '../../shared/teamwork/team-workspace-types'
import { stripAnsiCodes } from './team-agent-model-probe'

const MAX_EXECUTION_LOGS = 500

export function resolveWorkingDirectory(
  projectPath: string | null | undefined,
  fallbackHome: string
): string {
  if (projectPath?.trim()) {
    try {
      if (statSync(projectPath).isDirectory()) {
        return projectPath
      }
    } catch {
      // Fall through to home/cwd fallback.
    }
  }
  try {
    if (statSync(fallbackHome).isDirectory()) {
      return fallbackHome
    }
  } catch {
    // Fall through to process.cwd().
  }
  return process.cwd()
}

export function cloneExecutionRecord(record: AgentExecutionRecord): AgentExecutionRecord {
  return { ...record, logs: record.logs.map((entry) => ({ ...entry })) }
}

export function appendExecutionLog(
  record: AgentExecutionRecord,
  level: AgentExecutionLog['level'],
  message: string
): void {
  const last = record.logs.at(-1)
  if (last && last.level === level && last.message === message) {
    return
  }
  record.logs.push({ timestamp: Date.now(), level, message })
  if (record.logs.length > MAX_EXECUTION_LOGS) {
    record.logs.splice(0, record.logs.length - MAX_EXECUTION_LOGS)
  }
  record.updatedAt = Date.now()
}

export function wireAgentChildProcess(options: {
  executionId: string
  record: AgentExecutionRecord
  child: ChildProcess
  isCancelled: () => boolean
  onFinishProcess: () => void
  onEmitUpdated: () => void
}): void {
  const { record, child, isCancelled, onFinishProcess, onEmitUpdated } = options
  let stdoutBuf = ''
  let stderrBuf = ''

  const flushLines = (raw: string, level: AgentExecutionLog['level']): void => {
    for (const line of raw.split(/\r?\n/)) {
      const clean = stripAnsiCodes(line).trim()
      if (clean) {
        appendExecutionLog(record, level, clean)
      }
    }
  }

  child.stdout?.on('data', (chunk: Buffer | string) => {
    stdoutBuf += chunk.toString()
    const lastNl = stdoutBuf.lastIndexOf('\n')
    if (lastNl !== -1) {
      flushLines(stdoutBuf.slice(0, lastNl), 'info')
      stdoutBuf = stdoutBuf.slice(lastNl + 1)
      onEmitUpdated()
    }
  })

  child.stderr?.on('data', (chunk: Buffer | string) => {
    stderrBuf += chunk.toString()
    const lastNl = stderrBuf.lastIndexOf('\n')
    if (lastNl !== -1) {
      flushLines(stderrBuf.slice(0, lastNl), 'warn')
      stderrBuf = stderrBuf.slice(lastNl + 1)
      onEmitUpdated()
    }
  })

  child.on('error', (err) => {
    onFinishProcess()
    if (isCancelled()) {
      return
    }
    record.status = 'failed'
    record.error = err.message
    record.completedAt = Date.now()
    record.updatedAt = record.completedAt
    appendExecutionLog(record, 'error', `Error de proceso: ${err.message}`)
    onEmitUpdated()
  })

  child.on('close', (code, signal) => {
    onFinishProcess()
    if (stdoutBuf.trim()) {
      flushLines(stdoutBuf, 'info')
      stdoutBuf = ''
    }
    if (stderrBuf.trim()) {
      flushLines(stderrBuf, code === 0 ? 'warn' : 'error')
      stderrBuf = ''
    }
    if (isCancelled() || record.status === 'cancelled') {
      record.status = 'cancelled'
      record.completedAt ??= Date.now()
      record.updatedAt = Date.now()
      onEmitUpdated()
      return
    }
    const now = Date.now()
    record.completedAt = now
    record.updatedAt = now
    if (code === 0) {
      record.status = 'completed'
      const tailInfo = record.logs
        .filter((l) => l.level === 'info')
        .slice(-4)
        .map((l) => l.message)
        .join('\n')
      record.outputSummary = tailInfo.slice(0, 600) || 'Ejecución completada correctamente.'
      appendExecutionLog(record, 'info', 'Proceso finalizado con código 0.')
    } else {
      record.status = 'failed'
      record.error = `El agente finalizó con código ${code ?? signal ?? 'desconocido'}.`
      appendExecutionLog(record, 'error', record.error)
    }
    onEmitUpdated()
  })
}
