import type {
  TeamWhiteboard,
  TeamWhiteboardItem
} from '../../../../../shared/teamwork/team-kanban-types'
import { pointsToSmoothSvgPath, resolveArrowEndpoints } from './whiteboard-geometry'
import { resolveItemSwatch, SHAPE_LABELS } from './whiteboard-types'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function getMarkerId(hex: string): string {
  return `wb-arrow-${hex.replace(/[^a-zA-Z0-9]/g, '')}`
}

export function buildWhiteboardMarkdown(whiteboard: TeamWhiteboard): string {
  const itemMap = new Map(whiteboard.items.map((item) => [item.id, item]))
  const sorted = [...whiteboard.items].sort(
    (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0) || a.y - b.y || a.x - b.x
  )
  const sections: string[] = []

  for (const item of sorted) {
    if (item.type === 'mermaid') {
      sections.push(
        `## ${item.title ?? 'Diagrama Mermaid'}\n\n\`\`\`mermaid\n${item.content}\n\`\`\``
      )
    } else if (item.type === 'shape') {
      const kind = SHAPE_LABELS[item.shapeKind ?? 'rect']
      const label = item.title || item.content || kind
      const body = item.title && item.content ? `\n\n${item.content}` : ''
      sections.push(`## [${kind}] ${label}${body}`)
    } else if (item.type === 'arrow') {
      const fromLabel = item.fromId ? (itemMap.get(item.fromId)?.title ?? item.fromId) : 'Inicio'
      const toLabel = item.toId ? (itemMap.get(item.toId)?.title ?? item.toId) : 'Destino'
      const label = item.content || item.title ? ` (${item.content || item.title})` : ''
      sections.push(`- Conector: **${fromLabel}** → **${toLabel}**${label}`)
    } else if (item.type === 'draw') {
      const pts = item.points?.length ?? 0
      sections.push(`- Trazo libre (${pts} puntos en ${item.x}, ${item.y})`)
    } else {
      sections.push(`## ${item.title ?? item.type}\n\n${item.content}`)
    }
  }

  return `# ${whiteboard.title}\n\n${sections.join('\n\n')}`
}

function renderCardSvg(item: TeamWhiteboardItem, textColor: string, cardBg: string): string {
  const swatch = resolveItemSwatch(item)
  const stroke = item.strokeColor ?? swatch.strokeHex
  const strokeWidth = item.strokeWidth ?? 1.5
  const title = escapeXml(item.title ?? (item.type === 'mermaid' ? 'Diagrama Mermaid' : 'Nota'))
  const lines = item.content
    .split('\n')
    .slice(0, 6)
    .map((l) => escapeXml(l.slice(0, 48)))
  const bg = item.type === 'mermaid' ? cardBg : swatch.tintedHex
  const textEls = lines
    .map(
      (line, i) =>
        `<text x="${item.x + 12}" y="${item.y + 48 + i * 16}" font-size="11" fill="${textColor}">${line}</text>`
    )
    .join('\n')
  return [
    `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="12" fill="${bg}" stroke="${stroke}" stroke-width="${strokeWidth}" />`,
    `<text x="${item.x + 12}" y="${item.y + 24}" font-size="13" font-weight="600" fill="${textColor}">${title}</text>`,
    textEls
  ].join('\n')
}

function renderShapeSvg(item: TeamWhiteboardItem, textColor: string): string {
  const swatch = resolveItemSwatch(item)
  const stroke = item.strokeColor ?? swatch.strokeHex
  const strokeWidth = item.strokeWidth ?? 2
  const fill =
    item.fillStyle === 'solid'
      ? swatch.solidHex
      : item.fillStyle === 'outline'
        ? 'none'
        : swatch.tintedHex
  const labelColor = item.fillStyle === 'solid' ? '#ffffff' : textColor
  const cx = item.x + item.width / 2
  const cy = item.y + item.height / 2
  const kind = item.shapeKind ?? 'rect'

  let shapeEl = `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
  if (kind === 'ellipse') {
    shapeEl = `<ellipse cx="${cx}" cy="${cy}" rx="${item.width / 2}" ry="${item.height / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
  } else if (kind === 'diamond') {
    const pts = `${cx},${item.y} ${item.x + item.width},${cy} ${cx},${item.y + item.height} ${item.x},${cy}`
    shapeEl = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`
  }
  const label = escapeXml(item.content || item.title || '')
  const textEl = label
    ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="13" font-weight="500" fill="${labelColor}">${label}</text>`
    : ''
  return `${shapeEl}\n${textEl}`
}

export function buildWhiteboardSvg(whiteboard: TeamWhiteboard, isDark: boolean): string {
  const items = whiteboard.items
  let minX = 0
  let minY = 0
  let maxX = 1200
  let maxY = 800
  if (items.length > 0) {
    minX = Math.min(...items.map((i) => i.x)) - 48
    minY = Math.min(...items.map((i) => i.y)) - 48
    maxX = Math.max(...items.map((i) => i.x + i.width)) + 48
    maxY = Math.max(...items.map((i) => i.y + i.height)) + 48
  }
  const width = Math.max(400, Math.round(maxX - minX))
  const height = Math.max(300, Math.round(maxY - minY))
  const bg = isDark ? '#0f172a' : '#f8fafc'
  const cardBg = isDark ? '#1e293b' : '#ffffff'
  const textColor = isDark ? '#e2e8f0' : '#0f172a'

  const markerColors = new Set<string>()
  for (const item of items) {
    if (item.type === 'arrow') {
      markerColors.add(item.strokeColor ?? resolveItemSwatch(item).strokeHex)
    }
  }
  const defs = Array.from(markerColors)
    .map(
      (hex) =>
        `<marker id="${getMarkerId(hex)}" markerWidth="10" markerHeight="10" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="${hex}" /></marker>`
    )
    .join('\n')

  const body = [...items]
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
    .map((item) => {
      const stroke = item.strokeColor ?? resolveItemSwatch(item).strokeHex
      const sw = item.strokeWidth ?? 3
      if (item.type === 'draw') {
        const d = pointsToSmoothSvgPath(item.points ?? [], item.x, item.y)
        return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" />`
      }
      if (item.type === 'arrow') {
        const { start, end } = resolveArrowEndpoints(item, items)
        const midX = Math.round((start.x + end.x) / 2)
        const midY = Math.round((start.y + end.y) / 2)
        const label = item.content || item.title
        const labelEl = label
          ? `<text x="${midX}" y="${midY - 6}" text-anchor="middle" font-size="11" fill="${textColor}">${escapeXml(label)}</text>`
          : ''
        return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${stroke}" stroke-width="${sw}" marker-end="url(#${getMarkerId(stroke)})" />\n${labelEl}`
      }
      if (item.type === 'shape') {
        return renderShapeSvg(item, textColor)
      }
      return renderCardSvg(item, textColor, cardBg)
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}" style="font-family: system-ui, sans-serif;">
  <defs>${defs}</defs>
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bg}" />
  ${body}
</svg>`
}

export function downloadSvgFile(svgContent: string, filename: string): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
