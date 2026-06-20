import type { TagProps } from '@/components/ui'

type TagVariant = NonNullable<TagProps['variant']>

export interface ApiList<T> {
  items: T[]
  total?: number
}

export interface CurrentUser {
  account_id: string
  person_id?: string | null
  login_name: string
  account_status: string
  role_ids: string[]
  role_codes: string[]
  actions: string[]
}

export interface ApiTask {
  id: string
  task_no?: string
  name: string
  sub_type?: string | null
  priority?: string
  status?: string
  owner_id?: string | null
  project_id?: string | null
  start_at?: string | null
  due_at?: string | null
  progress?: number | string | null
  summary?: string
  deliverable_requirement?: string
  created_at?: string
  updated_at?: string
  payload?: Record<string, unknown>
}

export interface ApiProject {
  id: string
  project_no?: string
  name: string
  project_type?: string
  level?: string
  status?: string
  visibility?: string
  owner_org_id?: string | null
  leader_id?: string | null
  start_date?: string | null
  end_date?: string | null
  summary?: string
  payload?: Record<string, unknown>
}

export interface ApiPerson {
  id: string
  name: string
  employee_no?: string | null
  account_id?: string | null
  primary_org_id?: string | null
  primary_org_name?: string | null
  org_memberships?: {
    org_id: string
    org_name?: string | null
    membership_type?: string
    active?: boolean
  }[]
  management_level?: string | null
  professional_level?: string | null
  work_status?: string
  account_status?: string
  daily_standard_hours?: number | string
  dispatch_enabled?: boolean
  system_role_ids?: string[]
  skills?: ApiSkill[]
  payload?: Record<string, unknown>
}

export interface ApiSkill {
  id: string
  name: string
  enabled?: boolean
  payload?: Record<string, unknown>
}

export interface ApiOrg {
  id: string
  name: string
  code?: string
  org_type?: string
  parent_id?: string | null
  enabled?: boolean
  path?: string | null
}

export interface ApiConflict {
  id: string
  conflict_type?: string
  risk_level?: string
  status?: string
  task_id?: string | null
  task_name?: string | null
  task_no?: string | null
  person_id?: string | null
  person_name?: string | null
  person_employee_no?: string | null
  owner_org_name?: string | null
  conflict_date_start?: string | null
  conflict_date_end?: string | null
  overload_hours?: number | null
  handler_id?: string | null
  resolution_action?: string | null
  resolution_comment?: string | null
  updated_at?: string
  created_at?: string
  payload?: Record<string, unknown>
}

export interface ApiConflictDetail extends ApiConflict {
  person?: {
    id: string
    name?: string
    employee_no?: string | null
    work_status?: string
    daily_standard_hours?: number
    primary_org_name?: string | null
  } | null
  task?: {
    id: string
    task_no?: string
    name?: string
    status?: string
    priority?: string
    start_at?: string | null
    due_at?: string | null
    progress?: number
    project_id?: string | null
    project_name?: string | null
  } | null
  assignment?: {
    id: string
    title?: string
    status?: string
    owner_id?: string
    start_date?: string | null
    due_date?: string | null
    daily_commitment_hours?: number
    daily_commitment_type?: string
  } | null
  related_workload?: {
    date?: string
    committed_hours?: number
    standard_hours?: number
    load_rate?: number
    full_day_occupied?: boolean
    source_task_ids?: string[]
  }[]
  events?: {
    id: string
    event_type?: string
    actor_name?: string | null
    payload?: Record<string, unknown>
    created_at?: string
  }[]
  audits?: {
    id: string
    action?: string
    reason?: string
    created_at?: string
    after_payload?: Record<string, unknown>
  }[]
}

export interface ApiResource {
  id: string
  name: string
  resource_type?: string
  uploader_id?: string | null
  uploader_name?: string | null
  visibility?: string
  status?: string
  object_key?: string
  file_size?: number | string
  size_bytes?: number | string
  version_no?: number | string
  is_stage_result?: boolean
  is_final_result?: boolean
  created_at?: string
  updated_at?: string
  payload?: Record<string, unknown>
}

export interface ApiTool {
  id: string
  name: string
  category?: string
  entry_type?: string
  entry_url?: string
  enabled?: boolean
  icon?: string
  description?: string
  payload?: Record<string, unknown>
}

export interface ApiToolUsage {
  id: string
  tool_id: string
  user_id?: string | null
  source_type?: string
  source_id?: string | null
  used_at?: string
  payload?: Record<string, unknown>
}

export interface ApiTodo {
  id: string
  title: string
  todo_type?: string
  action_url?: string | null
  status?: string
  due_at?: string | null
  created_at?: string
  payload?: Record<string, unknown>
}

