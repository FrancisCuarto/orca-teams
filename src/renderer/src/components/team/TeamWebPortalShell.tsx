import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  ShieldCheck,
  Users,
  Wifi
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TeamUserProfile } from '../../../../shared/teamwork/team-workspace-types'
import TeamPage from './TeamPage'
import {
  getTeamsTeamApi,
  normalizeHttpRelayUrl,
  readStoredWebPortalUserProfile,
  readWebPortalConnectionConfig,
  saveWebPortalConnectionConfig
} from './storage/team-web-relay-api'

type PortalSessionState = {
  connected: boolean
  sessionKey: number
  teamCount: number
  user: TeamUserProfile | null
}

function formatRelayHostLabel(rawUrl: string): string {
  const httpUrl = normalizeHttpRelayUrl(rawUrl)
  if (!httpUrl) {
    return 'Sin Relay'
  }
  try {
    return new URL(httpUrl).host
  } catch {
    return httpUrl
  }
}

export default function TeamWebPortalShell(): React.JSX.Element {
  const initialConfig = useMemo(() => readWebPortalConnectionConfig(), [])
  const initialProfile = useMemo(() => readStoredWebPortalUserProfile(), [])

  const [relayUrl, setRelayUrl] = useState(initialConfig.relayUrl)
  const [roomSecret, setRoomSecret] = useState(initialConfig.roomSecret)
  const [displayName, setDisplayName] = useState(initialProfile?.displayName ?? '')
  const [email, setEmail] = useState(initialProfile?.email ?? '')
  const [magicCode, setMagicCode] = useState('')
  const [codeRequested, setCodeRequested] = useState(false)
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null)
  const [busy, setBusy] = useState(() => Boolean(normalizeHttpRelayUrl(initialConfig.relayUrl)))
  const [error, setError] = useState<string | null>(null)

  const [session, setSession] = useState<PortalSessionState>({
    connected: false,
    sessionKey: 1,
    teamCount: 0,
    user: initialProfile
  })

  const autoConnectRanRef = useRef(false)

  const connectWithSavedConfig = useCallback(
    async (nextRelayUrl: string, nextRoomSecret: string, profileOverride?: TeamUserProfile) => {
      const normalizedHttp = normalizeHttpRelayUrl(nextRelayUrl)
      if (!normalizedHttp) {
        setError('Ingresa la URL del servidor Relay para conectarte.')
        setBusy(false)
        return
      }

      saveWebPortalConnectionConfig({
        relayUrl: nextRelayUrl.trim(),
        roomSecret: nextRoomSecret.trim()
      })

      const teamApi = getTeamsTeamApi()
      if (!teamApi) {
        setError('API de Orca Teams no disponible en este entorno.')
        setBusy(false)
        return
      }

      setBusy(true)
      setError(null)
      try {
        if (!profileOverride && (displayName.trim() || email.trim())) {
          await teamApi.updateUserProfile({
            displayName: displayName.trim(),
            email: email.trim()
          })
        }
        const [snapshot, currentUser] = await Promise.all([
          teamApi.getWorkspaceSnapshot(),
          profileOverride ? Promise.resolve(profileOverride) : teamApi.getCurrentUser()
        ])
        setSession((prev) => ({
          connected: true,
          sessionKey: prev.sessionKey + 1,
          teamCount: snapshot.teams.length,
          user: currentUser
        }))
        if (snapshot.teams.length > 0) {
          toast.success(`Conectado a ${snapshot.teams[0].name}`)
        } else {
          toast.success('Conectado al Relay de Orca Teams')
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudo conectar con el servidor Relay. Verifica la URL y el token de sala.'
        )
      } finally {
        setBusy(false)
      }
    },
    [displayName, email]
  )

  useEffect(() => {
    if (autoConnectRanRef.current) {
      return
    }
    autoConnectRanRef.current = true
    if (!normalizeHttpRelayUrl(initialConfig.relayUrl)) {
      return
    }
    let cancelled = false
    const teamApi = getTeamsTeamApi()
    if (!teamApi) {
      setBusy(false)
      return
    }
    void (async () => {
      try {
        const [snapshot, currentUser] = await Promise.all([
          teamApi.getWorkspaceSnapshot(),
          teamApi.getCurrentUser()
        ])
        if (cancelled) {
          return
        }
        setSession((prev) => ({
          connected: true,
          sessionKey: prev.sessionKey + 1,
          teamCount: snapshot.teams.length,
          user: currentUser
        }))
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'No se pudo reconectar automáticamente al Relay guardado.'
          )
        }
      } finally {
        if (!cancelled) {
          setBusy(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [initialConfig.relayUrl])

  const handleRequestMagicCode = async (): Promise<void> => {
    if (!normalizeHttpRelayUrl(relayUrl)) {
      setError('Primero ingresa la URL del servidor Relay.')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Ingresa un correo electrónico válido para recibir el código.')
      return
    }

    saveWebPortalConnectionConfig({
      relayUrl: relayUrl.trim(),
      roomSecret: roomSecret.trim()
    })
    const teamApi = getTeamsTeamApi()
    if (!teamApi) {
      setError('API de Orca Teams no disponible.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const res = await teamApi.requestMagicLinkCode(
        email.trim(),
        displayName.trim() || undefined
      )
      setCodeRequested(true)
      if (res.sent) {
        setDevCodeHint(null)
        toast.success(`Código de acceso enviado a ${email.trim()}`)
      } else if (res.devCode) {
        setDevCodeHint(res.devCode)
        toast.warning('El Relay no tiene correo configurado; usa el código generado mostrado abajo.')
      } else {
        setDevCodeHint(null)
        toast.warning(
          res.error || 'No se pudo enviar el correo; ingresa el código de verificación si lo recibiste.'
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo solicitar el código de acceso.')
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyAndConnect = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (codeRequested && magicCode.trim()) {
      saveWebPortalConnectionConfig({
        relayUrl: relayUrl.trim(),
        roomSecret: roomSecret.trim()
      })
      const teamApi = getTeamsTeamApi()
      if (!teamApi) {
        setError('API de Orca Teams no disponible.')
        return
      }
      setBusy(true)
      setError(null)
      try {
        const verifiedUser = await teamApi.verifyMagicLinkCode(
          email.trim(),
          magicCode.trim(),
          displayName.trim() || undefined
        )
        setCodeRequested(false)
        setMagicCode('')
        setDevCodeHint(null)
        await connectWithSavedConfig(relayUrl, roomSecret, verifiedUser)
      } catch (err) {
        setBusy(false)
        setError(err instanceof Error ? err.message : 'Código inválido o expirado.')
      }
      return
    }

    await connectWithSavedConfig(relayUrl, roomSecret)
  }

  const handleDisconnect = (): void => {
    setSession((prev) => ({
      ...prev,
      connected: false
    }))
    setError(null)
  }

  const activeRelayHost = formatRelayHostLabel(relayUrl)

  return (
    <TooltipProvider>
      <div className="flex flex-col h-dvh w-screen overflow-hidden bg-background text-foreground">
        {session.connected ? (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-border bg-card/60 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                  <Users className="w-4 h-4 text-primary shrink-0" />
                  <span>Orca Teams</span>
                </div>
                <Badge variant="outline" className="text-3xs">
                  <Globe className="w-2.5 h-2.5 text-primary" />
                  <span>Portal Web</span>
                </Badge>
                <Badge variant="secondary" className="text-3xs font-mono">
                  <Wifi className="w-2.5 h-2.5 text-workspace-status-review" />
                  <span className="truncate max-w-[200px]">{activeRelayHost}</span>
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                {session.user && (
                  <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                    <span className="font-medium text-foreground truncate max-w-[140px]">
                      {session.user.displayName}
                    </span>
                    {session.user.authMethod === 'magic-link' && (
                      <Badge variant="secondary" className="text-3xs">
                        <ShieldCheck className="w-2.5 h-2.5 text-workspace-status-review" />
                        <span>Verificado</span>
                      </Badge>
                    )}
                  </div>
                )}
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={handleDisconnect}
                  title="Cambiar Relay o cuenta"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Desconectar</span>
                </Button>
              </div>
            </header>

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <TeamPage key={session.sessionKey} />
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-sleek flex items-center justify-center p-4 sm:p-6">
            <Card className="w-full max-w-lg border-border bg-card">
              <CardHeader className="space-y-2 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-3xs">
                    <Globe className="w-3 h-3 text-primary" />
                    <span>Orca Teams · Portal Web Ligero</span>
                  </Badge>
                  <Badge variant="secondary" className="text-3xs">
                    Kanban · Pizarra · Notas · Actividad
                  </Badge>
                </div>
                <CardTitle className="text-lg">Conectar al Espacio de Equipo</CardTitle>
                <CardDescription className="text-xs">
                  Accede al tablero, pizarra visual, notas de arquitectura y actividad en tiempo
                  real desde el navegador sin instalar el IDE completo.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <form onSubmit={(e) => void handleVerifyAndConnect(e)} className="space-y-4">
                  <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Wifi className="w-3.5 h-3.5 text-primary" />
                      <span>Conexión al Servidor Relay</span>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="portal-relay-url" className="text-2xs text-muted-foreground">
                        URL del Relay
                      </Label>
                      <Input
                        id="portal-relay-url"
                        variant="code"
                        value={relayUrl}
                        onChange={(e) => setRelayUrl(e.target.value)}
                        placeholder="https://relay.tu-equipo.com o ws://192.168.1.20:4789"
                        disabled={busy}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="portal-room-secret"
                        className="text-2xs text-muted-foreground"
                      >
                        Token o secreto de sala (opcional)
                      </Label>
                      <Input
                        id="portal-room-secret"
                        variant="code"
                        type="password"
                        value={roomSecret}
                        onChange={(e) => setRoomSecret(e.target.value)}
                        placeholder="token-equipo"
                        disabled={busy}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <KeyRound className="w-3.5 h-3.5 text-primary" />
                        <span>Identidad y Acceso con Código</span>
                      </div>
                      {session.user?.authMethod === 'magic-link' && (
                        <Badge variant="secondary" className="text-3xs">
                          <CheckCircle2 className="w-2.5 h-2.5 text-workspace-status-review" />
                          <span>Sesión verificada</span>
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="portal-display-name"
                          className="text-2xs text-muted-foreground"
                        >
                          Tu nombre
                        </Label>
                        <Input
                          id="portal-display-name"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Ej. Ana (PM)"
                          disabled={busy}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="portal-email" className="text-2xs text-muted-foreground">
                          Correo electrónico
                        </Label>
                        <Input
                          id="portal-email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="ana@empresa.com"
                          disabled={busy}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busy || !relayUrl.trim() || !email.trim()}
                        onClick={() => void handleRequestMagicCode()}
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>Enviar código de acceso por email</span>
                      </Button>
                    </div>

                    {codeRequested && (
                      <div className="rounded-md border border-border bg-card p-2.5 space-y-2">
                        {devCodeHint && (
                          <div className="text-2xs text-muted-foreground">
                            Código local del Relay:{' '}
                            <code className="font-mono font-semibold text-foreground">
                              {devCodeHint}
                            </code>
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label
                            htmlFor="portal-magic-code"
                            className="text-2xs text-muted-foreground"
                          >
                            Código de 6 dígitos
                          </Label>
                          <Input
                            id="portal-magic-code"
                            variant="code"
                            value={magicCode}
                            onChange={(e) => setMagicCode(e.target.value)}
                            placeholder="123456"
                            disabled={busy}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="break-words">{error}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={busy || !relayUrl.trim()}
                  >
                    {busy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Conectando...</span>
                      </>
                    ) : codeRequested && magicCode.trim() ? (
                      <>
                        <span>Verificar código y entrar</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        <span>Conectar al Portal</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
