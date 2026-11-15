import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AtSign, Bot, MessageSquare, Send, Trash2, User, Zap } from 'lucide-react'
import { toast } from 'sonner'
import {
  extractMentionsFromComment,
  toMentionHandle,
  type ExtendedTeamMember,
  type TeamCardComment,
  type TeamCommentMention,
  type TeamKanbanCard
} from '../../../../../shared/teamwork/team-kanban-types'
import type { TeamMemberEntry } from '../../../../../shared/teamwork/team-members'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getIntlLocale } from '@/i18n/i18n'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'
import { getTeamPreloadApi } from '../hooks/use-team-workspace-registry-actions'

export type TeamCardCommentsPanelProps = {
  card: TeamKanbanCard
  projectId: string
  currentUserId: string
  currentUserName: string
  humans: readonly ExtendedTeamMember[]
  configuredAgents: readonly TeamMemberEntry[]
  onAddComment?: (comment: TeamCardComment) => void
  onDeleteComment?: (commentId: string) => void
  onDispatchAgentFollowUp?: (
    card: TeamKanbanCard,
    agentMention: TeamCommentMention,
    comment: TeamCardComment
  ) => void
}

type MentionCandidate = {
  key: string
  id: string
  handle: string
  label: string
  role: string
  type: 'human' | 'agent'
}

type ActiveMentionMatch = {
  start: number
  end: number
  query: string
}

type BodySegment = {
  key: string
  kind: 'text' | 'mention'
  text: string
  mention?: TeamCommentMention
}

function buildMentionCandidates(
  humans: readonly ExtendedTeamMember[],
  configuredAgents: readonly TeamMemberEntry[]
): MentionCandidate[] {
  const candidates: MentionCandidate[] = []
  const seenKeys = new Set<string>()

  for (const agent of configuredAgents) {
    const rawHandle = agent.agentType ?? agent.id
    const handle = toMentionHandle(rawHandle) || toMentionHandle(agent.name)
    if (!handle) {
      continue
    }
    const key = `agent:${agent.id}`
    if (seenKeys.has(key)) {
      continue
    }
    seenKeys.add(key)
    candidates.push({
      key,
      id: agent.id,
      handle,
      label: agent.name,
      role: agent.role || 'Agente IA',
      type: 'agent'
    })
  }

  for (const human of humans) {
    const handle = toMentionHandle(human.name) || toMentionHandle(human.id)
    if (!handle) {
      continue
    }
    const key = `human:${human.id}`
    if (seenKeys.has(key)) {
      continue
    }
    seenKeys.add(key)
    candidates.push({
      key,
      id: human.id,
      handle,
      label: human.name,
      role: human.role || 'Miembro',
      type: 'human'
    })
  }

  return candidates
}

