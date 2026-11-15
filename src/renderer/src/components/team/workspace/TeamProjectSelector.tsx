import React, { useState } from 'react'
import { ChevronDown, FolderGit2, Globe, Lock, Plus, Users, Wifi } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type {
  Project,
  ProjectMember,
  Team,
  TeamInvitation,
  TeamRole,
  TeamSyncSettings,
  TeamUserProfile
} from '../../../../../shared/teamwork/team-workspace-types'
import {
  canAccessProject,
  getTeamPermissions,
  type TeamPermissions
} from '../../../../../shared/teamwork/team-rbac-policy'
import type {
  TeamMailConfigInput,
  TeamMailConfigPublic,
  TeamMemberWithProfile,
  TeamSendInvitationResult,
  TeamSyncRuntimeStatus
} from '../../../../../shared/teamwork/team-ipc-types'
import { TeamCreateModal } from './TeamCreateModal'
import { ProjectCreateModal } from './ProjectCreateModal'
import { TeamMembersModal } from './TeamMembersModal'
import { TeamSyncAccountModal } from './TeamSyncAccountModal'

type Props = {
  teams: Team[]
  activeTeam: Team | null
  projects: Project[]
  activeProject: Project | null
  members: TeamMemberWithProfile[]
  pendingInvitations: TeamInvitation[]
  mailConfig: TeamMailConfigPublic | null
  userRole: TeamRole
  permissions?: TeamPermissions
  projectMembersByProject?: Record<string, ProjectMember[]>
  currentUser?: TeamUserProfile
  syncStatus?: TeamSyncRuntimeStatus
  onSelectTeam: (teamId: string) => void
  onSelectProject: (projectId: string) => void
  onCreateTeam: (team: Omit<Team, 'createdAt' | 'updatedAt'>) => void
  onCreateProject: (project: Omit<Project, 'createdAt' | 'updatedAt'>) => void
  onInviteMember: (email: string, role: TeamRole) => Promise<TeamSendInvitationResult>
  onResendInvitation: (invitationId: string) => Promise<TeamSendInvitationResult>
  onRevokeInvitation: (invitationId: string) => Promise<void>
  onAcceptInvitation: (token: string, displayName?: string, email?: string) => Promise<unknown>
  onSaveMailConfig: (input: TeamMailConfigInput) => Promise<TeamMailConfigPublic>
  onTestMailConfig: (toEmail: string) => Promise<{ ok: boolean; error?: string }>
  onUpdateProfile?: (input: { displayName: string; email: string }) => Promise<TeamUserProfile>
  onRequestMagicCode?: (
    email: string,
    displayName?: string
  ) => Promise<{ sent: boolean; expiresAt: number; devCode?: string; error?: string }>
  onVerifyMagicCode?: (
    email: string,
    code: string,
    displayName?: string
  ) => Promise<TeamUserProfile>
  onConfigureSync?: (settings: Partial<TeamSyncSettings>) => Promise<TeamSyncRuntimeStatus>
}

