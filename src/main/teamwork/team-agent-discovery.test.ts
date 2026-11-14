import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listConfiguredTeamAgents,
  parseModelListingOutput,
  resetTeamAgentDiscoveryCacheForTests
} from './team-agent-discovery'

describe('team-agent-discovery', () => {
  beforeEach(() => {
    resetTeamAgentDiscoveryCacheForTests()
  })

  it('parses both plain and tab-separated model listings cleanly', () => {
    const raw = [
      'Available models:',
      'opencode-go/glm-5.3',
      'gemini-4-argon-medium\tGemini 4 Argon (Medium)',
      'gemini-pro-orchestrator-g1-pro\tOrchestrator (Argon)',
      '---',
      ''
    ].join('\n')
    expect(parseModelListingOutput(raw)).toEqual([
      'opencode-go/glm-5.3',
      'gemini-4-argon-medium',
      'gemini-pro-orchestrator-g1-pro'
    ])
  })

  it('returns ONLY installed AND configured agents, excluding unconfigured ones', async () => {
    const agents = await listConfiguredTeamAgents({
      claudeAccounts: { list: () => [] },
      codexAccounts: { list: () => [] },
      overrides: {
        homeDir: '/home/tester',
        env: {},
        hydrateShellPath: async () => undefined,
        detectAgents: async () => ['claude', 'codex', 'gemini', 'aider'],
        resolveExecutable: async () => null,
        pathExists: async (p) => p === '/home/tester/.claude/.credentials.json',
        isNonEmptyFile: async () => false,
        queryModels: async () => []
      }
    })

    expect(agents).toHaveLength(1)
    expect(agents[0]?.id).toBe('claude')
    expect(agents[0]?.command).toBe('claude')
    expect(agents[0]?.configured).toBe(true)
    expect(agents[0]?.configSource).toBe('~/.claude/.credentials.json')
  })

  it('detects antigravity via agy fallback and caches opencode/agy models until refresh', async () => {
    const queryModels = vi.fn(async (bin: string) => {
      if (bin.endsWith('agy')) {
        return ['gemini-4-argon-medium', 'gemini-pro-orchestrator-g1-pro']
      }
      return ['opencode-go/glm-5.3', 'opencode-go/deepseek-v4-pro']
    })

    const overrides = {
      homeDir: '/home/tester',
      env: {},
      hydrateShellPath: async () => undefined,
      detectAgents: async () => ['opencode'],
      resolveExecutable: async (cmd: string) =>
        cmd === 'agy' ? '/home/tester/.local/bin/agy' : `/usr/bin/${cmd}`,
      pathExists: async (p: string) =>
        p === '/home/tester/.local/share/opencode/auth.json' ||
        p === '/home/tester/.gemini/antigravity',
      isNonEmptyFile: async () => false,
      queryModels
    }

    const first = await listConfiguredTeamAgents({
      claudeAccounts: { listAccounts: () => ({ accounts: [] }) },
      codexAccounts: { listAccounts: () => ({ accounts: [] }) },
      overrides
    })

    expect(first.map((a) => a.id).sort()).toEqual(['antigravity', 'opencode'])
    const agy = first.find((a) => a.id === 'antigravity')
    expect(agy?.command).toBe('agy')
    expect(agy?.defaultModel).toBe('gemini-pro-orchestrator-g1-pro')
    expect(queryModels).toHaveBeenCalledTimes(2)

    await listConfiguredTeamAgents({ overrides })
    expect(queryModels).toHaveBeenCalledTimes(2)

    await listConfiguredTeamAgents({ refresh: true, overrides })
    expect(queryModels).toHaveBeenCalledTimes(4)
  })

  it('checks managed accounts, env vars, and non-empty gemini settings', async () => {
    const agents = await listConfiguredTeamAgents({
      claudeAccounts: { listAccounts: () => ({ accounts: [{ id: 'acc-1' }] }) },
      codexAccounts: { listAccounts: () => ({ accounts: [{ id: 'cx-1' }] }) },
      overrides: {
        homeDir: '/home/tester',
        env: {},
        hydrateShellPath: async () => undefined,
        detectAgents: async () => ['claude', 'codex', 'gemini'],
        resolveExecutable: async () => null,
        pathExists: async () => false,
        isNonEmptyFile: async (p) => p === '/home/tester/.gemini/settings.json',
        queryModels: async () => []
      }
    })

    expect(agents.map((a) => a.id).sort()).toEqual(['claude', 'codex', 'gemini'])
    expect(agents.find((a) => a.id === 'claude')?.configSource).toBe('Orca Claude Accounts')
    expect(agents.find((a) => a.id === 'codex')?.configSource).toBe('Orca Codex Accounts')
    expect(agents.find((a) => a.id === 'gemini')?.configSource).toBe('~/.gemini/settings.json')
  })
})
