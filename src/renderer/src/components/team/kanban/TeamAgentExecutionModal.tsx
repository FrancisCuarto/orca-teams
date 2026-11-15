import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  FileDiff,
  GitBranch,
  GitMerge,
  Loader2,
  RotateCcw,
  ShieldCheck,
  StopCircle,
  Terminal,
  Trash2,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../ui/dialog'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { getIntlLocale } from '@/i18n/i18n'
import { copyTextToClipboard } from '../utils/team-clipboard'
import type { AgentExecutionRecord } from '../../../../../shared/teamwork/team-workspace-types'
import { buildKeyedExecutionLogs } from './team-kanban-execution-helpers'

type Props = {
  open: boolean
  cardTitle: string
  execution: AgentExecutionRecord | null
  canApproveExecutions?: boolean
  canDispatchAgents?: boolean
  onOpenChange: (open: boolean) => void
  onCancel?: (executionId: string) => void
  onRerun?: () => void
  onApprove?: (executionId: string, mergeToBase: boolean) => void
  onReject?: (executionId: string, discardWorktree: boolean) => void
}

export function TeamAgentExecutionModal({
  open,
  cardTitle,
  execution,
  canApproveExecutions = true,
  canDispatchAgents = true,
  onOpenChange,
  onCancel,
  onRerun,
  onApprove,
  onReject
}: Props): React.JSX.Element | null {
  const logsEndRef = useRef<HTMLDivElement>(null)
  const [copiedLogs, setCopiedLogs] = useState(false)

  useEffect(() => {
    if (open && logsEndRef.current && typeof logsEndRef.current.scrollIntoView === 'function') {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, execution?.logs.length])

  const keyedLogs = useMemo(
    () => (execution ? buildKeyedExecutionLogs(execution.logs) : []),
    [execution]
  )

  if (!execution) {
    return null
  }

  const isRunning = execution.status === 'running' || execution.status === 'queued'
  const needsApproval =
    execution.status === 'waiting_for_input' || execution.approvalStatus === 'pending'
  const intlLocale = getIntlLocale()

  const handleCopyLogs = async (): Promise<void> => {
    const text = execution.logs
      .map((entry) => {
        const time = new Date(entry.timestamp).toLocaleTimeString(intlLocale, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
        return `[${time}] [${entry.level.toUpperCase()}] ${entry.message}`
      })
      .join('\n')
    const ok = await copyTextToClipboard(text || execution.prompt)
    if (ok) {
      setCopiedLogs(true)
      toast.success('Logs copiados al portapapeles')
      setTimeout(() => setCopiedLogs(false), 1800)
    } else {
      toast.error('No se pudieron copiar los logs')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              <span>Ejecución Agéntica: {cardTitle}</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5 py-1">
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border border-border bg-card/50 text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <span className="text-muted-foreground">Agente:</span>
                <span>{execution.agentId}</span>
              </div>
              <div className="text-muted-foreground font-mono">({execution.model})</div>
            </div>
            <div className="flex items-center gap-2">
              {execution.branchOrWorktree && (
                <div className="flex items-center gap-1 text-2xs font-mono text-muted-foreground">
                  <GitBranch className="w-3 h-3 text-primary" />
                  <span>{execution.branchOrWorktree}</span>
                </div>
              )}
              <Badge variant={execution.status === 'completed' ? 'secondary' : 'outline'}>
                {isRunning && (
                  <Loader2 className="w-2.5 h-2.5 mr-1 inline animate-spin text-primary" />
                )}
                {execution.status === 'waiting_for_input' && (
                  <ShieldCheck className="w-2.5 h-2.5 mr-1 inline text-workspace-status-review" />
                )}
                {execution.status === 'completed' && (
                  <CheckCircle2 className="w-2.5 h-2.5 mr-1 inline text-workspace-status-review" />
                )}
                {execution.status === 'failed' && (
                  <XCircle className="w-2.5 h-2.5 mr-1 inline text-destructive" />
                )}
                {execution.status === 'cancelled' && (
                  <StopCircle className="w-2.5 h-2.5 mr-1 inline text-muted-foreground" />
                )}
                <span className="uppercase">{execution.status}</span>
              </Badge>
            </div>
          </div>

          {execution.worktreePath && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs font-medium text-muted-foreground">
                  Worktree aislado:
                </span>
                <span className="font-mono text-2xs text-foreground truncate">
                  {execution.worktreePath}
                </span>
              </div>
              {execution.changedFiles && execution.changedFiles.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/60">
                  <span className="flex items-center gap-1 text-2xs font-medium text-muted-foreground">
                    <FileDiff className="w-3 h-3 text-primary" />
                    Archivos modificados ({execution.changedFiles.length})
                  </span>
                  <div className="max-h-20 overflow-y-auto scrollbar-sleek font-mono text-3xs text-foreground space-y-0.5">
                    {execution.changedFiles.map((fileLine) => (
                      <div key={fileLine}>{fileLine}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {needsApproval && (onApprove || onReject) && (
            <div className="rounded-lg border border-annotation-highlight/30 bg-annotation-highlight/10 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-annotation-highlight" />
                  <span>Aprobación humana requerida antes de integrar cambios</span>
                </span>
                {!canApproveExecutions ? (
                  <Badge variant="outline" className="text-3xs">
                    Solo lectura
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {onApprove && execution.worktreePath && (
                  <Button
                    type="button"
                    size="xs"
                    disabled={!canApproveExecutions}
                    onClick={() => {
                      if (canApproveExecutions) {
                        onApprove(execution.id, true)
                      }
                    }}
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    Aprobar y Fusionar a {execution.baseBranch ?? 'rama base'}
                  </Button>
                )}
                {onApprove && (
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={!canApproveExecutions}
                    onClick={() => {
                      if (canApproveExecutions) {
                        onApprove(execution.id, false)
                      }
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Aprobar sin fusionar
                  </Button>
                )}
                {onReject && (
                  <Button
                    type="button"
                    size="xs"
                    variant="destructive"
                    disabled={!canApproveExecutions}
                    onClick={() => {
                      if (canApproveExecutions) {
                        onReject(execution.id, Boolean(execution.worktreePath))
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {execution.worktreePath ? 'Rechazar y Descartar Worktree' : 'Rechazar'}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-muted-foreground font-medium">
                <Terminal className="w-3 h-3 text-primary" />
                <span>Consola de Streaming de Logs</span>
              </div>
              <Button type="button" variant="ghost" size="xs" onClick={() => void handleCopyLogs()}>
                {copiedLogs ? (
                  <Check className="w-3 h-3 text-workspace-status-review" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                {copiedLogs ? 'Copiado' : 'Copiar Logs'}
              </Button>
            </div>

            <div className="overflow-y-auto scrollbar-sleek max-h-56 p-3 rounded-lg border border-border bg-card/90 font-mono text-2xs space-y-1">
              {keyedLogs.length === 0 ? (
                <div className="text-muted-foreground italic">Esperando primeros registros...</div>
              ) : (
                keyedLogs.map(({ key, log }) => {
                  const time = new Date(log.timestamp).toLocaleTimeString(intlLocale, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })
                  return (
                    <div key={key} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-muted-foreground/60 shrink-0">{time}</span>
                      <span
                        className={
                          log.level === 'error'
                            ? 'text-destructive font-semibold'
                            : log.level === 'warn'
                              ? 'text-workspace-status-review font-semibold'
                              : 'text-primary'
                        }
                      >
                        [{log.level.toUpperCase()}]
                      </span>
                      <span className="text-foreground break-words">{log.message}</span>
                    </div>
                  )
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

          {execution.outputSummary && (
            <div className="p-3 rounded-lg border border-border bg-secondary/30 space-y-1 text-xs">
              <span className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-workspace-status-review" />
                Resumen de Salida
              </span>
              <p className="text-foreground whitespace-pre-wrap">{execution.outputSummary}</p>
            </div>
          )}

          {execution.error && (
            <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs space-y-1">
              <span className="text-2xs uppercase tracking-wider font-semibold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Error de Ejecución
              </span>
              <p className="break-words font-mono text-2xs">{execution.error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {isRunning && onCancel && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!canDispatchAgents}
              onClick={() => {
                if (canDispatchAgents) {
                  onCancel(execution.id)
                }
              }}
            >
              <StopCircle className="w-3.5 h-3.5 mr-1.5 inline" />
              Cancelar Ejecución
            </Button>
          )}
          {!isRunning && !needsApproval && onRerun && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canDispatchAgents}
              onClick={() => {
                if (canDispatchAgents) {
                  onRerun()
                }
              }}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5 inline" />
              Re-ejecutar
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
