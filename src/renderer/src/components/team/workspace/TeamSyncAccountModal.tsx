import React, { useState } from 'react'
import { Check, Copy, KeyRound, Radio, Server, ShieldCheck, UserCheck, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { TeamSyncRuntimeStatus } from '../../../../../shared/teamwork/team-ipc-types'
import type {
  TeamSyncMode,
  TeamSyncSettings,
  TeamUserProfile
} from '../../../../../shared/teamwork/team-workspace-types'
import { copyTextToClipboard } from '../utils/team-clipboard'

type Props = {
  open: boolean
  user: TeamUserProfile
  syncStatus: TeamSyncRuntimeStatus
  onOpenChange: (open: boolean) => void
  onUpdateProfile: (input: { displayName: string; email: string }) => Promise<TeamUserProfile>
  onRequestMagicCode: (
    email: string,
    displayName?: string
  ) => Promise<{ sent: boolean; expiresAt: number; devCode?: string; error?: string }>
  onVerifyMagicCode: (email: string, code: string, displayName?: string) => Promise<TeamUserProfile>
  onConfigureSync: (settings: Partial<TeamSyncSettings>) => Promise<TeamSyncRuntimeStatus>
}

function SyncAccountModalBody({
  user,
  syncStatus,
  onUpdateProfile,
  onRequestMagicCode,
  onVerifyMagicCode,
  onConfigureSync
}: Omit<Props, 'open' | 'onOpenChange'>): React.JSX.Element {
  const [displayName, setDisplayName] = useState(user.displayName)
  const [email, setEmail] = useState(user.email)
  const [authCode, setAuthCode] = useState('')
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null)
  const [codeRequested, setCodeRequested] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)

  const [mode, setMode] = useState<TeamSyncMode>(syncStatus.settings.mode)
  const [relayUrl, setRelayUrl] = useState(syncStatus.settings.relayUrl)
  const [hostPort, setHostPort] = useState(String(syncStatus.settings.hostPort || 4789))
  const [roomSecret, setRoomSecret] = useState(syncStatus.settings.roomSecret ?? '')
  const [syncBusy, setSyncBusy] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)

  const handleSaveProfile = async (): Promise<void> => {
    setAuthBusy(true)
    try {
      await onUpdateProfile({ displayName, email })
      toast.success('Perfil de colaborador actualizado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el perfil')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleRequestCode = async (): Promise<void> => {
    setAuthBusy(true)
    try {
      const res = await onRequestMagicCode(email, displayName)
      setCodeRequested(true)
      if (res.sent) {
        setDevCodeHint(null)
        toast.success(`Código enviado a ${email}`)
      } else {
        setDevCodeHint(res.devCode ?? null)
        toast.warning('Correo no configurado; usa el código local generado para verificar')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo solicitar el código')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleVerifyCode = async (): Promise<void> => {
    setAuthBusy(true)
    try {
      await onVerifyMagicCode(email, authCode, displayName)
      setCodeRequested(false)
      setAuthCode('')
      setDevCodeHint(null)
      toast.success('Cuenta verificada con éxito')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Código inválido o expirado')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleSaveSync = async (): Promise<void> => {
    setSyncBusy(true)
    try {
      const parsedPort = Number(hostPort)
      const status = await onConfigureSync({
        mode,
        relayUrl,
        hostPort: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4789,
        roomSecret: roomSecret.trim() || undefined,
        autoConnect: mode !== 'local'
      })
      toast.success(
        status.hostingActive && status.hostingUrl
          ? `Relay activo en ${status.hostingUrl}`
          : mode === 'remote'
            ? 'Conectado a relay remoto'
            : 'Modo local activado'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo aplicar la sincronización')
    } finally {
      setSyncBusy(false)
    }
  }

  const handleCopyHostingUrl = async (): Promise<void> => {
    if (!syncStatus.hostingUrl) {
      return
    }
    const ok = await copyTextToClipboard(syncStatus.hostingUrl)
    if (ok) {
      setCopiedUrl(true)
      toast.success('URL del Relay copiada')
      setTimeout(() => setCopiedUrl(false), 1800)
    }
  }

  return (
    <div className="space-y-4 py-1 max-h-[70vh] overflow-y-auto scrollbar-sleek pr-1">
      <section className="rounded-lg border border-border bg-card/50 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <UserCheck className="w-4 h-4 text-primary" />
            <span>Identidad y Verificación</span>
          </div>
          <Badge variant={user.authMethod === 'magic-link' ? 'secondary' : 'outline'}>
            {user.authMethod === 'magic-link' ? 'Verificado' : 'Perfil Local'}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-2xs font-medium text-muted-foreground">Nombre visible</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Tu nombre"
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <label className="text-2xs font-medium text-muted-foreground">Correo</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@equipo.com"
              className="h-8"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="secondary"
            disabled={authBusy}
            onClick={() => void handleSaveProfile()}
          >
            Guardar Perfil
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={authBusy}
            onClick={() => void handleRequestCode()}
          >
            <KeyRound className="w-3 h-3" />
            Verificar por Código Email
          </Button>
        </div>

        {codeRequested && (
          <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2">
            {devCodeHint && (
              <div className="text-2xs text-muted-foreground">
                Código local generado (sin SMTP configurado):{' '}
                <code className="font-mono font-semibold text-foreground">{devCodeHint}</code>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                variant="code"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="Código de 6 dígitos"
                className="h-8"
              />
              <Button
                type="button"
                size="xs"
                disabled={authBusy || !authCode.trim()}
                onClick={() => void handleVerifyCode()}
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card/50 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Wifi className="w-4 h-4 text-primary" />
            <span>Sincronización Multiusuario (CRDT WebSocket)</span>
          </div>
          {syncStatus.hostingActive && (
            <Badge variant="secondary">
              <Radio className="w-2.5 h-2.5 text-workspace-status-review animate-pulse" />
              <span className="ml-1">
                {syncStatus.connectedPeers} pares · {syncStatus.activeRooms} salas
              </span>
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            size="xs"
            variant={mode === 'local' ? 'default' : 'outline'}
            onClick={() => setMode('local')}
          >
            Local (Offline)
          </Button>
          <Button
            type="button"
            size="xs"
            variant={mode === 'host' ? 'default' : 'outline'}
            onClick={() => setMode('host')}
          >
            <Server className="w-3 h-3" />
            Hostear Relay
          </Button>
          <Button
            type="button"
            size="xs"
            variant={mode === 'remote' ? 'default' : 'outline'}
            onClick={() => setMode('remote')}
          >
            <Wifi className="w-3 h-3" />
            Relay Remoto
          </Button>
        </div>

        {mode === 'host' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-2xs font-medium text-muted-foreground">Puerto WebSocket</label>
              <Input
                variant="code"
                value={hostPort}
                onChange={(e) => setHostPort(e.target.value)}
                placeholder="4789"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <label className="text-2xs font-medium text-muted-foreground">
                Secreto de sala (opcional)
              </label>
              <Input
                variant="code"
                type="password"
                value={roomSecret}
                onChange={(e) => setRoomSecret(e.target.value)}
                placeholder="token-equipo"
                className="h-8"
              />
            </div>
          </div>
        )}

        {mode === 'remote' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-2xs font-medium text-muted-foreground">
                URL del Servidor Relay
              </label>
              <Input
                variant="code"
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                placeholder="ws://192.168.1.20:4789"
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <label className="text-2xs font-medium text-muted-foreground">
                Secreto de sala (opcional)
              </label>
              <Input
                variant="code"
                type="password"
                value={roomSecret}
                onChange={(e) => setRoomSecret(e.target.value)}
                placeholder="token-equipo"
                className="h-8"
              />
            </div>
          </div>
        )}

        {syncStatus.hostingActive && syncStatus.hostingUrl && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-workspace-status-review/30 bg-workspace-status-review/10 px-2.5 py-2 text-2xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <ShieldCheck className="w-3.5 h-3.5 text-workspace-status-review shrink-0" />
              <span className="text-muted-foreground shrink-0">Comparte con tu equipo:</span>
              <code className="font-mono text-foreground truncate">{syncStatus.hostingUrl}</code>
            </div>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => void handleCopyHostingUrl()}
              className="shrink-0"
            >
              {copiedUrl ? (
                <Check className="w-3 h-3 text-workspace-status-review" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              {copiedUrl ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" size="xs" disabled={syncBusy} onClick={() => void handleSaveSync()}>
            {syncBusy ? 'Aplicando...' : 'Aplicar Configuración de Sync'}
          </Button>
        </div>
      </section>
    </div>
  )
}

export function TeamSyncAccountModal(props: Props): React.JSX.Element {
  const formKey = `${props.user.userId}:${props.user.authenticatedAt}:${props.syncStatus.settings.mode}:${props.syncStatus.hostingUrl ?? ''}`
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Cuenta y Sincronización Remota</DialogTitle>
        </DialogHeader>
        <SyncAccountModalBody
          key={formKey}
          user={props.user}
          syncStatus={props.syncStatus}
          onUpdateProfile={props.onUpdateProfile}
          onRequestMagicCode={props.onRequestMagicCode}
          onVerifyMagicCode={props.onVerifyMagicCode}
          onConfigureSync={props.onConfigureSync}
        />
      </DialogContent>
    </Dialog>
  )
}
