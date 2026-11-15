import React, { useMemo, useState } from 'react'
import {
  AlertCircle,
  Download,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw
} from 'lucide-react'
import {
  collectExistingExternalIssueKeys
} from '../../../../../shared/teamwork/team-issue-card-builder'
import type {
  ExternalIssueProvider,
  ExternalTeamIssue,
  TeamKanbanCard,
  TeamKanbanColumn
} from '../../../../../shared/teamwork/team-kanban-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/class-names'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { getTeamPreloadApi } from '../hooks/use-team-workspace-registry-actions'

type Props = {
  isOpen: boolean
  columns: TeamKanbanColumn[]
  defaultColumnId?: string
  existingCards: Record<string, TeamKanbanCard>
  projectPath?: string | null
  onClose: () => void
  onImport: (issues: ExternalTeamIssue[], targetColumnId: string) => void
}

type BodyProps = Omit<Props, 'isOpen'>

function issueUniqueKey(issue: Pick<ExternalTeamIssue, 'provider' | 'id'>): string {
  return `${issue.provider}:${issue.id}`
}

function isIssueAlreadyImported(
  issue: Pick<ExternalTeamIssue, 'provider' | 'id' | 'key'>,
  existingKeys: Set<string>
): boolean {
  return (
    existingKeys.has(`${issue.provider}:id:${issue.id}`) ||
    existingKeys.has(`${issue.provider}:key:${issue.key}`)
  )
}

