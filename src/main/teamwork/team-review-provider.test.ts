import { describe, expect, it, vi } from 'vitest'
import type { ProcessSpec, ProcessResult } from '@orca/process-host/process-spec'
import {
  detectReviewProvider,
  detectReviewProviderFromRemoteUrl,
  pushAndCreateReviewRequest,
  queryReviewRequestState
} from './team-review-provider'

function makeOkResult(stdout = ''): ProcessResult {
  return { code: 0, signal: null, stdout, stderr: '', timedOut: false }
}

describe('team-review-provider', () => {
  it('detects github and gitlab remotes across HTTPS and SSH URLs without assuming github', () => {
    expect(detectReviewProviderFromRemoteUrl('https://github.com/stablyai/orca.git')).toBe('github')
    expect(detectReviewProviderFromRemoteUrl('git@github.com:stablyai/orca.git')).toBe('github')
    expect(detectReviewProviderFromRemoteUrl('https://gitlab.com/team/core.git')).toBe('gitlab')
    expect(detectReviewProviderFromRemoteUrl('git@gitlab.company.internal:group/app.git')).toBe(
      'gitlab'
    )
    expect(detectReviewProviderFromRemoteUrl('ssh://git@gitlab.example.org:2222/a/b.git')).toBe(
      'gitlab'
    )
    expect(() => detectReviewProviderFromRemoteUrl('')).toThrow(/remoto origin/i)
    expect(() => detectReviewProviderFromRemoteUrl('https://git.custom.local/repo.git')).toThrow(
      /no reconocido/i
    )
  })

  it('detects provider from git remote get-url origin via async runProcess', async () => {
    const runProcessMock = vi.fn(async (_spec: ProcessSpec) =>
      makeOkResult('git@gitlab.com:acme/platform.git\n')
    )
    const provider = await detectReviewProvider('/tmp/repo', runProcessMock)
    expect(provider).toBe('gitlab')
    expect(runProcessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        program: 'git',
        args: ['remote', 'get-url', 'origin'],
        cwd: '/tmp/repo'
      })
    )
  })

  it('pushes branch and creates a GitHub PR with gh pr create', async () => {
    const runProcessMock = vi.fn(async (spec: ProcessSpec): Promise<ProcessResult> => {
      if (spec.program === 'git' && spec.args?.[0] === 'status') {
        return makeOkResult(' M src/app.ts\n')
      }
      if (spec.program === 'git' && spec.args?.[0] === 'remote') {
        return makeOkResult('https://github.com/stablyai/orca.git\n')
      }
      if (spec.program === 'gh' && spec.args?.[0] === 'pr' && spec.args?.[1] === 'create') {
        return makeOkResult('https://github.com/stablyai/orca/pull/128\n')
      }
      return makeOkResult('')
    })

    const created = await pushAndCreateReviewRequest({
      cwd: '/tmp/wt',
      branch: 'orca-team/card-1',
      baseBranch: 'main',
      title: 'feat(team): card-1',
      body: 'Cambios aplicados',
      runProcessFn: runProcessMock
    })

    expect(created).toEqual({
      provider: 'github',
      number: 128,
      url: 'https://github.com/stablyai/orca/pull/128',
      state: 'open'
    })
    expect(runProcessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        program: 'git',
        args: ['push', '-u', 'origin', 'orca-team/card-1']
      })
    )
    expect(runProcessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        program: 'gh',
        args: [
          'pr',
          'create',
          '--title',
          'feat(team): card-1',
          '--body',
          'Cambios aplicados',
          '--head',
          'orca-team/card-1',
          '--base',
          'main'
        ]
      })
    )
  })

  it('pushes branch and creates a GitLab MR with glab mr create', async () => {
    const runProcessMock = vi.fn(async (spec: ProcessSpec): Promise<ProcessResult> => {
      if (spec.program === 'git' && spec.args?.[0] === 'status') {
        return makeOkResult('')
      }
      if (spec.program === 'git' && spec.args?.[0] === 'remote') {
        return makeOkResult('git@gitlab.com:acme/api.git\n')
      }
      if (spec.program === 'glab' && spec.args?.[0] === 'mr' && spec.args?.[1] === 'create') {
        return makeOkResult('https://gitlab.com/acme/api/-/merge_requests/42\n')
      }
      return makeOkResult('')
    })

    const created = await pushAndCreateReviewRequest({
      cwd: '/tmp/wt',
      branch: 'orca-team/card-2',
      baseBranch: 'develop',
      title: 'feat(team): card-2',
      body: 'MR automático',
      runProcessFn: runProcessMock
    })

    expect(created).toEqual({
      provider: 'gitlab',
      number: 42,
      url: 'https://gitlab.com/acme/api/-/merge_requests/42',
      state: 'open'
    })
    expect(runProcessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        program: 'glab',
        args: [
          'mr',
          'create',
          '--title',
          'feat(team): card-2',
          '--description',
          'MR automático',
          '--source-branch',
          'orca-team/card-2',
          '--yes',
          '--target-branch',
          'develop'
        ]
      })
    )
  })

  it('queries PR/MR state for both GitHub and GitLab and normalizes open/merged/closed', async () => {
    const ghMock = vi.fn(async () =>
      makeOkResult(
        JSON.stringify({
          number: 128,
          url: 'https://github.com/stablyai/orca/pull/128',
          state: 'MERGED'
        })
      )
    )
    const ghState = await queryReviewRequestState({
      cwd: '/tmp/repo',
      reviewRequest: {
        provider: 'github',
        number: 128,
        url: 'https://github.com/stablyai/orca/pull/128',
        state: 'open'
      },
      runProcessFn: ghMock
    })
    expect(ghState.state).toBe('merged')

    const glabOpenMock = vi.fn(async () =>
      makeOkResult(
        JSON.stringify({
          iid: 42,
          web_url: 'https://gitlab.com/acme/api/-/merge_requests/42',
          state: 'opened'
        })
      )
    )
    const glabOpen = await queryReviewRequestState({
      cwd: '/tmp/repo',
      reviewRequest: {
        provider: 'gitlab',
        number: 42,
        url: 'https://gitlab.com/acme/api/-/merge_requests/42',
        state: 'open'
      },
      runProcessFn: glabOpenMock
    })
    expect(glabOpen.state).toBe('open')

    const glabClosedMock = vi.fn(async () =>
      makeOkResult(
        JSON.stringify({
          iid: 42,
          web_url: 'https://gitlab.com/acme/api/-/merge_requests/42',
          state: 'closed'
        })
      )
    )
    const glabClosed = await queryReviewRequestState({
      cwd: '/tmp/repo',
      reviewRequest: {
        provider: 'gitlab',
        number: 42,
        url: 'https://gitlab.com/acme/api/-/merge_requests/42',
        state: 'open'
      },
      runProcessFn: glabClosedMock
    })
    expect(glabClosed.state).toBe('closed')
  })
})
