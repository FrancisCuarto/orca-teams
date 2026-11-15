import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type {
  TeamMailConfigInput,
  TeamMailConfigPublic,
  TeamMemberWithProfile,
  TeamSendInvitationResult
} from '../../../../../shared/teamwork/team-ipc-types'
import type {
  Project,
  Team,
  TeamInvitation,
  TeamRole
} from '../../../../../shared/teamwork/team-workspace-types'
import type { ExtendedTeamMember } from '../../../../../shared/teamwork/team-kanban-types'
import { getTeamsTeamApi } from '../storage/team-web-relay-api'
import {
  acceptTeamInvitationAction,
  createProjectAction,
  createTeamAction,
  resendTeamInvitationAction,
  saveTeamMailConfigAction,
  sendTeamInvitationAction,
  testTeamMailConfigAction
} from './use-team-workspace-registry-actions'

const INITIAL_STATIC_EPOCH = 1700000000

export function useTeamWorkspaceRegistry(options: {
  activeWorktreeId?: string
  activeWorktreePath?: string | null
  activeRepoId?: string
  activeRepoPath?: string | null
  activeRepoDisplayName?: string
  currentUserId?: string
}) {
  const defaultTeam: Team = useMemo(
    () => ({
      id: 'team-orca-core',
      name: 'Orca Core Team',
      slug: 'orca-core',
      ownerId: 'usr-francis',
      description: 'Equipo central de desarrollo',
      createdAt: INITIAL_STATIC_EPOCH,
      updatedAt: INITIAL_STATIC_EPOCH
    }),
    []
  )

  const defaultProject: Project = useMemo(() => {
    const path = options.activeWorktreePath ?? options.activeRepoPath ?? null
    const segments = path ? path.split(/[/\\]/).filter(Boolean) : []
    const name = options.activeRepoDisplayName ?? segments.at(-1) ?? 'Main Workspace'
    const id = options.activeRepoId ?? options.activeWorktreeId ?? 'proj-default'
    return {
      id,
      teamId: defaultTeam.id,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'main-workspace',
      visibility: 'team',
      createdAt: INITIAL_STATIC_EPOCH,
      updatedAt: INITIAL_STATIC_EPOCH
    }
  }, [
    options.activeWorktreePath,
    options.activeWorktreeId,
    options.activeRepoPath,
    options.activeRepoId,
    options.activeRepoDisplayName,
    defaultTeam.id
  ])

  const defaultOwnerMember: TeamMemberWithProfile = useMemo(
    () => ({
      teamId: defaultTeam.id,
      userId: 'usr-francis',
      role: 'owner',
      joinedAt: INITIAL_STATIC_EPOCH,
      displayName: 'Francis (Lead)',
      email: 'francis@orca.run'
    }),
    [defaultTeam.id]
  )

  const [teams, setTeams] = useState<Team[]>([defaultTeam])
  const [activeTeamId, setActiveTeamId] = useState<string>(defaultTeam.id)
  const [projects, setProjects] = useState<Project[]>([defaultProject])
  const [activeProjectId, setActiveProjectId] = useState<string>(defaultProject.id)
  const [membersByTeam, setMembersByTeam] = useState<Record<string, TeamMemberWithProfile[]>>({
    [defaultTeam.id]: [defaultOwnerMember]
  })
  const [invitationsByTeam, setInvitationsByTeam] = useState<Record<string, TeamInvitation[]>>({})
  const [mailConfig, setMailConfig] = useState<TeamMailConfigPublic | null>(null)

  const loadWorkspace = useCallback(async () => {
    const teamApi = getTeamsTeamApi()
    if (!teamApi) {
      return
    }
    try {
      const [snapshot, loadedMailConfig] = await Promise.all([
        teamApi.getWorkspaceSnapshot(),
        teamApi.getMailConfig()
      ])
      setMailConfig(loadedMailConfig)
      if (snapshot.teams.length > 0) {
        setTeams(snapshot.teams)
        setActiveTeamId((prev) =>
          snapshot.teams.some((t) => t.id === prev) ? prev : snapshot.teams[0].id
        )
      }
      if (snapshot.projects.length > 0) {
        setProjects(snapshot.projects)
        setActiveProjectId((prev) =>
          snapshot.projects.some((p) => p.id === prev) ? prev : snapshot.projects[0].id
        )
      }
      setMembersByTeam(snapshot.membersByTeam)
      setInvitationsByTeam(snapshot.invitationsByTeam)
    } catch (err) {
      console.warn('Error loading team workspace snapshot:', err)
    }
  }, [])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const activeTeam = useMemo(
    () => teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null,
    [teams, activeTeamId]
  )
  const teamProjects = useMemo(() => {
    if (!activeTeam) {
      return projects
    }
    const matching = projects.filter((p) => p.teamId === activeTeam.id)
    return matching.length > 0 ? matching : projects
  }, [activeTeam, projects])
  const currentProject = useMemo(
    () => teamProjects.find((p) => p.id === activeProjectId) ?? teamProjects[0] ?? null,
    [teamProjects, activeProjectId]
  )
  const activeMembers = useMemo(() => {
    const list = activeTeam ? membersByTeam[activeTeam.id] : undefined
    return list && list.length > 0 ? list : [defaultOwnerMember]
  }, [activeTeam, membersByTeam, defaultOwnerMember])
  const activePendingInvitations = useMemo(
    () =>
      activeTeam
        ? (invitationsByTeam[activeTeam.id] ?? []).filter((inv) => inv.status === 'pending')
        : [],
    [activeTeam, invitationsByTeam]
  )

  const currentUserId =
    options.currentUserId &&
    options.currentUserId !== 'local-owner' &&
    options.currentUserId !== 'web-guest'
      ? options.currentUserId
      : (activeTeam?.ownerId ?? options.currentUserId ?? 'usr-francis')
  const currentUserMember =
    activeMembers.find((m) => m.userId === currentUserId) ?? activeMembers[0]
  const currentUserName = currentUserMember?.displayName ?? 'Francis (Lead)'
  const userRole: TeamRole = currentUserMember?.role ?? 'owner'

  const humanMembers: ExtendedTeamMember[] = useMemo(
    () =>
      activeMembers.map((member) => ({
        id: member.userId,
        name: member.displayName,
        type: 'human',
        role: member.role.toUpperCase(),
        status: 'online',
        color: '#6366f1'
      })),
    [activeMembers]
  )

  const handleCreateTeam = useCallback(
    async (newTeam: Omit<Team, 'createdAt' | 'updatedAt'>) => {
      const created = await createTeamAction(newTeam, currentUserId)
      setTeams((prev) => [...prev.filter((t) => t.id !== created.id), created])
      setActiveTeamId(created.id)
      void loadWorkspace()
      toast.success(`Equipo '${created.name}' creado con éxito`)
    },
    [currentUserId, loadWorkspace]
  )

  const handleCreateProject = useCallback(
    async (newProj: Omit<Project, 'createdAt' | 'updatedAt'>) => {
      const created = await createProjectAction(newProj, currentUserId)
      setProjects((prev) => [...prev.filter((p) => p.id !== created.id), created])
      setActiveProjectId(created.id)
      void loadWorkspace()
      toast.success(`Proyecto '${created.name}' creado con éxito`)
    },
    [currentUserId, loadWorkspace]
  )

  const handleSendInvitation = useCallback(
    async (email: string, role: TeamRole): Promise<TeamSendInvitationResult> => {
      const teamId = activeTeam?.id ?? defaultTeam.id
      const result = await sendTeamInvitationAction({
        teamId,
        teamName: activeTeam?.name ?? defaultTeam.name,
        email,
        role,
        invitedBy: currentUserId,
        inviterName: currentUserName
      })
      setInvitationsByTeam((prev) => ({
        ...prev,
        [teamId]: [
          result.invitation,
          ...(prev[teamId] ?? []).filter((i) => i.id !== result.invitation.id)
        ]
      }))
      return result
    },
    [activeTeam, defaultTeam, currentUserId, currentUserName]
  )

  const handleResendInvitation = useCallback(
    async (invitationId: string): Promise<TeamSendInvitationResult> => {
      const result = await resendTeamInvitationAction(invitationId, currentUserName)
      const teamId = result.invitation.teamId
      setInvitationsByTeam((prev) => ({
        ...prev,
        [teamId]: [
          result.invitation,
          ...(prev[teamId] ?? []).filter((i) => i.id !== result.invitation.id)
        ]
      }))
      return result
    },
    [currentUserName]
  )

  const handleRevokeInvitation = useCallback(
    async (invitationId: string): Promise<void> => {
      const teamApi = getTeamsTeamApi()
      if (teamApi?.revokeInvitation) {
        await teamApi.revokeInvitation(invitationId, currentUserId)
      }
      if (activeTeam) {
        setInvitationsByTeam((prev) => ({
          ...prev,
          [activeTeam.id]: (prev[activeTeam.id] ?? []).filter((i) => i.id !== invitationId)
        }))
      }
      toast.success('Invitación revocada')
    },
    [activeTeam, currentUserId]
  )

  const handleAcceptInvitation = useCallback(
    async (token: string, displayName?: string, email?: string): Promise<TeamMemberWithProfile> => {
      const member = await acceptTeamInvitationAction(
        token,
        currentUserId,
        displayName || currentUserName,
        email || currentUserMember?.email
      )
      await loadWorkspace()
      return member
    },
    [currentUserId, currentUserName, currentUserMember?.email, loadWorkspace]
  )

  const handleSaveMailConfig = useCallback(
    async (input: TeamMailConfigInput): Promise<TeamMailConfigPublic> => {
      const saved = await saveTeamMailConfigAction(input)
      setMailConfig(saved)
      return saved
    },
    []
  )

  return {
    teams,
    activeTeam,
    projects: teamProjects,
    currentProject,
    activeMembers,
    activePendingInvitations,
    humanMembers,
    mailConfig,
    currentUserId,
    userRole,
    setActiveTeamId,
    setActiveProjectId,
    handleCreateTeam,
    handleCreateProject,
    handleSendInvitation,
    handleResendInvitation,
    handleRevokeInvitation,
    handleAcceptInvitation,
    handleSaveMailConfig,
    handleTestMailConfig: testTeamMailConfigAction
  }
}
