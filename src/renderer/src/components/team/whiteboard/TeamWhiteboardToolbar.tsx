import React from 'react'
import { ClipboardCopy, FileText, Minus, Plus, RotateCcw, StickyNote, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WhiteboardColor } from '../../../../../shared/teamwork/team-kanban-types'

const SWATCH_COLORS: { color: WhiteboardColor; className: string }[] = [
  { color: 'green', className: 'bg-emerald-500 border-emerald-400' },
  { color: 'blue', className: 'bg-blue-500 border-blue-400' },
  { color: 'pink', className: 'bg-pink-500 border-pink-400' },
  { color: 'purple', className: 'bg-purple-500 border-purple-400' }
]

export const ARCHITECTURE_TEMPLATES: { id: string; label: string; mermaid: string }[] = [
  {
    id: 'multi-agent-flow',
    label: 'Multi-Agente',
    mermaid:
      'graph TD\n  U[Usuario] --> OC[OpenCode: Agente Codificador]\n  U --> AG[Antigravity: Agente Arquitecto]\n  AG -->|Especificación| OC\n  OC -->|Pull Request| REV[Revisión Humana]\n  REV -->|Aprobado| MAIN[Rama main]'
  },
  {
    id: 'c4-layers',
    label: 'C4 Capas',
    mermaid:
      'graph TB\n  U[Usuario] --> APP[Orca]\n  subgraph Contenedores\n    APP --> R[Renderer Electron]\n    APP --> M[Proceso Main]\n  end\n  subgraph Componentes\n    M --> K[Módulo Kanban] & N[Módulo Notas] & P[Módulo Pizarra]\n  end'
  },
  {
    id: 'auth-sequence',
    label: 'Secuencia Auth',
    mermaid:
      'sequenceDiagram\n  actor U as Usuario\n  participant R as Renderer\n  participant M as Main\n  participant S as Sistema Operativo\n  U->>R: Introduce credenciales\n  R->>M: Solicita inicio de sesión\n  M->>S: Guarda el token de forma segura\n  S-->>M: Confirmación\n  M-->>R: Sesión activa\n  R-->>U: Acceso concedido'
  }
]

type Props = {
  zoom: number
  onAddSticky: (color?: WhiteboardColor) => void
  onAddSpec: () => void
  onAddMermaid: (template?: { label: string; mermaid: string }) => void
  onZoom: (delta: number) => void
  onResetView: () => void
  onCopyForAgent: () => void
}

export function TeamWhiteboardToolbar({
  zoom,
  onAddSticky,
  onAddSpec,
  onAddMermaid,
  onZoom,
  onResetView,
  onCopyForAgent
}: Props): React.JSX.Element {
  return (
    <>
      {/* Top Floating Whiteboard Toolbar */}
      <div className="absolute top-4 left-6 z-20 flex flex-wrap items-center gap-2 max-w-[calc(100%-16rem)] bg-card/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-border shadow-floating">
        <span className="text-xs font-semibold text-foreground mr-1">Pizarra:</span>

        <Button size="xs" variant="outline" onClick={() => onAddSticky('yellow')}>
          <StickyNote className="text-git-graph-lane-1" />+ Nota
        </Button>

        {SWATCH_COLORS.map(({ color, className }) => (
          <button
            key={color}
            type="button"
            onClick={() => onAddSticky(color)}
            className={`size-4 rounded-full border transition-transform hover:scale-125 ${className}`}
            title={`Añadir nota ${color}`}
          />
        ))}

        <Button size="xs" variant="outline" onClick={onAddSpec}>
          <FileText className="text-git-graph-lane-2" />+ Spec
        </Button>

        <Button size="xs" variant="outline" onClick={() => onAddMermaid()}>
          <Workflow />+ Diagrama Mermaid
        </Button>

        <span className="text-2xs font-medium text-muted-foreground">Plantillas:</span>
        {ARCHITECTURE_TEMPLATES.map((template) => (
          <Button
            key={template.id}
            size="xs"
            variant="ghost"
            onClick={() => onAddMermaid(template)}
          >
            {template.label}
          </Button>
        ))}

        <div className="flex items-center gap-1">
          <Button size="icon-xs" variant="ghost" onClick={() => onZoom(-0.15)} title="Alejar">
            <Minus />
          </Button>
          <span className="text-2xs font-mono text-muted-foreground w-9 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button size="icon-xs" variant="ghost" onClick={() => onZoom(0.15)} title="Acercar">
            <Plus />
          </Button>
          <Button size="icon-xs" variant="ghost" onClick={onResetView} title="Reiniciar Vista">
            <RotateCcw />
          </Button>
        </div>
      </div>

      {/* Agent Export */}
      <div className="absolute top-4 right-6 z-20 bg-card/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-border shadow-floating">
        <Button size="xs" variant="outline" onClick={onCopyForAgent} title="Copiar pizarra">
          <ClipboardCopy className="text-git-graph-lane-1" />
          Copiar para Agente
        </Button>
      </div>
    </>
  )
}
