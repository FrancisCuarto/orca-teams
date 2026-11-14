import React from 'react'
import { Radio, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'

type Props = {
  presences: CollaboratorPresence[]
  syncStatus?: 'connected' | 'syncing' | 'offline'
  activeCardsCount?: number
}

export function TeamBoardPresenceBar({
  presences,
  syncStatus = 'connected',
  activeCardsCount
}: Props): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border bg-card/40 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Radio className="w-3.5 h-3.5 text-workspace-status-review animate-pulse" />
        <span className="font-medium text-foreground">Colaboración en Vivo:</span>
      </div>

      <div className="flex items-center -space-x-1.5 overflow-hidden">
        {presences.slice(0, 6).map((collab) => {
          const initials = collab.displayName.slice(0, 2).toUpperCase()
          return (
            <div
              key={collab.userId}
              title={`${collab.displayName}${collab.activeCardId ? ' (viendo tarjeta)' : ''}`}
              className="relative inline-flex items-center justify-center w-6 h-6 rounded-full border-2 border-background bg-secondary text-2xs font-semibold text-foreground shadow-xs shrink-0 select-none"
            >
              <span>{initials}</span>
              {collab.activeCardId && (
                <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-workspace-status-review ring-1 ring-background" />
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {typeof activeCardsCount === 'number' && activeCardsCount > 0 && (
          <span className="text-2xs text-muted-foreground hidden sm:inline">
            {activeCardsCount} {activeCardsCount === 1 ? 'tarjeta activa' : 'tarjetas activas'}
          </span>
        )}

        <Badge variant={syncStatus === 'connected' ? 'secondary' : 'outline'}>
          <Users className="w-3 h-3 mr-1 inline text-primary" />
          {syncStatus === 'connected' ? `${presences.length} en línea` : 'Sincronizando...'}
        </Badge>
      </div>
    </div>
  )
}
