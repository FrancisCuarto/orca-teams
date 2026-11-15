import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type { FactoryConfig } from '../../shared/teamwork/team-factory-types'
import type {
  TeamApi,
  TeamApproveExecutionRequest,
  TeamDeepLinkJoinPayload,
  TeamExecutionEvent,
  TeamFactoryEvent,
  TeamMailConfigInput,
  TeamRejectExecutionRequest,
  TeamResolveFactoryGateRequest,
  TeamSendInvitationRequest,
  TeamStartExecutionRequest,
  TeamStartFactoryRunRequest
} from '../../shared/teamwork/team-ipc-types'
import type {
  TeamActivityEntry,
  TeamSyncSettings
} from '../../shared/teamwork/team-workspace-types'

export const teamApi: TeamApi = {
  listConfiguredAgents: (options?: { refresh?: boolean }) =>
    ipcRenderer.invoke('team:listConfiguredAgents', options),
  startExecution: (request: TeamStartExecutionRequest) =>
    ipcRenderer.invoke('team:startExecution', request),
  cancelExecution: (executionId: string) => ipcRenderer.invoke('team:cancelExecution', executionId),
  approveExecution: (request: TeamApproveExecutionRequest) =>
    ipcRenderer.invoke('team:approveExecution', request),
  rejectExecution: (request: TeamRejectExecutionRequest) =>
    ipcRenderer.invoke('team:rejectExecution', request),
  getExecution: (executionId: string) => ipcRenderer.invoke('team:getExecution', executionId),
  getLatestExecutionForCard: (cardId: string) =>
    ipcRenderer.invoke('team:getLatestExecutionForCard', cardId),
  onExecutionEvent: (callback: (event: TeamExecutionEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TeamExecutionEvent): void => {
      callback(payload)
    }
    ipcRenderer.on('team:executionEvent', listener)
    return () => {
      ipcRenderer.removeListener('team:executionEvent', listener)
    }
  },
  getFactoryConfig: (projectId: string) => ipcRenderer.invoke('team:getFactoryConfig', projectId),
  saveFactoryConfig: (config: FactoryConfig) =>
    ipcRenderer.invoke('team:saveFactoryConfig', config),
  startFactoryRun: (request: TeamStartFactoryRunRequest) =>
    ipcRenderer.invoke('team:startFactoryRun', request),
  cancelFactoryRun: (runId: string) => ipcRenderer.invoke('team:cancelFactoryRun', runId),
  resolveFactoryHumanGate: (request: TeamResolveFactoryGateRequest) =>
    ipcRenderer.invoke('team:resolveFactoryHumanGate', request),
  getFactoryRun: (runId: string) => ipcRenderer.invoke('team:getFactoryRun', runId),
  getLatestFactoryRunForCard: (cardId: string) =>
    ipcRenderer.invoke('team:getLatestFactoryRunForCard', cardId),
  listFactoryRuns: (projectId: string) => ipcRenderer.invoke('team:listFactoryRuns', projectId),
  onFactoryEvent: (callback: (event: TeamFactoryEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TeamFactoryEvent): void => {
      callback(payload)
    }
    ipcRenderer.on('team:factoryEvent', listener)
    return () => {
      ipcRenderer.removeListener('team:factoryEvent', listener)
    }
  },
  onDeepLinkJoin: (callback: (payload: TeamDeepLinkJoinPayload) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: TeamDeepLinkJoinPayload
    ): void => {
      callback(payload)
    }
    ipcRenderer.on('team:deepLinkJoin', listener)
    return () => {
      ipcRenderer.removeListener('team:deepLinkJoin', listener)
    }
  },
  consumePendingDeepLinkJoin: () => ipcRenderer.invoke('team:consumePendingDeepLinkJoin'),
  getWorkspaceSnapshot: () => ipcRenderer.invoke('team:getWorkspaceSnapshot'),
  createTeam: (input) => ipcRenderer.invoke('team:createTeam', input),
  createProject: (input) => ipcRenderer.invoke('team:createProject', input),
  sendInvitation: (request: TeamSendInvitationRequest) =>
    ipcRenderer.invoke('team:sendInvitation', request),
  resendInvitation: (invitationId: string, inviterName?: string) =>
    ipcRenderer.invoke('team:resendInvitation', invitationId, inviterName),
  acceptInvitation: (token: string, userId: string, displayName?: string, email?: string) =>
    ipcRenderer.invoke('team:acceptInvitation', token, userId, displayName, email),
  revokeInvitation: (invitationId: string, actorUserId: string) =>
    ipcRenderer.invoke('team:revokeInvitation', invitationId, actorUserId),
  getMailConfig: () => ipcRenderer.invoke('team:getMailConfig'),
  saveMailConfig: (input: TeamMailConfigInput) => ipcRenderer.invoke('team:saveMailConfig', input),
  testMailConfig: (toEmail: string) => ipcRenderer.invoke('team:testMailConfig', toEmail),
  listActivity: (options: { teamId: string; projectId?: string; limit?: number }) =>
    ipcRenderer.invoke('team:listActivity', options),
  recordActivity: (entry: Omit<TeamActivityEntry, 'id' | 'createdAt'>) =>
    ipcRenderer.invoke('team:recordActivity', entry),
  getCurrentUser: () => ipcRenderer.invoke('team:getCurrentUser'),
  updateUserProfile: (input: { displayName: string; email: string }) =>
    ipcRenderer.invoke('team:updateUserProfile', input),
  requestMagicLinkCode: (email: string, displayName?: string) =>
    ipcRenderer.invoke('team:requestMagicLinkCode', email, displayName),
  verifyMagicLinkCode: (email: string, code: string, displayName?: string) =>
    ipcRenderer.invoke('team:verifyMagicLinkCode', email, code, displayName),
  getSyncStatus: () => ipcRenderer.invoke('team:getSyncStatus'),
  configureSync: (settings: Partial<TeamSyncSettings>) =>
    ipcRenderer.invoke('team:configureSync', settings)
} satisfies NonNullable<PreloadApi['team']>
