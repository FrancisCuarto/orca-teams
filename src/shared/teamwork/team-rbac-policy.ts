import type { Project, TeamRole } from './team-workspace-types'

export type TeamPermissions = {
  canManageTeam: boolean
  canManageMembers: boolean
  canCreateProject: boolean
  canEditBoard: boolean
  canDispatchAgents: boolean
  canApproveExecutions: boolean
  canEditNotes: boolean
  canEditWhiteboard: boolean
  isReadOnly: boolean
}

export function getTeamPermissions(role: TeamRole): TeamPermissions {
  switch (role) {
    case 'owner':
      return {
        canManageTeam: true,
        canManageMembers: true,
        canCreateProject: true,
        canEditBoard: true,
        canDispatchAgents: true,
        canApproveExecutions: true,
        canEditNotes: true,
        canEditWhiteboard: true,
        isReadOnly: false
      }
    case 'admin':
      return {
        canManageTeam: false,
        canManageMembers: true,
        canCreateProject: true,
        canEditBoard: true,
        canDispatchAgents: true,
        canApproveExecutions: true,
        canEditNotes: true,
        canEditWhiteboard: true,
        isReadOnly: false
      }
    case 'member':
      return {
        canManageTeam: false,
        canManageMembers: false,
        canCreateProject: true,
        canEditBoard: true,
        canDispatchAgents: true,
        canApproveExecutions: true,
        canEditNotes: true,
        canEditWhiteboard: true,
        isReadOnly: false
      }
    case 'viewer':
      return {
        canManageTeam: false,
        canManageMembers: false,
        canCreateProject: false,
        canEditBoard: false,
        canDispatchAgents: false,
        canApproveExecutions: false,
        canEditNotes: false,
        canEditWhiteboard: false,
        isReadOnly: true
      }
  }
}

export function canAccessProject(
  project: Pick<Project, 'visibility'>,
  role: TeamRole | null,
  isExplicitProjectMember = false
): boolean {
  if (!role) {
    return false
  }
  if (project.visibility === 'team') {
    return true
  }
  if (role === 'owner' || role === 'admin') {
    return true
  }
  return Boolean(isExplicitProjectMember)
}

export function isReadOnlyTeamRole(role: TeamRole | null | undefined): boolean {
  if (!role) {
    return true
  }
  return getTeamPermissions(role).isReadOnly
}

export function getTeamRoleLabel(role: TeamRole): string {
  switch (role) {
    case 'owner':
      return 'Owner'
    case 'admin':
      return 'Admin'
    case 'member':
      return 'Member'
    case 'viewer':
      return 'Solo lectura (Viewer)'
  }
}
