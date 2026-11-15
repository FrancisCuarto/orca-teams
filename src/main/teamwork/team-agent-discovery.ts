import { access, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import type { TuiAgent } from '../../shared/agent-launch/catalog/tui-agent'
import { isTuiAgent, TUI_AGENT_CONFIG } from '../../shared/agent-launch/catalog/tui-agent-config'
import { TUI_AGENT_DISPLAY_NAMES } from '../../shared/agent-launch/catalog/tui-agent-display-names'
import type { ConfiguredTeamAgent } from '../../shared/teamwork/team-ipc-types'
import { hydrateShellPathForAgentDetection } from '../ipc/command-path/agent-detection-shell-path'
import { resolveCommandOnLocalPath } from '../ipc/command-path/command-path-resolver'
import { detectAgentsOnHost } from '../preflight/workspace-agent-detection'
import {
  getAgentConfigCheckSpec,
  getAgentRoleProfile,
  pickDefaultModel
} from './team-agent-metadata'
import {
  defaultQueryModels,
  MODEL_QUERY_TIMEOUT_MS,
  parseModelListingOutput
} from './team-agent-model-probe'

export { parseModelListingOutput }

const MODEL_CACHE_TTL_MS = 60_000

export type TeamAccountListSource =
  | { listAccounts: () => { accounts: readonly unknown[] } }
  | { list: () => readonly unknown[] | { accounts: readonly unknown[] } }

export type TeamAgentDiscoveryOverrides = {
  homeDir?: string
  env?: NodeJS.ProcessEnv
  hydrateShellPath?: () => Promise<void>
  detectAgents?: () => Promise<string[]>
  resolveExecutable?: (command: string) => Promise<string | null>
  pathExists?: (filePath: string) => Promise<boolean>
  isNonEmptyFile?: (filePath: string) => Promise<boolean>
  queryModels?: (binaryPath: string, args: string[], timeoutMs: number) => Promise<string[]>
}

export type TeamAgentDiscoveryDeps = {
  claudeAccounts?: TeamAccountListSource
  codexAccounts?: TeamAccountListSource
  refresh?: boolean
  overrides?: TeamAgentDiscoveryOverrides
}

const modelCache = new Map<string, { models: string[]; fetchedAt: number }>()

export function resetTeamAgentDiscoveryCacheForTests(): void {
  modelCache.clear()
}

function hasManagedAccounts(source: TeamAccountListSource | undefined): boolean {
  if (!source) {
    return false
  }
  if ('listAccounts' in source && typeof source.listAccounts === 'function') {
    return source.listAccounts().accounts.length > 0
  }
  if ('list' in source && typeof source.list === 'function') {
    const result = source.list()
    if (Array.isArray(result)) {
      return result.length > 0
    }
    if (typeof result === 'object' && result !== null && 'accounts' in result) {
      return result.accounts.length > 0
    }
  }
  return false
}

async function defaultPathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function defaultIsNonEmptyFile(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath)
    if (!info.isFile() || info.size === 0) {
      return false
    }
    const content = (await readFile(filePath, 'utf8')).trim()
    return content.length > 0 && content !== '{}'
  } catch {
    return false
  }
}

function formatConfigSource(filePath: string, home: string): string {
  return filePath.startsWith(home) ? `~${filePath.slice(home.length)}` : filePath
}

async function getAgentModels(
  agentId: TuiAgent,
  command: string,
  refresh: boolean,
  resolveExecutable: (cmd: string) => Promise<string | null>,
  queryModels: (bin: string, args: string[], timeoutMs: number) => Promise<string[]>
): Promise<string[]> {
  const cached = modelCache.get(agentId)
  if (!refresh && cached && Date.now() - cached.fetchedAt < MODEL_CACHE_TTL_MS) {
    return cached.models
  }
  const binaryPath = (await resolveExecutable(command)) ?? command
  const models = await queryModels(binaryPath, ['models'], MODEL_QUERY_TIMEOUT_MS)
  modelCache.set(agentId, { models, fetchedAt: Date.now() })
  return models
}

