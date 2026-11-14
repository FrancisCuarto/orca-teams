import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { TeamDatabaseService } from './team-database-service'

describe('TeamInvitationService', () => {
  let db: DatabaseSync
  let service: TeamDatabaseService

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    service = new TeamDatabaseService(db)
    service.initSchema()

    service.createTeam({
      id: 'team-orca',
      name: 'Orca Core',
      slug: 'orca-core',
      ownerId: 'usr-francis'
    })

    service.addTeamMember({
      teamId: 'team-orca',
      userId: 'usr-admin',
      role: 'admin',
      actorUserId: 'usr-francis'
    })

    service.addTeamMember({
      teamId: 'team-orca',
      userId: 'usr-viewer',
      role: 'viewer',
      actorUserId: 'usr-francis'
    })
  })

  it('allows admins to create invitations and fetches details by token', () => {
    const inv = service.createInvitation({
      id: 'inv-100',
      teamId: 'team-orca',
      email: 'dev@orca.run',
      role: 'member',
      token: 'token-secure-dev-collaborator-123',
      invitedBy: 'usr-admin'
    })

    expect(inv.id).toBe('inv-100')
    expect(inv.status).toBe('pending')

    const fetched = service.getInvitationByToken('token-secure-dev-collaborator-123')
    expect(fetched).not.toBeNull()
    expect(fetched?.email).toBe('dev@orca.run')
    expect(fetched?.role).toBe('member')
  })

  it('successfully accepts invitation and adds member', () => {
    service.createInvitation({
      id: 'inv-accept',
      teamId: 'team-orca',
      email: 'newuser@orca.run',
      role: 'member',
      token: 'token-accept-me-now-123456789',
      invitedBy: 'usr-francis'
    })

    const member = service.acceptInvitation('token-accept-me-now-123456789', 'usr-newbie')
    expect(member.userId).toBe('usr-newbie')
    expect(member.role).toBe('member')

    expect(service.getTeamMemberRole('team-orca', 'usr-newbie')).toBe('member')

    const updatedInv = service.getInvitationByToken('token-accept-me-now-123456789')
    expect(updatedInv?.status).toBe('accepted')
  })

  it('allows admins to revoke invitations and blocks subsequent acceptance', () => {
    service.createInvitation({
      id: 'inv-revoke',
      teamId: 'team-orca',
      email: 'blocked@orca.run',
      role: 'member',
      token: 'token-to-be-revoked-by-admin',
      invitedBy: 'usr-francis'
    })

    // Revocation by admin
    service.revokeInvitation({
      invitationId: 'inv-revoke',
      actorUserId: 'usr-admin'
    })

    const revoked = service.getInvitationByToken('token-to-be-revoked-by-admin')
    expect(revoked?.status).toBe('revoked')

    // Cannot be accepted
    expect(() => {
      service.acceptInvitation('token-to-be-revoked-by-admin', 'usr-blocked')
    }).toThrow(/ya no es válida/)
  })

  it('denies viewers from revoking invitations', () => {
    service.createInvitation({
      id: 'inv-deny',
      teamId: 'team-orca',
      email: 'anyone@orca.run',
      role: 'member',
      token: 'token-deny-revoke-123456789',
      invitedBy: 'usr-francis'
    })

    expect(() => {
      service.revokeInvitation({
        invitationId: 'inv-deny',
        actorUserId: 'usr-viewer'
      })
    }).toThrow(/Permisos insuficientes/)
  })
})
