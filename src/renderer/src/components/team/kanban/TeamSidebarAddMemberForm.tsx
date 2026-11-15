import React, { useState } from 'react'
import { Check, Plus, User, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ExtendedTeamMember } from '../../../../../shared/teamwork/team-members'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isImeOwnedKeyboardEvent } from '@/lib/text-input/ime/ime-composition-keyboard-event'

type Props = {
  onAddCustomMember: (member: ExtendedTeamMember) => void
}

export function TeamSidebarAddMemberForm({ onAddCustomMember }: Props): React.JSX.Element {
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('')

  const handleCreateMember = (): void => {
    if (!newName.trim()) {
      toast.error('El nombre del colaborador es requerido')
      return
    }
    const created: ExtendedTeamMember = {
      id: `custom-human-${Date.now()}`,
      name: newName.trim(),
      type: 'human',
      role: newRole.trim() || 'Colaborador',
      color: '#14b8a6',
      status: 'online'
    }
    onAddCustomMember(created)
    setNewName('')
    setNewRole('')
    setIsAddingMember(false)
    toast.success('Colaborador añadido al tablero')
  }

  if (!isAddingMember) {
    return (
      <Button
        variant="outline"
        size="xs"
        onClick={() => setIsAddingMember(true)}
        className="w-full text-xs h-7 gap-1"
      >
        <Plus className="size-3" /> Añadir Colaborador
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-2 rounded-xl border border-border bg-secondary/20 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-3xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1">
          <User className="size-3" /> Nuevo Colaborador
        </span>
        <button
          type="button"
          onClick={() => setIsAddingMember(false)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </div>
      <Input
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
            handleCreateMember()
          }
        }}
        placeholder="Nombre..."
        className="h-7 text-xs"
        autoFocus
      />
      <Input
        value={newRole}
        onChange={(e) => setNewRole(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isImeOwnedKeyboardEvent(e)) {
            handleCreateMember()
          }
        }}
        placeholder="Rol o especialidad..."
        className="h-7 text-xs"
      />
      <div className="flex items-center gap-1 pt-1">
        <Button size="xs" onClick={handleCreateMember} className="flex-1 h-6">
          <Check className="size-3" /> Añadir
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setIsAddingMember(false)} className="h-6">
          Cancelar
        </Button>
      </div>
    </div>
  )
}
