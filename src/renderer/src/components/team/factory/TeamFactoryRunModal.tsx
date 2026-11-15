import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Copy,
  Factory,
  GitBranch,
  Loader2,
  RotateCcw,
  StopCircle,
  Terminal,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  FactoryRunRecord,
  FactoryStage
} from '../../../../../shared/teamwork/team-factory-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getIntlLocale } from '@/i18n/i18n'
import { copyTextToClipboard } from '../utils/team-clipboard'
import { TeamFactoryRunReviewsGrid } from './TeamFactoryRunReviewsGrid'

const PIPELINE_STEPS: readonly { stage: FactoryStage; label: string }[] = [
  { stage: 'spec', label: 'Spec (Brain)' },
  { stage: 'build', label: 'Builder TDD' },
  { stage: 'checks', label: 'Checks' },
  { stage: 'review', label: '4x Revisores' },
  { stage: 'approve', label: 'Aprobador' },
  { stage: 'human_gate', label: 'Gate' }
]

type TabId = 'pipeline' | 'spec' | 'logs'

type Props = {
  open: boolean
  run: FactoryRunRecord | null
  actorUserId: string
  onOpenChange: (open: boolean) => void
  onCancel?: (runId: string) => void
  onResolveHumanGate?: (runId: string, decision: 'approve' | 'reject', comment?: string) => void
  onRerun?: () => void
}

