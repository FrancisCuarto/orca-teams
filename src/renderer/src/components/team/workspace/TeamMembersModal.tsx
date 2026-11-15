import React, { useState } from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Mail,
  Settings2,
  Shield,
  UserPlus,
  Users
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  TEAM_ROLES,
  type TeamInvitation,
  type TeamRole
} from '../../../../../shared/teamwork/team-workspace-types'
import type {
  TeamMailConfigInput,
  TeamMailConfigPublic,
  TeamMemberWithProfile,
  TeamSendInvitationResult
} from '../../../../../shared/teamwork/team-ipc-types'
import { copyTextToClipboard } from '../utils/team-clipboard'
import { TeamMailConfigPanel } from './TeamMailConfigPanel'
import { buildInvitationMailtoHref, TeamPendingInvitationsList } from './TeamPendingInvitationsList'

function isTeamRole(value: string): value is TeamRole {
  return value === 'owner' || value === 'admin' || value === 'member' || value === 'viewer'
}

const EMPTY_INVITATIONS: TeamInvitation[] = []

type Props = {
  open: boolean
  teamName: string
  members: TeamMemberWithProfile[]
  pendingInvitations?: TeamInvitation[]
  mailConfig?: TeamMailConfigPublic | null
  userRole: TeamRole
  initialJoinToken?: string | null
  onClearPendingJoin?: () => void
  onOpenChange: (open: boolean) => void
  onInviteMember: (email: string, role: TeamRole) => Promise<TeamSendInvitationResult>
  onResendInvitation?: (invitationId: string) => Promise<TeamSendInvitationResult>
  onRevokeInvitation?: (invitationId: string) => Promise<void>
  onAcceptInvitation?: (token: string, displayName?: string, email?: string) => Promise<unknown>
  onSaveMailConfig?: (input: TeamMailConfigInput) => Promise<TeamMailConfigPublic>
  onTestMailConfig?: (toEmail: string) => Promise<{ ok: boolean; error?: string }>
}

