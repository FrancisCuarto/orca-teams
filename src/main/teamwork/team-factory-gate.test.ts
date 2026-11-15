import { describe, expect, it } from 'vitest'
import type { FactoryReviewVerdict } from '../../shared/teamwork/team-factory-types'
import { evaluateDeterministicGate, matchesProtectedPattern } from './team-factory-gate'
import { parseApproverDecisionJson, parseReviewerVerdictJson } from './team-factory-prompts'

function makePassVerdict(role: FactoryReviewVerdict['role']): FactoryReviewVerdict {
  return {
    role,
    agentId: 'claude',
    model: 'sonnet',
    status: 'pass',
    summary: 'OK',
    findings: [],
    durationMs: 100
  }
}

describe('team-factory-gate & parsers', () => {
  it('auto-approves small clean diffs on non-protected paths', () => {
    const result = evaluateDeterministicGate({
      diff: {
        filesChanged: 2,
        insertions: 25,
        deletions: 10,
        files: ['src/renderer/components/Button.tsx', 'src/renderer/components/Button.test.tsx']
      },
      checkResults: [
        {
          name: 'typecheck',
          command: 'pnpm tc',
          passed: true,
          exitCode: 0,
          output: '',
          durationMs: 50
        }
      ],
      reviews: [
        makePassVerdict('security'),
        makePassVerdict('ux'),
        makePassVerdict('ui'),
        makePassVerdict('code')
      ],
      rules: {
        protectedPathPatterns: ['migrations/', 'auth', 'team-schema.ts'],
        maxAutoApproveFiles: 10,
        maxAutoApproveLines: 300,
        requireHumanOnFindingSeverity: 'high'
      }
    })

    expect(result.requiresHumanApproval).toBe(false)
    expect(result.reasons).toEqual([])
    expect(result.checksPassed).toBe(true)
  })

  it('escalates to human approval when protected paths, diff limits, or checks fail', () => {
    expect(matchesProtectedPattern('src/shared/teamwork/team-schema.ts', 'team-schema.ts')).toBe(
      true
    )
    expect(matchesProtectedPattern('db/migrations/001.sql', 'migrations/')).toBe(true)

    const result = evaluateDeterministicGate({
      diff: {
        filesChanged: 15,
        insertions: 450,
        deletions: 10,
        files: ['src/shared/teamwork/team-schema.ts']
      },
      checkResults: [
        {
          name: 'tests',
          command: 'pnpm test',
          passed: false,
          exitCode: 1,
          output: 'fail',
          durationMs: 50
        }
      ],
      reviews: [
        makePassVerdict('security'),
        makePassVerdict('ux'),
        makePassVerdict('ui'),
        makePassVerdict('code')
      ],
      rules: {
        protectedPathPatterns: ['team-schema.ts'],
        maxAutoApproveFiles: 12,
        maxAutoApproveLines: 400,
        requireHumanOnFindingSeverity: 'high'
      }
    })

    expect(result.requiresHumanApproval).toBe(true)
    expect(result.checksPassed).toBe(false)
    expect(result.reasons.length).toBeGreaterThanOrEqual(4)
  })

  it('parses fenced JSON reviewer verdicts and never passes malformed output', () => {
    const valid = parseReviewerVerdictJson({
      rawOutput: 'Aquí tienes:\n```json\n{"status":"pass","summary":"Seguro","findings":[]}\n```',
      role: 'security',
      agentId: 'codex',
      model: 'gpt-5',
      durationMs: 250
    })
    expect(valid.status).toBe('pass')
    expect(valid.summary).toBe('Seguro')

    const malformed = parseReviewerVerdictJson({
      rawOutput: 'Todo bien creo',
      role: 'code',
      agentId: 'claude',
      model: 'sonnet',
      durationMs: 120
    })
    expect(malformed.status).toBe('error')
    expect(malformed.findings[0]?.severity).toBe('high')
  })

  it('blocks approver decision when any reviewer did not pass', () => {
    const blocked = parseApproverDecisionJson({
      rawOutput: '{"approved": true, "summary": "Adelante"}',
      attempt: 1,
      agentId: 'claude',
      model: 'opus',
      reviews: [
        makePassVerdict('security'),
        { ...makePassVerdict('ux'), status: 'fail', summary: 'Falta estado vacío' },
        makePassVerdict('ui'),
        makePassVerdict('code')
      ]
    })
    expect(blocked.approved).toBe(false)
  })
})
