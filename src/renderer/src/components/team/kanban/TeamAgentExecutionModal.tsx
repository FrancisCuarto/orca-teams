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
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  StopCircle,
  Terminal,
  Trash2,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { getIntlLocale } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import type {
  TeamExecutionDiffFileStatus,
  TeamExecutionDiffResult
} from '../../../../../shared/teamwork/team-ipc-types'
import type { AgentExecutionRecord } from '../../../../../shared/teamwork/team-workspace-types'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs'
import { Textarea } from '../../ui/textarea'
import { copyTextToClipboard } from '../utils/team-clipboard'
import { buildKeyedDiffLines } from './team-execution-diff-lines'
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
  onLoadDiff?: (executionId: string) => Promise<TeamExecutionDiffResult | null>
  onRequestChanges?: (executionId: string, feedback: string) => Promise<void> | void
}

type ModalTab = 'logs' | 'diff'

function formatDiffStatusCode(status: TeamExecutionDiffFileStatus): string {
  switch (status) {
    case 'added':
      return 'A'
    case 'deleted':
      return 'D'
    case 'renamed':
      return 'R'
    case 'untracked':
      return '?'
    case 'modified':
      return 'M'
  }
}

function diffStatusBadgeClass(status: TeamExecutionDiffFileStatus): string {
  switch (status) {
    case 'added':
    case 'untracked':
      return 'text-chat-diff-added border-chat-diff-added/30 bg-[var(--diff-added-background)]'
    case 'deleted':
      return 'text-chat-diff-removed border-chat-diff-removed/30 bg-[var(--diff-removed-background)]'
    case 'renamed':
      return 'text-primary border-primary/30 bg-primary/10'
    case 'modified':
      return 'text-foreground border-border bg-muted/40'
  }
}

type BodyProps = {
  open: boolean
  cardTitle: string
  execution: AgentExecutionRecord
  canApproveExecutions?: boolean
  canDispatchAgents?: boolean
  onOpenChange: (open: boolean) => void
  onCancel?: (executionId: string) => void
  onRerun?: () => void
  onApprove?: (executionId: string, mergeToBase: boolean) => void
  onReject?: (executionId: string, discardWorktree: boolean) => void
  onLoadDiff?: (executionId: string) => Promise<TeamExecutionDiffResult | null>
  onRequestChanges?: (executionId: string, feedback: string) => Promise<void> | void
}

