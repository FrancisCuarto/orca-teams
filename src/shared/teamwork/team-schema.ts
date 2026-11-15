export const TEAMS_DATABASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id TEXT NOT NULL,
  description TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS teams_owner_id ON teams(owner_id);

CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS team_members_user_id ON team_members(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE (team_id, slug)
);
CREATE INDEX IF NOT EXISTS projects_team_id ON projects(team_id);

CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_members_user_id ON project_members(user_id);

CREATE TABLE IF NOT EXISTS team_invitations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  invited_by TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS team_invitations_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS team_invitations_team_id ON team_invitations(team_id);

CREATE TABLE IF NOT EXISTS agent_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt TEXT NOT NULL,
  branch_or_worktree TEXT,
  worktree_path TEXT,
  base_branch TEXT,
  approval_status TEXT,
  changed_files_json TEXT,
  output_summary TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  logs_json TEXT NOT NULL DEFAULT '[]',
  started_at BIGINT,
  completed_at BIGINT,
  error TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_executions_task_id ON agent_executions(task_id);
CREATE INDEX IF NOT EXISTS agent_executions_project_id ON agent_executions(project_id);

CREATE TABLE IF NOT EXISTS team_activity_log (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  project_id TEXT,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  summary TEXT NOT NULL,
  metadata_json TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS team_activity_team_id ON team_activity_log(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS team_activity_project_id ON team_activity_log(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS team_auth_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS team_auth_challenges_email ON team_auth_challenges(email);

CREATE TABLE IF NOT EXISTS team_sync_snapshots (
  room_id TEXT PRIMARY KEY,
  state_base64 TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS factory_configs (
  project_id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS factory_runs (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_stage TEXT NOT NULL,
  run_json TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  completed_at BIGINT,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS factory_runs_card_id ON factory_runs(card_id);
CREATE INDEX IF NOT EXISTS factory_runs_project_id ON factory_runs(project_id);

CREATE TABLE IF NOT EXISTS team_card_comments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_type TEXT NOT NULL,
  body TEXT NOT NULL,
  mentions_json TEXT NOT NULL DEFAULT '[]',
  created_at BIGINT NOT NULL,
  updated_at BIGINT
);
CREATE INDEX IF NOT EXISTS team_card_comments_card_id ON team_card_comments(card_id, created_at ASC);
CREATE INDEX IF NOT EXISTS team_card_comments_project_id ON team_card_comments(project_id, created_at DESC);
`

export function teamSchemaStatements(): string[] {
  return TEAMS_DATABASE_SCHEMA.replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}
