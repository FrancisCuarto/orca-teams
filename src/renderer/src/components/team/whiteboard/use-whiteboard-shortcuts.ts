import { useEffect } from 'react'
import type { WhiteboardTool } from './whiteboard-types'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  )
}

type Options = {
  selectedItemId: string | null
  readOnly?: boolean
  onSpaceChange: (held: boolean) => void
  onSelectItem: (id: string | null) => void
  onSelectTool: (tool: WhiteboardTool) => void
  onUndo: () => void
  onRedo: () => void
  onDuplicateSelected: () => void
  onDeleteSelected: () => void
}

export function useWhiteboardShortcuts(opts: Options): void {
  const {
    selectedItemId,
    readOnly = false,
    onSpaceChange,
    onSelectItem,
    onSelectTool,
    onUndo,
    onRedo,
    onDuplicateSelected,
    onDeleteSelected
  } = opts

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) {
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        onSpaceChange(true)
        return
      }
      if (e.key === 'Escape') {
        onSelectItem(null)
        onSelectTool('select')
        return
      }
      const mod = e.metaKey || e.ctrlKey
      if (!readOnly && mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          onRedo()
        } else {
          onUndo()
        }
        return
      }
      if (!readOnly && mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        onRedo()
        return
      }
      if (!readOnly && mod && e.key.toLowerCase() === 'd' && selectedItemId) {
        e.preventDefault()
        onDuplicateSelected()
        return
      }
      if (!readOnly && (e.key === 'Delete' || e.key === 'Backspace') && selectedItemId) {
        e.preventDefault()
        onDeleteSelected()
        return
      }
      if (!mod) {
        const k = e.key.toLowerCase()
        if (k === 'v') {
          onSelectTool('select')
        } else if (k === 'h') {
          onSelectTool('pan')
        } else if (!readOnly && k === 'p') {
          onSelectTool('draw')
        } else if (!readOnly && k === 'a') {
          onSelectTool('arrow')
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        onSpaceChange(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [
    selectedItemId,
    readOnly,
    onSpaceChange,
    onSelectItem,
    onSelectTool,
    onUndo,
    onRedo,
    onDuplicateSelected,
    onDeleteSelected
  ])
}
