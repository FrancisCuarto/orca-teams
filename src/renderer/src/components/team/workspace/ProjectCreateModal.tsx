import React, { useState } from 'react'
import { FolderPlus, Globe, Lock } from 'lucide-react'
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
import type {
  Project,
  ProjectVisibility
} from '../../../../../shared/teamwork/team-workspace-types'

type Props = {
  open: boolean
  teamId: string
  teamName: string
  onOpenChange: (open: boolean) => void
  onCreate: (project: Omit<Project, 'createdAt' | 'updatedAt'>) => void
}

export function ProjectCreateModal({
  open,
  teamId,
  teamName,
  onOpenChange,
  onCreate
}: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<ProjectVisibility>('team')
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
      setError('El nombre del proyecto es obligatorio')
      return
    }
    if (!slug.trim()) {
      setError('El slug identificador es obligatorio')
      return
    }

    const id = `proj-${Date.now()}`
    onCreate({
      id,
      teamId,
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      visibility
    })

    setName('')
    setSlug('')
    setDescription('')
    setVisibility('team')
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <FolderPlus className="w-4 h-4 text-primary" />
            Crear Proyecto en {teamName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">{error}</div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="project-name" className="text-xs text-muted-foreground">
              Nombre del Proyecto
            </Label>
            <Input
              id="project-name"
              value={name}
              onChange={handleNameChange}
              placeholder="p. ej. Rediseño del Workspace"
              className="h-8 text-xs"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-slug" className="text-xs text-muted-foreground">
              Slug del Proyecto
            </Label>
            <Input
              id="project-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="rediseno-workspace"
              className="h-8 text-xs font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-desc" className="text-xs text-muted-foreground">
              Descripción (opcional)
            </Label>
            <Textarea
              id="project-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Objetivos clave y entregables..."
              className="text-xs min-h-[60px] resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Visibilidad y Aislamiento</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisibility('team')}
                className={`flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left transition-colors ${
                  visibility === 'team'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card/50 text-muted-foreground hover:bg-card'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Globe className="w-3.5 h-3.5" />
                  Equipo Completo
                </div>
                <span className="text-3xs text-muted-foreground leading-tight">
                  Visible para todos los miembros del equipo.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left transition-colors ${
                  visibility === 'private'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card/50 text-muted-foreground hover:bg-card'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Lock className="w-3.5 h-3.5" />
                  Privado
                </div>
                <span className="text-3xs text-muted-foreground leading-tight">
                  Solo visible para miembros invitados expresamente.
                </span>
              </button>
            </div>
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
              <FolderPlus className="w-3.5 h-3.5" />
              Crear Proyecto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
