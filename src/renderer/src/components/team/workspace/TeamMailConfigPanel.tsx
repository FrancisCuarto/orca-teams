import React, { useState } from 'react'
import { CheckCircle2, MailCheck, Save, Send } from 'lucide-react'
import { toast } from 'sonner'
import type {
  TeamMailConfigInput,
  TeamMailConfigPublic,
  TeamMailProvider
} from '../../../../../shared/teamwork/team-ipc-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function isMailProvider(value: string): value is TeamMailProvider {
  return value === 'smtp' || value === 'resend' || value === 'sendmail'
}

type Props = {
  mailConfig: TeamMailConfigPublic | null
  onSave: (input: TeamMailConfigInput) => Promise<TeamMailConfigPublic>
  onTest: (toEmail: string) => Promise<{ ok: boolean; error?: string }>
}

export function TeamMailConfigPanel({ mailConfig, onSave, onTest }: Props): React.JSX.Element {
  const [provider, setProvider] = useState<TeamMailProvider>(mailConfig?.provider ?? 'smtp')
  const [fromEmail, setFromEmail] = useState(mailConfig?.fromEmail ?? '')
  const [fromName, setFromName] = useState(mailConfig?.fromName ?? 'Orca Teams')
  const [smtpHost, setSmtpHost] = useState(mailConfig?.smtpHost ?? 'smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState(String(mailConfig?.smtpPort ?? 587))
  const [smtpSecure, setSmtpSecure] = useState(mailConfig?.smtpSecure ?? false)
  const [smtpUser, setSmtpUser] = useState(mailConfig?.smtpUser ?? '')
  const [secret, setSecret] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!fromEmail.trim() && provider !== 'sendmail') {
      toast.error('Ingresa el correo remitente (From Email)')
      return
    }
    setSaving(true)
    try {
      await onSave({
        provider,
        fromEmail: fromEmail.trim(),
        fromName: fromName.trim() || 'Orca Teams',
        smtpHost: smtpHost.trim(),
        smtpPort: Number(smtpPort) || (smtpSecure ? 465 : 587),
        smtpSecure,
        smtpUser: smtpUser.trim(),
        secret: secret.trim() || undefined
      })
      setSecret('')
      toast.success('Configuración de correo guardada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    const target = testEmail.trim() || fromEmail.trim()
    if (!target || !target.includes('@')) {
      toast.error('Ingresa un correo válido para la prueba')
      return
    }
    setTesting(true)
    try {
      const res = await onTest(target)
      if (res.ok) {
        toast.success(`Correo de prueba enviado a ${target}`)
      } else {
        toast.error(res.error ?? 'Error enviando correo de prueba')
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <form
      onSubmit={handleSave}
      className="p-3 rounded-lg border border-border bg-muted/30 space-y-2.5 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold flex items-center gap-1.5">
          <MailCheck className="w-3.5 h-3.5 text-primary" />
          Transporte de Correo (Invitaciones)
        </span>
        {mailConfig?.hasSecret && (
          <span className="text-3xs text-workspace-status-review flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Credencial guardada
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {(['smtp', 'resend', 'sendmail'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              if (isMailProvider(option)) {
                setProvider(option)
              }
            }}
            disabled={option === 'sendmail' && !mailConfig?.sendmailAvailable}
            className={`px-2 py-1 rounded border text-3xs font-medium uppercase transition-colors ${
              provider === option
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border text-muted-foreground hover:text-foreground disabled:opacity-40'
            }`}
          >
            {option === 'smtp' ? 'SMTP' : option === 'resend' ? 'Resend API' : 'Sendmail'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          value={fromEmail}
          onChange={(e) => setFromEmail(e.target.value)}
          placeholder="remitente@dominio.com"
          className="h-7"
          type="email"
        />
        <Input
          value={fromName}
          onChange={(e) => setFromName(e.target.value)}
          placeholder="Nombre remitente (Orca Teams)"
          className="h-7"
        />
      </div>

      {provider === 'smtp' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Input
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.gmail.com"
              className="col-span-2 h-7"
            />
            <Input
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              placeholder="587"
              className="h-7"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="Usuario SMTP"
              className="h-7"
            />
            <Input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={mailConfig?.hasSecret ? '•••••• (conservado)' : 'App Password / Clave'}
              type="password"
              className="h-7"
            />
          </div>
          <label className="flex items-center gap-1.5 text-3xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={smtpSecure}
              onChange={(e) => setSmtpSecure(e.target.checked)}
              className="rounded border-border"
            />
            TLS directo (puerto 465). Desmarcado usa STARTTLS (587).
          </label>
        </>
      )}

      {provider === 'resend' && (
        <Input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={mailConfig?.hasSecret ? 're_•••••• (conservado)' : 'Resend API Key (re_...)'}
          type="password"
          className="h-7"
        />
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" size="xs" disabled={saving}>
          <Save className="w-3 h-3" />
          {saving ? 'Guardando...' : 'Guardar Config'}
        </Button>

        <div className="flex items-center gap-1 flex-1 min-w-[180px]">
          <Input
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="correo@prueba.com"
            className="h-7 flex-1"
            type="email"
          />
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => void handleTest()}
            disabled={testing}
          >
            <Send className="w-3 h-3" />
            {testing ? '...' : 'Probar'}
          </Button>
        </div>
      </div>
    </form>
  )
}