function findActiveMentionMatch(text: string, cursorPos: number): ActiveMentionMatch | null {
  const beforeCursor = text.slice(0, cursorPos)
  const match = /(?:^|[\s(\[,])@([a-zA-Z0-9._-]*)$/.exec(beforeCursor)
  if (!match) {
    return null
  }
  const query = match[1] ?? ''
  const atIndex = beforeCursor.lastIndexOf('@')
  if (atIndex === -1) {
    return null
  }
  return {
    start: atIndex,
    end: cursorPos,
    query
  }
}

function segmentCommentBody(
  commentId: string,
  body: string,
  mentions: readonly TeamCommentMention[]
): BodySegment[] {
  const mentionMap = new Map<string, TeamCommentMention>()
  for (const mention of mentions) {
    mentionMap.set(mention.token.toLowerCase(), mention)
  }

  const segments: BodySegment[] = []
  const pattern = /(^|[\s(\[,])(@([a-zA-Z0-9][a-zA-Z0-9._-]*))/g
  let cursor = 0

  for (const match of body.matchAll(pattern)) {
    const matchIndex = match.index ?? 0
    const prefix = match[1] ?? ''
    const rawMention = match[2] ?? ''
    const rawToken = match[3] ?? ''
    const cleanedToken = rawToken.replace(/[.,;:!?]+$/, '')
    const mentionStart = matchIndex + prefix.length
    const mentionEnd = mentionStart + 1 + cleanedToken.length

    if (mentionStart > cursor) {
      segments.push({
        key: `${commentId}-txt-${cursor}-${mentionStart}`,
        kind: 'text',
        text: body.slice(cursor, mentionStart)
      })
    }

    if (cleanedToken) {
      const matched = mentionMap.get(cleanedToken.toLowerCase())
      segments.push({
        key: `${commentId}-mnt-${mentionStart}-${mentionEnd}`,
        kind: 'mention',
        text: `@${cleanedToken}`,
        mention: matched ?? {
          token: cleanedToken,
          label: cleanedToken,
          type: 'human'
        }
      })
      cursor = mentionEnd
    } else {
      segments.push({
        key: `${commentId}-raw-${matchIndex}`,
        kind: 'text',
        text: rawMention
      })
      cursor = mentionStart + rawMention.length
    }
  }

  if (cursor < body.length) {
    segments.push({
      key: `${commentId}-tail-${cursor}-${body.length}`,
      kind: 'text',
      text: body.slice(cursor)
    })
  }

  return segments
}

export function TeamCardCommentsPanel({
  card,
  projectId,
  currentUserId,
  currentUserName,
  humans,
  configuredAgents,
  onAddComment,
  onDeleteComment,
  onDispatchAgentFollowUp
}: TeamCardCommentsPanelProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [cursorPos, setCursorPos] = useState(0)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadedComments, setLoadedComments] = useState<TeamCardComment[]>([])
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set())
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    let active = true
    const teamApi = getTeamPreloadApi()
    if (!teamApi?.listCardComments) {
      return
    }
    void teamApi
      .listCardComments(card.id)
      .then((rows) => {
        if (active && Array.isArray(rows)) {
          setLoadedComments(rows)
        }
      })
      .catch(() => {
        // Keep CRDT/in-memory comments if SQLite IPC is unavailable.
      })
    return () => {
      active = false
    }
  }, [card.id])

  const comments = useMemo(() => {
    const byId = new Map<string, TeamCardComment>()
    for (const item of loadedComments) {
      if (!deletedIds.has(item.id)) {
        byId.set(item.id, item)
      }
    }
    for (const item of card.comments ?? []) {
      if (!deletedIds.has(item.id)) {
        byId.set(item.id, item)
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt)
  }, [loadedComments, card.comments, deletedIds])

  const candidates = useMemo(
    () => buildMentionCandidates(humans, configuredAgents),
    [humans, configuredAgents]
  )

  const activeMention = useMemo(() => findActiveMentionMatch(draft, cursorPos), [draft, cursorPos])

  const filteredCandidates = useMemo(() => {
    if (!activeMention) {
      return []
    }
    const q = activeMention.query.toLowerCase()
    if (!q) {
      return candidates.slice(0, 8)
    }
    return candidates
      .filter(
        (c) =>
          c.handle.toLowerCase().includes(q) ||
          c.label.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [activeMention, candidates])

  const showPopover = activeMention !== null && filteredCandidates.length > 0
  const safeHighlightIndex =
    filteredCandidates.length > 0 ? Math.min(highlightedIndex, filteredCandidates.length - 1) : 0

  const insertMentionCandidate = (candidate: MentionCandidate): void => {
    if (!activeMention) {
      return
    }
    const insertion = `@${candidate.handle} `
    const nextDraft =
      draft.slice(0, activeMention.start) + insertion + draft.slice(activeMention.end)
    const nextCursor = activeMention.start + insertion.length
    setDraft(nextDraft)
    setCursorPos(nextCursor)
    setHighlightedIndex(0)

    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(nextCursor, nextCursor)
      }
    })
  }

  const handleSubmit = async (): Promise<void> => {
    const trimmed = draft.trim()
    if (!trimmed || isSubmitting) {
      return
    }
    setIsSubmitting(true)
    const now = Date.now()
    const commentId = `cmt-${now}-${Math.random().toString(36).slice(2, 8)}`
    const mentions = extractMentionsFromComment(trimmed, {
      members: humans,
      agents: configuredAgents
    })

    const newComment: TeamCardComment = {
      id: commentId,
      cardId: card.id,
      projectId,
      authorId: currentUserId,
      authorName: currentUserName,
      authorType: 'human',
      body: trimmed,
      mentions,
      createdAt: now
    }

    setDraft('')
    setCursorPos(0)
    setLoadedComments((prev) => [...prev.filter((c) => c.id !== newComment.id), newComment])
    onAddComment?.(newComment)

    try {
      const teamApi = getTeamPreloadApi()
      if (teamApi?.addCardComment) {
        const persisted = await teamApi.addCardComment({
          id: newComment.id,
          cardId: newComment.cardId,
          projectId: newComment.projectId,
          authorId: newComment.authorId,
          authorName: newComment.authorName,
          authorType: newComment.authorType,
          body: newComment.body,
          mentions: newComment.mentions,
          createdAt: newComment.createdAt
        })
        setLoadedComments((prev) => [
          ...prev.filter((c) => c.id !== persisted.id),
          persisted
        ])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el comentario')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (commentId: string): Promise<void> => {
    setDeletedIds((prev) => {
      const next = new Set(prev)
      next.add(commentId)
      return next
    })
    setLoadedComments((prev) => prev.filter((c) => c.id !== commentId))
    onDeleteComment?.(commentId)

    try {
      const teamApi = getTeamPreloadApi()
      if (teamApi?.deleteCardComment) {
        await teamApi.deleteCardComment(commentId)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el comentario')
    }
  }

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (showPopover) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) => (prev + 1) % filteredCandidates.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex(
          (prev) => (prev - 1 + filteredCandidates.length) % filteredCandidates.length
        )
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !isImeOwnedKeyboardEvent(e)) {
        e.preventDefault()
        const target = filteredCandidates[safeHighlightIndex]
        if (target) {
          insertMentionCandidate(target)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setCursorPos(0)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !isImeOwnedKeyboardEvent(e)) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const intlLocale = getIntlLocale()

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-border">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <MessageSquare className="size-3.5 text-muted-foreground" />
          <span>Comentarios y Menciones</span>
          <Badge variant="outline" className="text-3xs px-1.5 py-0 h-4 font-mono">
            {comments.length}
          </Badge>
        </label>
        <span className="text-3xs text-muted-foreground flex items-center gap-1">
          <AtSign className="size-3" /> Usa @miembro o @claude / @codex
        </span>
      </div>

      {comments.length > 0 ? (
        <div className="flex flex-col gap-2 max-h-44 overflow-y-auto scrollbar-sleek pr-0.5">
          {comments.map((comment) => {
            const formattedTimestamp = new Date(comment.createdAt).toLocaleString(intlLocale, {
              dateStyle: 'short',
              timeStyle: 'short'
            })
            const segments = segmentCommentBody(comment.id, comment.body, comment.mentions)
            const agentMentions = comment.mentions.filter((m) => m.type === 'agent')

            return (
              <div
                key={comment.id}
                className="group flex flex-col gap-1.5 rounded-lg border border-border bg-card/60 px-2.5 py-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-flex items-center justify-center size-4 rounded-full bg-muted text-muted-foreground shrink-0">
                      {comment.authorType === 'agent' ? (
                        <Bot className="size-2.5 text-primary" />
                      ) : (
                        <User className="size-2.5" />
                      )}
                    </span>
                    <span className="font-medium text-foreground truncate">
                      {comment.authorName}
                    </span>
                    <span className="text-3xs text-muted-foreground whitespace-nowrap">
                      {formattedTimestamp}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => void handleDelete(comment.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Eliminar comentario"
                  >
                    <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>

                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                  {segments.map((seg) =>
                    seg.kind === 'mention' ? (
                      <Badge
                        key={seg.key}
                        variant={seg.mention?.type === 'agent' ? 'outline' : 'secondary'}
                        className={`mx-0.5 px-1.5 py-0 h-4 text-3xs align-baseline ${
                          seg.mention?.type === 'agent'
                            ? 'border-primary/40 bg-primary/10 text-primary'
                            : 'text-secondary-foreground'
                        }`}
                      >
                        {seg.mention?.type === 'agent' ? (
                          <Bot className="size-2.5" />
                        ) : (
                          <User className="size-2.5" />
                        )}
                        {seg.text}
                      </Badge>
                    ) : (
                      <React.Fragment key={seg.key}>{seg.text}</React.Fragment>
                    )
                  )}
                </p>

                {agentMentions.length > 0 && onDispatchAgentFollowUp ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
                    {agentMentions.map((agentMention) => (
                      <Button
                        key={`${comment.id}-dispatch-${agentMention.token}`}
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => onDispatchAgentFollowUp(card, agentMention, comment)}
                        className="h-6 px-2 text-3xs gap-1"
                        title={`Enviar consulta de seguimiento a @${agentMention.token}`}
                      >
                        <Zap className="size-3 text-primary" />
                        <span>Ejecutar @{agentMention.token}</span>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground">
          Aún no hay comentarios en esta tarjeta. Menciona a un miembro o agente con @.
        </div>
      )}

      <div className="relative flex flex-col gap-1.5">
        {showPopover ? (
          <div
            role="listbox"
            aria-label="Sugerencias de mención"
            className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-44 overflow-y-auto scrollbar-sleek rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-floating"
          >
            {filteredCandidates.map((candidate, idx) => (
              <button
                key={candidate.key}
                type="button"
                role="option"
                aria-selected={idx === safeHighlightIndex}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMentionCandidate(candidate)
                }}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                  idx === safeHighlightIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {candidate.type === 'agent' ? (
                    <Bot className="size-3.5 text-primary shrink-0" />
                  ) : (
                    <User className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-mono text-2xs text-primary">@{candidate.handle}</span>
                  <span className="truncate text-foreground">{candidate.label}</span>
                </div>
                <Badge variant="outline" className="text-3xs px-1.5 py-0 h-4 shrink-0">
                  {candidate.type === 'agent' ? 'Agente' : candidate.role}
                </Badge>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setCursorPos(e.target.selectionStart ?? e.target.value.length)
              setHighlightedIndex(0)
            }}
            onClick={(e) => {
              setCursorPos(e.currentTarget.selectionStart ?? draft.length)
            }}
            onKeyUp={(e) => {
              setCursorPos(e.currentTarget.selectionStart ?? draft.length)
            }}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Escribe un comentario... (@ para mencionar miembro o agente)"
            rows={2}
            className="min-h-14 text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!draft.trim() || isSubmitting}
            onClick={() => void handleSubmit()}
            title="Enviar comentario (Enter)"
          >
            <Send className="size-3.5" />
            <span>Comentar</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
