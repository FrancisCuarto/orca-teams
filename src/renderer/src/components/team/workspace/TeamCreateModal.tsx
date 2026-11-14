import React, { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { Team } from '../../../../../shared/teamwork/team-workspace-types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (team: Omit<Team, 'createdAt' | 'updatedAt'>) => void
}

export function TeamCreateModal({ open, onOpenChange, onCreate }: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value
    setName(val)
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9-]+/g, '-')) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      )
    }
  }

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!name.trim()) {
      setError('El nombre del equipo es obligatorio')
      return
    }
    if (!slug.trim()) {
      setError('El slug identificador es obligatorio')
      return
    }

    const id = `team-${Date.now()}`
    onCreate({
      id,
      name: name.trim(),
      slug: slug.trim(),
      ownerId: 'usr-current',
      description: description.trim() || undefined
    })

    setName('')
    setSlug('')
    setDescription('')
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Users className="w-4 h-4 text-primary" />
            Crear Nuevo Equipo
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">{error}</div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="team-name" className="text-xs text-muted-foreground">
              Nombre del Equipo
            </Label>
            <Input
              id="team-name"
              value={name}
              onChange={handleNameChange}
              placeholder="p. ej. Orca Dev Core"
              className="h-8 text-xs"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-slug" className="text-xs text-muted-foreground">
              Slug Identificador (minúsculas y guiones)
            </Label>
            <Input
              id="team-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="orca-dev-core"
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-description" className="text-xs text-muted-foreground">
              Descripción (opcional)
            </Label>
            <Textarea
              id="team-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Propósito y responsabilidades de este equipo..."
              className="text-xs min-h-[60px] resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 text-xs"
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm" className="h-8 text-xs gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Crear Equipo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
