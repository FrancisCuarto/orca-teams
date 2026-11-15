import { app } from 'electron'
import type {
  AiVaultPrepareSessionResumeArgs,
  AiVaultPrepareSessionResumeResult
} from '../../../shared/ai-vault/resume/ai-vault-resume-preparation'
import {
  deleteRuntimeAiVaultSession,
  getSavedRuntimeAiVaultHostInfos,
  prepareRuntimeAiVaultSessionResume,
  resolveRuntimeAiVaultSessionTitles,
  scanRuntimeAiVaultSessions
} from '../../ai-vault/runtime-session-scanner'
import { callRuntimeSessionSearch } from '../../ai-vault/runtime-session-search-call'
import { getRuntimeEnvironmentRegistryRoot } from '../runtime-environments/runtime-environment-registry-root'
import { registerAiVaultHandlers } from '../ai-vault/ai-vault'
import { configureRuntimeAiVaultSessionDelete } from '../ai-vault/ai-vault-delete'
import { registerAiVaultSearchHandlers } from '../ai-vault/ai-vault-search'

export function registerAiVaultWiring(options: {
  ensureStructuredSessionOwnership: () => Promise<void>
  getAdditionalAiVaultCodexHomePaths?: () => readonly string[]
  prepareAiVaultSessionResume?: (
    args: AiVaultPrepareSessionResumeArgs
  ) => Promise<AiVaultPrepareSessionResumeResult>
}): void {
  const { ensureStructuredSessionOwnership } = options
  registerAiVaultSearchHandlers({
    callRuntimeSearch: (environmentId, method, params) =>
      callRuntimeSessionSearch(getRuntimeEnvironmentRegistryRoot(), environmentId, method, params),
    ensureStructuredSessionOwnership
  })
  registerAiVaultHandlers({
    getUserDataPath: () => app.getPath('userData'),
    ensureStructuredSessionOwnership,
    getAdditionalCodexHomePaths: options.getAdditionalAiVaultCodexHomePaths,
    prepareSessionResume: options.prepareAiVaultSessionResume,
    getActiveRuntimeAiVaultHostInfos: () =>
      getSavedRuntimeAiVaultHostInfos(getRuntimeEnvironmentRegistryRoot()),
    scanRuntimeAiVaultSessions: async (environmentId, args, scanOptions) =>
      scanRuntimeAiVaultSessions(
        getRuntimeEnvironmentRegistryRoot(),
        environmentId,
        args,
        scanOptions
      ),
    resolveRuntimeAiVaultSessionTitles: async (environmentId, args) =>
      resolveRuntimeAiVaultSessionTitles(getRuntimeEnvironmentRegistryRoot(), environmentId, args),
    prepareRuntimeSessionResume: async (environmentId, args) =>
      prepareRuntimeAiVaultSessionResume(getRuntimeEnvironmentRegistryRoot(), environmentId, args)
  })
  configureRuntimeAiVaultSessionDelete((environmentId, args) =>
    deleteRuntimeAiVaultSession(getRuntimeEnvironmentRegistryRoot(), environmentId, args)
  )
}
