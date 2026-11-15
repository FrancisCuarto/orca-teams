import { execFile } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  discardCardWorktree,
  inspectWorktreeChanges,
  mergeWorktreeToBase,
  provisionCardWorktree
} from './team-worktree-provisioner'

const execFileAsync = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, windowsHide: true })
  return stdout.trim()
}

describe('team-worktree-provisioner', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('falls back cleanly when workspace is a non-git folder', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'orca-nongit-'))
    tempDirs.push(dir)

    const result = await provisionCardWorktree({
      projectPath: dir,
      cardId: 'card-1',
      cardTitle: 'Setup notes'
    })

    expect(result.isGitRepo).toBe(false)
    expect(result.workDir).toBe(dir)
    expect(result.branch).toBeUndefined()
  })

  it('provisions isolated worktree, inspects changes, merges back, and discards worktree', async () => {
    const repoDir = mkdtempSync(path.join(tmpdir(), 'orca-git-wt-'))
    tempDirs.push(repoDir)

    await git(repoDir, ['init', '-b', 'main'])
    await git(repoDir, ['config', 'user.email', 'team@orca.local'])
    await git(repoDir, ['config', 'user.name', 'Orca Team'])
    writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8')
    await git(repoDir, ['add', 'README.md'])
    await git(repoDir, ['commit', '-m', 'init'])

    const provisioned = await provisionCardWorktree({
      projectPath: repoDir,
      cardId: 'card-42',
      cardTitle: 'Implement Login Flow'
    })

    expect(provisioned.isGitRepo).toBe(true)
    expect(provisioned.branch).toMatch(/^orca-team\/card-42-/)
    expect(provisioned.baseBranch).toBe('main')
    expect(realpathSync(provisioned.workDir)).not.toBe(realpathSync(repoDir))

    writeFileSync(path.join(provisioned.workDir, 'feature.txt'), 'done\n', 'utf8')
    const changes = await inspectWorktreeChanges(provisioned.workDir)
    expect(changes).toContain('?? feature.txt')

    const merged = await mergeWorktreeToBase({
      worktreePath: provisioned.workDir,
      branch: provisioned.branch ?? 'orca-team/card-42',
      baseBranch: provisioned.baseBranch,
      commitMessage: 'feat: implement login flow'
    })
    expect(merged.merged).toBe(true)
    expect(merged.changedFiles).toContain('?? feature.txt')

    await discardCardWorktree({
      worktreePath: provisioned.workDir,
      branch: provisioned.branch
    })

    const worktreeList = await git(repoDir, ['worktree', 'list'])
    expect(worktreeList).not.toContain('card-42')
  })
})
