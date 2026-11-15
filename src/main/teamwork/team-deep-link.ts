import { BrowserWindow } from 'electron'
import type { TeamDeepLinkJoinPayload } from '../../shared/teamwork/team-ipc-types'

export const TEAM_JOIN_DEEP_LINK_MAX_LENGTH = 2048
const TEAM_JOIN_RELAY_MAX_LENGTH = 512
const TEAM_JOIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{3,256}$/
const REPEAT_WINDOW_MS = 3_000
const BURST_LIMIT = 5

function isValidRelayUrl(rawRelay: string): boolean {
  if (rawRelay.length === 0 || rawRelay.length > TEAM_JOIN_RELAY_MAX_LENGTH) {
    return false
  }
  try {
    const parsed = new URL(rawRelay)
    if (parsed.username || parsed.password) {
      return false
    }
    return (
      parsed.protocol === 'ws:' ||
      parsed.protocol === 'wss:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:'
    )
  } catch {
    return false
  }
}

export function buildTeamJoinUrl(token: string, relayUrl?: string): string {
  const base = `orca://team/join?token=${encodeURIComponent(token.trim())}`
  const trimmedRelay = relayUrl?.trim()
  if (trimmedRelay && isValidRelayUrl(trimmedRelay)) {
    return `${base}&relay=${encodeURIComponent(trimmedRelay)}`
  }
  return base
}

/**
 * Parses `orca://team/join?token=...` and `https://.../join?token=...` join links safely.
 * Returns null for malformed, oversized, non-matching, or unsafe URLs.
 */
export function parseTeamJoinDeepLink(rawUrl: string): TeamDeepLinkJoinPayload | null {
  if (typeof rawUrl !== 'string') {
    return null
  }
  const trimmed = rawUrl.trim()
  if (trimmed.length === 0 || trimmed.length > TEAM_JOIN_DEEP_LINK_MAX_LENGTH) {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }

  if (parsed.username || parsed.password) {
    return null
  }

  const pathname = parsed.pathname.replace(/\/+$/, '') || '/'

  if (parsed.protocol === 'orca:') {
    if (parsed.hostname.toLowerCase() !== 'team' || pathname !== '/join') {
      return null
    }
  } else {
    const isLocalHttp =
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    if (parsed.protocol !== 'https:' && !isLocalHttp) {
      return null
    }
    if (pathname !== '/join' && pathname !== '/team/join') {
      return null
    }
  }

  const tokens = parsed.searchParams.getAll('token')
  if (tokens.length !== 1) {
    return null
  }
  const token = (tokens[0] ?? '').trim()
  if (!TEAM_JOIN_TOKEN_PATTERN.test(token)) {
    return null
  }

  const relayParam = parsed.searchParams.get('relay')?.trim()
  const relayUrl = relayParam && isValidRelayUrl(relayParam) ? relayParam : undefined

  return {
    token,
    rawUrl: trimmed,
    ...(relayUrl ? { relayUrl } : {})
  }
}

export function isTeamJoinDeepLinkUrl(rawUrl: string): boolean {
  return parseTeamJoinDeepLink(rawUrl) !== null
}

export function teamJoinDeepLinkFromArguments(
  argv: readonly string[]
): TeamDeepLinkJoinPayload | null {
  for (const arg of argv) {
    const parsed = parseTeamJoinDeepLink(arg)
    if (parsed) {
      return parsed
    }
  }
  return null
}

/** Buffers the latest team join deep link until a renderer consumes it or receives a live broadcast. */
export class TeamDeepLinkJoinState {
  private pending: TeamDeepLinkJoinPayload | null = null
  private recent: { token: string; at: number }[] = []

  constructor(private readonly now: () => number = Date.now) {}

  capture(
    argv: readonly string[],
    publish?: (payload: TeamDeepLinkJoinPayload) => void
  ): boolean {
    const payload = teamJoinDeepLinkFromArguments(argv)
    if (!payload) {
      return false
    }
    const at = this.now()
    this.recent = this.recent.filter((entry) => at - entry.at < REPEAT_WINDOW_MS)
    if (
      this.recent.some((entry) => entry.token === payload.token) ||
      this.recent.length >= BURST_LIMIT
    ) {
      return true
    }
    this.recent.push({ token: payload.token, at })
    this.pending = payload
    publish?.(payload)
    return true
  }

  consume(): TeamDeepLinkJoinPayload | null {
    const value = this.pending
    this.pending = null
    return value
  }
}

export function broadcastTeamDeepLinkJoin(payload: TeamDeepLinkJoinPayload): void {
  if (typeof BrowserWindow?.getAllWindows !== 'function') {
    return
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('team:deepLinkJoin', payload)
    }
  }
}
