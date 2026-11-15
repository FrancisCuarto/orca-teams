import { runProcess } from '@orca/process-host'
import type { ProcessResult } from '@orca/process-host/process-spec'
import type {
  TeamReviewProvider,
  TeamReviewRequest,
  TeamReviewRequestState
} from '../../shared/teamwork/team-workspace-types'

export type RunProcessFn = typeof runProcess

const DEFAULT_CLI_TIMEOUT_MS = 30_000
const NETWORK_CLI_TIMEOUT_MS = 60_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeReviewState(rawState: unknown): TeamReviewRequestState | null {
  if (typeof rawState !== 'string') {
    return null
  }
  const normalized = rawState.trim().toLowerCase()
  if (normalized === 'open' || normalized === 'opened') {
    return 'open'
  }
  if (normalized === 'merged') {
    return 'merged'
  }
  if (normalized === 'closed' || normalized === 'locked') {
    return 'closed'
  }
  return null
}

async function execCli(
  program: string,
  args: readonly string[],
  cwd: string,
  runProcessFn: RunProcessFn = runProcess,
  timeoutMs = DEFAULT_CLI_TIMEOUT_MS
): Promise<ProcessResult> {
  const result = await runProcessFn({ program, args, cwd, timeoutMs })
  if (result.timedOut) {
    throw new Error(
      `El comando '${program} ${args[0] ?? ''}' excedió el tiempo límite (${timeoutMs}ms).`
    )
  }
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `código ${String(result.code)}`
    throw new Error(`Error al ejecutar '${program} ${args[0] ?? ''}': ${detail}`)
  }
  return result
}

function extractHostnameFromRemote(remoteUrl: string): string {
  const trimmed = remoteUrl.trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.includes('://')) {
    try {
      return new URL(trimmed).hostname.toLowerCase()
    } catch {
      return trimmed.toLowerCase()
    }
  }
  const scpMatch = /^(?:[^@]+@)?([^:/]+):/.exec(trimmed)
  if (scpMatch?.[1]) {
    return scpMatch[1].toLowerCase()
  }
  return trimmed.toLowerCase()
}

export function detectReviewProviderFromRemoteUrl(remoteUrl: string): TeamReviewProvider {
  const trimmed = remoteUrl.trim()
  if (!trimmed) {
    throw new Error('El repositorio no tiene un remoto origin configurado.')
  }
  const host = extractHostnameFromRemote(trimmed)
  if (host.includes('gitlab')) {
    return 'gitlab'
  }
  if (host.includes('github')) {
    return 'github'
  }
  const lower = trimmed.toLowerCase()
  if (lower.includes('gitlab')) {
    return 'gitlab'
  }
  if (lower.includes('github')) {
    return 'github'
  }
  throw new Error(
    `Proveedor Git no reconocido para origin '${trimmed}'. Se requiere un remoto de GitHub o GitLab.`
  )
}

export async function detectReviewProvider(
  cwd: string,
  runProcessFn: RunProcessFn = runProcess
): Promise<TeamReviewProvider> {
  const result = await execCli('git', ['remote', 'get-url', 'origin'], cwd, runProcessFn)
  return detectReviewProviderFromRemoteUrl(result.stdout)
}

function parseReviewUrlAndNumber(
  output: string,
  provider: TeamReviewProvider
): { url: string; number: number } | null {
  const pattern =
    provider === 'gitlab'
      ? /https?:\/\/[^\s"'<>]+\/(?:-\/)?merge_requests\/(\d+)/i
      : /https?:\/\/[^\s"'<>]+\/pull\/(\d+)/i
  const match = pattern.exec(output)
  if (!match?.[0] || !match[1]) {
    return null
  }
  const number = Number.parseInt(match[1], 10)
  if (!Number.isInteger(number) || number <= 0) {
    return null
  }
  return { url: match[0], number }
}

function parseGitHubPrJson(raw: string): TeamReviewRequest | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) {
    return null
  }
  const number = typeof parsed.number === 'number' ? parsed.number : null
  const url = typeof parsed.url === 'string' ? parsed.url.trim() : ''
  const state = normalizeReviewState(parsed.state)
  if (number === null || !Number.isInteger(number) || number <= 0 || !url || !state) {
    return null
  }
  return { provider: 'github', number, url, state }
}