function TeamAgentExecutionModalBody({
  open,
  cardTitle,
  execution,
  canApproveExecutions = true,
  canDispatchAgents = true,
  onOpenChange,
  onCancel,
  onRerun,
  onApprove,
  onReject,
  onLoadDiff,
  onRequestChanges
}: BodyProps): React.JSX.Element {
  const logsEndRef = useRef<HTMLDivElement>(null)
  const [copiedLogs, setCopiedLogs] = useState(false)
  const [activeTab, setActiveTab] = useState<ModalTab>('logs')
  const [diffResult, setDiffResult] = useState<TeamExecutionDiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [submittingChanges, setSubmittingChanges] = useState(false)

  useEffect(() => {
    if (
      open &&
      activeTab === 'logs' &&
      logsEndRef.current &&
      typeof logsEndRef.current.scrollIntoView === 'function'
    ) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, activeTab, execution.logs.length])

  const keyedLogs = useMemo(() => buildKeyedExecutionLogs(execution.logs), [execution.logs])
  const keyedDiffLines = useMemo(
    () => (diffResult?.diff ? buildKeyedDiffLines(diffResult.diff) : []),
    [diffResult?.diff]
  )

  const isRunning = execution.status === 'running' || execution.status === 'queued'
  const needsApproval =
    execution.status === 'waiting_for_input' || execution.approvalStatus === 'pending'
  const canRequestChanges =
    !isRunning &&
    (execution.status === 'waiting_for_input' || execution.status === 'completed') &&
    Boolean(onRequestChanges)
  const intlLocale = getIntlLocale()

  const loadDiff = async (): Promise<void> => {
    if (!onLoadDiff) {
      setDiffError('Inspección de diff no disponible en este contexto.')
      return
    }
    setDiffLoading(true)
    setDiffError(null)
    try {
      const result = await onLoadDiff(execution.id)
      if (!result) {
        setDiffError('No se pudo obtener el diff del worktree.')
        setDiffResult(null)
      } else {
        setDiffResult(result)
        setDiffError(result.error ?? null)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cargar el diff.'
      setDiffError(msg)
    } finally {
      setDiffLoading(false)
    }
  }

  const handleTabChange = (value: string): void => {
    const nextTab: ModalTab = value === 'diff' ? 'diff' : 'logs'
    setActiveTab(nextTab)
    if (nextTab === 'diff' && !diffResult && !diffLoading && onLoadDiff) {
      void loadDiff()
    }
  }

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

  const handleRequestChanges = async (): Promise<void> => {
    const clean = feedback.trim()
    if (!clean || !onRequestChanges || submittingChanges) {
      return
    }
    setSubmittingChanges(true)
    try {
      await onRequestChanges(execution.id, clean)
      setFeedback('')
      setDiffResult(null)
      setDiffError(null)
      setActiveTab('logs')
    } catch {
      // Caller surfaces toast/error; keep feedback text so user does not lose it.
    } finally {
      setSubmittingChanges(false)
    }
  }

  const diffFilesCount = diffResult?.files.length ?? execution.changedFiles?.length ?? 0

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-sleek">
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
              {isRunning && <Loader2 className="w-2.5 h-2.5 mr-1 inline animate-spin text-primary" />}
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
              <span className="text-2xs font-medium text-muted-foreground">Worktree aislado:</span>
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

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <div className="flex items-center justify-between gap-2">
            <TabsList size="sm">
              <TabsTrigger value="logs">
                <Terminal className="w-3 h-3 text-primary" />
                <span>Consola de Logs</span>
              </TabsTrigger>
              <TabsTrigger value="diff">
                <FileDiff className="w-3 h-3 text-primary" />
                <span>Cambios (Diff)</span>
                {diffFilesCount > 0 && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-3xs">
                    {diffFilesCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {activeTab === 'logs' ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => void handleCopyLogs()}
              >
                {copiedLogs ? (
                  <Check className="w-3 h-3 text-workspace-status-review" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                {copiedLogs ? 'Copiado' : 'Copiar Logs'}
              </Button>
            ) : (
              onLoadDiff && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={diffLoading}
                  onClick={() => void loadDiff()}
                >
                  <RefreshCw className={cn('w-3 h-3', diffLoading && 'animate-spin')} />
                  Actualizar Diff
                </Button>
              )
            )}
          </div>

          <TabsContent value="logs" className="mt-2">
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
          </TabsContent>

          <TabsContent value="diff" className="mt-2 space-y-2.5">
            {diffLoading ? (
              <div className="flex items-center gap-2 p-4 rounded-lg border border-border bg-card/60 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span>Cargando cambios del worktree...</span>
              </div>
            ) : diffError ? (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30 text-xs text-muted-foreground">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                <span>{diffError}</span>
              </div>
            ) : !diffResult || (diffResult.files.length === 0 && keyedDiffLines.length === 0) ? (
              <div className="p-4 rounded-lg border border-border bg-card/60 text-xs text-muted-foreground italic">
                Sin cambios detectados en el worktree respecto a{' '}
                {execution.baseBranch ?? 'HEAD'}.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {diffResult.files.map((file) => (
                      <div
                        key={file.path}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/80 px-2 py-0.5 text-3xs font-mono"
                      >
                        <span
                          className={cn(
                            'inline-flex items-center justify-center rounded px-1 font-semibold border',
                            diffStatusBadgeClass(file.status)
                          )}
                        >
                          {formatDiffStatusCode(file.status)}
                        </span>
                        <span className="text-foreground truncate max-w-60" title={file.path}>
                          {file.path}
                        </span>
                        <span className="text-chat-diff-added">+{file.additions}</span>
                        <span className="text-chat-diff-removed">-{file.deletions}</span>
                      </div>
                    ))}
                  </div>
                  {diffResult.truncated && (
                    <Badge variant="outline" className="text-3xs">
                      Diff truncado por tamaño
                    </Badge>
                  )}
                </div>

                <div className="overflow-y-auto overflow-x-auto scrollbar-sleek max-h-60 rounded-lg border border-border bg-card/90 py-1.5 font-mono text-2xs leading-relaxed">
                  {keyedDiffLines.map((line) => (
                    <div
                      key={line.key}
                      className={cn(
                        'whitespace-pre px-2.5',
                        line.kind === 'add' &&
                          'bg-[var(--diff-added-background)] text-chat-diff-added',
                        line.kind === 'del' &&
                          'bg-[var(--diff-removed-background)] text-chat-diff-removed',
                        line.kind === 'hunk' && 'bg-primary/10 text-primary',
                        line.kind === 'file-header' &&
                          'bg-muted/40 text-muted-foreground font-semibold',
                        line.kind === 'context' && 'text-foreground'
                      )}
                    >
                      {line.text || ' '}
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {canRequestChanges && (
          <div className="rounded-lg border border-border bg-card/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="team-reprompt-feedback"
                className="flex items-center gap-1.5 text-xs font-medium text-foreground"
              >
                <MessageSquarePlus className="w-3.5 h-3.5 text-primary" />
                <span>Solicitar ajustes sobre este worktree</span>
              </label>
              <span className="text-3xs text-muted-foreground">
                Conserva la rama y archivos actuales
              </span>
            </div>
            <Textarea
              id="team-reprompt-feedback"
              value={feedback}
              disabled={submittingChanges}
              onChange={(event) => setFeedback(event.target.value)}
              onKeyDown={(event) => {
                if (
                  !isImeOwnedKeyboardEvent(event) &&
                  (event.metaKey || event.ctrlKey) &&
                  event.key === 'Enter'
                ) {
                  event.preventDefault()
                  void handleRequestChanges()
                }
              }}
              placeholder="Ej: Agrega manejo de errores en el endpoint y cubre el caso límite con un test..."
              className="min-h-16 text-xs"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={!feedback.trim() || submittingChanges}
                onClick={() => void handleRequestChanges()}
              >
                {submittingChanges ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                )}
                {submittingChanges ? 'Enviando...' : 'Pedir corrección'}
              </Button>
            </div>
          </div>
        )}

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
  )
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
  onReject,
  onLoadDiff,
  onRequestChanges
}: Props): React.JSX.Element | null {
  if (!execution) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <TeamAgentExecutionModalBody
        key={`${execution.id}:${open ? 'open' : 'closed'}`}
        open={open}
        cardTitle={cardTitle}
        execution={execution}
        canApproveExecutions={canApproveExecutions}
        canDispatchAgents={canDispatchAgents}
        onOpenChange={onOpenChange}
        onCancel={onCancel}
        onRerun={onRerun}
        onApprove={onApprove}
        onReject={onReject}
        onLoadDiff={onLoadDiff}
        onRequestChanges={onRequestChanges}
      />
    </Dialog>
  )
}
