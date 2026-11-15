import type {
  TeamMailConfigInput,
  TeamMailConfigPublic,
  TeamMemberWithProfile,
  TeamSendInvitationResult
} from '../../../../../shared/teamwork/team-ipc-types'
import type { Project, Team, TeamRole } from '../../../../../shared/teamwork/team-workspace-types'
import { getTeamsTeamApi } from '../storage/team-web-relay-api'

export { getTeamsTeamApi, getTeamsTeamApi as getTeamPreloadApi }

export async function createTeamAction(
  newTeam: Omit<Team, 'createdAt' | 'updatedAt'>,
  ownerId: string
): Promise<Team> {
  const teamApi = getTeamsTeamApi()
  if (teamApi?.createTeam) {
    return teamApi.createTeam({
      name: newTeam.name,
      slug: newTeam.slug,
      description: newTeam.description,
      ownerId
    })
  }
  const now = Date.now()
  return { ...newTeam, createdAt: now, updatedAt: now }
}

export async function createProjectAction(
  newProj: Omit<Project, 'createdAt' | 'updatedAt'>,
  actorUserId: string
): Promise<Project> {
  const teamApi = getTeamsTeamApi()
  if (teamApi?.createProject) {
    return teamApi.createProject({
      teamId: newProj.teamId,
      name: newProj.name,
      slug: newProj.slug,
      description: newProj.description,
      visibility: newProj.visibility,
      actorUserId
    })
  }
  const now = Date.now()
  return { ...newProj, createdAt: now, updatedAt: now }
}

export async function sendTeamInvitationAction(params: {
  teamId: string
  teamName: string
  email: string
  role: TeamRole
  invitedBy: string
  inviterName: string
}): Promise<TeamSendInvitationResult> {
  const teamApi = getTeamsTeamApi()
  if (!teamApi?.sendInvitation) {
    const now = Date.now()
    const token = `inv-${now}-${Math.random().toString(36).slice(2, 8)}`
    return {
      invitation: {
        id: token,
        teamId: params.teamId,
        email: params.email,
        role: params.role,
        token,
        invitedBy: params.invitedBy,
        status: 'pending',
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
        createdAt: now
      },
      joinUrl: `orca://team/join?token=${token}`,
      emailSent: false,
      needsMailConfig: true,
      error: 'El servicio de correo no está disponible en este entorno.'
    }
  }
  return teamApi.sendInvitation(params)
}

export async function resendTeamInvitationAction(
  invitationId: string,
  inviterName: string
): Promise<TeamSendInvitationResult> {
  const teamApi = getTeamsTeamApi()
  if (!teamApi?.resendInvitation) {
    throw new Error('El servicio de correo no está disponible')
  }
  return teamApi.resendInvitation(invitationId, inviterName)
}

export async function acceptTeamInvitationAction(
  token: string,
  userId: string,
  displayName?: string,
  email?: string
): Promise<TeamMemberWithProfile> {
  const teamApi = getTeamsTeamApi()
  if (!teamApi?.acceptInvitation) {
    throw new Error('El servicio de invitaciones no está disponible')
  }
  return teamApi.acceptInvitation(token.trim(), userId, displayName?.trim(), email?.trim())
}

export async function saveTeamMailConfigAction(
  input: TeamMailConfigInput
): Promise<TeamMailConfigPublic> {
  const teamApi = getTeamsTeamApi()
  if (!teamApi?.saveMailConfig) {
    throw new Error('El servicio de configuración de correo no está disponible')
  }
  return teamApi.saveMailConfig(input)
}

export async function testTeamMailConfigAction(
  toEmail: string
): Promise<{ ok: boolean; error?: string }> {
  const teamApi = getTeamsTeamApi()
  if (!teamApi?.testMailConfig) {
    return { ok: false, error: 'El servicio de correo no está disponible' }
  }
  return teamApi.testMailConfig(toEmail)
}