function TeamIssueImporterBody({
  columns,
  defaultColumnId,
  existingCards,
  projectPath,
  onClose,
  onImport
}: BodyProps): React.JSX.Element {
  const [provider, setProvider] = useState<ExternalIssueProvider>('github')
  const [repoPath, setRepoPath] = useState(projectPath ?? '')
  const [linearApiKey, setLinearApiKey] = useState('')
  const [linearTeamKey, setLinearTeamKey] = useState('')
  const [targetColumnId, setTargetColumnId] = useState(
    defaultColumnId ?? columns[0]?.id ?? ''
  )
  const [issues, setIssues] = useState<ExternalTeamIssue[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const existingExternalKeys = useMemo(
    () => collectExistingExternalIssueKeys(existingCards),
    [existingCards]
  )

  const selectableIssues = useMemo(
    () => issues.filter((issue) => !isIssueAlreadyImported(issue, existingExternalKeys)),
    [issues, existingExternalKeys]
  )

  const selectedIssues = useMemo(
    () => selectableIssues.filter((issue) => selectedIds.has(issueUniqueKey(issue))),
    [selectableIssues, selectedIds]
  )

  const handleProviderSwitch = (nextProvider: ExternalIssueProvider): void => {
    if (nextProvider === provider) {
      return
    }
    setProvider(nextProvider)
    setIssues([])
    setSelectedIds(new Set())
    setHasLoaded(false)
    setErrorMessage(null)
  }

  const handleFetchIssues = async (): Promise<void> => {
    const teamApi = getTeamPreloadApi()
    if (!teamApi?.fetchExternalIssues) {
      setErrorMessage('La importación de issues requiere el runtime de escritorio Orca.')
      return
    }

    if (provider === 'github' && !repoPath.trim()) {
      setErrorMessage('Indica la ruta del repositorio local para consultar issues con gh.')
      return
    }
    if (provider === 'linear' && !linearApiKey.trim()) {
      setErrorMessage('Ingresa tu API key de Linear para consultar issues.')
      return
    }

    setLoading(true)
    setErrorMessage(null)
    try {
      const fetched =
        provider === 'github'
          ? await teamApi.fetchExternalIssues({
              provider: 'github',
              repoPath: repoPath.trim(),
              limit: 30
            })
          : await teamApi.fetchExternalIssues({
              provider: 'linear',
              apiKey: linearApiKey.trim(),
              teamKey: linearTeamKey.trim() || undefined,
              limit: 30
            })
      setIssues(fetched)
      setSelectedIds(new Set())
      setHasLoaded(true)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'No se pudieron obtener los issues externos.'
      )
      setIssues([])
      setSelectedIds(new Set())
    } finally {
      setLoading(false)
    }
  }

  const toggleIssueSelection = (issueKey: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(issueKey)) {
        next.delete(issueKey)
      } else {
        next.add(issueKey)
      }
      return next
    })
  }

  const handleSelectAllAvailable = (): void => {
    setSelectedIds(new Set(selectableIssues.map((issue) => issueUniqueKey(issue))))
  }

  const handleClearSelection = (): void => {
    setSelectedIds(new Set())
  }

  const handleConfirmImport = (): void => {
    if (selectedIssues.length === 0 || !targetColumnId) {
      return
    }
    onImport(selectedIssues, targetColumnId)
    onClose()
  }

  return (
    <>
      <div className="flex flex-col gap-3 py-1">
        {/* Provider Switch */}
        <div className="flex items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Proveedor de issues"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1"
          >
            <Button
              type="button"
              size="xs"
              variant={provider === 'github' ? 'secondary' : 'ghost'}
              onClick={() => handleProviderSwitch('github')}
            >
              GitHub
            </Button>
            <Button
              type="button"
              size="xs"
              variant={provider === 'linear' ? 'secondary' : 'ghost'}
              onClick={() => handleProviderSwitch('linear')}
            >
              Linear
            </Button>
          </div>

          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={loading}
            onClick={() => void handleFetchIssues()}
          >
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Cargar issues
          </Button>
        </div>

        {/* Provider Credentials / Source */}
        {provider === 'github' ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="importer-github-repo" className="text-xs font-medium text-foreground">
              Repositorio local (GitHub CLI)
            </label>
            <Input
              id="importer-github-repo"
              density="compact"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
                  e.preventDefault()
                  void handleFetchIssues()
                }
              }}
              placeholder="/ruta/al/repositorio"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label
                htmlFor="importer-linear-key"
                className="flex items-center gap-1 text-xs font-medium text-foreground"
              >
                <KeyRound className="size-3 text-muted-foreground" />
                Linear API Key
              </label>
              <Input
                id="importer-linear-key"
                type="password"
                density="compact"
                value={linearApiKey}
                onChange={(e) => setLinearApiKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
                    e.preventDefault()
                    void handleFetchIssues()
                  }
                }}
                placeholder="lin_api_..."
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="importer-linear-team" className="text-xs font-medium text-foreground">
                Team Key (opcional)
              </label>
              <Input
                id="importer-linear-team"
                density="compact"
                value={linearTeamKey}
                onChange={(e) => setLinearTeamKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
                    e.preventDefault()
                    void handleFetchIssues()
                  }
                }}
                placeholder="Ej. ENG"
              />
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span className="break-words">{errorMessage}</span>
          </div>
        ) : null}

        {/* Checklist Header */}
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {issues.length > 0
              ? `${issues.length} ${issues.length === 1 ? 'issue encontrado' : 'issues encontrados'} · ${selectedIssues.length} seleccionados`
              : hasLoaded
                ? 'No se encontraron issues abiertos.'
                : 'Pulsa "Cargar issues" para listar tareas pendientes.'}
          </span>
          {selectableIssues.length > 0 ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={handleSelectAllAvailable}
              >
                Seleccionar disponibles ({selectableIssues.length})
              </Button>
              {selectedIds.size > 0 ? (
                <Button type="button" size="xs" variant="ghost" onClick={handleClearSelection}>
                  Limpiar
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Issue Checklist */}
        <div className="max-h-64 overflow-y-auto scrollbar-sleek rounded-md border border-border bg-card/40 divide-y divide-border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Consultando {provider === 'github' ? 'GitHub' : 'Linear'}...
            </div>
          ) : issues.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground px-4">
              {hasLoaded
                ? 'No hay issues abiertos que mostrar con los criterios actuales.'
                : 'Selecciona un proveedor y carga los issues para revisarlos antes de importar.'}
            </div>
          ) : (
            issues.map((issue) => {
              const uniqueKey = issueUniqueKey(issue)
              const duplicate = isIssueAlreadyImported(issue, existingExternalKeys)
              const checked = !duplicate && selectedIds.has(uniqueKey)

              return (
                <label
                  key={uniqueKey}
                  className={cn(
                    'flex items-start gap-2.5 p-2.5 transition-colors',
                    duplicate
                      ? 'opacity-60 cursor-not-allowed bg-muted/20'
                      : 'cursor-pointer hover:bg-accent/40'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={duplicate}
                    onChange={() => toggleIssueSelection(uniqueKey)}
                    className="mt-0.5 size-3.5 rounded border-input text-primary focus:ring-primary shrink-0"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{issue.key}</Badge>
                      <span className="text-xs font-medium text-foreground truncate">
                        {issue.title}
                      </span>
                      {duplicate ? <Badge variant="secondary">Ya importado</Badge> : null}
                    </div>
                    {issue.description ? (
                      <p className="text-2xs text-muted-foreground line-clamp-1">
                        {issue.description}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="referenceLabel">{issue.priority}</Badge>
                      {issue.labels.slice(0, 3).map((label) => (
                        <Badge key={`${uniqueKey}-lbl-${label}`} variant="referenceLabel">
                          {label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={`Abrir ${issue.key}`}
                    className="text-muted-foreground hover:text-foreground shrink-0 p-1"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </label>
              )
            })
          )}
        </div>

        {/* Target Column Selector */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <label
            htmlFor="importer-target-column"
            className="text-xs font-medium text-foreground shrink-0"
          >
            Columna destino
          </label>
          <select
            id="importer-target-column"
            aria-label="Columna destino"
            value={targetColumnId}
            onChange={(e) => setTargetColumnId(e.target.value)}
            className="h-8 flex-1 max-w-xs rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={selectedIssues.length === 0 || !targetColumnId}
          onClick={handleConfirmImport}
        >
          <Download />
          Importar seleccionados
          {selectedIssues.length > 0 ? ` (${selectedIssues.length})` : ''}
        </Button>
      </DialogFooter>
    </>
  )
}

export function TeamIssueImporterModal({
  isOpen,
  columns,
  defaultColumnId,
  existingCards,
  projectPath,
  onClose,
  onImport
}: Props): React.JSX.Element {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Issues Externos</DialogTitle>
          <DialogDescription>
            Consulta issues abiertos desde GitHub o Linear e impórtalos como tareas en tu tablero
            Kanban evitando duplicados.
          </DialogDescription>
        </DialogHeader>

        {isOpen ? (
          <TeamIssueImporterBody
            key={`${defaultColumnId ?? columns[0]?.id ?? 'default'}-${projectPath ?? ''}`}
            columns={columns}
            defaultColumnId={defaultColumnId}
            existingCards={existingCards}
            projectPath={projectPath}
            onClose={onClose}
            onImport={onImport}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