async function detectConfiguredAgent(
  agentId: TuiAgent,
  deps: TeamAgentDiscoveryDeps,
  helpers: {
    home: string
    env: NodeJS.ProcessEnv
    resolveExecutable: (cmd: string) => Promise<string | null>
    pathExists: (filePath: string) => Promise<boolean>
    isNonEmptyFile: (filePath: string) => Promise<boolean>
    queryModels: (bin: string, args: string[], timeoutMs: number) => Promise<string[]>
  }
): Promise<ConfiguredTeamAgent | null> {
  if (agentId === 'claude-agent-teams') {
    return null
  }
  const command = TUI_AGENT_CONFIG[agentId].detectCmd
  const spec = getAgentConfigCheckSpec(agentId, command)

  let configSource: string | null = null
  if (
    (agentId === 'claude' || agentId === 'openclaude') &&
    hasManagedAccounts(deps.claudeAccounts)
  ) {
    configSource = 'Orca Claude Accounts'
  } else if (agentId === 'codex' && hasManagedAccounts(deps.codexAccounts)) {
    configSource = 'Orca Codex Accounts'
  }
  if (!configSource) {
    for (const filePath of spec.files(helpers.home)) {
      if (await helpers.pathExists(filePath)) {
        configSource = formatConfigSource(filePath, helpers.home)
        break
      }
    }
  }
  if (!configSource && spec.nonEmptyFiles) {
    for (const filePath of spec.nonEmptyFiles(helpers.home)) {
      if (await helpers.isNonEmptyFile(filePath)) {
        configSource = formatConfigSource(filePath, helpers.home)
        break
      }
    }
  }
  if (!configSource) {
    for (const envName of spec.envVars) {
      if (helpers.env[envName]?.trim()) {
        configSource = envName
        break
      }
    }
  }

  let models: string[] = []
  if (spec.supportsModelListing) {
    models = await getAgentModels(
      agentId,
      command,
      Boolean(deps.refresh),
      helpers.resolveExecutable,
      helpers.queryModels
    )
    if (!configSource && models.length > 0) {
      configSource = `${command} models`
    }
  }
  if (!configSource) {
    return null
  }

  const profile = getAgentRoleProfile(agentId)
  return {
    id: agentId,
    name: TUI_AGENT_DISPLAY_NAMES[agentId],
    role: profile.role,
    command,
    color: profile.color,
    configured: true,
    configSource,
    models,
    defaultModel: pickDefaultModel(models, profile.preferredModelPatterns),
    defaultSkills: [...profile.defaultSkills]
  }
}

export async function listConfiguredTeamAgents(
  deps: TeamAgentDiscoveryDeps
): Promise<ConfiguredTeamAgent[]> {
  const overrides = deps.overrides ?? {}
  const home = overrides.homeDir ?? homedir()
  const env = overrides.env ?? process.env
  const hydrateShellPath = overrides.hydrateShellPath ?? (() => hydrateShellPathForAgentDetection())
  const detectAgents = overrides.detectAgents ?? (() => detectAgentsOnHost({ kind: 'local' }))
  const resolveExecutable =
    overrides.resolveExecutable ?? ((cmd: string) => resolveCommandOnLocalPath(cmd))
  const pathExists = overrides.pathExists ?? defaultPathExists
  const isNonEmptyFile = overrides.isNonEmptyFile ?? defaultIsNonEmptyFile
  const queryModels = overrides.queryModels ?? defaultQueryModels

  await hydrateShellPath()
  const detectedIds = await detectAgents()
  const uniqueIds = new Set<TuiAgent>(detectedIds.filter(isTuiAgent))
  if (!uniqueIds.has('antigravity') && (await resolveExecutable('agy'))) {
    uniqueIds.add('antigravity')
  }

  const results = await Promise.all(
    [...uniqueIds].map((agentId) =>
      detectConfiguredAgent(agentId, deps, {
        home,
        env,
        resolveExecutable,
        pathExists,
        isNonEmptyFile,
        queryModels
      })
    )
  )
  return results.filter((agent): agent is ConfiguredTeamAgent => agent !== null)
}
