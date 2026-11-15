import React from 'react'
import {
  ArrowUpRight,
  Circle,
  ClipboardCopy,
  Diamond,
  Download,
  FileText,
  Hand,
  Maximize2,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Redo2,
  Square,
  StickyNote,
  Undo2,
  Workflow
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WhiteboardShapeKind } from '../../../../../shared/teamwork/team-kanban-types'
import type { WhiteboardTool } from './whiteboard-types'

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
  activeTool: WhiteboardTool
  activeShapeKind: WhiteboardShapeKind
  zoom: number
  canUndo: boolean
  canRedo: boolean
  readOnly?: boolean
  onSelectTool: (tool: WhiteboardTool, shapeKind?: WhiteboardShapeKind) => void
  onAddSticky: () => void
  onAddSpec: () => void
  onAddMermaid: (template?: { label: string; mermaid: string }) => void
  onUndo: () => void
  onRedo: () => void
  onZoom: (delta: number) => void
  onFitView: () => void
  onExportSvg: () => void
  onCopyMarkdown: () => void
}

export function TeamWhiteboardToolbar({
  activeTool,
  activeShapeKind,
  zoom,
  canUndo,
  canRedo,
  readOnly = false,
  onSelectTool,
  onAddSticky,
  onAddSpec,
  onAddMermaid,
  onUndo,
  onRedo,
  onZoom,
  onFitView,
  onExportSvg,
  onCopyMarkdown
}: Props): React.JSX.Element {
  return (
    <>
      <div className="absolute top-3 left-4 z-30 flex flex-wrap items-center gap-1.5 max-w-[calc(100%-17rem)] bg-card/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-border shadow-floating">
        {/* Pointer & Canvas Navigation */}
        <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5 border border-border/60">
          <Button
            size="icon-xs"
            variant={activeTool === 'select' ? 'secondary' : 'ghost'}
            onClick={() => onSelectTool('select')}
            title="Seleccionar / Mover (V)"
            aria-label="Seleccionar"
          >
            <MousePointer2 className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant={activeTool === 'pan' ? 'secondary' : 'ghost'}
            onClick={() => onSelectTool('pan')}
            title="Mover lienzo (H o Espacio)"
            aria-label="Mano"
          >
            <Hand className="size-3.5" />
          </Button>
        </div>

        {/* Drawing & Shape Tools */}
        <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5 border border-border/60">
          <Button
            size="icon-xs"
            disabled={readOnly}
            variant={activeTool === 'shape' && activeShapeKind === 'rect' ? 'secondary' : 'ghost'}
            onClick={() => onSelectTool('shape', 'rect')}
            title="Rectángulo (R)"
            aria-label="Rectángulo"
          >
            <Square className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            disabled={readOnly}
            variant={
              activeTool === 'shape' && activeShapeKind === 'ellipse' ? 'secondary' : 'ghost'
            }
            onClick={() => onSelectTool('shape', 'ellipse')}
            title="Elipse (O)"
            aria-label="Elipse"
          >
            <Circle className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            disabled={readOnly}
            variant={
              activeTool === 'shape' && activeShapeKind === 'diamond' ? 'secondary' : 'ghost'
            }
            onClick={() => onSelectTool('shape', 'diamond')}
            title="Rombo"
            aria-label="Rombo"
          >
            <Diamond className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            disabled={readOnly}
            variant={activeTool === 'arrow' ? 'secondary' : 'ghost'}
            onClick={() => onSelectTool('arrow')}
            title="Flecha / Conector (A)"
            aria-label="Flecha"
          >
            <ArrowUpRight className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            disabled={readOnly}
            variant={activeTool === 'draw' ? 'secondary' : 'ghost'}
            onClick={() => onSelectTool('draw')}
            title="Lápiz libre (P)"
            aria-label="Lápiz"
          >
            <Pencil className="size-3.5" />
          </Button>
        </div>

        {/* Cards & Mermaid */}
        <Button size="xs" variant="outline" disabled={readOnly} onClick={onAddSticky}>
          <StickyNote className="size-3.5 text-git-graph-lane-1" />+ Nota
        </Button>
        <Button size="xs" variant="outline" disabled={readOnly} onClick={onAddSpec}>
          <FileText className="size-3.5 text-git-graph-lane-2" />+ Spec
        </Button>
        <Button size="xs" variant="outline" disabled={readOnly} onClick={() => onAddMermaid()}>
          <Workflow className="size-3.5" />+ Mermaid
        </Button>

        <div className="hidden xl:flex items-center gap-0.5">
          {ARCHITECTURE_TEMPLATES.map((tpl) => (
            <Button
              key={tpl.id}
              size="xs"
              variant="ghost"
              disabled={readOnly}
              onClick={() => onAddMermaid(tpl)}
            >
              {tpl.label}
            </Button>
          ))}
        </div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 border-l border-border pl-1.5">
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={readOnly || !canUndo}
            onClick={onUndo}
            title="Deshacer (Ctrl+Z)"
            aria-label="Deshacer"
          >
            <Undo2 className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={readOnly || !canRedo}
            onClick={onRedo}
            title="Rehacer (Ctrl+Shift+Z)"
            aria-label="Rehacer"
          >
            <Redo2 className="size-3.5" />
          </Button>
        </div>

        {/* Zoom & Fit */}
        <div className="flex items-center gap-0.5 border-l border-border pl-1.5">
          <Button size="icon-xs" variant="ghost" onClick={() => onZoom(-0.15)} title="Alejar">
            <Minus className="size-3.5" />
          </Button>
          <span className="text-2xs font-mono text-muted-foreground w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button size="icon-xs" variant="ghost" onClick={() => onZoom(0.15)} title="Acercar">
            <Plus className="size-3.5" />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={onFitView}
            title="Centrar vista"
            aria-label="Fit"
          >
            <Maximize2 className="size-3 mr-1" />
            Fit
          </Button>
        </div>
      </div>

      {/* Right Floating Export Controls */}
      <div className="absolute top-3 right-4 z-30 flex items-center gap-1.5 bg-card/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-border shadow-floating">
        <Button
          size="xs"
          variant="outline"
          onClick={onExportSvg}
          title="Descargar pizarra como SVG"
        >
          <Download className="size-3.5 text-git-graph-lane-2" />
          Exportar SVG
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={onCopyMarkdown}
          title="Copiar pizarra como Markdown"
        >
          <ClipboardCopy className="size-3.5 text-git-graph-lane-1" />
          Copiar MD
        </Button>
      </div>
    </>
  )
}
