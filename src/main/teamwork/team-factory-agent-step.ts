import { spawn, type ChildProcess } from 'node:child_process'
import { hydrateShellPathForAgentDetection } from '../ipc/command-path/agent-detection-shell-path'
import { resolveCommandOnLocalPath } from '../ipc/command-path/command-path-resolver'
import { buildAgentCliCommand, resolveAgentCommand } from './team-agent-command'
import { stripAnsiCodes } from './team-agent-model-probe'

const AGENT_STEP_TIMEOUT_MS = 600_000
const KILL_GRACE_MS = 1_500

export type AgentStepExecutionInput = {
  agentId: string
  model?: string
  prompt: string
  cwd: string
  onLog: (level: 'info' | 'warn' | 'error', message: string) => void
  onRegisterChild: (child: ChildProcess) => () => void
  isCancelled: () => boolean
}

export type AgentStepExecutionOutput = {
  ok: boolean
  output: string
  error?: string
  durationMs: number
}

export type AgentStepExecutorDeps = {
  hydrateShellPath?: () => Promise<void>
  resolveExecutable?: (command: string) => Promise<string | null>
  spawnProcess?: (
    bin: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv }
  ) => ChildProcess
  timeoutMs?: number
}

export async function runIsolatedAgentStep(
  input: AgentStepExecutionInput,
  deps: AgentStepExecutorDeps = {}
): Promise<AgentStepExecutionOutput> {
  const startedAt = Date.now()
  const command = resolveAgentCommand(input.agentId)
  const hydrate = deps.hydrateShellPath ?? (() => hydrateShellPathForAgentDetection())
  const resolveExec = deps.resolveExecutable ?? ((cmd: string) => resolveCommandOnLocalPath(cmd))

  await hydrate()
  const resolvedBin = await resolveExec(command)
  if (!resolvedBin) {
    return {
      ok: false,
      output: '',
      error: `No se encontró el binario '${command}' en PATH.`,
      durationMs: Date.now() - startedAt
    }
  }

  const cli = buildAgentCliCommand(resolvedBin, input.prompt, input.model)
  const spawnFn =
    deps.spawnProcess ??
    ((bin, args, opts) =>
      spawn(bin, args, {
        cwd: opts.cwd,
        env: opts.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      }))

  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawnFn(cli.bin, cli.args, { cwd: input.cwd, env: { ...process.env } })
    } catch (err) {
      resolve({
        ok: false,
        output: '',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt
      })
      return
    }

    const unregister = input.onRegisterChild(child)
    let stdoutAll = ''
    let stdoutBuf = ''
    let stderrBuf = ''
    let settled = false

    const flushLines = (raw: string, level: 'info' | 'warn' | 'error'): void => {
      for (const line of raw.split(/\r?\n/)) {
        const clean = stripAnsiCodes(line).trim()
        if (clean) {
          input.onLog(level, clean)
        }
      }
    }

    const finish = (ok: boolean, error?: string): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      unregister()
      resolve({
        ok,
        output: stdoutAll.trim(),
        ...(error ? { error } : {}),
        durationMs: Date.now() - startedAt
      })
    }

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stdoutAll += text
      stdoutBuf += text
      const lastNl = stdoutBuf.lastIndexOf('\n')
      if (lastNl !== -1) {
        flushLines(stdoutBuf.slice(0, lastNl), 'info')
        stdoutBuf = stdoutBuf.slice(lastNl + 1)
      }
    })

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrBuf += chunk.toString()
      const lastNl = stderrBuf.lastIndexOf('\n')
      if (lastNl !== -1) {
        flushLines(stderrBuf.slice(0, lastNl), 'warn')
        stderrBuf = stderrBuf.slice(lastNl + 1)
      }
    })

    child.on('error', (err) => {
      if (!input.isCancelled()) {
        input.onLog('error', `Error de proceso (${command}): ${err.message}`)
      }
      finish(false, err.message)
    })

    child.on('close', (code, signal) => {
      if (stdoutBuf.trim()) {
        flushLines(stdoutBuf, 'info')
      }
      if (stderrBuf.trim()) {
        flushLines(stderrBuf, code === 0 ? 'warn' : 'error')
      }
      if (input.isCancelled()) {
        finish(false, 'Ejecución cancelada.')
        return
      }
      if (code === 0) {
        finish(true)
      } else {
        finish(
          false,
          `El agente '${command}' finalizó con código ${code ?? signal ?? 'desconocido'}.`
        )
      }
    })

    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL')
          }
        }, KILL_GRACE_MS).unref?.()
      }
      finish(false, `Tiempo límite excedido en agente '${command}'.`)
    }, deps.timeoutMs ?? AGENT_STEP_TIMEOUT_MS)
    timer.unref?.()
  })
}
