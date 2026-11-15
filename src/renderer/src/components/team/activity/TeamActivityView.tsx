import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, Bot, RefreshCw, Shield, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getIntlLocale } from '@/i18n/i18n'
import type {
  TeamActivityActorType,
  TeamActivityEntry
} from '../../../../../shared/teamwork/team-workspace-types'
import { getTeamsTeamApi } from '../storage/team-web-relay-api'

type Props = {
  teamId: string
  projectId?: string
}

type ActorFilter = 'all' | TeamActivityActorType

export function TeamActivityView({ teamId, projectId }: Props): React.JSX.Element {
  const [entries, setEntries] = useState<TeamActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ActorFilter>('all')

  const loadActivity = useCallback(async () => {
    const teamApi = getTeamsTeamApi()
    if (!teamApi?.listActivity) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const list = await teamApi.listActivity({ teamId, projectId, limit: 100 })
      setEntries(list)
    } finally {
      setLoading(false)
    }
  }, [teamId, projectId])

  useEffect(() => {
    void loadActivity()
  }, [loadActivity])

  const filtered = useMemo(
    () => (filter === 'all' ? entries : entries.filter((entry) => entry.actorType === filter)),
    [entries, filter]
  )

  const intlLocale = getIntlLocale()

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-border bg-card/30">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="text-xs font-semibold text-foreground">
            Historial de Actividad y Auditoría
          </h2>
          <Badge variant="outline">{filtered.length} eventos</Badge>
        </div>

        <div className="flex items-center gap-1.5">
          {(['all', 'human', 'agent'] as const).map((nextFilter) => (
            <Button
              key={nextFilter}
              type="button"
              size="xs"
              variant={filter === nextFilter ? 'secondary' : 'ghost'}
              onClick={() => setFilter(nextFilter)}
            >
              {nextFilter === 'all' ? 'Todos' : nextFilter === 'human' ? 'Humanos' : 'Agentes IA'}
            </Button>
          ))}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            onClick={() => void loadActivity()}
            disabled={loading}
            title="Actualizar historial"
          >
            <RefreshCw className={loading ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-sleek p-5 space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            {loading
              ? 'Cargando historial de actividad...'
              : 'Todavía no hay eventos registrados para este proyecto.'}
          </div>
        ) : (
          filtered.map((entry) => {
            const formattedDate = new Date(entry.createdAt).toLocaleString(intlLocale, {
              dateStyle: 'short',
              timeStyle: 'short'
            })
            return (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card/50 px-3.5 py-2.5 text-xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="mt-0.5 rounded-full bg-muted p-1.5 text-muted-foreground shrink-0">
                    {entry.actorType === 'agent' ? (
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    ) : entry.actorType === 'human' ? (
                      <User className="w-3.5 h-3.5 text-workspace-status-review" />
                    ) : (
                      <Shield className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-foreground">{entry.actorName}</span>
                      <Badge variant="outline">
                        <code className="font-mono text-3xs">{entry.action}</code>
                      </Badge>
                    </div>
                    <p className="text-foreground/90 break-words">{entry.summary}</p>
                  </div>
                </div>
                <span className="text-3xs text-muted-foreground shrink-0 whitespace-nowrap">
                  {formattedDate}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
