CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations_meta (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login_name text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  person_id uuid,
  status text NOT NULL DEFAULT 'pending',
  last_login_at timestamptz,
  failed_login_count int NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  role_type text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS permission_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL,
  description text NOT NULL DEFAULT '',
  UNIQUE(module, action)
);

CREATE TABLE IF NOT EXISTS role_actions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  action_code text NOT NULL,
  PRIMARY KEY(role_id, action_code)
);

CREATE TABLE IF NOT EXISTS data_scope_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  scope_type text NOT NULL DEFAULT 'self',
  org_ids uuid[] NOT NULL DEFAULT '{}',
  project_scope_type text NOT NULL DEFAULT 'member',
  project_ids uuid[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  org_type text NOT NULL,
  parent_id uuid REFERENCES organizations(id),
  path text NOT NULL DEFAULT '',
  leader_ids uuid[] NOT NULL DEFAULT '{}',
  deputy_leader_ids uuid[] NOT NULL DEFAULT '{}',
  technical_supervisor_ids uuid[] NOT NULL DEFAULT '{}',
  default_approver_ids uuid[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_organizations_parent ON organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_organizations_path ON organizations(path text_pattern_ops);

CREATE TABLE IF NOT EXISTS organization_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  change_type text NOT NULL,
  before_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  employee_no text UNIQUE,
  account_id uuid UNIQUE REFERENCES accounts(id),
  primary_org_id uuid REFERENCES organizations(id),
  management_level text,
  professional_level text,
  system_role_ids uuid[] NOT NULL DEFAULT '{}',
  work_status text NOT NULL DEFAULT 'active',
  daily_standard_hours numeric NOT NULL DEFAULT 8,
  dispatch_enabled boolean NOT NULL DEFAULT true,
  account_status text NOT NULL DEFAULT 'pending',
  default_entry_role_id uuid,
  invitation_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  CHECK (daily_standard_hours > 0)
);
CREATE INDEX IF NOT EXISTS idx_persons_primary_org ON persons(primary_org_id);
CREATE INDEX IF NOT EXISTS idx_persons_work_status ON persons(work_status);

CREATE TABLE IF NOT EXISTS person_org_memberships (
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_type text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(person_id, org_id, membership_type)
);

CREATE TABLE IF NOT EXISTS skill_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS person_skill_tags (
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skill_tags(id) ON DELETE CASCADE,
  PRIMARY KEY(person_id, skill_id)
);

CREATE TABLE IF NOT EXISTS person_status_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  status_type text NOT NULL,
  date_start date NOT NULL,
  date_end date NOT NULL,
  source_task_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_no text NOT NULL UNIQUE,
  name text NOT NULL,
  project_type text NOT NULL DEFAULT 'other',
  level text NOT NULL DEFAULT 'custom',
  owner_org_id uuid REFERENCES organizations(id),
  leader_id uuid REFERENCES persons(id),
  managed_by_id uuid REFERENCES persons(id),
  status text NOT NULL DEFAULT 'preparing',
  visibility text NOT NULL DEFAULT 'normal',
  start_date date,
  end_date date,
  summary text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_projects_owner_org ON projects(owner_org_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  project_role text NOT NULL DEFAULT 'member',
  work_desc text NOT NULL DEFAULT '',
  org_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(project_id, person_id)
);

CREATE TABLE IF NOT EXISTS visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  grant_actions text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_visibility_object ON visibility_grants(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_visibility_subject ON visibility_grants(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_no text NOT NULL UNIQUE,
  name text NOT NULL,
  task_type_id uuid,
  sub_type text,
  level text NOT NULL DEFAULT 'normal',
  priority text NOT NULL DEFAULT 'normal',
  owner_org_id uuid REFERENCES organizations(id),
  project_id uuid REFERENCES projects(id),
  visibility text NOT NULL DEFAULT 'normal',
  initiator_id uuid REFERENCES persons(id),
  owner_id uuid REFERENCES persons(id),
  acceptor_id uuid REFERENCES persons(id),
  start_at timestamptz,
  due_at timestamptz,
  estimated_total_hours numeric NOT NULL DEFAULT 0,
  summary text NOT NULL DEFAULT '',
  deliverable_requirement text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  template_snapshot_id uuid,
  progress numeric NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_org ON tasks(owner_org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_dates ON tasks(start_at, due_at);

CREATE TABLE IF NOT EXISTS task_members (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'member',
  work_content text NOT NULL DEFAULT '',
  estimated_total_hours numeric NOT NULL DEFAULT 0,
  daily_commitment_type text NOT NULL DEFAULT 'hours',
  daily_commitment_hours numeric NOT NULL DEFAULT 0,
  start_date date,
  due_date date,
  approval_status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(task_id, person_id, member_role)
);

CREATE TABLE IF NOT EXISTS task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner_id uuid NOT NULL REFERENCES persons(id),
  collaborator_ids uuid[] NOT NULL DEFAULT '{}',
  start_date date,
  due_date date,
  estimated_total_hours numeric NOT NULL DEFAULT 0,
  daily_commitment_type text NOT NULL DEFAULT 'hours',
  daily_commitment_hours numeric NOT NULL DEFAULT 0,
  confirmed_spent_hours numeric NOT NULL DEFAULT 0,
  progress numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'not_started',
  acceptor_id uuid REFERENCES persons(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_assignments_task ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_assignments_owner ON task_assignments(owner_id);

CREATE TABLE IF NOT EXISTS task_progress_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES task_assignments(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES persons(id),
  spent_hours numeric NOT NULL DEFAULT 0,
  progress numeric NOT NULL DEFAULT 0,
  content text NOT NULL DEFAULT '',
  result_resource_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'submitted',
  reported_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS task_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  changed_by uuid,
  change_type text NOT NULL,
  reason text NOT NULL DEFAULT '',
  before_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  submitter_id uuid,
  acceptor_id uuid,
  status text NOT NULL DEFAULT 'pending',
  comment text NOT NULL DEFAULT '',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  acted_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS dispatch_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES persons(id),
  dispatch_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  ticket_type text NOT NULL,
  target_person_ids uuid[] NOT NULL DEFAULT '{}',
  target_org_id uuid,
  status text NOT NULL DEFAULT 'pending',
  current_step int NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_status ON approval_tickets(status);

CREATE TABLE IF NOT EXISTS approval_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES approval_tickets(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  approver_id uuid,
  approver_source text NOT NULL DEFAULT 'default',
  action text,
  comment text NOT NULL DEFAULT '',
  acted_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS coordination_meeting_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES approval_tickets(id) ON DELETE CASCADE,
  meeting_at timestamptz NOT NULL,
  participants uuid[] NOT NULL DEFAULT '{}',
  topic text NOT NULL DEFAULT '',
  conclusion text NOT NULL DEFAULT '',
  next_actions text NOT NULL DEFAULT '',
  resource_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workload_snapshots (
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  committed_hours numeric NOT NULL DEFAULT 0,
  standard_hours numeric NOT NULL DEFAULT 8,
  load_rate numeric NOT NULL DEFAULT 0,
  full_day_occupied boolean NOT NULL DEFAULT false,
  source_task_ids uuid[] NOT NULL DEFAULT '{}',
  source_assignment_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(person_id, work_date)
);

CREATE TABLE IF NOT EXISTS conflict_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_type text NOT NULL,
  risk_level text NOT NULL DEFAULT 'medium',
  person_id uuid REFERENCES persons(id),
  task_id uuid REFERENCES tasks(id),
  assignment_id uuid REFERENCES task_assignments(id),
  conflict_date_start date,
  conflict_date_end date,
  overload_hours numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  handler_id uuid,
  resolution_action text,
  resolution_comment text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflict_records(status);
CREATE INDEX IF NOT EXISTS idx_conflicts_person ON conflict_records(person_id);

CREATE TABLE IF NOT EXISTS risk_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_type text NOT NULL,
  risk_level text NOT NULL DEFAULT 'medium',
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resource_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  resource_type text NOT NULL,
  uploader_id uuid REFERENCES persons(id),
  visibility text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'draft',
  current_version_id uuid,
  is_stage_result boolean NOT NULL DEFAULT false,
  is_final_result boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version bigint NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS resource_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES resource_files(id) ON DELETE CASCADE,
  version_no int NOT NULL,
  object_key text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  sha256 text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(resource_id, version_no)
);

CREATE TABLE IF NOT EXISTS resource_links (
  resource_id uuid NOT NULL REFERENCES resource_files(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  PRIMARY KEY(resource_id, object_type, object_id)
);

CREATE TABLE IF NOT EXISTS resource_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  resource_type text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace text NOT NULL,
  version_no int NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(namespace, version_no)
);

CREATE TABLE IF NOT EXISTS task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type_id uuid,
  fields_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  milestones_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  assignments_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  resource_requirements_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  acceptance_rules_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS todo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  todo_type text NOT NULL,
  title text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  assignee_id uuid REFERENCES persons(id),
  status text NOT NULL DEFAULT 'open',
  due_at timestamptz,
  action_url text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_todos_assignee_status ON todo_items(assignee_id, status);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  receiver_id uuid REFERENCES persons(id),
  channel text NOT NULL DEFAULT 'in_app',
  read_at timestamptz,
  source_event_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  scope_type text NOT NULL,
  scope_id uuid,
  period_start date,
  period_end date,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'common',
  entry_type text NOT NULL DEFAULT 'external',
  entry_url text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  icon text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_permissions (
  tool_id uuid NOT NULL REFERENCES tool_entries(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  actions text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY(tool_id, subject_type, subject_id)
);

CREATE TABLE IF NOT EXISTS tool_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id uuid NOT NULL REFERENCES tool_entries(id) ON DELETE CASCADE,
  user_id uuid REFERENCES persons(id),
  source_type text NOT NULL DEFAULT 'manual',
  source_id uuid,
  used_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS invitation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_type text NOT NULL DEFAULT 'user',
  default_org_id uuid REFERENCES organizations(id),
  default_role_ids uuid[] NOT NULL DEFAULT '{}',
  default_project_id uuid REFERENCES projects(id),
  default_project_role text,
  default_work_desc text NOT NULL DEFAULT '',
  need_approval boolean NOT NULL DEFAULT true,
  reviewer_source text NOT NULL DEFAULT 'default_org',
  required_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_in_days int NOT NULL DEFAULT 7,
  max_uses int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'enabled',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES invitation_templates(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  max_uses int NOT NULL DEFAULT 1,
  used_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'enabled',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_link_id uuid REFERENCES invitation_links(id),
  account_id uuid REFERENCES accounts(id),
  person_id uuid REFERENCES persons(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  reviewer_id uuid,
  review_comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE TABLE IF NOT EXISTS role_entry_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES roles(id),
  default_home text NOT NULL DEFAULT '/dashboard',
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  quick_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  todo_types text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES persons(id),
  filter_type text NOT NULL,
  name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS search_index_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  search_text text NOT NULL DEFAULT '',
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(object_type, object_id)
);
CREATE INDEX IF NOT EXISTS idx_search_vector ON search_index_meta USING GIN(search_vector);

CREATE TABLE IF NOT EXISTS domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  object_type text NOT NULL,
  object_id uuid,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  retry_count int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_domain_events_status ON domain_events(status, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  object_type text NOT NULL,
  object_id uuid,
  action text NOT NULL,
  before_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL DEFAULT '',
  source_ip text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO roles(code, name, role_type, priority, enabled)
VALUES
  ('sa', '超级管理员', 'sa', 0, true),
  ('admin', '系统管理员', 'admin', 10, true),
  ('leader', '中心领导', 'leader', 20, true),
  ('manager', '部门主任', 'manager', 30, true),
  ('project_owner', '项目负责人', 'project_owner', 40, true),
  ('task_owner', '任务负责人', 'task_owner', 50, true),
  ('employee', '员工', 'employee', 100, true),
  ('pending', '待审核用户', 'pending', 999, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO permission_actions(module, action, description)
VALUES
  ('auth', 'login', '登录'),
  ('admin', 'manage', '后台管理'),
  ('admin', 'invitation_manage', '邀请管理'),
  ('org', 'manage', '组织管理'),
  ('person', 'manage', '人员管理'),
  ('project', 'create', '创建项目'),
  ('project', 'manage', '项目管理'),
  ('project', 'manage_member', '项目成员管理'),
  ('task', 'create', '创建任务'),
  ('task', 'dispatch', '任务派发'),
  ('task', 'approve', '任务审批'),
  ('task', 'accept', '任务验收'),
  ('resource', 'upload', '资料上传'),
  ('resource', 'download', '资料下载'),
  ('config', 'publish', '发布配置'),
  ('report', 'export', '导出报表'),
  ('tool', 'manage', '工具管理')
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_actions(role_id, action_code)
SELECT r.id, a.module || '.' || a.action
FROM roles r CROSS JOIN permission_actions a
WHERE r.code = 'sa'
ON CONFLICT DO NOTHING;

INSERT INTO role_actions(role_id, action_code)
SELECT r.id, a.module || '.' || a.action
FROM roles r
JOIN permission_actions a ON (a.module, a.action) IN (
  ('project', 'create'), ('project', 'manage'), ('task', 'create'),
  ('task', 'dispatch'), ('task', 'accept'), ('resource', 'upload'),
  ('resource', 'download'), ('report', 'export')
)
WHERE r.code IN ('leader', 'manager', 'project_owner')
ON CONFLICT DO NOTHING;

INSERT INTO role_actions(role_id, action_code)
SELECT r.id, a.module || '.' || a.action
FROM roles r
JOIN permission_actions a ON (a.module, a.action) IN (
  ('task', 'create'), ('resource', 'upload'), ('resource', 'download')
)
WHERE r.code IN ('task_owner', 'employee')
ON CONFLICT DO NOTHING;
