import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type {
  TeamApi,
  TeamExecutionEvent,
  TeamMailConfigInput,
  TeamSendInvitationRequest,
  TeamStartExecutionRequest
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
