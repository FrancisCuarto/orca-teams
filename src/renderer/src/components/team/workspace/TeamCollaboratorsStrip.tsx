import React from 'react'
import type { CollaboratorPresence } from '../../../../../shared/teamwork/realtime/team-crdt-types'

type Props = {
  currentUser: {
    userId: string
    displayName: string
    avatarUrl?: string
    color?: string
  }
  peers: CollaboratorPresence[]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  }
  return name.trim().slice(0, 2).toUpperCase() || '??'
}

function describePresenceActivity(peer: CollaboratorPresence, isSelf: boolean): string {
  if (isSelf) {
    return `${peer.displayName} (tú · en línea)`
  }
  if (peer.activeCardId) {
    return `${peer.displayName} · editando tarjeta`
  }
  if (peer.activeNoteId) {
    return `${peer.displayName} · editando nota`
  }
  if (peer.cursor) {
    return `${peer.displayName} · activo en pizarra`
  }
  return `${peer.displayName} · en línea`
}

export function TeamCollaboratorsStrip({ currentUser, peers }: Props): React.JSX.Element {
  const selfPresence: CollaboratorPresence = {
    userId: currentUser.userId,
    displayName: currentUser.displayName,
    avatarUrl: currentUser.avatarUrl,
    color: currentUser.color ?? '#3b82f6',
    lastSeen: 0
  }

  const dedupedPeers = peers.filter((p) => p.userId !== currentUser.userId)
  const visibleCollaborators = [...dedupedPeers, selfPresence]
  const maxVisible = 5
  const shown = visibleCollaborators.slice(0, maxVisible)
  const overflowCount = Math.max(0, visibleCollaborators.length - maxVisible)

  return (
    <div
      data-testid="team-header-collaborators-strip"
      className="flex items-center gap-2"
      title={`${visibleCollaborators.length} ${visibleCollaborators.length === 1 ? 'colaborador en línea' : 'colaboradores en línea'}`}
    >
      <div className="flex items-center -space-x-1.5">
        {shown.map((collab) => {
          const isSelf = collab.userId === currentUser.userId
          const initials = getInitials(collab.displayName)
          const tooltip = describePresenceActivity(collab, isSelf)
          return (
            <div
              key={collab.userId}
              title={tooltip}
              data-testid={`header-collaborator-${collab.userId}`}
              className="relative inline-flex items-center justify-center size-6 rounded-full border-2 border-background bg-secondary text-3xs font-semibold text-foreground shadow-xs shrink-0 select-none overflow-visible"
              style={{ boxShadow: `0 0 0 1.5px ${collab.color}` }}
            >
              {collab.avatarUrl ? (
                <img
                  src={collab.avatarUrl}
                  alt={collab.displayName}
                  className="size-full rounded-full object-cover"
                />
              ) : (
                <span>{initials}</span>
              )}
              <span
                className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-1 ring-background bg-emerald-500"
                aria-hidden="true"
              />
            </div>
          )
        })}
        {overflowCount > 0 ? (
          <div className="inline-flex items-center justify-center size-6 rounded-full border-2 border-background bg-muted text-3xs font-semibold text-muted-foreground shadow-xs shrink-0 select-none">
            +{overflowCount}
          </div>
        ) : null}
      </div>

      {dedupedPeers.length > 0 ? (
        <span className="text-3xs text-muted-foreground hidden md:inline whitespace-nowrap">
          {dedupedPeers.length}{' '}
          {dedupedPeers.length === 1 ? 'par activo' : 'pares activos'}
        </span>
      ) : null}
    </div>
  )
}
