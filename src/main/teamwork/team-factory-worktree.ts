import { execFile } from 'node:child_process'
import { access, appendFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { FactoryDiffSummary } from '../../shared/teamwork/team-factory-types'

const execFileAsync = promisify(execFile)
const MAX_DIFF_PATCH_CHARS = 24_000

export type PreparedFactoryWorkspace = {
  workingDir: string
  isGitRepo: boolean
  isIsolatedWorktree: boolean
  branchName: string
  baseRef?: string
}

export type CollectedFactoryDiff = {
  summary: FactoryDiffSummary
  patch: string
}

function sanitizeBranchSlug(raw: string, fallback: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^[-/]+|[-/]+$/g, '')
    .slice(0, 60)
  return cleaned || fallback
}

async function runGit(
  cwd: string,
  args: string[]
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const res = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true
    })
    return { ok: true, stdout: res.stdout, stderr: res.stderr }
  } catch (err) {
    const stdout =
      typeof err === 'object' && err !== null && 'stdout' in err && typeof err.stdout === 'string'
        ? err.stdout
        : ''
    const stderr =
      typeof err === 'object' && err !== null && 'stderr' in err && typeof err.stderr === 'string'
        ? err.stderr
        : err instanceof Error
          ? err.message
          : String(err)
    return { ok: false, stdout, stderr }
  }
}

async function ensureWorktreeRootExcluded(repoRoot: string): Promise<void> {
  const excludePath = path.join(repoRoot, '.git', 'info', 'exclude')
  const marker = '.orca/factory-worktrees/'
  try {
    const content = await readFile(excludePath, 'utf8')
    if (content.includes(marker)) {
      return
    }
    const prefix = content.endsWith('\n') || content.length === 0 ? '' : '\n'
    await appendFile(excludePath, `${prefix}${marker}\n`, 'utf8')
  } catch {
    // Best-effort ignore rule; never fail pipeline if .git/info/exclude is missing.
  }
}

export async function prepareFactoryWorktree(options: {
  projectPath: string | null | undefined
  cardId: string
  cardTitle: string
  branchOrWorktree?: string
  useWorktreeIsolation: boolean
  fallbackDir: string
}): Promise<PreparedFactoryWorkspace> {
  const rawBranch =
    options.branchOrWorktree?.trim() ||
    `factory/${sanitizeBranchSlug(options.cardTitle, options.cardId)}`
  const branchName = sanitizeBranchSlug(rawBranch, `factory-${options.cardId}`)

  if (!options.projectPath?.trim()) {
    return {
      workingDir: options.fallbackDir,
      isGitRepo: false,
      isIsolatedWorktree: false,
      branchName
    }
  }

  const projectDir = options.projectPath
  const inside = await runGit(projectDir, ['rev-parse', '--is-inside-work-tree'])
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    return {
      workingDir: projectDir,
      isGitRepo: false,
      isIsolatedWorktree: false,
      branchName
    }
  }

  const rootRes = await runGit(projectDir, ['rev-parse', '--show-toplevel'])
  const repoRoot = rootRes.ok && rootRes.stdout.trim() ? rootRes.stdout.trim() : projectDir
  const headRes = await runGit(repoRoot, ['rev-parse', 'HEAD'])
  const baseRef = headRes.ok ? headRes.stdout.trim() : undefined

  if (!options.useWorktreeIsolation || !baseRef) {
    return {
      workingDir: repoRoot,
      isGitRepo: true,
      isIsolatedWorktree: false,
      branchName,
      baseRef
    }
  }

  await ensureWorktreeRootExcluded(repoRoot)
  const dirSlug = branchName.replace(/\//g, '__')
  const worktreePath = path.join(repoRoot, '.orca', 'factory-worktrees', dirSlug)
  await mkdir(path.dirname(worktreePath), { recursive: true })

  try {
    await access(path.join(worktreePath, '.git'))
    return {
      workingDir: worktreePath,
      isGitRepo: true,
      isIsolatedWorktree: true,
      branchName,
      baseRef
    }
  } catch {
    // Worktree does not exist yet; create it.
  }

  const branchCheck = await runGit(repoRoot, [
    'show-ref',
    '--verify',
    '--quiet',
    `refs/heads/${branchName}`
  ])
  const addArgs = branchCheck.ok
    ? ['worktree', 'add', worktreePath, branchName]
    : ['worktree', 'add', '-b', branchName, worktreePath, baseRef]

  const addRes = await runGit(repoRoot, addArgs)
  if (!addRes.ok) {
    throw new Error(
      `No se pudo crear el worktree aislado '${worktreePath}': ${addRes.stderr.trim()}`
    )
  }

  return {
    workingDir: worktreePath,
    isGitRepo: true,
    isIsolatedWorktree: true,
    branchName,
    baseRef
  }
}

