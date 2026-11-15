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
  ProjectMember,
  Team,
  TeamInvitation,
  TeamRole,
  TeamUserProfile
} from '../../../../../shared/teamwork/team-workspace-types'
import {
  canAccessProject,
  getTeamPermissions,
  type TeamPermissions
} from '../../../../../shared/teamwork/team-rbac-policy'
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
  currentUser?: TeamUserProfile
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
  const [projectMembersByProject, setProjectMembersByProject] = useState<
    Record<string, ProjectMember[]>
  >({})
  const [hasLoadedSnapshot, setHasLoadedSnapshot] = useState(false)
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
      setHasLoadedSnapshot(true)
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
      setProjectMembersByProject(snapshot.projectMembersByProject ?? {})
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
    return matching.length > 0 ? matching : hasLoadedSnapshot ? [] : projects
  }, [activeTeam, projects, hasLoadedSnapshot])
  const activeMembers = useMemo(() => {
    const list = activeTeam ? membersByTeam[activeTeam.id] : undefined
    if (list && list.length > 0) {
      return list
    }
    return hasLoadedSnapshot ? [] : [defaultOwnerMember]
  }, [activeTeam, membersByTeam, defaultOwnerMember, hasLoadedSnapshot])
  const activePendingInvitations = useMemo(
    () =>
      activeTeam
        ? (invitationsByTeam[activeTeam.id] ?? []).filter((inv) => inv.status === 'pending')
        : [],
    [activeTeam, invitationsByTeam]
  )

  const rawUserId = options.currentUserId?.trim() || options.currentUser?.userId?.trim()
  const currentUserId =
    rawUserId && rawUserId !== 'local-owner'
      ? rawUserId
      : (activeTeam?.ownerId ?? defaultOwnerMember.userId)
  const explicitMember = activeMembers.find((m) => m.userId === currentUserId)
  const currentUserMember = explicitMember ?? (hasLoadedSnapshot ? undefined : activeMembers[0])
  const currentUserName = currentUserMember?.displayName ?? 'Francis (Lead)'
  const userRole: TeamRole = explicitMember
    ? explicitMember.role
    : activeTeam?.ownerId === currentUserId
      ? 'owner'
      : hasLoadedSnapshot
        ? 'viewer'
        : (currentUserMember?.role ?? 'owner')
  const permissions: TeamPermissions = useMemo(() => getTeamPermissions(userRole), [userRole])

  const visibleProjects = useMemo(
    () =>
      teamProjects.filter((project) => {
        const projectMembers = projectMembersByProject[project.id] ?? []
        const isExplicitMember = projectMembers.some((m) => m.userId === currentUserId)
        return canAccessProject(project, userRole, isExplicitMember)
      }),
    [teamProjects, projectMembersByProject, currentUserId, userRole]
  )
  const currentProject = useMemo(
    () => visibleProjects.find((p) => p.id === activeProjectId) ?? visibleProjects[0] ?? null,
    [visibleProjects, activeProjectId]
  )

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
      if (!permissions.canCreateProject) {
        toast.error('Permisos insuficientes: tu rol no permite crear proyectos')
        return
      }
      const created = await createProjectAction(newProj, currentUserId)
      setProjects((prev) => [...prev.filter((p) => p.id !== created.id), created])
      if (created.visibility === 'private') {
        setProjectMembersByProject((prev) => ({
          ...prev,
          [created.id]: [
            ...(prev[created.id] ?? []),
            {
              projectId: created.id,
              userId: currentUserId,
              role: 'owner',
              joinedAt: created.createdAt
            }
          ]
        }))
      }
      setActiveProjectId(created.id)
      void loadWorkspace()
      toast.success(`Proyecto '${created.name}' creado con éxito`)
    },
    [currentUserId, loadWorkspace, permissions.canCreateProject]
  )

  const handleSendInvitation = useCallback(
    async (email: string, role: TeamRole): Promise<TeamSendInvitationResult> => {
      if (!permissions.canManageMembers) {
        throw new Error('Permisos insuficientes: se requiere rol admin u owner para invitar')
      }
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
    [activeTeam, defaultTeam, currentUserId, currentUserName, permissions.canManageMembers]
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
      if (!permissions.canManageMembers) {
        toast.error('Permisos insuficientes: se requiere rol admin u owner para revocar')
        return
      }
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
    [activeTeam, currentUserId, permissions.canManageMembers]
  )

  const handleAcceptInvitation = useCallback(
    async (token: string, displayName?: string, email?: string): Promise<TeamMemberWithProfile> => {
      const targetUserId = options.currentUser?.userId ?? currentUserId
      const targetName = displayName || options.currentUser?.displayName || currentUserName
      const targetEmail = email || options.currentUser?.email || currentUserMember?.email
      const member = await acceptTeamInvitationAction(
        token,
        targetUserId,
        targetName,
        targetEmail
      )
      await loadWorkspace()
      return member
    },
    [
      options.currentUser?.userId,
      options.currentUser?.displayName,
      options.currentUser?.email,
      currentUserId,
      currentUserName,
      currentUserMember?.email,
      loadWorkspace
    ]
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
    projects: visibleProjects,
    currentProject,
    activeMembers,
    activePendingInvitations,
    projectMembersByProject,
    humanMembers,
    mailConfig,
    currentUserId,
    userRole,
    permissions,
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
