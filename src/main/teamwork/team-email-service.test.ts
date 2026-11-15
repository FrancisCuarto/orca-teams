import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamEmailService } from './team-email-service'

describe('team-email-service', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'orca-team-mail-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('honestly returns needsMailConfig when no provider or sendmail is available', async () => {
    const service = new TeamEmailService({
      userDataDir: tempDir,
      resolveExecutable: async () => null
    })

    const res = await service.sendInvitationEmail({
      toEmail: 'dev@orca.run',
      teamName: 'Orca Team',
      role: 'member',
      joinUrl: 'orca://team/join?token=abc',
      token: 'abc'
    })

    expect(res.sent).toBe(false)
    expect(res.needsMailConfig).toBe(true)
    expect(res.error).toContain('No hay servidor de correo configurado')
  })

  it('stores secret via safeStorage or plain fallback and preserves secret on partial update', async () => {
    const service = new TeamEmailService({
      userDataDir: tempDir,
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: (v) => Buffer.from(v),
        decryptString: (b) => b.toString('utf8')
      },
      resolveExecutable: async () => null
    })

    const saved = await service.saveMailConfig({
      provider: 'resend',
      fromEmail: 'noreply@orca.run',
      fromName: 'Orca Teams',
      secret: 're_test_secret_123'
    })
    expect(saved.hasSecret).toBe(true)

    const rawFile = readFileSync(path.join(tempDir, 'orca-team-mail.json'), 'utf8')
    expect(rawFile).toContain('plain:')
    expect(rawFile).not.toContain('re_test_secret_123')

    const updated = await service.saveMailConfig({
      provider: 'resend',
      fromEmail: 'team@orca.run'
    })
    expect(updated.hasSecret).toBe(true)
    expect(updated.fromEmail).toBe('team@orca.run')
  })

  it('sends real email via Resend HTTP API and reports HTTP errors honestly', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"email_1"}', { status: 200 }))
    const service = new TeamEmailService({
      userDataDir: tempDir,
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (v) => Buffer.from(v, 'utf8'),
        decryptString: (b) => b.toString('utf8')
      },
      resolveExecutable: async () => null,
      fetchFn: fetchMock
    })

    await service.saveMailConfig({
      provider: 'resend',
      fromEmail: 'invites@orca.run',
      secret: 're_live_key'
    })

    const okRes = await service.sendInvitationEmail({
      toEmail: 'alice@orca.run',
      teamName: 'Core',
      role: 'admin',
      joinUrl: 'orca://team/join?token=tok123',
      token: 'tok123',
      inviterName: 'Francis'
    })
    expect(okRes).toEqual({ sent: true, transportUsed: 'resend' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValueOnce(new Response('invalid key', { status: 401 }))
    const errRes = await service.testMailConfig('alice@orca.run')
    expect(errRes.ok).toBe(false)
    expect(errRes.error).toContain('Resend HTTP 401')
  })

  it('delivers real SMTP email over loopback TCP with AUTH LOGIN fallback', async () => {
    const receivedCommands: string[] = []
    let receivedData = ''

    const server = net.createServer((socket) => {
      let inData = false
      let authStep = 0
      socket.write('220 localhost ESMTP test\r\n')
      let buf = ''
      socket.on('data', (chunk) => {
        buf += chunk.toString('utf8')
        while (true) {
          const idx = buf.indexOf('\r\n')
          if (idx === -1) {
            break
          }
          const line = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          if (inData) {
            if (line === '.') {
              inData = false
              socket.write('250 2.0.0 OK queued\r\n')
            } else {
              receivedData += `${line}\n`
            }
            continue
          }
          receivedCommands.push(line)
          if (line.startsWith('EHLO')) {
            socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n')
          } else if (line.startsWith('AUTH PLAIN')) {
            socket.write('535 use AUTH LOGIN\r\n')
          } else if (line === 'AUTH LOGIN') {
            authStep = 1
            socket.write('334 VXNlcm5hbWU6\r\n')
          } else if (authStep === 1) {
            authStep = 2
            socket.write('334 UGFzc3dvcmQ6\r\n')
          } else if (authStep === 2) {
            authStep = 0
            socket.write('235 Authentication successful\r\n')
          } else if (line.startsWith('MAIL FROM:') || line.startsWith('RCPT TO:')) {
            socket.write('250 OK\r\n')
          } else if (line === 'DATA') {
            inData = true
            socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
          } else if (line === 'QUIT') {
            socket.write('221 Bye\r\n')
            socket.end()
          }
        }
      })
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0

    try {
      const service = new TeamEmailService({
        userDataDir: tempDir,
        safeStorage: {
          isEncryptionAvailable: () => false,
          encryptString: (v) => Buffer.from(v),
          decryptString: (b) => b.toString('utf8')
        },
        resolveExecutable: async () => null
      })

      await service.saveMailConfig({
        provider: 'smtp',
        fromEmail: 'bot@orca.run',
        fromName: 'Orca Bot',
        smtpHost: '127.0.0.1',
        smtpPort: port,
        smtpSecure: false,
        smtpUser: 'bot@orca.run',
        secret: 'smtp-secret'
      })

      const res = await service.sendInvitationEmail({
        toEmail: 'bob@orca.run',
        teamName: 'Alpha',
        role: 'member',
        joinUrl: 'orca://team/join?token=xyz',
        token: 'xyz'
      })

      expect(res).toEqual({ sent: true, transportUsed: 'smtp' })
      expect(receivedCommands).toContain('AUTH LOGIN')
      expect(receivedCommands).toContain('MAIL FROM:<bot@orca.run>')
      expect(receivedCommands).toContain('RCPT TO:<bob@orca.run>')
      expect(receivedData).toContain('orca://team/join?token=xyz')
    } finally {
      server.close()
    }
  })
})
