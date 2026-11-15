import type { CollaboratorPresence } from './team-crdt-types'

export type TeamSyncWireMessage =
  | {
      type: 'join'
      roomId: string
      userId: string
      token?: string
    }
  | {
      type: 'sync-state' | 'sync-update'
      roomId: string
      senderId: string
      payloadBase64: string
    }
  | {
      type: 'presence'
      roomId: string
      presence: CollaboratorPresence
    }
  | {
      type: 'presence-leave'
      roomId: string
      userId: string
    }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function encodeUint8ArrayBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function decodeUint8ArrayBase64(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function parsePresence(raw: unknown): CollaboratorPresence | null {
  if (
    !isRecord(raw) ||
    typeof raw.userId !== 'string' ||
    typeof raw.displayName !== 'string' ||
    typeof raw.color !== 'string' ||
    typeof raw.lastSeen !== 'number'
  ) {
    return null
  }
  const cursor =
    isRecord(raw.cursor) && typeof raw.cursor.x === 'number' && typeof raw.cursor.y === 'number'
      ? { x: raw.cursor.x, y: raw.cursor.y }
      : undefined
  return {
    userId: raw.userId,
    displayName: raw.displayName,
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : undefined,
    color: raw.color,
    activeCardId: typeof raw.activeCardId === 'string' ? raw.activeCardId : undefined,
    activeNoteId: typeof raw.activeNoteId === 'string' ? raw.activeNoteId : undefined,
    cursor,
    lastSeen: raw.lastSeen
  }
}

export function parseTeamSyncWireMessage(rawText: string): TeamSyncWireMessage | null {
  try {
    const parsed: unknown = JSON.parse(rawText)
    if (!isRecord(parsed) || typeof parsed.type !== 'string' || typeof parsed.roomId !== 'string') {
      return null
    }
    if (parsed.type === 'join' && typeof parsed.userId === 'string') {
      return {
        type: 'join',
        roomId: parsed.roomId,
        userId: parsed.userId,
        ...(typeof parsed.token === 'string' ? { token: parsed.token } : {})
      }
    }
    if (
      (parsed.type === 'sync-state' || parsed.type === 'sync-update') &&
      typeof parsed.senderId === 'string' &&
      typeof parsed.payloadBase64 === 'string'
    ) {
      return {
        type: parsed.type,
        roomId: parsed.roomId,
        senderId: parsed.senderId,
        payloadBase64: parsed.payloadBase64
      }
    }
    if (parsed.type === 'presence') {
      const presence = parsePresence(parsed.presence)
      if (!presence) {
        return null
      }
      return {
        type: 'presence',
        roomId: parsed.roomId,
        presence
      }
    }
    if (parsed.type === 'presence-leave' && typeof parsed.userId === 'string') {
      return {
        type: 'presence-leave',
        roomId: parsed.roomId,
        userId: parsed.userId
      }
    }
    return null
  } catch {
    return null
  }
}
