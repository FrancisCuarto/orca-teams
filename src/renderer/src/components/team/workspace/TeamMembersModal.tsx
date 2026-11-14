import React, { useState } from 'react'
import { Check, Copy, Mail, Shield, UserPlus, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  TEAM_ROLES,
  type TeamMember,
  type TeamRole
} from '../../../../../shared/teamwork/team-workspace-types'

type MemberWithProfile = TeamMember & {
  displayName: string
  email: string
  avatarUrl?: string
}

type Props = {
  open: boolean
  teamName: string
  members: MemberWithProfile[]
  userRole: TeamRole
  onOpenChange: (open: boolean) => void
  onInviteMember: (email: string, role: TeamRole) => Promise<string>
}

export function TeamMembersModal({
  open,
  teamName,
  members,
  userRole,
  onOpenChange,
  onInviteMember
}: Props): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [selectedRole, setSelectedRole] = useState<TeamRole>('member')
  const [generatedLink, setGeneratedLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canManageMembers = userRole === 'owner' || userRole === 'admin'

  const handleInvite = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!email.trim() || !email.includes('@')) {
      setError('Introduce un correo electrónico válido')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const link = await onInviteMember(email.trim(), selectedRole)
      setGeneratedLink(link)
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar la invitación')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = async (): Promise<void> => {
    if (!generatedLink) {
      return
    }
    await navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Users className="w-4 h-4 text-primary" />
            Miembros de {teamName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {canManageMembers && (
            <div className="p-3 rounded-lg border border-border bg-card/60 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <UserPlus className="w-3.5 h-3.5 text-primary" />
                Invitar nuevo colaborador
              </div>

              {error && (
                <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">
                  {error}
                </div>
              )}

              <form onSubmit={handleInvite} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@equipo.com"
                    className="h-8 pl-8 text-xs"
                    type="email"
                  />
                </div>

                <select
                  value={selectedRole}
                  onChange={(e) => {
                    const r = e.target.value as TeamRole
                    setSelectedRole(r)
                  }}
                  className="h-8 text-xs rounded-md border border-input bg-background px-2 text-foreground focus:outline-none"
                >
                  {TEAM_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role.toUpperCase()}
                    </option>
                  ))}
                </select>

                <Button type="submit" size="sm" className="h-8 text-xs" disabled={loading}>
                  {loading ? 'Generando...' : 'Invitar'}
                </Button>
              </form>

              {generatedLink && (
                <div className="p-2 rounded bg-primary/10 border border-primary/20 space-y-1.5">
                  <span className="text-3xs text-primary font-medium">
                    Enlace de invitación generado (válido por 7 días):
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={generatedLink}
                      className="flex-1 bg-background text-3xs font-mono p-1 rounded border border-border"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 text-3xs gap-1"
                      onClick={handleCopyLink}
                    >
                      {copied ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {copied ? 'Copiado' : 'Copiar'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Integrantes ({members.length})
            </span>
            <div className="max-h-56 overflow-y-auto scrollbar-sleek space-y-1.5 divide-y divide-border/50">
              {members.map((member) => (
                <div key={member.userId} className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold">
                      {member.displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{member.displayName}</span>
                      <span className="text-3xs text-muted-foreground">{member.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-3xs uppercase font-mono gap-1">
                      <Shield className="w-2.5 h-2.5" />
                      {member.role}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
