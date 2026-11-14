import { randomUUID } from 'node:crypto'

function encodeMimeHeader(value: string): string {
  const isAscii = /^[\x20-\x7e]*$/.test(value)
  if (isAscii) {
    return value
  }
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function formatMimeAddress(email: string, name?: string): string {
  const cleanEmail = email.replace(/[\r\n<>]/g, '').trim()
  if (!name?.trim()) {
    return `<${cleanEmail}>`
  }
  const cleanName = name.replace(/[\r\n"]/g, '').trim()
  return `${encodeMimeHeader(cleanName)} <${cleanEmail}>`
}

export function buildMimeMessage(req: {
  fromEmail: string
  fromName?: string
  toEmail: string
  subject: string
  text: string
  html: string
}): string {
  const boundary = `orca-team-${randomUUID()}`
  const domain = req.fromEmail.split('@')[1] ?? 'orca.local'
  const lines = [
    `From: ${formatMimeAddress(req.fromEmail, req.fromName)}`,
    `To: ${formatMimeAddress(req.toEmail)}`,
    `Subject: ${encodeMimeHeader(req.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    req.text,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    req.html,
    `--${boundary}--`
  ]
  const raw = lines.join('\r\n')
  return raw
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n')
}
