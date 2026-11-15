import { runProcess } from '@orca/process-host'
import {
  buildKanbanCardsFromExternalIssues,
  isDuplicateExternalIssue,
  type BuildKanbanCardsOptions
} from '../../shared/teamwork/team-issue-card-builder'
import type {
  ExternalTeamIssue,
  TeamKanbanPriority
} from '../../shared/teamwork/team-kanban-types'
import { hydrateShellPathForAgentDetection } from '../ipc/command-path/agent-detection-shell-path'
import { resolveCommandOnLocalPath } from '../ipc/command-path/command-path-resolver'

export { buildKanbanCardsFromExternalIssues, isDuplicateExternalIssue }
export type { BuildKanbanCardsOptions, ExternalTeamIssue }

const DEFAULT_FETCH_LIMIT = 30
const MAX_FETCH_LIMIT = 100
const LINEAR_GRAPHQL_ENDPOINT = 'https://api.linear.app/graphql'

const LINEAR_OPEN_ISSUES_QUERY = `
  query TeamImporterOpenIssues($first: Int!, $filter: IssueFilter) {
    issues(first: $first, filter: $filter) {
      nodes {
        id
        identifier
        title
        description
        url
        priority
        state {
          name
          type
        }
        labels {
          nodes {
            name
          }
        }
      }
    }
  }
`

export type FetchGitHubIssuesInput = {
  repoPath: string
  limit?: number
  runProcessFn?: typeof runProcess
  resolveExecutable?: (command: string) => Promise<string | null>
  hydrateShellPath?: () => Promise<void>
}

export type FetchLinearIssuesInput = {
  apiKey: string
  teamKey?: string
  limit?: number
  fetchFn?: typeof globalThis.fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampIssueLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DEFAULT_FETCH_LIMIT
  }
  return Math.max(1, Math.min(Math.trunc(limit), MAX_FETCH_LIMIT))
}

function inferPriorityFromLabels(labels: readonly string[]): TeamKanbanPriority {
  const normalized = labels.map((label) => label.toLowerCase())
  if (
    normalized.some(
      (label) =>
        label.includes('urgent') ||
        label.includes('critical') ||
        label === 'p0' ||
        label.includes('priority: urgent')
    )
  ) {
    return 'urgent'
  }
  if (
    normalized.some(
      (label) => label.includes('high') || label === 'p1' || label.includes('priority: high')
    )
  ) {
    return 'high'
  }
  if (
    normalized.some(
      (label) => label.includes('low') || label === 'p3' || label.includes('priority: low')
    )
  ) {
    return 'low'
  }
  return 'medium'
}

function extractGitHubLabels(rawLabels: unknown): string[] {
  if (!Array.isArray(rawLabels)) {
    return []
  }
  const labels: string[] = []
  for (const entry of rawLabels) {
    if (typeof entry === 'string' && entry.trim()) {
      labels.push(entry.trim())
    } else if (isRecord(entry) && typeof entry.name === 'string' && entry.name.trim()) {
      labels.push(entry.name.trim())
    }
  }
  return labels
}

export function parseGitHubIssuesJson(rawJson: string): ExternalTeamIssue[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    throw new Error('La salida de gh issue list no es JSON válido.')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('La respuesta de GitHub CLI debe ser una lista de issues.')
  }

  const issues: ExternalTeamIssue[] = []
  for (const item of parsed) {
    if (!isRecord(item)) {
      continue
    }
    if (
      typeof item.number !== 'number' ||
      typeof item.title !== 'string' ||
      typeof item.url !== 'string'
    ) {
      continue
    }
    const labels = extractGitHubLabels(item.labels)
    const state = typeof item.state === 'string' && item.state.trim() ? item.state : 'OPEN'
    const description = typeof item.body === 'string' ? item.body : ''

    issues.push({
      provider: 'github',
      id: String(item.number),
      key: `#${item.number}`,
      title: item.title,
      description,
      url: item.url,
      labels,
      priority: inferPriorityFromLabels(labels),
      state
    })
  }
  return issues
}

