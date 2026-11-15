import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type {
  TeamApi,
  TeamApproveExecutionRequest,
  TeamExecutionEvent,
  TeamMailConfigInput,
  TeamRejectExecutionRequest,
  TeamRequestExecutionChangesRequest,
  TeamSendInvitationRequest,
  TeamStartExecutionRequest
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
  getExecutionDiff: (executionId: string) =>
    ipcRenderer.invoke('team:getExecutionDiff', executionId),
  requestExecutionChanges: (request: TeamRequestExecutionChangesRequest) =>
    ipcRenderer.invoke('team:requestExecutionChanges', request),
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
