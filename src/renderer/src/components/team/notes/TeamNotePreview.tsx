import React from 'react'
import { Check } from 'lucide-react'

type Props = {
  content: string
  onToggleChecklistLine?: (lineIndex: number) => void
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  let cursor = 0
  return parts.map((part) => {
    const offset = cursor
    cursor += part.length
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={`code-${offset}-${part.slice(1, 17)}`}
          className="px-1 py-0.5 rounded bg-muted font-mono text-2xs text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong
          key={`strong-${offset}-${part.slice(2, 18)}`}
          className="font-semibold text-foreground"
        >
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <React.Fragment key={`text-${offset}-${part.slice(0, 16)}`}>{part}</React.Fragment>
  })
}

type BlockLine = { line: string; offset: number }

function linesWithOffsets(lines: string[], baseOffset: number): BlockLine[] {
  let offset = baseOffset
  return lines.map((line) => {
    const entry = { line, offset }
    offset += line.length + 1
    return entry
  })
}

export function TeamNotePreview({ content, onToggleChecklistLine }: Props): React.JSX.Element {
  let offset = 0
  const blocks = content.split('\n\n').map((text) => {
    const block = { text, offset }
    offset += text.length + 2
    return block
  })

  return (
    <div className="max-w-3xl space-y-4">
      {blocks.map(({ text: block, offset: blockOffset }) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const codeBody = block.split('\n').slice(1, -1).join('\n')
          return (
            <pre
              key={`fence-${blockOffset}-${block.slice(0, 16)}`}
              className="p-3 rounded-lg border border-border bg-muted/50 font-mono text-xs text-foreground overflow-x-auto scrollbar-sleek"
            >
              <code>{codeBody}</code>
            </pre>
          )
        }
        if (block.startsWith('# ')) {
          return (
            <h1
              key={`h1-${blockOffset}-${block.slice(0, 16)}`}
              className="text-xl font-bold text-foreground pb-2 border-b border-border"
            >
              {block.slice(2)}
            </h1>
          )
        }
        if (block.startsWith('## ')) {
          return (
            <h2
              key={`h2-${blockOffset}-${block.slice(0, 16)}`}
              className="text-base font-bold text-foreground mt-4 mb-2"
            >
              {block.slice(3)}
            </h2>
          )
        }
        if (block.startsWith('### ')) {
          return (
            <h3
              key={`h3-${blockOffset}-${block.slice(0, 16)}`}
              className="text-sm font-semibold text-foreground mt-3 mb-1"
            >
              {block.slice(4)}
            </h3>
          )
        }
        if (block.startsWith('- [ ] ') || block.startsWith('- [x] ')) {
          const firstLineIndex = content.slice(0, blockOffset).split('\n').length - 1
          return (
            <div
              key={`checklist-${blockOffset}-${block.slice(0, 16)}`}
              className="space-y-1.5 my-2"
            >
              {linesWithOffsets(block.split('\n'), blockOffset).map(
                ({ line, offset: lineOffset }, li) => {
                  const done = line.startsWith('- [x] ')
                  const text = line.replace(/^- \[[ x]\] /, '')
                  const isChecklistLine = line.startsWith('- [ ] ') || line.startsWith('- [x] ')
                  const key = `check-${lineOffset}-${text.slice(0, 16)}`
                  const row = (
                    <>
                      <span
                        className={`size-3.5 rounded border flex items-center justify-center shrink-0 ${
                          done
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-border'
                        }`}
                      >
                        {done && <Check className="size-2.5" />}
                      </span>
                      <span className={done ? 'line-through text-muted-foreground' : ''}>
                        {renderInlineFormatting(text)}
                      </span>
                    </>
                  )
                  return isChecklistLine && onToggleChecklistLine ? (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={done}
                      onClick={() => onToggleChecklistLine?.(firstLineIndex + li)}
                      className="flex items-center gap-2 text-left w-full text-xs text-foreground cursor-pointer"
                    >
                      {row}
                    </button>
                  ) : (
                    <div key={key} className="flex items-center gap-2 text-xs text-foreground">
                      {row}
                    </div>
                  )
                }
              )}
            </div>
          )
        }
        if (block.startsWith('- ')) {
          return (
            <ul
              key={`list-${blockOffset}-${block.slice(0, 16)}`}
              className="list-disc pl-5 space-y-1 text-xs text-foreground"
            >
              {linesWithOffsets(block.split('\n'), blockOffset).map(
                ({ line, offset: lineOffset }) => {
                  const item = line.replace(/^- /, '')
                  return (
                    <li key={`li-${lineOffset}-${item.slice(0, 16)}`}>
                      {renderInlineFormatting(item)}
                    </li>
                  )
                }
              )}
            </ul>
          )
        }
        if (block.startsWith('> ')) {
          const quoted = block
            .split('\n')
            .map((line) => line.replace(/^> ?/, ''))
            .join('\n')
          return (
            <blockquote
              key={`quote-${blockOffset}-${block.slice(0, 16)}`}
              className="border-l-2 border-border pl-3 my-2 text-xs italic text-muted-foreground whitespace-pre-wrap"
            >
              {renderInlineFormatting(quoted)}
            </blockquote>
          )
        }
        return (
          <p
            key={`p-${blockOffset}-${block.slice(0, 16)}`}
            className="text-xs leading-relaxed text-foreground whitespace-pre-wrap"
          >
            {renderInlineFormatting(block)}
          </p>
        )
      })}
    </div>
  )
}