function TeamMembersModalBody({
  teamName,
  members,
  pendingInvitations = EMPTY_INVITATIONS,
  mailConfig = null,
  userRole,
  initialJoinToken = null,
  onClearPendingJoin,
  onInviteMember,
  onResendInvitation,
  onRevokeInvitation,
  onAcceptInvitation,
  onSaveMailConfig,
  onTestMailConfig
}: Omit<Props, 'open' | 'onOpenChange'>): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [selectedRole, setSelectedRole] = useState<TeamRole>('member')
  const [lastResult, setLastResult] = useState<TeamSendInvitationResult | null>(null)
  const [showMailConfig, setShowMailConfig] = useState(false)
  const [showRedeem, setShowRedeem] = useState(Boolean(initialJoinToken))
  const [redeemToken, setRedeemToken] = useState(initialJoinToken ?? '')
  const [redeemName, setRedeemName] = useState('')
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
      const result = await onInviteMember(email.trim(), selectedRole)
      setLastResult(result)
      setEmail('')
      if (!result.emailSent && result.needsMailConfig) {
        setShowMailConfig(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar la invitación')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = async (): Promise<void> => {
    if (!lastResult) {
      return
    }
    const ok = await copyTextToClipboard(
      `Equipo: ${teamName}\nCódigo: ${lastResult.invitation.token}\nEnlace: ${lastResult.joinUrl}`
    )
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error('No se pudo copiar el enlace al portapapeles')
    }
  }

  const handleRedeem = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!onAcceptInvitation || !redeemToken.trim()) {
      return
    }
    const cleanToken = redeemToken.includes('token=')
      ? (new URLSearchParams(redeemToken.split('?')[1] ?? '').get('token') ?? redeemToken)
      : redeemToken
    try {
      await onAcceptInvitation(cleanToken.trim(), redeemName.trim() || undefined)
      toast.success('¡Te uniste al equipo con éxito!')
      setRedeemToken('')
      setRedeemName('')
      setShowRedeem(false)
      onClearPendingJoin?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Código inválido o expirado')
    }
  }

  return (
    <>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle>
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Miembros de {teamName}
              </span>
            </DialogTitle>
            <div className="flex items-center gap-1.5">
              {onAcceptInvitation && (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => setShowRedeem((prev) => !prev)}
                >
                  <KeyRound className="w-3 h-3" /> Tengo código
                </Button>
              )}
              {onSaveMailConfig && (
                <Button
                  type="button"
                  size="xs"
                  variant={showMailConfig ? 'secondary' : 'outline'}
                  onClick={() => setShowMailConfig((prev) => !prev)}
                >
                  <Settings2 className="w-3 h-3" /> Config. Email
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-1 max-h-[75vh] overflow-y-auto scrollbar-sleek">
          {showRedeem && onAcceptInvitation && (
            <form
              onSubmit={handleRedeem}
              className="p-3 rounded-lg border border-border bg-muted/30 space-y-2"
            >
              <span className="text-xs font-semibold block">
                Canjear código o enlace de invitación
              </span>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={redeemToken}
                  onChange={(e) => setRedeemToken(e.target.value)}
                  placeholder="inv-... o orca://team/join?token=..."
                  className="h-7"
                />
                <Input
                  value={redeemName}
                  onChange={(e) => setRedeemName(e.target.value)}
                  placeholder="Tu nombre visible"
                  className="h-7"
                />
              </div>
              <Button type="submit" size="xs">
                Unirme al equipo
              </Button>
            </form>
          )}

          {showMailConfig && onSaveMailConfig && onTestMailConfig && (
            <TeamMailConfigPanel
              mailConfig={mailConfig}
              onSave={onSaveMailConfig}
              onTest={onTestMailConfig}
            />
          )}

          {canManageMembers && (
            <div className="p-3 rounded-lg border border-border bg-card/60 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <UserPlus className="w-3.5 h-3.5 text-primary" /> Invitar nuevo colaborador
              </div>
              {error && (
                <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">
                  {error}
                </div>
              )}
              <form onSubmit={handleInvite} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 flex-1">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@equipo.com"
                    className="h-8 flex-1"
                    type="email"
                  />
                </div>
                <select
                  value={selectedRole}
                  onChange={(e) => {
                    if (isTeamRole(e.target.value)) {
                      setSelectedRole(e.target.value)
                    }
                  }}
                  className="h-8 text-xs rounded-md border border-input bg-background px-2 text-foreground focus:outline-none"
                >
                  {TEAM_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role.toUpperCase()}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" disabled={loading}>
                  {loading ? 'Enviando...' : 'Invitar'}
                </Button>
              </form>

              {lastResult && (
                <div
                  className={`p-2.5 rounded border space-y-2 ${
                    lastResult.emailSent
                      ? 'bg-workspace-status-review/10 border-workspace-status-review/30'
                      : 'bg-annotation-highlight/10 border-annotation-highlight/30'
                  }`}
                >
                  <span
                    className={`text-3xs font-medium block ${
                      lastResult.emailSent
                        ? 'text-workspace-status-review'
                        : 'text-annotation-highlight'
                    }`}
                  >
                    {lastResult.emailSent
                      ? `Correo enviado a ${lastResult.invitation.email} vía ${lastResult.transportUsed?.toUpperCase()}`
                      : `Invitación guardada, pero el correo NO se envió: ${lastResult.error ?? 'Configura SMTP o Resend arriba.'}`}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      readOnly
                      value={lastResult.joinUrl}
                      className="flex-1 min-w-[160px] bg-background text-3xs font-mono p-1 rounded border border-border"
                    />
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => void handleCopyLink()}
                    >
                      {copied ? (
                        <Check className="w-3 h-3 text-workspace-status-review" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      {copied ? 'Copiado' : 'Copiar'}
                    </Button>
                    <a
                      href={buildInvitationMailtoHref(teamName, lastResult.invitation)}
                      className="inline-flex items-center gap-1 h-6 px-2 rounded border border-border bg-background text-3xs hover:bg-muted"
                    >
                      <ExternalLink className="w-3 h-3" /> Abrir Mail
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          <TeamPendingInvitationsList
            teamName={teamName}
            invitations={pendingInvitations}
            onResend={async (id) => {
              if (!onResendInvitation) {
                return
              }
              const res = await onResendInvitation(id)
              setLastResult(res)
              if (res.emailSent) {
                toast.success(`Invitación reenviada a ${res.invitation.email}`)
              } else {
                toast.warning(res.error ?? 'No se pudo enviar el email de invitación')
                setShowMailConfig(true)
              }
            }}
            onRevoke={async (id) => {
              if (onRevokeInvitation) {
                await onRevokeInvitation(id)
              }
            }}
          />

          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">
              Integrantes ({members.length})
            </span>
            <div className="max-h-48 overflow-y-auto scrollbar-sleek space-y-1.5 divide-y divide-border/50">
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
                  <Badge variant="outline">
                    <Shield className="w-2.5 h-2.5" />
                    <span className="text-3xs uppercase font-mono">{member.role}</span>
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
    </>
  )
}

export function TeamMembersModal({
  open,
  onOpenChange,
  ...bodyProps
}: Props): React.JSX.Element {
  const modalBodyKey = `${bodyProps.teamName}:${bodyProps.initialJoinToken ?? 'none'}`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <TeamMembersModalBody key={modalBodyKey} {...bodyProps} />
      </DialogContent>
    </Dialog>
  )
}
