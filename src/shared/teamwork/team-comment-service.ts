import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  extractMentionsFromComment,
  isTeamCommentMention,
  type TeamCardComment,
  type TeamCommentMention
} from './team-kanban-types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMentionsJson(raw: unknown): TeamCommentMention[] {
  if (typeof raw !== 'string' || !raw.trim()) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isTeamCommentMention)
  } catch {
    return []
  }
}

export type AddCardCommentInput = {
  id?: string
  cardId: string
  projectId: string
  authorId: string
  authorName: string
  authorType?: 'human' | 'agent'
  body: string
  mentions?: TeamCommentMention[]
  createdAt?: number
}

export class TeamCommentService {
  constructor(private readonly db: DatabaseSync) {}

  listCardComments(cardId: string): TeamCardComment[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM team_card_comments
         WHERE card_id = ?
         ORDER BY created_at ASC`
      )
      .all(cardId)

    const comments: TeamCardComment[] = []
    for (const row of rows) {
      if (!isRecord(row)) {
        continue
      }
      comments.push({
        id: String(row.id),
        cardId: String(row.card_id),
        projectId: String(row.project_id),
        authorId: String(row.author_id),
        authorName: String(row.author_name),
        authorType: row.author_type === 'agent' ? 'agent' : 'human',
        body: String(row.body),
        mentions: parseMentionsJson(row.mentions_json),
        createdAt: Number(row.created_at),
        updatedAt:
          typeof row.updated_at === 'number' && !Number.isNaN(row.updated_at)
            ? row.updated_at
            : undefined
      })
    }
    return comments
  }

  addCardComment(input: AddCardCommentInput): TeamCardComment {
    const body = input.body.trim()
    if (!body) {
      throw new Error('El comentario no puede estar vacío')
    }
    const now = input.createdAt ?? Date.now()
    const id = input.id?.trim() || `cmt-${randomUUID().slice(0, 12)}`
    const authorType: 'human' | 'agent' = input.authorType === 'agent' ? 'agent' : 'human'
    const mentions =
      input.mentions !== undefined ? input.mentions : extractMentionsFromComment(body)

    const comment: TeamCardComment = {
      id,
      cardId: input.cardId,
      projectId: input.projectId,
      authorId: input.authorId,
      authorName: input.authorName,
      authorType,
      body,
      mentions,
      createdAt: now
    }

    this.db
      .prepare(
        `INSERT INTO team_card_comments (
          id, card_id, project_id, author_id, author_name, author_type,
          body, mentions_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          body = excluded.body,
          mentions_json = excluded.mentions_json,
          updated_at = excluded.updated_at`
      )
      .run(
        comment.id,
        comment.cardId,
        comment.projectId,
        comment.authorId,
        comment.authorName,
        comment.authorType,
        comment.body,
        JSON.stringify(comment.mentions),
        comment.createdAt,
        comment.updatedAt ?? null
      )

    return comment
  }

  deleteCardComment(commentId: string): boolean {
    const result = this.db.prepare('DELETE FROM team_card_comments WHERE id = ?').run(commentId)
    return Number(result.changes) > 0
  }
}
