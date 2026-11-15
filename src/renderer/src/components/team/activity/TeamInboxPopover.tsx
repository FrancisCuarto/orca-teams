import React, { useState } from 'react'
import {
  ArrowUpRight,
  AtSign,
  Bell,
  Check,
  CheckCheck,
  Inbox,
  Mail,
  RefreshCw,
  ShieldAlert,
  UserCheck
} from 'lucide-react'
import type { TeamTab } from '../../../../../shared/teamwork/team-kanban-types'
import type {
  TeamInboxItem,
  TeamInboxItemKind
} from '../../../../../shared/teamwork/team-inbox-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getIntlLocale } from '@/i18n/i18n'

type Props = {
  items: TeamInboxItem[]
  unreadCount: number
  loading?: boolean
  onMarkAsRead: (itemId: string) => void
  onMarkAllAsRead: () => void
  onSelectTab: (tab: TeamTab, item: TeamInboxItem) => void
  onRefresh?: () => void
}

function getKindMeta(kind: TeamInboxItemKind): {
  label: string
  badgeClass: string
  icon: React.JSX.Element
} {
  switch (kind) {
    case 'assignment':
      return {
        label: 'Asignación',
        badgeClass: 'text-blue-400 border-blue-400/30 bg-blue-500/10',
        icon: <UserCheck className="size-3 text-blue-400" />
      }
    case 'mention':
      return {
        label: 'Mención',
        badgeClass: 'text-violet-400 border-violet-400/30 bg-violet-500/10',
        icon: <AtSign className="size-3 text-violet-400" />
      }
    case 'invitation':
      return {
        label: 'Invitación',
        badgeClass: 'text-emerald-400 border-emerald-400/30 bg-emerald-500/10',
        icon: <Mail className="size-3 text-emerald-400" />
      }
    case 'approval':
      return {
        label: 'Aprobación',
        badgeClass: 'text-amber-400 border-amber-400/30 bg-amber-500/10',
        icon: <ShieldAlert className="size-3 text-amber-400" />
      }
  }
}

function getTabLabel(tab: TeamTab): string {
  switch (tab) {
    case 'kanban':
      return 'Ir al Kanban'
    case 'whiteboard':
      return 'Ir a Pizarra'
    case 'notes':
      return 'Ir a Notas'
    case 'activity':
      return 'Ir a Actividad'
  }
}

export function TeamInboxPopover({
  items,
  unreadCount,
  loading = false,
  onMarkAsRead,
  onMarkAllAsRead,
  onSelectTab,
  onRefresh
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const intlLocale = getIntlLocale()

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen)
    if (nextOpen) {
      onRefresh?.()
    }
  }

  const handleJumpToItem = (item: TeamInboxItem): void => {
    if (!item.read) {
      onMarkAsRead(item.id)
    }
    onSelectTab(item.targetTab, item)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="relative"
          title="Bandeja de notificaciones"
          aria-label="Notificaciones del equipo"
          data-testid="team-inbox-trigger"
        >
          <Bell className="size-3.5" />
          {unreadCount > 0 ? (
            <span
              data-testid="team-inbox-unread-badge"
              className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-none flex items-center justify-center ring-2 ring-background"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" wheelScroll className="w-80 sm:w-96 p-0">
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-border bg-card/50">
          <div className="flex items-center gap-2 min-w-0">
            <Inbox className="size-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground truncate">Bandeja</span>
            <Badge variant={unreadCount > 0 ? 'default' : 'secondary'} className="text-3xs h-4 px-1.5">
              {unreadCount > 0 ? `${unreadCount} sin leer` : 'Al día'}
            </Badge>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={unreadCount === 0}
              onClick={onMarkAllAsRead}
              className="h-6 px-1.5 text-3xs gap-1"
              title="Marcar todas como leídas"
            >
              <CheckCheck className="size-3" />
              Leer todo
            </Button>
            {onRefresh ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onRefresh}
                disabled={loading}
                title="Actualizar notificaciones"
              >
                <RefreshCw className={loading ? 'animate-spin' : undefined} />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto scrollbar-sleek divide-y divide-border/60">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-8 text-center">
              <Bell className="size-5 text-muted-foreground/60" />
              <p className="text-xs font-medium text-foreground">Sin notificaciones</p>
              <p className="text-2xs text-muted-foreground leading-relaxed">
                Aquí aparecerán tus asignaciones, menciones, invitaciones y aprobaciones de agentes.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const kindMeta = getKindMeta(item.kind)
              const formattedDate = new Date(item.createdAt).toLocaleString(intlLocale, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleJumpToItem(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleJumpToItem(item)
                    }
                  }}
                  data-testid={`team-inbox-item-${item.id}`}
                  className={`group flex flex-col gap-1.5 px-3.5 py-2.5 text-left transition-colors cursor-pointer hover:bg-accent/50 focus-visible:outline-none focus-visible:bg-accent/60 ${
                    item.read ? 'opacity-75' : 'bg-primary/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {!item.read ? (
                        <span
                          className="size-1.5 rounded-full bg-primary shrink-0"
                          aria-label="Sin leer"
                        />
                      ) : null}
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.2 text-3xs font-medium ${kindMeta.badgeClass}`}
                      >
                        {kindMeta.icon}
                        {kindMeta.label}
                      </span>
                      <span className="text-2xs font-semibold text-foreground truncate">
                        {item.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!item.read ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onMarkAsRead(item.id)
                          }}
                          title="Marcar como leída"
                          aria-label={`Marcar como leída: ${item.title}`}
                          className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <Check className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <p className="text-2xs text-foreground/90 line-clamp-2 leading-snug">
                    {item.summary}
                  </p>

                  <div className="flex items-center justify-between gap-2 text-3xs text-muted-foreground">
                    <span className="truncate">
                      {item.actorName} · {formattedDate}
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-primary font-medium shrink-0 opacity-85 group-hover:opacity-100">
                      {getTabLabel(item.targetTab)}
                      <ArrowUpRight className="size-2.5" />
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
