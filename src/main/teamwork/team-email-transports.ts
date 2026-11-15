import { spawn } from 'node:child_process'
import type { TeamMailProvider } from '../../shared/teamwork/team-ipc-types'
import { sendSmtpMail, type SmtpSendRequest } from './team-smtp-client'

export const MAIL_TIMEOUT_MS = 12_000

export type PersistedMailConfig = {
  provider: TeamMailProvider
  fromEmail: string
  fromName: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  encryptedSecret?: string
}

export type TeamEmailSendResult = {
  sent: boolean
  transportUsed?: TeamMailProvider
  error?: string
  needsMailConfig?: boolean
}

export type EmailMessageInput = {
  toEmail: string
  subject: string
  text: string
  html: string
}

export async function sendViaResend(
  cfg: PersistedMailConfig,
  secret: string,
  msg: EmailMessageInput,
  fetchFn: typeof globalThis.fetch
): Promise<TeamEmailSendResult> {
  try {
    const from = cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail
    const response = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [msg.toEmail],
        subject: msg.subject,
        text: msg.text,
        html: msg.html
      }),
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS)
    })
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      return {
        sent: false,
        transportUsed: 'resend',
        error: `Resend HTTP ${response.status}: ${bodyText || response.statusText}`
      }
    }
    return { sent: true, transportUsed: 'resend' }
  } catch (err) {
    return {
      sent: false,
      transportUsed: 'resend',
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function sendViaSmtp(
  cfg: PersistedMailConfig,
  secret: string,
  msg: EmailMessageInput,
  smtpFn: (req: SmtpSendRequest) => Promise<void>,
  tlsRejectUnauthorized?: boolean
): Promise<TeamEmailSendResult> {
  try {
    await smtpFn({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpSecure,
      user: cfg.smtpUser,
      secret,
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName,
      toEmail: msg.toEmail,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      timeoutMs: MAIL_TIMEOUT_MS,
      tlsRejectUnauthorized
    })
    return { sent: true, transportUsed: 'smtp' }
  } catch (err) {
    return {
      sent: false,
      transportUsed: 'smtp',
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export function sendViaSendmail(
  sendmailBin: string,
  cfg: PersistedMailConfig,
  msg: EmailMessageInput
): Promise<TeamEmailSendResult> {
  const fromEmail = cfg.fromEmail || 'orca-teams@localhost'
  const raw = [
    `From: ${cfg.fromName ? `${cfg.fromName} <${fromEmail}>` : fromEmail}`,
    `To: ${msg.toEmail}`,
    `Subject: ${msg.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    msg.html
  ].join('\r\n')

  return new Promise((resolve) => {
    const child = spawn(sendmailBin, ['-t', '-oi'], { stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })
    child.on('error', (err) => {
      resolve({ sent: false, transportUsed: 'sendmail', error: err.message })
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ sent: true, transportUsed: 'sendmail' })
      } else {
        resolve({
          sent: false,
          transportUsed: 'sendmail',
          error: stderr.trim() || `sendmail terminó con código ${code}`
        })
      }
    })
    child.stdin.write(raw)
    child.stdin.end()
  })
}

export { sendSmtpMail }
