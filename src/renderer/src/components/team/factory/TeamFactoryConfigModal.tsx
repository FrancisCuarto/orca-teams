import React, { useEffect, useState } from 'react'
import { Check, Factory, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  FACTORY_REVIEWER_LABELS,
  FACTORY_REVIEWER_ROLES,
  type FactoryConfig,
  type FactoryFindingSeverity
} from '../../../../../shared/teamwork/team-factory-types'
import type { TeamMemberEntry } from '../../../../../shared/teamwork/team-members'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { TeamFactoryRoleRow } from './TeamFactoryRoleRow'

type Props = {
  open: boolean
  config: FactoryConfig
  configuredAgents: readonly TeamMemberEntry[]
  onOpenChange: (open: boolean) => void
  onSave: (config: FactoryConfig) => Promise<FactoryConfig>
}

export function TeamFactoryConfigModal({
  open,
  config,
  configuredAgents,
  onOpenChange,
  onSave
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState<FactoryConfig>(config)
  const [patternsText, setPatternsText] = useState(
    config.deterministicRules.protectedPathPatterns.join(', ')
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(config)
      setPatternsText(config.deterministicRules.protectedPathPatterns.join(', '))
    }
  }, [open, config])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const protectedPathPatterns = patternsText
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
      const next: FactoryConfig = {
        ...draft,
        deterministicRules: {
          ...draft.deterministicRules,
          protectedPathPatterns
        },
        checkCommands: draft.checkCommands.filter((c) => c.name.trim() && c.command.trim()),
        updatedAt: Date.now()
      }
      await onSave(next)
      toast.success('Configuración de Software Factory guardada')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              <Factory className="size-4 text-primary" />
              <span>Configuración de Software Factory</span>
            </span>
          </DialogTitle>
          <DialogDescription>
            Asigna agentes y modelos por rol (Spec, Builder TDD, 4 Revisores aislados y Aprobador),
            checks deterministas y reglas de escalado humano.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto scrollbar-sleek pr-1 py-1">
          <section className="space-y-2">
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Agentes y Modelos por Etapa
            </h4>
            <TeamFactoryRoleRow
              label="1. Spec Writer (SDD)"
              description="Consulta el Brain (Notas/ADRs) y redacta la especificación."
              value={draft.specWriter}
              agents={configuredAgents}
              onChange={(specWriter) => setDraft({ ...draft, specWriter })}
            />
            <TeamFactoryRoleRow
              label="2. Builder (TDD)"
              description="Escribe tests primero e implementa en worktree aislado."
              value={draft.builder}
              agents={configuredAgents}
              onChange={(builder) => setDraft({ ...draft, builder })}
            />
            {FACTORY_REVIEWER_ROLES.map((role) => (
              <TeamFactoryRoleRow
                key={role}
                label={`3. Revisor: ${FACTORY_REVIEWER_LABELS[role]}`}
                description="Audita en paralelo con contexto aislado del Builder."
                value={draft.reviewers[role]}
                agents={configuredAgents}
                onChange={(nextVal) =>
                  setDraft({ ...draft, reviewers: { ...draft.reviewers, [role]: nextVal } })
                }
              />
            ))}
            <TeamFactoryRoleRow
              label="4. El Aprobador"
              description="Consolida los 4 informes o devuelve la tarea al Builder."
              value={draft.approver}
              agents={configuredAgents}
              onChange={(approver) => setDraft({ ...draft, approver })}
            />
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg border border-border bg-secondary/20">
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={draft.useWorktreeIsolation}
                onChange={(e) => setDraft({ ...draft, useWorktreeIsolation: e.target.checked })}
                className="size-3.5 rounded border-input"
              />
              <span>Worktree Git aislado</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={draft.writeSpecToBrain}
                onChange={(e) => setDraft({ ...draft, writeSpecToBrain: e.target.checked })}
                className="size-3.5 rounded border-input"
              />
              <span>Proponer Spec al Brain</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Máx. reintentos:</span>
              <Input
                type="number"
                min={0}
                max={5}
                value={draft.maxRetries}
                onChange={(e) =>
                  setDraft({ ...draft, maxRetries: Math.max(0, Number(e.target.value) || 0) })
                }
                className="h-7 w-16"
              />
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Checks Deterministas (Antes de Revisores)
              </h4>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() =>
                  setDraft({
                    ...draft,
                    checkCommands: [
                      ...draft.checkCommands,
                      { name: 'Typecheck', command: 'pnpm tc' }
                    ]
                  })
                }
              >
                <Plus className="size-3" /> Añadir check
              </Button>
            </div>
            {draft.checkCommands.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Sin comandos configurados (ej. pnpm tc, pnpm test).
              </p>
            ) : (
              <div className="space-y-2">
                {draft.checkCommands.map((chk, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={chk.name}
                      onChange={(e) => {
                        const next = [...draft.checkCommands]
                        next[idx] = { ...chk, name: e.target.value }
                        setDraft({ ...draft, checkCommands: next })
                      }}
                      placeholder="Nombre (ej. Tests)"
                      className="h-8 w-36"
                    />
                    <Input
                      variant="code"
                      value={chk.command}
                      onChange={(e) => {
                        const next = [...draft.checkCommands]
                        next[idx] = { ...chk, command: e.target.value }
                        setDraft({ ...draft, checkCommands: next })
                      }}
                      placeholder="Comando (ej. pnpm test)"
                      className="h-8 flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          checkCommands: draft.checkCommands.filter((_, i) => i !== idx)
                        })
                      }
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2.5 p-3 rounded-lg border border-border bg-card/50">
            <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldAlert className="size-3.5 text-primary" />
              <span>Gate Determinista (Escalado Humano)</span>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-foreground">
                Rutas protegidas que exigen aprobación humana (separadas por coma)
              </label>
              <Input
                variant="code"
                value={patternsText}
                onChange={(e) => setPatternsText(e.target.value)}
                className="h-8"
                placeholder="migrations/, auth, security, package.json"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-2xs text-muted-foreground">Máx. archivos auto</label>
                <Input
                  type="number"
                  min={1}
                  value={draft.deterministicRules.maxAutoApproveFiles}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      deterministicRules: {
                        ...draft.deterministicRules,
                        maxAutoApproveFiles: Math.max(1, Number(e.target.value) || 1)
                      }
                    })
                  }
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-2xs text-muted-foreground">Máx. líneas diff auto</label>
                <Input
                  type="number"
                  min={10}
                  value={draft.deterministicRules.maxAutoApproveLines}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      deterministicRules: {
                        ...draft.deterministicRules,
                        maxAutoApproveLines: Math.max(10, Number(e.target.value) || 10)
                      }
                    })
                  }
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <label className="text-2xs text-muted-foreground">Escalar si hallazgo &gt;=</label>
                <select
                  value={draft.deterministicRules.requireHumanOnFindingSeverity}
                  onChange={(e) => {
                    const val = e.target.value
                    const sev: FactoryFindingSeverity | 'none' =
                      val === 'critical' || val === 'high' || val === 'medium' || val === 'low'
                        ? val
                        : 'none'
                    setDraft({
                      ...draft,
                      deterministicRules: {
                        ...draft.deterministicRules,
                        requireHumanOnFindingSeverity: sev
                      }
                    })
                  }}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="none">Ninguno</option>
                </select>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
            <Check className="size-3.5" /> Guardar Factory
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
