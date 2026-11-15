import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  TeamKanbanCard,
  TeamNote,
  TeamNotesCollection
} from '../../shared/teamwork/team-kanban-types'

const MAX_BRAIN_CHARS = 8_000
const MAX_NOTE_EXCERPT_CHARS = 1_400

export type FactoryBrainContext = {
  noteIds: string[]
  markdown: string
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseTeamNotesCollection(raw: string, projectId: string): TeamNotesCollection | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isPlainRecord(parsed) || !Array.isArray(parsed.notes)) {
      return null
    }
    const notes: TeamNote[] = []
    for (const item of parsed.notes) {
      if (
        isPlainRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.content === 'string'
      ) {
        notes.push({
          id: item.id,
          title: item.title,
          content: item.content,
          category:
            item.category === 'adr' ||
            item.category === 'spec' ||
            item.category === 'meeting' ||
            item.category === 'general'
              ? item.category
              : 'general',
          status:
            item.status === 'draft' ||
            item.status === 'proposed' ||
            item.status === 'accepted' ||
            item.status === 'deprecated'
              ? item.status
              : undefined,
          author: typeof item.author === 'string' ? item.author : undefined,
          tags: Array.isArray(item.tags)
            ? item.tags.filter((t): t is string => typeof t === 'string')
            : [],
          createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
          updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now()
        })
      }
    }
    return {
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : projectId,
      notes,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
    }
  } catch {
    return null
  }
}

function scoreNoteRelevance(note: TeamNote, card: TeamKanbanCard): number {
  if (note.status === 'deprecated') {
    return -1
  }
  let score = 0
  if (note.status === 'accepted') {
    score += 4
  } else if (note.status === 'proposed') {
    score += 1
  }
  if (note.category === 'adr') {
    score += 3
  } else if (note.category === 'spec') {
    score += 2
  }
  const cardTokens = `${card.title} ${card.description} ${card.labels.join(' ')}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
  const noteHaystack =
    `${note.title} ${note.tags.join(' ')} ${note.content.slice(0, 500)}`.toLowerCase()
  for (const token of new Set(cardTokens)) {
    if (noteHaystack.includes(token)) {
      score += 2
    }
  }
  return score
}

async function readExtraBrainDocs(
  projectPath: string
): Promise<{ name: string; content: string }[]> {
  const brainDir = path.join(projectPath, '.orca', 'brain')
  try {
    const entries = await readdir(brainDir, { withFileTypes: true })
    const docs: { name: string; content: string }[] = []
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        const content = await readFile(path.join(brainDir, entry.name), 'utf8')
        if (content.trim()) {
          docs.push({ name: entry.name, content: content.trim() })
        }
      }
    }
    return docs.slice(0, 6)
  } catch {
    return []
  }
}

export async function loadFactoryBrainContext(
  projectPath: string | null | undefined,
  projectId: string,
  card: TeamKanbanCard
): Promise<FactoryBrainContext> {
  if (!projectPath?.trim()) {
    return { noteIds: [], markdown: '' }
  }

  const chunks: string[] = []
  const noteIds: string[] = []
  let totalChars = 0

  const notesPath = path.join(projectPath, '.orca', 'team', 'notes', 'notes.json')
  try {
    const raw = await readFile(notesPath, 'utf8')
    const collection = parseTeamNotesCollection(raw, projectId)
    if (collection) {
      const ranked = collection.notes
        .map((note) => ({ note, score: scoreNoteRelevance(note, card) }))
        .filter((item) => item.score >= 0)
        .sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)

      for (const { note } of ranked) {
        const excerpt = note.content.trim().slice(0, MAX_NOTE_EXCERPT_CHARS)
        const block = `### [${note.category.toUpperCase()}${note.status ? ` · ${note.status}` : ''}] ${note.title}\nTags: ${note.tags.join(', ') || 'ninguna'}\n\n${excerpt}`
        if (totalChars + block.length > MAX_BRAIN_CHARS) {
          break
        }
        chunks.push(block)
        noteIds.push(note.id)
        totalChars += block.length
      }
    }
  } catch {
    // No team notes persisted on disk yet.
  }

  const extraDocs = await readExtraBrainDocs(projectPath)
  for (const doc of extraDocs) {
    const block = `### [BRAIN DOC] ${doc.name}\n\n${doc.content.slice(0, MAX_NOTE_EXCERPT_CHARS)}`
    if (totalChars + block.length > MAX_BRAIN_CHARS) {
      break
    }
    chunks.push(block)
    noteIds.push(`brain-doc:${doc.name}`)
    totalChars += block.length
  }

  return {
    noteIds,
    markdown: chunks.join('\n\n---\n\n')
  }
}

export async function proposeFactorySpecNoteToBrain(options: {
  projectPath: string | null | undefined
  projectId: string
  card: TeamKanbanCard
  specMarkdown: string
}): Promise<string | null> {
  const { projectPath, projectId, card, specMarkdown } = options
  if (!projectPath?.trim() || !specMarkdown.trim()) {
    return null
  }
  const notesDir = path.join(projectPath, '.orca', 'team', 'notes')
  const notesPath = path.join(notesDir, 'notes.json')
  const noteId = `factory-spec-${card.id}`
  const now = Date.now()

  let collection: TeamNotesCollection = { projectId, notes: [], updatedAt: now }
  try {
    const raw = await readFile(notesPath, 'utf8')
    const parsed = parseTeamNotesCollection(raw, projectId)
    if (parsed) {
      collection = parsed
    }
  } catch {
    // Create fresh notes file.
  }

  const tags = Array.from(new Set(['factory', 'spec', ...card.labels]))
  const existingIdx = collection.notes.findIndex((n) => n.id === noteId)
  const noteRecord: TeamNote = {
    id: noteId,
    title: `Spec Factory: ${card.title}`,
    content: specMarkdown.trim(),
    category: 'spec',
    status: 'proposed',
    author: 'Software Factory (Spec Writer)',
    tags,
    createdAt: existingIdx !== -1 ? collection.notes[existingIdx].createdAt : now,
    updatedAt: now
  }

  const nextNotes =
    existingIdx !== -1
      ? collection.notes.map((n, idx) => (idx === existingIdx ? noteRecord : n))
      : [noteRecord, ...collection.notes]

  await mkdir(notesDir, { recursive: true })
  await writeFile(
    notesPath,
    JSON.stringify({ ...collection, projectId, notes: nextNotes, updatedAt: now }, null, 2),
    'utf8'
  )
  return noteId
}
