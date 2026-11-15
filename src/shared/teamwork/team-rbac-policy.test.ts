import { describe, expect, it } from 'vitest'
import {
  canAccessProject,
  getTeamPermissions,
  getTeamRoleLabel,
  isReadOnlyTeamRole
} from './team-rbac-policy'

describe('team-rbac-policy', () => {
  describe('getTeamPermissions', () => {
    it('grants full permissions to owner', () => {
      expect(getTeamPermissions('owner')).toEqual({
        canManageTeam: true,
        canManageMembers: true,
        canCreateProject: true,
        canEditBoard: true,
        canDispatchAgents: true,
        canApproveExecutions: true,
        canEditNotes: true,
        canEditWhiteboard: true,
        isReadOnly: false
      })
    })

    it('grants member management and editing permissions to admin without team ownership', () => {
      expect(getTeamPermissions('admin')).toEqual({
        canManageTeam: false,
        canManageMembers: true,
        canCreateProject: true,
        canEditBoard: true,
        canDispatchAgents: true,
        canApproveExecutions: true,
        canEditNotes: true,
        canEditWhiteboard: true,
        isReadOnly: false
      })
    })

    it('grants collaborative editing and agent permissions to member without member management', () => {
      expect(getTeamPermissions('member')).toEqual({
        canManageTeam: false,
        canManageMembers: false,
        canCreateProject: true,
        canEditBoard: true,
        canDispatchAgents: true,
        canApproveExecutions: true,
        canEditNotes: true,
        canEditWhiteboard: true,
        isReadOnly: false
      })
    })

    it('restricts viewer to strictly read-only permissions', () => {
      expect(getTeamPermissions('viewer')).toEqual({
        canManageTeam: false,
        canManageMembers: false,
        canCreateProject: false,
        canEditBoard: false,
        canDispatchAgents: false,
        canApproveExecutions: false,
        canEditNotes: false,
        canEditWhiteboard: false,
        isReadOnly: true
      })
    })
  })

  describe('canAccessProject', () => {
    it('denies access when role is null', () => {
      expect(canAccessProject({ visibility: 'team' }, null, true)).toBe(false)
      expect(canAccessProject({ visibility: 'private' }, null, true)).toBe(false)
    })

    it('allows all team members including viewers to access team-visible projects', () => {
      expect(canAccessProject({ visibility: 'team' }, 'owner', false)).toBe(true)
      expect(canAccessProject({ visibility: 'team' }, 'admin', false)).toBe(true)
      expect(canAccessProject({ visibility: 'team' }, 'member', false)).toBe(true)
      expect(canAccessProject({ visibility: 'team' }, 'viewer', false)).toBe(true)
    })

    it('allows owners and admins to access private projects even without explicit membership', () => {
      expect(canAccessProject({ visibility: 'private' }, 'owner', false)).toBe(true)
      expect(canAccessProject({ visibility: 'private' }, 'admin', false)).toBe(true)
    })

    it('restricts private projects for members and viewers to explicit project members', () => {
      expect(canAccessProject({ visibility: 'private' }, 'member', false)).toBe(false)
      expect(canAccessProject({ visibility: 'private' }, 'viewer', false)).toBe(false)
      expect(canAccessProject({ visibility: 'private' }, 'member', true)).toBe(true)
      expect(canAccessProject({ visibility: 'private' }, 'viewer', true)).toBe(true)
    })
  })

  describe('isReadOnlyTeamRole and getTeamRoleLabel', () => {
    it('identifies read-only roles accurately', () => {
      expect(isReadOnlyTeamRole('viewer')).toBe(true)
      expect(isReadOnlyTeamRole(null)).toBe(true)
      expect(isReadOnlyTeamRole(undefined)).toBe(true)
      expect(isReadOnlyTeamRole('member')).toBe(false)
      expect(isReadOnlyTeamRole('admin')).toBe(false)
      expect(isReadOnlyTeamRole('owner')).toBe(false)
    })

    it('returns human-readable role labels', () => {
      expect(getTeamRoleLabel('owner')).toBe('Owner')
      expect(getTeamRoleLabel('admin')).toBe('Admin')
      expect(getTeamRoleLabel('member')).toBe('Member')
      expect(getTeamRoleLabel('viewer')).toBe('Solo lectura (Viewer)')
    })
  })
})