export function TeamProjectSelector({
  teams,
  activeTeam,
  projects,
  activeProject,
  members,
  pendingInvitations,
  mailConfig,
  userRole,
  permissions,
  projectMembersByProject,
  currentUser,
  syncStatus,
  onSelectTeam,
  onSelectProject,
  onCreateTeam,
  onCreateProject,
  onInviteMember,
  onResendInvitation,
  onRevokeInvitation,
  onAcceptInvitation,
  onSaveMailConfig,
  onTestMailConfig,
  onUpdateProfile,
  onRequestMagicCode,
  onVerifyMagicCode,
  onConfigureSync
}: Props): React.JSX.Element {
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [membersModalOpen, setMembersModalOpen] = useState(false)
  const [syncModalOpen, setSyncModalOpen] = useState(false)

  const resolvedPermissions = permissions ?? getTeamPermissions(userRole)
  const currentUserId = currentUser?.userId
  const visibleProjects = projects.filter((project) => {
    const projectMembers = projectMembersByProject?.[project.id] ?? []
    const isExplicitMember = currentUserId
      ? projectMembers.some((member) => member.userId === currentUserId)
      : false
    return canAccessProject(project, userRole, isExplicitMember)
  })

  return (
    <div className="flex items-center gap-2 border-b border-border bg-card/40 px-4 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-semibold">
            <Users className="w-3.5 h-3.5 text-primary" />
            <span className="truncate max-w-[140px]">
              {activeTeam ? activeTeam.name : 'Seleccionar Equipo'}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <div className="px-2 py-1 text-3xs font-semibold text-muted-foreground uppercase">
            Equipos Disponibles
          </div>
          {teams.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => onSelectTeam(t.id)}
              className="text-xs cursor-pointer flex items-center justify-between"
            >
              <span className="truncate">{t.name}</span>
              {t.id === activeTeam?.id && (
                <Badge variant="secondary" className="text-3xs py-0 px-1">
                  Activo
                </Badge>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setTeamModalOpen(true)}
            className="text-xs cursor-pointer text-primary gap-2 font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Crear Nuevo Equipo...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="text-muted-foreground/40">/</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
            <FolderGit2 className="w-3.5 h-3.5 text-primary" />
            <span className="truncate max-w-[160px]">
              {activeProject ? activeProject.name : 'Seleccionar Proyecto'}
            </span>
            {activeProject?.visibility === 'private' && (
              <Lock className="w-2.5 h-2.5 text-amber-500" />
            )}
            <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <div className="px-2 py-1 text-3xs font-semibold text-muted-foreground uppercase">
            Proyectos de {activeTeam?.name ?? 'Equipo'}
          </div>
          {visibleProjects.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              No hay proyectos visibles para tu rol
            </div>
          ) : (
            visibleProjects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                className="text-xs cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-1.5 truncate">
                  {p.visibility === 'private' ? (
                    <Lock className="w-3 h-3 text-amber-500 shrink-0" />
                  ) : (
                    <Globe className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{p.name}</span>
                </div>
                {p.id === activeProject?.id && (
                  <Badge variant="secondary" className="text-3xs py-0 px-1 shrink-0">
                    Activo
                  </Badge>
                )}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!resolvedPermissions.canCreateProject}
            onClick={() => {
              if (resolvedPermissions.canCreateProject) {
                setProjectModalOpen(true)
              }
            }}
            className="text-xs cursor-pointer text-primary gap-2 font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Crear Proyecto...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-2">
        {currentUser && syncStatus && (
          <Button variant="outline" size="xs" onClick={() => setSyncModalOpen(true)}>
            <Wifi
              className={
                syncStatus.hostingActive || syncStatus.settings.mode === 'remote'
                  ? 'w-3.5 h-3.5 text-workspace-status-review'
                  : 'w-3.5 h-3.5 text-muted-foreground'
              }
            />
            <span className="truncate max-w-[110px]">{currentUser.displayName}</span>
            <Badge variant="secondary">
              <span className="uppercase">{syncStatus.settings.mode}</span>
            </Badge>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => setMembersModalOpen(true)}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Miembros & Invitaciones</span>
          <Badge variant="outline" className="text-3xs px-1 py-0">
            {members.length}
          </Badge>
        </Button>
      </div>

      <TeamCreateModal
        open={teamModalOpen}
        onOpenChange={setTeamModalOpen}
        onCreate={onCreateTeam}
      />

      <ProjectCreateModal
        open={resolvedPermissions.canCreateProject && projectModalOpen}
        teamId={activeTeam?.id ?? 'team-orca-core'}
        teamName={activeTeam?.name ?? 'Equipo'}
        onOpenChange={(open) => {
          if (resolvedPermissions.canCreateProject || !open) {
            setProjectModalOpen(open)
          }
        }}
        onCreate={(project) => {
          if (resolvedPermissions.canCreateProject) {
            onCreateProject(project)
          }
        }}
      />

      <TeamMembersModal
        open={membersModalOpen}
        teamName={activeTeam?.name ?? 'Equipo'}
        members={members}
        pendingInvitations={pendingInvitations}
        mailConfig={mailConfig}
        userRole={userRole}
        onOpenChange={setMembersModalOpen}
        onInviteMember={onInviteMember}
        onResendInvitation={onResendInvitation}
        onRevokeInvitation={onRevokeInvitation}
        onAcceptInvitation={onAcceptInvitation}
        onSaveMailConfig={onSaveMailConfig}
        onTestMailConfig={onTestMailConfig}
      />

      {currentUser &&
        syncStatus &&
        onUpdateProfile &&
        onRequestMagicCode &&
        onVerifyMagicCode &&
        onConfigureSync && (
          <TeamSyncAccountModal
            open={syncModalOpen}
            user={currentUser}
            syncStatus={syncStatus}
            onOpenChange={setSyncModalOpen}
            onUpdateProfile={onUpdateProfile}
            onRequestMagicCode={onRequestMagicCode}
            onVerifyMagicCode={onVerifyMagicCode}
            onConfigureSync={onConfigureSync}
          />
        )}
    </div>
  )
}