export async function fetchGitHubIssues(
  input: FetchGitHubIssuesInput
): Promise<ExternalTeamIssue[]> {
  const cwd = input.repoPath.trim()
  if (!cwd) {
    throw new Error('Se requiere la ruta del repositorio local para importar issues de GitHub.')
  }
  const limit = clampIssueLimit(input.limit)

  const hydrate = input.hydrateShellPath ?? (() => hydrateShellPathForAgentDetection())
  const resolveExec =
    input.resolveExecutable ?? ((cmd: string) => resolveCommandOnLocalPath(cmd))
  await hydrate().catch(() => undefined)
  const resolvedGh = await resolveExec('gh').catch(() => null)
  const program = resolvedGh ?? 'gh'

  const execute = input.runProcessFn ?? runProcess
  let result: Awaited<ReturnType<typeof runProcess>>
  try {
    result = await execute({
      program,
      args: [
        'issue',
        'list',
        '--json',
        'number,title,body,url,labels,state',
        '--limit',
        String(limit)
      ],
      cwd,
      timeoutMs: 20_000
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('ENOENT')) {
      throw new Error(
        'No se encontró el CLI de GitHub (gh). Instálalo y autentícate con "gh auth login".'
      )
    }
    throw new Error(`No se pudo ejecutar gh issue list: ${message}`)
  }

  if (result.timedOut) {
    throw new Error('Tiempo de espera agotado al consultar issues de GitHub (gh).')
  }
  if (result.code !== 0) {
    const stderr = result.stderr.trim()
    throw new Error(stderr || `gh issue list finalizó con código ${String(result.code)}`)
  }

  return parseGitHubIssuesJson(result.stdout)
}

function mapLinearPriority(value: unknown): TeamKanbanPriority {
  if (value === 1) {
    return 'urgent'
  }
  if (value === 2) {
    return 'high'
  }
  if (value === 4) {
    return 'low'
  }
  return 'medium'
}

function extractLinearLabels(rawLabels: unknown): string[] {
  if (!isRecord(rawLabels) || !Array.isArray(rawLabels.nodes)) {
    return []
  }
  const labels: string[] = []
  for (const node of rawLabels.nodes) {
    if (isRecord(node) && typeof node.name === 'string' && node.name.trim()) {
      labels.push(node.name.trim())
    }
  }
  return labels
}

function extractGraphQLErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.errors) || payload.errors.length === 0) {
    return null
  }
  const first = payload.errors[0]
  if (isRecord(first) && typeof first.message === 'string' && first.message.trim()) {
    return first.message
  }
  return 'Error desconocido en la consulta GraphQL de Linear.'
}

export function parseLinearIssuesPayload(payload: unknown): ExternalTeamIssue[] {
  const graphqlError = extractGraphQLErrorMessage(payload)
  if (graphqlError) {
    throw new Error(graphqlError)
  }
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data.issues)) {
    throw new Error('Respuesta inesperada de la API de Linear.')
  }
  const rawNodes = payload.data.issues.nodes
  if (!Array.isArray(rawNodes)) {
    return []
  }

  const issues: ExternalTeamIssue[] = []
  for (const node of rawNodes) {
    if (!isRecord(node)) {
      continue
    }
    if (
      typeof node.id !== 'string' ||
      typeof node.identifier !== 'string' ||
      typeof node.title !== 'string' ||
      typeof node.url !== 'string'
    ) {
      continue
    }
    const stateName =
      isRecord(node.state) && typeof node.state.name === 'string' && node.state.name.trim()
        ? node.state.name
        : 'Open'
    const description = typeof node.description === 'string' ? node.description : ''

    issues.push({
      provider: 'linear',
      id: node.id,
      key: node.identifier,
      title: node.title,
      description,
      url: node.url,
      labels: extractLinearLabels(node.labels),
      priority: mapLinearPriority(node.priority),
      state: stateName
    })
  }
  return issues
}

export async function fetchLinearIssues(
  input: FetchLinearIssuesInput
): Promise<ExternalTeamIssue[]> {
  const apiKey = input.apiKey.trim()
  if (!apiKey) {
    throw new Error('Se requiere una API key de Linear para consultar issues.')
  }
  const limit = clampIssueLimit(input.limit)
  const filter: Record<string, unknown> = {
    state: { type: { nin: ['completed', 'canceled'] } }
  }
  const trimmedTeamKey = input.teamKey?.trim()
  if (trimmedTeamKey) {
    filter.team = { key: { eqIgnoreCase: trimmedTeamKey } }
  }

  const fetchImpl = input.fetchFn ?? globalThis.fetch
  const response = await fetchImpl(LINEAR_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey
    },
    body: JSON.stringify({
      query: LINEAR_OPEN_ISSUES_QUERY,
      variables: {
        first: limit,
        filter
      }
    })
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('API key de Linear inválida o sin permisos.')
    }
    const detail = await response.text().catch(() => '')
    throw new Error(
      `Error HTTP ${response.status} al consultar Linear${detail ? `: ${detail.slice(0, 200)}` : ''}`
    )
  }

  const payload: unknown = await response.json()
  return parseLinearIssuesPayload(payload)
}
