import React, { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { TeamKanbanChecklistItem } from '../../../../../shared/teamwork/team-kanban-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'

type Props = {
  items: TeamKanbanChecklistItem[]
  onAdd: (text: string) => void
  onToggle: (id: string) => void
  onDelete: (id: string) => void
}

export function TeamKanbanCardChecklist({
  items,
  onAdd,
  onToggle,
  onDelete
}: Props): React.JSX.Element {
  const [newText, setNewText] = useState('')

  const handleAdd = (): void => {
    if (!newText.trim()) {
      return
    }
    onAdd(newText.trim())
    setNewText('')
  }

  const completedCount = items.filter((i) => i.done).length

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">
        Criterios de aceptación ({completedCount}/{items.length})
      </label>
      <div className="flex gap-2">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder="Añadir criterio..."
        />
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          onClick={handleAdd}
          title="Añadir criterio"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {items.length > 0 ? (
        <div className="flex flex-col gap-1 max-h-28 overflow-y-auto scrollbar-sleek border border-border rounded-md p-1.5 bg-secondary/10">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => onToggle(item.id)}
                  className="rounded border-input text-primary focus:ring-primary"
                />
                <span
                  className={`truncate ${
                    item.done ? 'line-through text-muted-foreground' : 'text-foreground'
                  }`}
                >
                  {item.text}
                </span>
              </label>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => onDelete(item.id)}
                title="Eliminar"
              >
                <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
