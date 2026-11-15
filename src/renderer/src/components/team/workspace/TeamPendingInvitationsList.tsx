import React from 'react'
import { Copy, ExternalLink, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { TeamInvitation } from '../../../../../shared/teamwork/team-workspace-types'
import { getIntlLocale } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { copyTextToClipboard } from '../utils/team-clipboard'

type Props = {
  teamName: string
  invitations: TeamInvitation[]
  onResend: (invitationId: string) => Promise<void>
  onRevoke: (invitationId: string) => Promise<void>
}

export function buildInvitationMailtoHref(teamName: string, invitation: TeamInvitation): string {
  const joinUrl = `orca://team/join?token=${encodeURIComponent(invitation.token)}`
  const subject = encodeURIComponent(`Invitación a ${teamName} en Orca Teams`)
  const body = encodeURIComponent(
    `Hola,\n\nTe invito a unirte al equipo "${teamName}" como ${invitation.role.toUpperCase()} en Orca Teams.\n\nCódigo de invitación: ${invitation.token}\nEnlace directo: ${joinUrl}\n`
  )
  return `mailto:${encodeURIComponent(invitation.email)}?subject=${subject}&body=${body}`
}

export function TeamPendingInvitationsList({
  teamName,
  invitations,
  onResend,
  onRevoke
}: Props): React.JSX.Element | null {
  if (invitations.length === 0) {
    return null
  }

  const handleCopy = async (inv: TeamInvitation): Promise<void> => {
    const ok = await copyTextToClipboard(
      `Equipo: ${teamName}\nCódigo: ${inv.token}\nEnlace: orca://team/join?token=${inv.token}`
    )
    if (ok) {
      toast.success(`Invitación copiada para ${inv.email}`)
    } else {
      toast.error('No se pudo copiar al portapapeles')
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        Invitaciones pendientes ({invitations.length})
      </span>
      <div className="max-h-36 overflow-y-auto scrollbar-sleek space-y-1.5">
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/70 px-2.5 py-1.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium truncate">{inv.email}</span>
                <Badge variant="secondary">
                  <span className="text-3xs uppercase">{inv.role}</span>
                </Badge>
              </div>
              <span className="text-3xs text-muted-foreground">
                Expira {new Date(inv.expiresAt).toLocaleDateString(getIntlLocale())} · {inv.token}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Reenviar por email"
                onClick={() => void onResend(inv.id)}
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
              <a
                href={buildInvitationMailtoHref(teamName, inv)}
                title="Abrir en tu cliente de correo"
                className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Copiar código y enlace"
                onClick={() => void handleCopy(inv)}
              >
                <Copy className="w-3 h-3" />
              </Button>
              <Button
                type="button"
                variant="destructive-chip"
                size="icon-xs"
                title="Revocar invitación"
                onClick={() => void onRevoke(inv.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
