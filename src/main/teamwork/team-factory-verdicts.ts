import type {
  FactoryApproverDecision,
  FactoryFindingSeverity,
  FactoryReviewerRole,
  FactoryReviewFinding,
  FactoryReviewVerdict
} from '../../shared/teamwork/team-factory-types'

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  const candidates: string[] = [trimmed]
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    candidates.unshift(fencedMatch[1].trim())
  }
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1))
  }
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (isPlainRecord(parsed)) {
        return parsed
      }
    } catch {
      // Try next candidate.
    }
  }
  return null
}

function normalizeSeverity(value: unknown): FactoryFindingSeverity {
  if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') {
    return value
  }
  return 'medium'
}

export function parseReviewerVerdictJson(options: {
  rawOutput: string
  role: FactoryReviewerRole
  agentId: string
  model: string
  durationMs: number
}): FactoryReviewVerdict {
  const { rawOutput, role, agentId, model, durationMs } = options
  const parsed = extractJsonObject(rawOutput)
  if (!parsed) {
    return {
      role,
      agentId,
      model,
      status: 'error',
      summary: 'El revisor no devolvió un veredicto JSON válido.',
      findings: [
        {
          severity: 'high',
          message: `Salida no estructurada del revisor (${rawOutput.trim().slice(0, 180) || 'vacía'}).`
        }
      ],
      durationMs
    }
  }

  const rawStatus = typeof parsed.status === 'string' ? parsed.status.toLowerCase() : ''
  const status: FactoryReviewVerdict['status'] =
    rawStatus === 'pass' ? 'pass' : rawStatus === 'fail' ? 'fail' : 'error'

  const findings: FactoryReviewFinding[] = []
  if (Array.isArray(parsed.findings)) {
    for (const item of parsed.findings) {
      if (isPlainRecord(item) && typeof item.message === 'string' && item.message.trim()) {
        findings.push({
          severity: normalizeSeverity(item.severity),
          ...(typeof item.file === 'string' && item.file.trim() ? { file: item.file.trim() } : {}),
          message: item.message.trim()
        })
      }
    }
  }

  return {
    role,
    agentId,
    model,
    status,
    summary:
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : status === 'pass'
          ? 'Sin observaciones bloqueantes.'
          : 'Se detectaron observaciones.',
    findings,
    durationMs
  }
}

export function parseApproverDecisionJson(options: {
  rawOutput: string
  attempt: number
  agentId: string
  model: string
  reviews: FactoryReviewVerdict[]
}): FactoryApproverDecision {
  const { rawOutput, attempt, agentId, model, reviews } = options
  const parsed = extractJsonObject(rawOutput)
  const hasBlockingReview = reviews.some((r) => r.status !== 'pass')

  if (!parsed || typeof parsed.approved !== 'boolean') {
    return {
      approved: false,
      summary: 'El aprobador no devolvió una decisión JSON válida; se bloquea por seguridad.',
      fixInstructions: reviews
        .filter((r) => r.status !== 'pass')
        .map((r) => `[${r.role}] ${r.summary}`)
        .join('\n'),
      attempt,
      agentId,
      model
    }
  }

  const approved = parsed.approved && !hasBlockingReview
  return {
    approved,
    summary:
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : approved
          ? 'Los cuatro revisores aprobaron la implementación.'
          : 'El aprobador solicitó correcciones antes de avanzar.',
    ...(typeof parsed.fixInstructions === 'string' && parsed.fixInstructions.trim()
      ? { fixInstructions: parsed.fixInstructions.trim() }
      : {}),
    attempt,
    agentId,
    model
  }
}
