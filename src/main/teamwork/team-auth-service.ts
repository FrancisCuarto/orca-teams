import { createHash, randomInt } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { userInfo } from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import type { TeamUserProfile } from '../../shared/teamwork/team-workspace-types'
import { slugify } from './team-host-database-queries'
import type { TeamEmailService } from './team-email-service'
import type { TeamHostDatabase } from './team-host-database'

const AUTH_PROFILE_FILE = 'orca-team-user.json'
const CODE_TTL_MS = 15 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hashAuthCode(email: string, code: string): string {
  return createHash('sha256').update(`${email.trim().toLowerCase()}:${code.trim()}`).digest('hex')
}

export class TeamAuthService {
  constructor(
    private readonly db: TeamHostDatabase,
    private readonly emailService: TeamEmailService,
    private readonly userDataDir?: string
  ) {}

  private profilePath(): string {
    return path.join(this.userDataDir ?? app.getPath('userData'), AUTH_PROFILE_FILE)
  }

  private defaultLocalProfile(): TeamUserProfile {
    const username = userInfo().username || 'Owner'
    return {
      userId: 'local-owner',
      email: `${slugify(username, 'owner')}@local.orca`,
      displayName: username,
      authMethod: 'local',
      authenticatedAt: Date.now()
    }
  }

  async getCurrentUser(): Promise<TeamUserProfile> {
    try {
      const raw = await readFile(this.profilePath(), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      if (
        isRecord(parsed) &&
        typeof parsed.userId === 'string' &&
        typeof parsed.email === 'string' &&
        typeof parsed.displayName === 'string'
      ) {
        return {
          userId: parsed.userId,
          email: parsed.email,
          displayName: parsed.displayName,
          avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : undefined,
          authMethod: parsed.authMethod === 'magic-link' ? 'magic-link' : 'local',
          authenticatedAt:
            typeof parsed.authenticatedAt === 'number' ? parsed.authenticatedAt : Date.now()
        }
      }
    } catch {
      // No saved user profile yet; return local OS default.
    }
    return this.defaultLocalProfile()
  }

  async updateUserProfile(input: { displayName: string; email: string }): Promise<TeamUserProfile> {
    const current = await this.getCurrentUser()
    const displayName = input.displayName.trim() || current.displayName
    const email = input.email.trim().toLowerCase() || current.email
    const next: TeamUserProfile = {
      ...current,
      displayName,
      email,
      authenticatedAt: Date.now()
    }
    await this.persistProfile(next)
    this.db.upsertMemberProfile(next.userId, next.displayName, next.email)
    return next
  }

  async requestMagicLinkCode(
    email: string,
    _displayName?: string
  ): Promise<{ sent: boolean; expiresAt: number; devCode?: string; error?: string }> {
    const normalized = email.trim().toLowerCase()
    if (!normalized.includes('@')) {
      throw new Error('Ingresa un correo electrónico válido')
    }
    const code = String(randomInt(100000, 999999))
    const expiresAt = Date.now() + CODE_TTL_MS
    this.db.createAuthChallenge(normalized, hashAuthCode(normalized, code), expiresAt)

    const mailResult = await this.emailService.sendAuthCodeEmail(normalized, code)
    if (mailResult.sent) {
      return { sent: true, expiresAt }
    }
    return {
      sent: false,
      expiresAt,
      devCode: code,
      error: mailResult.error
    }
  }

  async verifyMagicLinkCode(
    email: string,
    code: string,
    displayName?: string
  ): Promise<TeamUserProfile> {
    const normalized = email.trim().toLowerCase()
    const valid = this.db.consumeAuthChallenge(normalized, hashAuthCode(normalized, code))
    if (!valid) {
      throw new Error('Código inválido o expirado')
    }

    const current = await this.getCurrentUser()
    const userId =
      current.userId === 'local-owner'
        ? `usr-${slugify(normalized.split('@')[0] || 'member', 'user')}`
        : current.userId
    const resolvedName = displayName?.trim() || normalized.split('@')[0] || current.displayName
    const profile: TeamUserProfile = {
      userId,
      email: normalized,
      displayName: resolvedName,
      authMethod: 'magic-link',
      authenticatedAt: Date.now()
    }
    await this.persistProfile(profile)
    this.db.upsertMemberProfile(profile.userId, profile.displayName, profile.email)
    return profile
  }

  private async persistProfile(profile: TeamUserProfile): Promise<void> {
    const filePath = this.profilePath()
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(profile, null, 2), 'utf8')
  }
}
