import { useCallback } from 'react'
import { toast } from 'sonner'
import type {
  TeamWhiteboard,
  TeamWhiteboardItem,
  WhiteboardColor
} from '../../../../../shared/teamwork/team-kanban-types'
import { copyTextToClipboard } from '../utils/team-clipboard'
import { buildWhiteboardMarkdown, buildWhiteboardSvg, downloadSvgFile } from './whiteboard-export'
import { getMaxZIndex, type WhiteboardTool } from './whiteboard-types'

const COLOR_CYCLE: WhiteboardColor[] = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange']
const DEFAULT_MERMAID =
  'graph TD\n  A[Cliente / Vista] --> B[API / Store]\n  B --> C[Lógica de Negocio]\n  C --> D[Base de Datos / Git]'

type Options = {
  whiteboard: TeamWhiteboard
  isDark: boolean
  zoom: number
  pan: { x: number; y: number }
  selectedItem: TeamWhiteboardItem | null
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  onSelectTool: (tool: WhiteboardTool) => void
  onCommitItems: (items: TeamWhiteboardItem[]) => void
  onMutateBoard: (updates: Partial<TeamWhiteboard>) => void
  onCreateTask?: (item: TeamWhiteboardItem) => void
}

export function useWhiteboardActions(opts: Options) {
  const {
    whiteboard,
    isDark,
    zoom,
    pan,
    selectedItem,
    selectedItemId,
    onSelectItem,
    onSelectTool,
    onCommitItems,
    onMutateBoard,
    onCreateTask
  } = opts

  const addCardItem = useCallback(
    (item: Omit<TeamWhiteboardItem, 'x' | 'y'>) => {
      const offset = (whiteboard.items.length % 5) * 24
      const created: TeamWhiteboardItem = {
        ...item,
        x: Math.round((120 - pan.x) / zoom) + offset,
        y: Math.round((120 - pan.y) / zoom) + offset,
        zIndex: getMaxZIndex(whiteboard.items) + 1
      }
      onCommitItems([...whiteboard.items, created])
      onSelectItem(created.id)
      onSelectTool('select')
    },
    [onCommitItems, onSelectItem, onSelectTool, pan.x, pan.y, whiteboard.items, zoom]
  )

  const addSticky = useCallback(() => {
    addCardItem({
      id: `sticky-${Date.now()}`,
      type: 'sticky',
      title: 'Nueva Nota',
      content: 'Escribe tu idea o nota...',
      color: 'yellow',
      width: 250,
      height: 180
    })
  }, [addCardItem])

  const addSpec = useCallback(() => {
    addCardItem({
      id: `text-${Date.now()}`,
      type: 'text',
      title: 'Especificación',
      content: '## Objetivo\n\n## Decisiones clave\n- ',
      color: 'blue',
      width: 320,
      height: 260
    })
  }, [addCardItem])

  const addMermaid = useCallback(
    (tpl?: { label: string; mermaid: string }) => {
      addCardItem({
        id: `mermaid-${Date.now()}`,
        type: 'mermaid',
        title: tpl?.label ?? 'Diagrama Mermaid',
        content: tpl?.mermaid ?? DEFAULT_MERMAID,
        width: 460,
        height: 320
      })
    },
    [addCardItem]
  )

  const deleteItem = useCallback(
    (id: string) => {
      onCommitItems(whiteboard.items.filter((item) => item.id !== id))
      if (selectedItemId === id) {
        onSelectItem(null)
      }
    },
    [onCommitItems, onSelectItem, selectedItemId, whiteboard.items]
  )

  const duplicateSelected = useCallback(() => {
    if (!selectedItem) {
      return
    }
    const copy: TeamWhiteboardItem = {
      ...selectedItem,
      id: `${selectedItem.type}-${Date.now()}`,
      x: selectedItem.x + 24,
      y: selectedItem.y + 24,
      zIndex: getMaxZIndex(whiteboard.items) + 1
    }
    onCommitItems([...whiteboard.items, copy])
    onSelectItem(copy.id)
  }, [onCommitItems, onSelectItem, selectedItem, whiteboard.items])

  const updateItem = useCallback(
    (id: string, updates: Partial<TeamWhiteboardItem>, record = false) => {
      const next = whiteboard.items.map((item) => (item.id === id ? { ...item, ...updates } : item))
      if (record) {
        onCommitItems(next)
      } else {
        onMutateBoard({ items: next })
      }
    },
    [onCommitItems, onMutateBoard, whiteboard.items]
  )

  const cycleColor = useCallback(
    (item: TeamWhiteboardItem) => {
      const next =
        COLOR_CYCLE[(COLOR_CYCLE.indexOf(item.color ?? 'yellow') + 1) % COLOR_CYCLE.length]
      updateItem(item.id, { color: next, strokeColor: undefined }, true)
    },
    [updateItem]
  )

  const createTaskForItem = useCallback(
    async (item: TeamWhiteboardItem) => {
      if (onCreateTask) {
        onCreateTask(item)
        return
      }
      const copied = await copyTextToClipboard(`## ${item.title ?? item.type}\n\n${item.content}`)
      if (copied) {
        toast.success('Elemento copiado para crear tarea en Kanban')
      } else {
        toast.error('No se pudo copiar la tarea al portapapeles')
      }
    },
    [onCreateTask]
  )

  const copyMarkdown = useCallback(async () => {
    const copied = await copyTextToClipboard(buildWhiteboardMarkdown(whiteboard))
    if (copied) {
      toast.success('Pizarra copiada como Markdown')
    } else {
      toast.error('No se pudo copiar la pizarra al portapapeles')
    }
  }, [whiteboard])

  const exportSvg = useCallback(() => {
    const svg = buildWhiteboardSvg(whiteboard, isDark)
    const slug = whiteboard.title.toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'whiteboard'
    downloadSvgFile(svg, `${slug}.svg`)
    toast.success('Pizarra exportada como SVG')
  }, [isDark, whiteboard])

  return {
    addSticky,
    addSpec,
    addMermaid,
    deleteItem,
    duplicateSelected,
    updateItem,
    cycleColor,
    createTaskForItem,
    copyMarkdown,
    exportSvg
  }
}
