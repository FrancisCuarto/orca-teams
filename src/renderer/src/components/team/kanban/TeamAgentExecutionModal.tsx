import React, { useEffect, useRef } from 'react'
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  GitBranch,
  Loader2,
  StopCircle,
  Terminal,
  XCircle
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../ui/dialog'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import type { AgentExecutionRecord } from '../../../../../shared/teamwork/team-workspace-types'

type Props = {
  open: boolean
  cardTitle: string
  execution: AgentExecutionRecord | null
  onOpenChange: (open: boolean) => void
  onCancel?: (executionId: string) => void
}

function getStatusBadgeVariant(status: AgentExecutionRecord['status']): 'secondary' | 'outline' {
  if (status === 'completed') {
    return 'secondary'
  }
  return 'outline'
}

export function TeamAgentExecutionModal({
  open,
  cardTitle,
  execution,
  onOpenChange,
  onCancel
}: Props): React.JSX.Element | null {
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, execution?.logs.length])

  if (!execution) {
    return null
  }

  const isRunning = execution.status === 'running' || execution.status === 'queued'

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
          {/* Metadata Bar */}
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

              <Badge variant={getStatusBadgeVariant(execution.status)}>
                {isRunning && (
                  <Loader2 className="w-2.5 h-2.5 mr-1 inline animate-spin text-primary" />
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

          {/* Terminal Logs View */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-muted-foreground font-medium">
              <Terminal className="w-3 h-3 text-primary" />
              <span>Consola de Streaming de Logs</span>
            </div>

            <div className="overflow-y-auto scrollbar-sleek max-h-56 p-3 rounded-lg border border-border bg-card/90 font-mono text-2xs space-y-1">
              {execution.logs.length === 0 ? (
                <div className="text-muted-foreground italic">Esperando primeros registros...</div>
              ) : (
                execution.logs.map((log, index) => {
                  const time = new Date(log.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })
                  return (
                    <div
                      key={`${log.timestamp}-${index}`}
                      className="flex items-start gap-2 leading-relaxed"
                    >
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

          {/* Completed Summary / Error Output */}
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
              onClick={() => onCancel(execution.id)}
            >
              <StopCircle className="w-3.5 h-3.5 mr-1.5 inline" />
              Cancelar Ejecución
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