function parseGitLabMrJson(raw: string): TeamReviewRequest | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) {
    return null
  }
  const rawNumber =
    typeof parsed.iid === 'number'
      ? parsed.iid
      : typeof parsed.number === 'number'
        ? parsed.number
        : null
  const rawUrl =
    typeof parsed.web_url === 'string'
      ? parsed.web_url.trim()
      : typeof parsed.url === 'string'
        ? parsed.url.trim()
        : ''
  const state = normalizeReviewState(parsed.state)
  if (rawNumber === null || !Number.isInteger(rawNumber) || rawNumber <= 0 || !rawUrl || !state) {
    return null
  }
  return { provider: 'gitlab', number: rawNumber, url: rawUrl, state }
}

function parseGitLabMrTextFallback(
  raw: string,
  fallback: TeamReviewRequest
): TeamReviewRequest | null {
  const stateMatch = /\bstate\s*:\s*(opened|open|merged|closed|locked)\b/i.exec(raw)
  const state = normalizeReviewState(stateMatch?.[1])
  if (!state) {
    return null
  }
  const parsedUrl = parseReviewUrlAndNumber(raw, 'gitlab')
  return {
    provider: 'gitlab',
    number: parsedUrl?.number ?? fallback.number,
    url: parsedUrl?.url ?? fallback.url,
    state
  }
}

async function commitPendingWorktreeChanges(
  cwd: string,
  commitMessage: string,
  runProcessFn: RunProcessFn
): Promise<void> {
  const statusResult = await execCli('git', ['status', '--porcelain'], cwd, runProcessFn)
  if (!statusResult.stdout.trim()) {
    return
  }
  await execCli('git', ['add', '-A'], cwd, runProcessFn)
  await execCli('git', ['commit', '-m', commitMessage], cwd, runProcessFn)
}

async function resolveBranchName(
  cwd: string,
  preferredBranch: string | undefined,
  runProcessFn: RunProcessFn
): Promise<string> {
  const explicit = preferredBranch?.trim()
  if (explicit && explicit !== 'HEAD') {
    return explicit
  }
  const branchResult = await execCli(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    cwd,
    runProcessFn
  )
  const current = branchResult.stdout.trim()
  if (!current || current === 'HEAD') {
    throw new Error('No se pudo determinar la rama Git actual para publicar el PR/MR.')
  }
  return current
}

async function lookupBranchReviewRequest(options: {
  cwd: string
  provider: TeamReviewProvider
  ref: string
  runProcessFn: RunProcessFn
}): Promise<TeamReviewRequest | null> {
  const { cwd, provider, ref, runProcessFn } = options
  if (provider === 'github') {
    const viewResult = await execCli(
      'gh',
      ['pr', 'view', ref, '--json', 'number,url,state'],
      cwd,
      runProcessFn,
      NETWORK_CLI_TIMEOUT_MS
    )
    return parseGitHubPrJson(viewResult.stdout)
  }
  const viewResult = await execCli(
    'glab',
    ['mr', 'view', ref, '--output', 'json'],
    cwd,
    runProcessFn,
    NETWORK_CLI_TIMEOUT_MS
  )
  return parseGitLabMrJson(viewResult.stdout)
}