export interface ApiNotification {
  id: string
  title?: string
  content?: string
  notification_type?: string
  priority?: string
  action_url?: string | null
  read_at?: string | null
  created_at?: string
  payload?: Record<string, unknown>
}

export interface ApiReportSummary {
  report_type: string
  count?: number | string
  latest?: string | null
}

export interface ApiReportSnapshot {
  id: string
  report_type: string
  scope_type?: string
  scope_id?: string | null
  period_start?: string | null
  period_end?: string | null
  generated_at?: string
  payload?: Record<string, unknown>
}

export function textFromPayload(payload: Record<string, unknown> | undefined, key: string, fallback = '未设置') {
  const value = payload?.[key]
  return typeof value === 'string' && value ? value : fallback
}

export function numberValue(value: unknown, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function formatDate(value?: string | null) {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function formatDateTime(value?: string | null) {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${formatDate(value)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function taskStatusLabel(status?: string) {
  const map: Record<string, string> = {
    draft: '草稿',
    coordination_pending: '待审批',
    pending_confirm: '待确认',
    confirmation_pending: '待确认',
    in_progress: '进行中',
    paused: '已暂停',
    risk: '有风险',
    pending_acceptance: '待验收',
    acceptance_pending: '待验收',
    acceptance_rejected: '验收驳回',
    completed: '已完成',
    archived: '已归档',
    cancelled: '已取消',
  }
  return map[status ?? ''] ?? status ?? '未知'
}

export function taskTypeLabel(type?: string | null) {
  const map: Record<string, string> = {
    research: '科研任务',
    report: '报告材料',
    support: '协同支持',
    travel: '出差安排',
    leave: '休假占用',
    backfill: '后补填报',
    other: '其他',
  }
  return map[type ?? ''] ?? type ?? '常规'
}

export function taskStatusVariant(status?: string): TagVariant {
  if (status === 'completed' || status === 'archived') return 'success'
  if (status === 'risk' || status === 'acceptance_rejected' || status === 'cancelled') return 'error'
  if (status === 'coordination_pending' || status === 'confirmation_pending' || status === 'acceptance_pending') return 'warning'
  return 'info'
}

export function priorityLabel(priority?: string) {
  const map: Record<string, string> = {
    low: '低',
    normal: '中',
    high: '高',
    urgent: '紧急',
  }
  return map[priority ?? ''] ?? priority ?? '中'
}

export function projectStatusLabel(status?: string) {
  const map: Record<string, string> = {
    preparing: '筹备',
    active: '进行中',
    paused: '暂停',
    completed: '已完成',
    archived: '已归档',
  }
  return map[status ?? ''] ?? status ?? '未知'
}

export function projectTypeLabel(type?: string | null) {
  const map: Record<string, string> = {
    research: '科研',
    delivery: '交付',
    operation: '运营',
    other: '其他',
  }
  return map[type ?? ''] ?? type ?? '其他'
}

export function visibilityLabel(visibility?: string | null) {
  const map: Record<string, string> = {
    normal: '普通',
    public: '公开',
    hidden: '隐藏',
    restricted: '指定范围',
  }
  return map[visibility ?? ''] ?? visibility ?? '普通'
}

export function workStatusLabel(status?: string) {
  const map: Record<string, string> = {
    active: '在岗',
    leave: '休假',
    business_trip: '出差',
    inactive: '离岗',
  }
  return map[status ?? ''] ?? status ?? '未知'
}

export function accountStatusLabel(status?: string) {
  const map: Record<string, string> = {
    enabled: '启用',
    pending: '待审核',
    disabled: '禁用',
    locked: '锁定',
  }
  return map[status ?? ''] ?? status ?? '未知'
}

export function conflictTypeLabel(type?: string) {
  const map: Record<string, string> = {
    overload: '人员超载',
    full_day_overlap: '全天占用重叠',
    unavailable: '人员不可用',
    all_day_overlap: '全天任务重叠',
    time_overlap: '时间冲突',
    status: '状态冲突',
    permission: '权限冲突',
    resource: '资源冲突',
  }
  return map[type ?? ''] ?? type ?? '冲突'
}

export function riskLabel(level?: string) {
  const map: Record<string, string> = {
    none: '正常',
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重',
  }
  return map[level ?? ''] ?? level ?? '正常'
}

export function riskVariant(level?: string): TagVariant {
  if (level === 'critical' || level === 'high') return 'error'
  if (level === 'medium') return 'warning'
  if (level === 'low') return 'info'
  return 'success'
}

export function resourceStatusLabel(status?: string) {
  const map: Record<string, string> = {
    submitted: '已提交',
    confirmed: '已确认',
    archived: '已归档',
    rejected: '已驳回',
  }
  return map[status ?? ''] ?? status ?? '未知'
}
