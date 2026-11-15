import { create } from 'zustand'
import { useAppStore } from '@/store'
import type { TeamDeepLinkJoinPayload } from '../../../../../shared/teamwork/team-ipc-types'

export const useTeamDeepLinkJoinStore = create<{
  pendingJoin: TeamDeepLinkJoinPayload | null
  setPendingJoin: (payload: TeamDeepLinkJoinPayload | null) => void
}>()((set) => ({
  pendingJoin: null,
  setPendingJoin: (pendingJoin) => set({ pendingJoin })
}))

export function openTeamDeepLinkJoin(payload: TeamDeepLinkJoinPayload): void {
  useTeamDeepLinkJoinStore.getState().setPendingJoin(payload)
  useAppStore.getState().openTeamPage()
}