export function parseGitNumstat(output: string): {
  files: string[]
  insertions: number
  deletions: number
} {
  const files: string[] = []
  let insertions = 0
  let deletions = 0
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    const parts = trimmed.split('\t')
    if (parts.length < 3) {
      continue
    }
    const add = Number.parseInt(parts[0], 10)
    const del = Number.parseInt(parts[1], 10)
    const filePath = parts.slice(2).join('\t')
    if (!Number.isNaN(add)) {
      insertions += add
    }
    if (!Number.isNaN(del)) {
      deletions += del
    }
    if (filePath) {
      files.push(filePath)
    }
  }
  return { files, insertions, deletions }
}

export async function collectFactoryDiff(options: {
  workingDir: string
  isGitRepo: boolean
  baseRef?: string
}): Promise<CollectedFactoryDiff> {
  if (!options.isGitRepo) {
    return {
      summary: { filesChanged: 0, insertions: 0, deletions: 0, files: [] },
      patch: ''
    }
  }

  const targetRef = options.baseRef || 'HEAD'
  const numstat = await runGit(options.workingDir, ['diff', '--numstat', targetRef])
  const parsed = parseGitNumstat(numstat.stdout)
  const diffRes = await runGit(options.workingDir, ['diff', targetRef])

  const statusRes = await runGit(options.workingDir, ['status', '--porcelain'])
  const untrackedFiles: string[] = []
  for (const line of statusRes.stdout.split(/\r?\n/)) {
    if (line.startsWith('?? ')) {
      const rel = line.slice(3).trim()
      if (rel && !rel.startsWith('.orca/factory')) {
        untrackedFiles.push(rel)
      }
    }
  }

  const allFiles = Array.from(new Set([...parsed.files, ...untrackedFiles]))
  let untrackedInsertions = 0
  const untrackedChunks: string[] = []
  for (const rel of untrackedFiles.slice(0, 15)) {
    try {
      const content = await readFile(path.join(options.workingDir, rel), 'utf8')
      const lines = content.split(/\r?\n/)
      untrackedInsertions += lines.length
      untrackedChunks.push(
        `--- /dev/null\n+++ b/${rel}\n${lines
          .slice(0, 120)
          .map((l) => `+${l}`)
          .join('\n')}`
      )
    } catch {
      // Binary or unreadable untracked file.
    }
  }

  const combinedPatch = [diffRes.stdout.trim(), ...untrackedChunks].filter(Boolean).join('\n\n')
  const truncatedPatch =
    combinedPatch.length > MAX_DIFF_PATCH_CHARS
      ? `${combinedPatch.slice(0, MAX_DIFF_PATCH_CHARS)}\n\n... [diff truncado a ${MAX_DIFF_PATCH_CHARS} caracteres]`
      : combinedPatch

  return {
    summary: {
      filesChanged: allFiles.length,
      insertions: parsed.insertions + untrackedInsertions,
      deletions: parsed.deletions,
      files: allFiles
    },
    patch: truncatedPatch
  }
}
