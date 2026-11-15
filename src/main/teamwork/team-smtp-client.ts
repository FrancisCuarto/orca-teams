import net from 'node:net'
import tls from 'node:tls'
import { buildMimeMessage } from './team-mail-mime'

export type SmtpSendRequest = {
  host: string
  port: number
  secure: boolean
  user: string
  secret: string
  fromEmail: string
  fromName?: string
  toEmail: string
  subject: string
  text: string
  html: string
  timeoutMs?: number
  tlsRejectUnauthorized?: boolean
}

type SmtpReply = { code: number; lines: string[] }

class SmtpSession {
  private buffer = ''
  private closed = false
  private lastError: Error | null = null
  private waiter: { check: () => void; reject: (err: Error) => void } | null = null

  constructor(
    private socket: net.Socket | tls.TLSSocket,
    private readonly timeoutMs: number
  ) {
    this.attachListeners(socket)
  }

  private attachListeners(sock: net.Socket | tls.TLSSocket): void {
    sock.on('data', this.onData)
    sock.on('error', this.onError)
    sock.on('close', this.onClose)
  }

  private detachListeners(sock: net.Socket | tls.TLSSocket): void {
    sock.off('data', this.onData)
    sock.off('error', this.onError)
    sock.off('close', this.onClose)
  }

  private readonly onData = (chunk: Buffer | string): void => {
    this.buffer += chunk.toString('utf8')
    this.waiter?.check()
  }

  private readonly onError = (err: Error): void => {
    this.lastError = err
    this.waiter?.reject(err)
    this.waiter = null
  }

  private readonly onClose = (): void => {
    this.closed = true
    this.waiter?.reject(this.lastError ?? new Error('Conexión SMTP cerrada inesperadamente'))
    this.waiter = null
  }

  readReply(): Promise<SmtpReply> {
    return new Promise((resolve, reject) => {
      const tryParse = (): boolean => {
        const lines: string[] = []
        let cursor = 0
        while (true) {
          const idx = this.buffer.indexOf('\n', cursor)
          if (idx === -1) {
            return false
          }
          const line = this.buffer.slice(cursor, idx).replace(/\r$/, '')
          cursor = idx + 1
          lines.push(line)
          if (/^\d{3}(?: |$)/.test(line)) {
            this.buffer = this.buffer.slice(cursor)
            clearTimeout(timer)
            this.waiter = null
            resolve({ code: Number(line.slice(0, 3)), lines })
            return true
          }
        }
      }

      const timer = setTimeout(() => {
        this.waiter = null
        reject(new Error(`Timeout SMTP (${this.timeoutMs}ms) esperando respuesta del servidor`))
      }, this.timeoutMs)

      if (tryParse()) {
        return
      }
      if (this.lastError) {
        clearTimeout(timer)
        reject(this.lastError)
        return
      }
      if (this.closed) {
        clearTimeout(timer)
        reject(new Error('Conexión SMTP cerrada antes de recibir respuesta'))
        return
      }
      this.waiter = {
        check: () => {
          tryParse()
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        }
      }
    })
  }

  async command(line: string, expectedCodes: readonly number[]): Promise<SmtpReply> {
    this.socket.write(`${line}\r\n`)
    const reply = await this.readReply()
    if (!expectedCodes.includes(reply.code)) {
      throw new Error(`SMTP error ${reply.code}: ${reply.lines.join(' | ')}`)
    }
    return reply
  }

  async writeRaw(payload: string, expectedCodes: readonly number[]): Promise<SmtpReply> {
    this.socket.write(payload)
    const reply = await this.readReply()
    if (!expectedCodes.includes(reply.code)) {
      throw new Error(`SMTP DATA error ${reply.code}: ${reply.lines.join(' | ')}`)
    }
    return reply
  }

  upgradeTls(servername: string, rejectUnauthorized: boolean): Promise<void> {
    const oldSocket = this.socket
    this.detachListeners(oldSocket)
    this.buffer = ''
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Timeout en handshake STARTTLS')),
        this.timeoutMs
      )
      const tlsSocket = tls.connect({ socket: oldSocket, servername, rejectUnauthorized }, () => {
        clearTimeout(timer)
        this.socket = tlsSocket
        this.attachListeners(tlsSocket)
        resolve()
      })
      tlsSocket.once('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }

  close(): void {
    this.detachListeners(this.socket)
    this.socket.destroy()
  }
}

function connectSocket(
  host: string,
  port: number,
  secure: boolean,
  timeoutMs: number,
  rejectUnauthorized: boolean
): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Timeout conectando a SMTP ${host}:${port}`))
    }, timeoutMs)

    const socket = secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized }, () => {
          clearTimeout(timer)
          resolve(socket)
        })
      : net.connect({ host, port }, () => {
          clearTimeout(timer)
          resolve(socket)
        })

    socket.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

export async function sendSmtpMail(req: SmtpSendRequest): Promise<void> {
  const timeoutMs = req.timeoutMs ?? 12_000
  const rejectUnauthorized = req.tlsRejectUnauthorized ?? true
  const useDirectTls = req.secure || req.port === 465
  const socket = await connectSocket(
    req.host,
    req.port,
    useDirectTls,
    timeoutMs,
    rejectUnauthorized
  )
  const session = new SmtpSession(socket, timeoutMs)

  try {
    const greeting = await session.readReply()
    if (greeting.code !== 220) {
      throw new Error(`SMTP greeting inválido (${greeting.code}): ${greeting.lines.join(' ')}`)
    }
    const ehloDomain = req.fromEmail.split('@')[1] ?? 'localhost'
    let ehlo = await session.command(`EHLO ${ehloDomain}`, [250])

    if (!useDirectTls && ehlo.lines.some((line) => /\bSTARTTLS\b/i.test(line))) {
      await session.command('STARTTLS', [220])
      await session.upgradeTls(req.host, rejectUnauthorized)
      ehlo = await session.command(`EHLO ${ehloDomain}`, [250])
    }

    if (req.user.trim() && req.secret) {
      const authLine = ehlo.lines.find((line) => /\bAUTH\b/i.test(line)) ?? ''
      const supportsPlain = /\bPLAIN\b/i.test(authLine) || !/\bLOGIN\b/i.test(authLine)
      let authenticated = false
      if (supportsPlain) {
        const token = Buffer.from(`\u0000${req.user}\u0000${req.secret}`, 'utf8').toString('base64')
        try {
          await session.command(`AUTH PLAIN ${token}`, [235])
          authenticated = true
        } catch (err) {
          if (!/\bLOGIN\b/i.test(authLine)) {
            throw err
          }
        }
      }
      if (!authenticated) {
        await session.command('AUTH LOGIN', [334])
        await session.command(Buffer.from(req.user, 'utf8').toString('base64'), [334])
        await session.command(Buffer.from(req.secret, 'utf8').toString('base64'), [235])
      }
    }

    const cleanFrom = req.fromEmail.replace(/[\r\n<>]/g, '').trim()
    const cleanTo = req.toEmail.replace(/[\r\n<>]/g, '').trim()
    await session.command(`MAIL FROM:<${cleanFrom}>`, [250])
    await session.command(`RCPT TO:<${cleanTo}>`, [250, 251])
    await session.command('DATA', [354])
    await session.writeRaw(`${buildMimeMessage(req)}\r\n.\r\n`, [250])
    await session.command('QUIT', [221]).catch(() => undefined)
  } finally {
    session.close()
  }
}