export function TeamFactoryRunModal({
  open,
  run,
  onOpenChange,
  onCancel,
  onResolveHumanGate,
  onRerun
}: Props): React.JSX.Element | null {
  const [activeTab, setActiveTab] = useState<TabId>('pipeline')
  const [gateComment, setGateComment] = useState('')

  const stageStatusByStage = useMemo(() => {
    const map = new Map<
      FactoryStage,
      'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'cancelled'
    >()
    if (!run) {
      return map
    }
    for (const s of run.stages) {
      map.set(s.stage, s.status)
    }
    if (run.status === 'waiting_human') {
      map.set('human_gate', 'running')
    } else if (run.status === 'completed') {
      map.set('human_gate', 'passed')
    } else if (run.humanGate?.status === 'rejected') {
      map.set('human_gate', 'failed')
    }
    return map
  }, [run])

  if (!run) {
    return null
  }

  const isRunning = run.status === 'queued' || run.status === 'running'
  const isWaitingHuman = run.status === 'waiting_human'
  const intlLocale = getIntlLocale()

  const handleCopyLogs = async (): Promise<void> => {
    const text = run.logs
      .map(
        (l) => `[${new Date(l.timestamp).toLocaleTimeString(intlLocale)}] [${l.stage}] ${l.message}`
      )
      .join('\n')
    const ok = await copyTextToClipboard(text)
    if (ok) {
      toast.success('Logs de Software Factory copiados')
    } else {
      toast.error('No se pudieron copiar los logs')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" surface={isWaitingHuman ? 'security' : 'default'}>
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Factory className="size-4 text-primary" />
              <span className="truncate">Software Factory: {run.cardTitle}</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Status bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-border bg-card/60 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  run.status === 'completed'
                    ? 'secondary'
                    : run.status === 'failed'
                      ? 'destructive'
                      : 'outline'
                }
              >
                {isRunning && <Loader2 className="size-3 mr-1 animate-spin" />}
                {run.status === 'waiting_human' && <AlertTriangle className="size-3 mr-1" />}
                {run.status === 'completed' && <CheckCircle2 className="size-3 mr-1" />}
                {run.status === 'failed' && <XCircle className="size-3 mr-1" />}
                <span className="uppercase">{run.status.replace('_', ' ')}</span>
              </Badge>
              <span className="font-mono text-2xs text-muted-foreground">
                Intento {run.attempt}/{run.maxRetries + 1}
              </span>
              <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                <Brain className="size-3 text-primary" />
                {run.brainNoteIds.length} nota(s) Brain
              </span>
            </div>
            {run.branchName ? (
              <div className="flex items-center gap-1 font-mono text-2xs text-muted-foreground">
                <GitBranch className="size-3 text-primary" />
                <span>{run.branchName}</span>
              </div>
            ) : null}
          </div>

          {/* Stepper */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {PIPELINE_STEPS.map((step) => {
              const status = stageStatusByStage.get(step.stage) ?? 'pending'
              return (
                <div
                  key={step.stage}
                  className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border text-3xs font-medium ${
                    status === 'running'
                      ? 'border-primary bg-primary/10 text-primary'
                      : status === 'passed'
                        ? 'border-border bg-secondary/40 text-foreground'
                        : status === 'failed'
                          ? 'border-destructive/40 bg-destructive/10 text-destructive'
                          : 'border-border/60 bg-card/40 text-muted-foreground'
                  }`}
                >
                  {status === 'running' && <Loader2 className="size-2.5 animate-spin shrink-0" />}
                  {status === 'passed' && <CheckCircle2 className="size-2.5 shrink-0" />}
                  {status === 'failed' && <XCircle className="size-2.5 shrink-0" />}
                  <span className="truncate">{step.label}</span>
                </div>
              )
            })}
          </div>

          {/* Human-in-the-loop Gate */}
          {isWaitingHuman && run.humanGate ? (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <AlertTriangle className="size-4 text-destructive shrink-0" />
                <span>Revisión Humana Requerida (Gate Determinista)</span>
              </div>
              <ul className="space-y-1 text-2xs text-foreground list-disc pl-4">
                {run.humanGate.reasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
              {onResolveHumanGate ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Input
                    value={gateComment}
                    onChange={(e) => setGateComment(e.target.value)}
                    placeholder="Comentario opcional de aprobación o rechazo..."
                    className="h-8 flex-1 min-w-[200px]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onResolveHumanGate(run.id, 'approve', gateComment)}
                  >
                    <CheckCircle2 className="size-3.5" /> Aprobar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => onResolveHumanGate(run.id, 'reject', gateComment)}
                  >
                    <XCircle className="size-3.5" /> Rechazar
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Tabs */}
          <div className="flex items-center justify-between gap-2 border-b border-border pb-1.5">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="xs"
                variant={activeTab === 'pipeline' ? 'secondary' : 'ghost'}
                onClick={() => setActiveTab('pipeline')}
              >
                Revisores & Gate
              </Button>
              <Button
                type="button"
                size="xs"
                variant={activeTab === 'spec' ? 'secondary' : 'ghost'}
                onClick={() => setActiveTab('spec')}
              >
                Spec (SDD)
              </Button>
              <Button
                type="button"
                size="xs"
                variant={activeTab === 'logs' ? 'secondary' : 'ghost'}
                onClick={() => setActiveTab('logs')}
              >
                <Terminal className="size-3" /> Logs ({run.logs.length})
              </Button>
            </div>
            {activeTab === 'logs' ? (
              <Button type="button" size="xs" variant="ghost" onClick={() => void handleCopyLogs()}>
                <Copy className="size-3" /> Copiar
              </Button>
            ) : null}
          </div>

          {/* Tab content */}
          <div className="max-h-[40vh] overflow-y-auto scrollbar-sleek pr-1">
            {activeTab === 'pipeline' ? (
              <TeamFactoryRunReviewsGrid
                reviews={run.reviews}
                approverDecision={run.approverDecision}
                gateResult={run.gateResult}
                isReviewRunning={run.currentStage === 'review' && isRunning}
              />
            ) : activeTab === 'spec' ? (
              <div className="p-3 rounded-lg border border-border bg-card/50 text-xs whitespace-pre-wrap font-mono leading-relaxed text-foreground">
                {run.specMarkdown || 'El Spec Writer aún no ha generado la especificación.'}
              </div>
            ) : (
              <div className="p-3 rounded-lg border border-border bg-card/90 font-mono text-2xs space-y-1">
                {run.logs.map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-muted-foreground/60 shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString(intlLocale, {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                    <span className="text-primary shrink-0">[{entry.stage}]</span>
                    <span
                      className={
                        entry.level === 'error'
                          ? 'text-destructive break-words'
                          : entry.level === 'warn'
                            ? 'text-muted-foreground break-words'
                            : 'text-foreground break-words'
                      }
                    >
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {run.error ? (
            <div className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-2xs font-mono">
              {run.error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {isRunning && onCancel ? (
            <Button type="button" variant="destructive" size="sm" onClick={() => onCancel(run.id)}>
              <StopCircle className="size-3.5" /> Cancelar Factory
            </Button>
          ) : null}
          {!isRunning && onRerun ? (
            <Button type="button" variant="secondary" size="sm" onClick={onRerun}>
              <RotateCcw className="size-3.5" /> Re-ejecutar Factory
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
