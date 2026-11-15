import { spawn } from 'node:child_process'
import type {
  FactoryCheckCommand,
  FactoryCheckResult,
  FactoryDeterministicGateResult,
  FactoryDeterministicRules,
  FactoryDiffSummary,
  FactoryFindingSeverity,
  FactoryReviewVerdict
} from '../../shared/teamwork/team-factory-types'

const CHECK_TIMEOUT_MS = 180_000
const MAX_CHECK_OUTPUT_CHARS = 4_000

const SEVERITY_RANK: Record<FactoryFindingSeverity | 'none', number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
}

export function matchesProtectedPattern(filePath: string, pattern: string): boolean {
  const normalizedFile = filePath.replace(/\\/g, '/').toLowerCase()
  const normalizedPattern = pattern.trim().replace(/\\/g, '/').toLowerCase()
  if (!normalizedPattern) {
    return false
  }
  if (!normalizedPattern.includes('*')) {
    return normalizedFile.includes(normalizedPattern)
  }
  const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(escaped).test(normalizedFile)
}

export function evaluateDeterministicGate(options: {
  diff: FactoryDiffSummary
  checkResults: FactoryCheckResult[]
  reviews: FactoryReviewVerdict[]
  rules: FactoryDeterministicRules
}): FactoryDeterministicGateResult {
  const { diff, checkResults, reviews, rules } = options
  const reasons: string[] = []

  const failedChecks = checkResults.filter((c) => !c.passed)
  const checksPassed = failedChecks.length === 0
  if (!checksPassed) {
    reasons.push(
      `Fallaron ${failedChecks.length} check(s) determinista(s): ${failedChecks.map((c) => c.name).join(', ')}.`
    )
  }

  const protectedTouched = diff.files.filter((file) =>
    rules.protectedPathPatterns.some((pattern) => matchesProtectedPattern(file, pattern))
  )
  if (protectedTouched.length > 0) {
    reasons.push(
      `Archivos en rutas protegidas modificados (${protectedTouched.slice(0, 5).join(', ')}${protectedTouched.length > 5 ? ', ...' : ''}).`
    )
  }

  if (diff.filesChanged > rules.maxAutoApproveFiles) {
    reasons.push(
      `Se modificaron ${diff.filesChanged} archivos (límite auto-aprobación: ${rules.maxAutoApproveFiles}).`
    )
  }

  const totalChangedLines = diff.insertions + diff.deletions
  if (totalChangedLines > rules.maxAutoApproveLines) {
    reasons.push(
      `El diff suma ${totalChangedLines} líneas modificadas (límite auto-aprobación: ${rules.maxAutoApproveLines}).`
    )
  }

  const erroredReviews = reviews.filter((r) => r.status === 'error')
  if (erroredReviews.length > 0) {
    reasons.push(
      `Revisor(es) sin veredicto estructurado válido: ${erroredReviews.map((r) => r.role).join(', ')}.`
    )
  }

  const failedReviews = reviews.filter((r) => r.status === 'fail')
  if (failedReviews.length > 0) {
    reasons.push(`Revisión(es) con estado FAIL: ${failedReviews.map((r) => r.role).join(', ')}.`)
  }

  const thresholdRank = SEVERITY_RANK[rules.requireHumanOnFindingSeverity]
  if (thresholdRank > 0) {
    const severeFindings = reviews.flatMap((r) =>
      r.findings
        .filter((f) => SEVERITY_RANK[f.severity] >= thresholdRank)
        .map((f) => `[${r.role}/${f.severity}] ${f.message}`)
    )
    if (severeFindings.length > 0) {
      reasons.push(
        `Hallazgos de severidad >= ${rules.requireHumanOnFindingSeverity}: ${severeFindings.slice(0, 3).join(' | ')}`
      )
    }
  }

  return {
    requiresHumanApproval: reasons.length > 0,
    reasons,
    checksPassed,
    diff,
    checkResults
  }
}

export async function runDeterministicChecks(options: {
  workingDir: string
  checkCommands: readonly FactoryCheckCommand[]
  isCancelled: () => boolean
  onLog?: (message: string) => void
}): Promise<FactoryCheckResult[]> {
  const results: FactoryCheckResult[] = []
  for (const check of options.checkCommands) {
    if (options.isCancelled()) {
      break
    }
    const cmd = check.command.trim()
    if (!cmd) {
      continue
    }
    options.onLog?.(`Ejecutando check '${check.name}': ${cmd}`)
    const startedAt = Date.now()
    const result = await executeShellCommand(cmd, options.workingDir, options.isCancelled)
    const durationMs = Date.now() - startedAt
    results.push({
      name: check.name,
      command: cmd,
      passed: result.exitCode === 0,
      exitCode: result.exitCode,
      output: result.output,
      durationMs
    })
  }
  return results
}

function executeShellCommand(
  command: string,
  cwd: string,
  isCancelled: () => boolean
): Promise<{ exitCode: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    let combined = ''
    let settled = false
    const finish = (exitCode: number | null): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      clearInterval(cancelPoll)
      const trimmed =
        combined.length > MAX_CHECK_OUTPUT_CHARS
          ? combined.slice(combined.length - MAX_CHECK_OUTPUT_CHARS)
          : combined
      resolve({ exitCode, output: trimmed.trim() })
    }

    child.stdout?.on('data', (chunk: Buffer | string) => {
      combined += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      combined += chunk.toString()
    })
    child.on('error', (err) => {
      combined += `\n${err.message}`
      finish(1)
    })
    child.on('close', (code) => {
      finish(code)
    })

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      combined += '\n[TIMEOUT alcanzado en check determinista]'
      finish(124)
    }, CHECK_TIMEOUT_MS)

    const cancelPoll = setInterval(() => {
      if (isCancelled()) {
        child.kill('SIGTERM')
        finish(130)
      }
    }, 300)
  })
}
