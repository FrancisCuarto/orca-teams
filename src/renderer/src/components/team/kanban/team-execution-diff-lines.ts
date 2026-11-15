export type ExecutionDiffLineKind = 'file-header' | 'hunk' | 'add' | 'del' | 'context'

export type KeyedExecutionDiffLine = {
  key: string
  kind: ExecutionDiffLineKind
  text: string
}

function classifyDiffLine(line: string): ExecutionDiffLineKind {
  if (
    line.startsWith('diff --git ') ||
    line.startsWith('index ') ||
    line.startsWith('new file mode ') ||
    line.startsWith('deleted file mode ') ||
    line.startsWith('rename from ') ||
    line.startsWith('rename to ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('Binary files ')
  ) {
    return 'file-header'
  }
  if (line.startsWith('@@')) {
    return 'hunk'
  }
  if (line.startsWith('+')) {
    return 'add'
  }
  if (line.startsWith('-')) {
    return 'del'
  }
  return 'context'
}

export function buildKeyedDiffLines(diff: string): KeyedExecutionDiffLine[] {
  if (!diff.trim()) {
    return []
  }
  const seen = new Map<string, number>()
  const result: KeyedExecutionDiffLine[] = []
  let currentFile = 'root'

  for (const rawLine of diff.split(/\r?\n/)) {
    if (rawLine.startsWith('diff --git ')) {
      currentFile = rawLine.slice('diff --git '.length).trim() || 'root'
    }
    const kind = classifyDiffLine(rawLine)
    const base = `${currentFile}|${kind}|${rawLine.slice(0, 64)}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    result.push({
      key: `${base}#${count}`,
      kind,
      text: rawLine
    })
  }

  return result
}
