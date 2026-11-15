import { describe, expect, it, vi } from 'vitest'
import { isRoutedOrcaDeepLink } from '../startup/orca-deep-link-url'
import {
  buildTeamJoinUrl,
  isTeamJoinDeepLinkUrl,
  parseTeamJoinDeepLink,
  TeamDeepLinkJoinState
} from './team-deep-link'

describe('team-deep-link', () => {
  it('parses valid orca://team/join and https://.../join URLs', () => {
    const orcaUrl = 'orca://team/join?token=inv_token_123'
    expect(parseTeamJoinDeepLink(orcaUrl)).toEqual({
      token: 'inv_token_123',
      rawUrl: orcaUrl
    })

    const httpsUrl = 'https://teams.orca.dev/join?token=abc-XYZ_789&relay=wss%3A%2F%2Frelay.orca.dev'
    expect(parseTeamJoinDeepLink(httpsUrl)).toEqual({
      token: 'abc-XYZ_789',
      rawUrl: httpsUrl,
      relayUrl: 'wss://relay.orca.dev'
    })

    const localHttps = 'http://localhost:3000/team/join?token=dev_token_1'
    expect(parseTeamJoinDeepLink(localHttps)?.token).toBe('dev_token_1')

    expect(buildTeamJoinUrl('tok_999')).toBe('orca://team/join?token=tok_999')
  })

  it('rejects malformed, unsafe, or unrelated deep links', () => {
    expect(parseTeamJoinDeepLink('')).toBeNull()
    expect(parseTeamJoinDeepLink('orca://team/join')).toBeNull()
    expect(parseTeamJoinDeepLink('orca://team/join?token=ab')).toBeNull()
    expect(parseTeamJoinDeepLink('orca://team/join?token=bad%20token')).toBeNull()
    expect(parseTeamJoinDeepLink('http://evil.example/join?token=valid_token_123')).toBeNull()
    expect(parseTeamJoinDeepLink('https://user:pass@orca.dev/join?token=valid_token_123')).toBeNull()
    expect(parseTeamJoinDeepLink('orca://pair?code=1234')).toBeNull()
    expect(parseTeamJoinDeepLink('orca://plugins/acme.dusk')).toBeNull()
    expect(isTeamJoinDeepLinkUrl('orca://team/join?token=valid_token_123')).toBe(true)
    expect(isRoutedOrcaDeepLink('orca://team/join?token=valid_token_123')).toBe(true)
    expect(isRoutedOrcaDeepLink('orca://pair?code=x')).toBe(false)
  })

  it('buffers cold-start links and deduplicates repeated bursts', () => {
    let now = 0
    const state = new TeamDeepLinkJoinState(() => now)
    const publish = vi.fn()

    expect(state.capture(['/usr/bin/orca', 'orca://team/join?token=tok_abc123'], publish)).toBe(true)
    expect(publish).toHaveBeenCalledTimes(1)
    expect(state.consume()?.token).toBe('tok_abc123')
    expect(state.consume()).toBeNull()

    state.capture(['orca://team/join?token=tok_abc123'], publish)
    expect(publish).toHaveBeenCalledTimes(1)

    now = 5_000
    state.capture(['orca://team/join?token=tok_abc123'], publish)
    expect(publish).toHaveBeenCalledTimes(2)
  })
})
