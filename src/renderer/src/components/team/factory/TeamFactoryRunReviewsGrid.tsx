import React from 'react'
import { CheckCircle2, Code2, Eye, Palette, Shield, XCircle } from 'lucide-react'
import {
  FACTORY_REVIEWER_LABELS,
  FACTORY_REVIEWER_ROLES,
  type FactoryApproverDecision,
  type FactoryDeterministicGateResult,
  type FactoryReviewerRole,
  type FactoryReviewVerdict
} from '../../../../../shared/teamwork/team-factory-types'
import { Badge } from '@/components/ui/badge'

const ROLE_ICON: Record<FactoryReviewerRole, React.JSX.Element> = {
  security: <Shield className="size-3.5 text-primary" />,
  ux: <Eye className="size-3.5 text-primary" />,
  ui: <Palette className="size-3.5 text-primary" />,
  code: <Code2 className="size-3.5 text-primary" />
}

type Props = {
  reviews: FactoryReviewVerdict[]
  approverDecision?: FactoryApproverDecision
  gateResult?: FactoryDeterministicGateResult
  isReviewRunning: boolean
}

export function TeamFactoryRunReviewsGrid({
  reviews,
  approverDecision,
  gateResult,
  isReviewRunning
}: Props): React.JSX.Element {
  const byRole = new Map(reviews.map((r) => [r.role, r]))

  return (
    <div className="space-y-3">
      <div>
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          4 Revisores Independientes en Paralelo (Contexto Aislado)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {FACTORY_REVIEWER_ROLES.map((role) => {
            const verdict = byRole.get(role)
            return (
              <div
                key={role}
                className="p-2.5 rounded-lg border border-border bg-card/60 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    {ROLE_ICON[role]}
                    <span>{FACTORY_REVIEWER_LABELS[role]}</span>
                  </div>
                  {verdict ? (
                    <Badge variant={verdict.status === 'pass' ? 'secondary' : 'destructive'}>
                      <span className="uppercase">{verdict.status}</span>
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      {isReviewRunning ? 'Auditando...' : 'Pendiente'}
                    </Badge>
                  )}
                </div>

                {verdict ? (
                  <>
                    <div className="text-3xs font-mono text-muted-foreground">
                      {verdict.agentId} · {verdict.model} · {Math.round(verdict.durationMs / 1000)}s
                    </div>
                    <p className="text-2xs text-foreground leading-relaxed">{verdict.summary}</p>
                    {verdict.findings.length > 0 ? (
                      <ul className="space-y-1 pt-1 border-t border-border/60">
                        {verdict.findings.slice(0, 4).map((f, idx) => (
                          <li key={idx} className="text-3xs text-muted-foreground leading-snug">
                            <span className="font-semibold uppercase text-foreground">
                              [{f.severity}]
                            </span>{' '}
                            {f.file ? <span className="font-mono">{f.file}: </span> : null}
                            {f.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {gateResult ? (
        <div className="p-2.5 rounded-lg border border-border bg-secondary/20 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-foreground">Checks Deterministas & Diff</span>
            <span className="font-mono text-2xs text-muted-foreground">
              {gateResult.diff.filesChanged} archivos · +{gateResult.diff.insertions} / -
              {gateResult.diff.deletions} líneas
            </span>
          </div>
          {gateResult.checkResults.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {gateResult.checkResults.map((chk) => (
                <Badge key={chk.name} variant={chk.passed ? 'secondary' : 'destructive'}>
                  <span className="inline-flex items-center gap-1">
                    {chk.passed ? (
                      <CheckCircle2 className="size-2.5" />
                    ) : (
                      <XCircle className="size-2.5" />
                    )}
                    {chk.name}
                  </span>
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {approverDecision ? (
        <div
          className={`p-2.5 rounded-lg border text-xs space-y-1 ${
            approverDecision.approved
              ? 'border-border bg-secondary/30'
              : 'border-destructive/30 bg-destructive/10'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">
              El Aprobador ({approverDecision.agentId} · Intento {approverDecision.attempt})
            </span>
            <Badge variant={approverDecision.approved ? 'secondary' : 'destructive'}>
              {approverDecision.approved ? 'APROBADO' : 'DEVUELTO A BUILDER'}
            </Badge>
          </div>
          <p className="text-2xs text-foreground">{approverDecision.summary}</p>
          {approverDecision.fixInstructions ? (
            <p className="text-2xs text-muted-foreground whitespace-pre-wrap">
              {approverDecision.fixInstructions}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
