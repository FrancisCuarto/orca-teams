import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
import type {
  TeamMailConfigInput,
  TeamMailConfigPublic,
  TeamMailProvider
} from '../../shared/teamwork/team-ipc-types'
import { resolveCommandOnLocalPath } from '../ipc/command-path/command-path-resolver'
import { guardedSafeStorage } from '../host/safe-storage-availability'
import {
  sendSmtpMail,
  sendViaResend,
  sendViaSendmail,
  sendViaSmtp,
  type PersistedMailConfig,
  type TeamEmailSendResult
} from './team-email-transports'
import type { SmtpSendRequest } from './team-smtp-client'

export type { TeamEmailSendResult }

const MAIL_CONFIG_FILE = 'orca-team-mail.json'

type SafeStorageAdapter = {
  isEncryptionAvailable: () => boolean
  encryptString: (plainText: string) => Buffer
  decryptString: (cipher: Buffer) => string
}

export type TeamInvitationEmailPayload = {
  toEmail: string
  teamName: string
  role: string
  joinUrl: string
  token: string
  inviterName?: string
}

export type TeamEmailServiceDeps = {
  userDataDir?: string
  safeStorage?: SafeStorageAdapter
  resolveExecutable?: (cmd: string) => Promise<string | null>
  fetchFn?: typeof globalThis.fetch
  sendSmtpFn?: (req: SmtpSendRequest) => Promise<void>
  tlsRejectUnauthorized?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMailProvider(value: unknown): value is TeamMailProvider {
  return value === 'smtp' || value === 'resend' || value === 'sendmail'
}

function defaultMailConfig(): PersistedMailConfig {
  return {
    provider: 'smtp',
    fromEmail: '',
    fromName: 'Orca Teams',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: ''
  }
}

export class TeamEmailService {
  constructor(private readonly deps: TeamEmailServiceDeps = {}) {}

  private configPath(): string {
    return path.join(this.deps.userDataDir ?? app.getPath('userData'), MAIL_CONFIG_FILE)
  }

  private storage(): SafeStorageAdapter {
    return this.deps.safeStorage ?? guardedSafeStorage
  }

  private encryptSecret(secret: string): string {
    const adapter = this.storage()
    if (adapter.isEncryptionAvailable()) {
      return `safe:${adapter.encryptString(secret).toString('base64')}`
    }
    return `plain:${Buffer.from(secret, 'utf8').toString('base64')}`
  }

  private decryptSecret(stored: string | undefined): string {
    if (!stored) {
      return ''
    }
    if (stored.startsWith('safe:')) {
      const adapter = this.storage()
      if (!adapter.isEncryptionAvailable()) {
        return ''
      }
      return adapter.decryptString(Buffer.from(stored.slice(5), 'base64'))
    }
    if (stored.startsWith('plain:')) {
      return Buffer.from(stored.slice(6), 'base64').toString('utf8')
    }
    return ''
  }

  private async readPersisted(): Promise<PersistedMailConfig> {
    try {
      const raw = await readFile(this.configPath(), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (!isRecord(parsed)) {
        return defaultMailConfig()
      }
      return {
        provider: isMailProvider(parsed.provider) ? parsed.provider : 'smtp',
        fromEmail: typeof parsed.fromEmail === 'string' ? parsed.fromEmail : '',
        fromName: typeof parsed.fromName === 'string' ? parsed.fromName : 'Orca Teams',
        smtpHost: typeof parsed.smtpHost === 'string' ? parsed.smtpHost : '',
        smtpPort: typeof parsed.smtpPort === 'number' ? parsed.smtpPort : 587,
        smtpSecure: Boolean(parsed.smtpSecure),
        smtpUser: typeof parsed.smtpUser === 'string' ? parsed.smtpUser : '',
        encryptedSecret:
          typeof parsed.encryptedSecret === 'string' ? parsed.encryptedSecret : undefined
      }
    } catch {
      return defaultMailConfig()
    }
  }

  async findSendmailBinary(): Promise<string | null> {
    const resolve = this.deps.resolveExecutable ?? ((cmd: string) => resolveCommandOnLocalPath(cmd))
    return (await resolve('sendmail')) ?? (await resolve('msmtp'))
  }

  async getMailConfig(): Promise<TeamMailConfigPublic> {
    const [cfg, sendmailBin] = await Promise.all([this.readPersisted(), this.findSendmailBinary()])
    const secret = this.decryptSecret(cfg.encryptedSecret)
    return {
      provider: cfg.provider,
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName,
      smtpHost: cfg.smtpHost,
      smtpPort: cfg.smtpPort,
      smtpSecure: cfg.smtpSecure,
      smtpUser: cfg.smtpUser,
      hasSecret: secret.length > 0,
      sendmailAvailable: Boolean(sendmailBin)
    }
  }

  async saveMailConfig(input: TeamMailConfigInput): Promise<TeamMailConfigPublic> {
    const current = await this.readPersisted()
    const nextSecret =
      typeof input.secret === 'string' && input.secret.length > 0
        ? this.encryptSecret(input.secret)
        : current.encryptedSecret

    const next: PersistedMailConfig = {
      provider: input.provider,
      fromEmail: input.fromEmail.trim(),
      fromName: input.fromName?.trim() || 'Orca Teams',
      smtpHost: input.smtpHost?.trim() ?? '',
      smtpPort: input.smtpPort ?? 587,
      smtpSecure: Boolean(input.smtpSecure),
      smtpUser: input.smtpUser?.trim() ?? '',
      ...(nextSecret ? { encryptedSecret: nextSecret } : {})
    }

    const filePath = this.configPath()
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(next, null, 2), 'utf8')
    return this.getMailConfig()
  }

  async sendInvitationEmail(payload: TeamInvitationEmailPayload): Promise<TeamEmailSendResult> {
    const inviter = payload.inviterName?.trim() || 'Un miembro del equipo'
    const subject = `Invitación a ${payload.teamName} en Orca Teams`
    const text = [
      `${inviter} te ha invitado a unirte al equipo "${payload.teamName}" con rol ${payload.role}.`,
      '',
      `Enlace de acceso: ${payload.joinUrl}`,
      `Token de invitación: ${payload.token}`
    ].join('\n')
    const html = [
      `<p><strong>${inviter}</strong> te ha invitado a unirte al equipo <strong>${payload.teamName}</strong> con el rol <code>${payload.role}</code>.</p>`,
      `<p>Enlace de acceso: <a href="${payload.joinUrl}">${payload.joinUrl}</a></p>`,
      `<p>Token: <code>${payload.token}</code></p>`
    ].join('')
    return this.sendEmail({ toEmail: payload.toEmail, subject, text, html })
  }

  async testMailConfig(toEmail: string): Promise<{ ok: boolean; error?: string }> {
    const res = await this.sendEmail({
      toEmail,
      subject: 'Prueba de correo - Orca Teams',
      text: 'Configuración de correo de Orca Teams verificada correctamente.',
      html: '<p>Configuración de correo de <strong>Orca Teams</strong> verificada correctamente.</p>'
    })
    return res.sent ? { ok: true } : { ok: false, error: res.error }
  }

  private async sendEmail(msg: {
    toEmail: string
    subject: string
    text: string
    html: string
  }): Promise<TeamEmailSendResult> {
    const cfg = await this.readPersisted()
    const secret = this.decryptSecret(cfg.encryptedSecret)

    if (cfg.provider === 'resend' && secret && cfg.fromEmail) {
      return sendViaResend(cfg, secret, msg, this.deps.fetchFn ?? globalThis.fetch)
    }
    if (cfg.provider !== 'sendmail' && cfg.smtpHost && cfg.smtpUser && secret && cfg.fromEmail) {
      return sendViaSmtp(
        cfg,
        secret,
        msg,
        this.deps.sendSmtpFn ?? sendSmtpMail,
        this.deps.tlsRejectUnauthorized
      )
    }

    const sendmailBin = await this.findSendmailBinary()
    if (sendmailBin) {
      return sendViaSendmail(sendmailBin, cfg, msg)
    }

    return {
      sent: false,
      needsMailConfig: true,
      error: 'No hay servidor de correo configurado (SMTP, Resend ni sendmail local).'
    }
  }
}
