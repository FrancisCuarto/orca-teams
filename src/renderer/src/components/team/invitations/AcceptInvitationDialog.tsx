import React, { useState } from 'react'
import { CheckCircle2, Shield, UserCheck, Users, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { TeamInvitation } from '../../../../../shared/teamwork/team-workspace-types'

type Props = {
  open: boolean
  teamName: string
  invitation: TeamInvitation | null
  onOpenChange: (open: boolean) => void
  onAccept: (token: string) => Promise<void>
}

export function AcceptInvitationDialog({
  open,
  teamName,
  invitation,
  onOpenChange,
  onAccept
}: Props): React.JSX.Element {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)

  if (!invitation) {
    return null
  }

  const handleAccept = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      await onAccept(invitation.token)
      setAccepted(true)
      setTimeout(() => {
        onOpenChange(false)
        setAccepted(false)
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aceptar la invitación')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Invitación de Colaboración
            </span>
          </DialogTitle>
        </DialogHeader>

        {accepted ? (
          <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-workspace-status-review animate-in zoom-in-75" />
            <h3 className="text-sm font-semibold text-foreground">¡Te has unido al equipo!</h3>
            <p className="text-xs text-muted-foreground">
              Ya tienes acceso a los proyectos de <strong>{teamName}</strong>.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {error && (
              <div className="p-2 rounded bg-destructive/10 text-destructive text-xs flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="p-3 rounded-lg border border-border bg-card/60 flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-2xs text-muted-foreground uppercase font-medium">Equipo</span>
                <span className="text-xs font-semibold text-foreground">{teamName}</span>
              </div>

              <div className="flex flex-col items-end gap-0.5">
                <span className="text-2xs text-muted-foreground uppercase font-medium">
                  Rol Asignado
                </span>
                <Badge variant="secondary">
                  <Shield className="w-2.5 h-2.5 text-primary mr-1 inline" />
                  {invitation.role}
                </Badge>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Has recibido una invitación para sumarte como <strong>{invitation.role}</strong> y
              colaborar con personas y agentes de IA en este equipo.
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Rechazar
              </Button>
              <Button type="button" size="sm" onClick={handleAccept} disabled={loading}>
                <UserCheck className="w-3.5 h-3.5 mr-1.5 inline" />
                {loading ? 'Aceptando...' : 'Unirme al Equipo'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