export async function pushAndCreateReviewRequest(options: {
  cwd: string
  branch?: string
  baseBranch?: string
  title: string
  body: string
  commitMessage?: string
  runProcessFn?: RunProcessFn
}): Promise<TeamReviewRequest> {
  const runProcessFn = options.runProcessFn ?? runProcess
  const commitMessage = options.commitMessage?.trim() || 'feat(team): apply agent changes'
  await commitPendingWorktreeChanges(options.cwd, commitMessage, runProcessFn)

  const branch = await resolveBranchName(options.cwd, options.branch, runProcessFn)
  const provider = await detectReviewProvider(options.cwd, runProcessFn)

  await execCli('git', ['push', '-u', 'origin', branch], options.cwd, runProcessFn, NETWORK_CLI_TIMEOUT_MS)

  const baseBranch = options.baseBranch?.trim()
  const hasBase = Boolean(baseBranch && baseBranch !== 'HEAD' && baseBranch !== branch)

  if (provider === 'github') {
    const args = ['pr', 'create', '--title', options.title, '--body', options.body, '--head', branch]
    if (hasBase && baseBranch) {
      args.push('--base', baseBranch)
    }
    try {
      const created = await execCli('gh', args, options.cwd, runProcessFn, NETWORK_CLI_TIMEOUT_MS)
      const parsed = parseReviewUrlAndNumber(`${created.stdout}\n${created.stderr}`, 'github')
      if (parsed) {
        return {
          provider: 'github',
          number: parsed.number,
          url: parsed.url,
          state: 'open'
        }
      }
      const lookedUp = await lookupBranchReviewRequest({
        cwd: options.cwd,
        provider: 'github',
        ref: branch,
        runProcessFn
      })
      if (lookedUp) {
        return lookedUp
      }
      throw new Error('No se pudo obtener la URL o número del Pull Request creado en GitHub.')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.toLowerCase().includes('already exists')) {
        const existing = await lookupBranchReviewRequest({
          cwd: options.cwd,
          provider: 'github',
          ref: branch,
          runProcessFn
        })
        if (existing) {
          return existing
        }
      }
      throw error
    }
  }

  const glabArgs = [
    'mr',
    'create',
    '--title',
    options.title,
    '--description',
    options.body,
    '--source-branch',
    branch,
    '--yes'
  ]
  if (hasBase && baseBranch) {
    glabArgs.push('--target-branch', baseBranch)
  }
  try {
    const created = await execCli('glab', glabArgs, options.cwd, runProcessFn, NETWORK_CLI_TIMEOUT_MS)
    const parsed = parseReviewUrlAndNumber(`${created.stdout}\n${created.stderr}`, 'gitlab')
    if (parsed) {
      return {
        provider: 'gitlab',
        number: parsed.number,
        url: parsed.url,
        state: 'open'
      }
    }
    const lookedUp = await lookupBranchReviewRequest({
      cwd: options.cwd,
      provider: 'gitlab',
      ref: branch,
      runProcessFn
    })
    if (lookedUp) {
      return lookedUp
    }
    throw new Error('No se pudo obtener la URL o número del Merge Request creado en GitLab.')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.toLowerCase().includes('already exists')) {
      const existing = await lookupBranchReviewRequest({
        cwd: options.cwd,
        provider: 'gitlab',
        ref: branch,
        runProcessFn
      })
      if (existing) {
        return existing
      }
    }
    throw error
  }
}

export async function queryReviewRequestState(options: {
  cwd: string
  reviewRequest: TeamReviewRequest
  runProcessFn?: RunProcessFn
}): Promise<TeamReviewRequest> {
  const runProcessFn = options.runProcessFn ?? runProcess
  const { reviewRequest, cwd } = options
  const ref = String(reviewRequest.number)

  if (reviewRequest.provider === 'github') {
    const result = await execCli(
      'gh',
      ['pr', 'view', ref, '--json', 'number,url,state'],
      cwd,
      runProcessFn,
      NETWORK_CLI_TIMEOUT_MS
    )
    const parsed = parseGitHubPrJson(result.stdout)
    if (!parsed) {
      throw new Error(`Respuesta inválida de 'gh pr view' para PR #${reviewRequest.number}.`)
    }
    return parsed
  }

  const result = await execCli(
    'glab',
    ['mr', 'view', ref, '--output', 'json'],
    cwd,
    runProcessFn,
    NETWORK_CLI_TIMEOUT_MS
  )
  const parsed =
    parseGitLabMrJson(result.stdout) ?? parseGitLabMrTextFallback(result.stdout, reviewRequest)
  if (!parsed) {
    throw new Error(`Respuesta inválida de 'glab mr view' para MR !${reviewRequest.number}.`)
  }
  return parsed
}
