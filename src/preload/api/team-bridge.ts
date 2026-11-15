import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type { FactoryConfig } from '../../shared/teamwork/team-factory-types'
import type {
  TeamApi,
  TeamExecutionEvent,
  TeamFactoryEvent,
  TeamMailConfigInput,
  TeamResolveFactoryGateRequest,
  TeamSendInvitationRequest,
  TeamStartExecutionRequest,
  TeamStartFactoryRunRequest
} from '../../shared/teamwork/team-ipc-types'

export const teamApi: TeamApi = {
  listConfiguredAgents: (options?: { refresh?: boolean }) =>
    ipcRenderer.invoke('team:listConfiguredAgents', options),
  startExecution: (request: TeamStartExecutionRequest) =>
    ipcRenderer.invoke('team:startExecution', request),
  cancelExecution: (executionId: string) => ipcRenderer.invoke('team:cancelExecution', executionId),
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
  testMailConfig: (toEmail: string) => ipcRenderer.invoke('team:testMailConfig', toEmail)
} satisfies NonNullable<PreloadApi['team']>
