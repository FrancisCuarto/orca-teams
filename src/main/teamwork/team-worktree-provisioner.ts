import { execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { slugify } from './team-host-database-queries'

const execFileAsync = promisify(execFile)

export type ProvisionedWorktree = {
  isGitRepo: boolean
  workDir: string
  repoRoot?: string
  branch?: string
  baseBranch?: string
  reused?: boolean
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    windowsHide: true,
    timeout: 20_000,
    maxBuffer: 1024 * 1024
  })
  return stdout.trim()
}

export async function provisionCardWorktree(options: {
  projectPath?: string | null
  cardId: string
  cardTitle: string
  preferredBranch?: string
}): Promise<ProvisionedWorktree> {
  const projectPath = options.projectPath?.trim()
  if (!projectPath || !existsSync(projectPath)) {
    return { isGitRepo: false, workDir: projectPath || '' }
  }

  let repoRoot: string
  try {
    repoRoot = await runGit(projectPath, ['rev-parse', '--show-toplevel'])
  } catch {
    return { isGitRepo: false, workDir: projectPath }
  }

  let baseBranch = 'HEAD'
  try {
    const current = await runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])
    if (current && current !== 'HEAD') {
      baseBranch = current
    }
  } catch {
    baseBranch = 'HEAD'
  }

  const cardSlug = slugify(options.cardTitle, 'task').slice(0, 28)
  const idPart = slugify(options.cardId, 'card').slice(0, 16)
  const branch =
    options.preferredBranch?.trim() && options.preferredBranch.trim().startsWith('orca-team/')
      ? options.preferredBranch.trim()
      : `orca-team/${idPart}-${cardSlug}`

  const worktreesRoot = path.join(repoRoot, '.orca', 'team-worktrees')
  mkdirSync(worktreesRoot, { recursive: true })
  const worktreePath = path.join(worktreesRoot, idPart)

  if (existsSync(path.join(worktreePath, '.git'))) {
    return {
      isGitRepo: true,
      workDir: worktreePath,
      repoRoot,
      branch,
      baseBranch,
      reused: true
    }
  }

  let branchExists = false
  try {
    await runGit(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])
    branchExists = true
  } catch {
    branchExists = false
  }

  const worktreeArgs = branchExists
    ? ['worktree', 'add', '--quiet', worktreePath, branch]
    : ['worktree', 'add', '--quiet', '-b', branch, worktreePath, baseBranch]
  await runGit(repoRoot, worktreeArgs)

  return {
    isGitRepo: true,
    workDir: worktreePath,
    repoRoot,
    branch,
    baseBranch,
    reused: false
  }
}

export async function inspectWorktreeChanges(worktreePath: string): Promise<string[]> {
  try {
    const status = await runGit(worktreePath, ['status', '--porcelain'])
    if (!status) {
      return []
    }
    return status
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 80)
  } catch {
    return []
  }
}

export async function mergeWorktreeToBase(options: {
  worktreePath: string
  branch: string
  baseBranch?: string
  commitMessage: string
}): Promise<{ merged: boolean; changedFiles: string[]; message: string }> {
  const repoRoot = await runGit(options.worktreePath, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir'
  ])
    .then((gitDir) => path.dirname(gitDir))
    .catch(() => path.dirname(path.dirname(path.dirname(options.worktreePath))))

  const changedFiles = await inspectWorktreeChanges(options.worktreePath)
  if (changedFiles.length > 0) {
    await runGit(options.worktreePath, ['add', '-A'])
    await runGit(options.worktreePath, ['commit', '-m', options.commitMessage])
  }

  const targetBase =
    options.baseBranch && options.baseBranch !== 'HEAD' ? options.baseBranch : 'main'
  const headBranch = await runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '')

  if (headBranch === targetBase) {
    await runGit(repoRoot, ['merge', '--no-ff', options.branch, '-m', `Merge ${options.branch}`])
    return {
      merged: true,
      changedFiles,
      message: `Rama ${options.branch} integrada en ${targetBase}.`
    }
  }

  return {
    merged: false,
    changedFiles,
    message: `Cambios confirmados en ${options.branch} (cambia a ${targetBase} para hacer merge).`
  }
}

export async function discardCardWorktree(options: {
  worktreePath: string
  branch?: string
}): Promise<void> {
  const repoRoot = path.dirname(path.dirname(path.dirname(options.worktreePath)))
  try {
    await runGit(repoRoot, ['worktree', 'remove', '--force', options.worktreePath])
  } catch {
    // Worktree may already have been removed manually.
  }
  if (options.branch) {
    try {
      await runGit(repoRoot, ['branch', '-D', options.branch])
    } catch {
      // Ignore if branch was already deleted or checked out elsewhere.
    }
  }
}
