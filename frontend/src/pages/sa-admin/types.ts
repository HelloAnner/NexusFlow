import type { ApiList, ApiPerson } from '@/lib/format'

export interface AdminDashboard {
  pending_registrations?: number
  enabled_accounts?: number
  open_conflicts?: number
}

export interface Account {
  id: string
  login_name: string
  person_id?: string | null
  status?: string
  last_login_at?: string | null
  failed_login_count?: number
  created_at?: string
}

export interface Registration {
  id: string
  status?: string
  person_id?: string | null
  account_id?: string | null
  created_at?: string
  reviewed_at?: string | null
  review_comment?: string
  payload?: Record<string, unknown>
}

export interface RuntimeStatus {
  status?: string
  database?: boolean
  redis?: boolean
  s3_configured?: boolean
  search_backend?: string
  uptime_seconds?: number
}

export interface BrandingConfig {
  product_name: string
  system_name: string
}

export interface AuditLog {
  id: string
  object_type?: string
  object_id?: string
  action?: string
  created_at?: string
  reason?: string
  actor_id?: string | null
}

export interface Role {
  id: string
  code: string
  name: string
  role_type?: string
  enabled?: boolean
}

export interface Org {
  id: string
  name: string
  code?: string
  org_type?: string
  parent_id?: string | null
  enabled?: boolean
}

export interface InvitationTemplate {
  id: string
  name?: string
  invite_type?: string
  default_org_id?: string | null
  default_role_ids?: string[]
  default_project_id?: string | null
  need_approval?: boolean
  expires_in_days?: number
  max_uses?: number
  status?: string
  created_at?: string
  updated_at?: string
  payload?: Record<string, unknown>
}

export interface InvitationLink {
  id: string
  template_id?: string
  status?: string
  expires_at?: string | null
  max_uses?: number
  used_count?: number
  created_by?: string
  created_at?: string
}

export interface AdminData {
  dashboard: AdminDashboard
  registrations: ApiList<Registration>
  people: ApiList<ApiPerson>
  accounts: ApiList<Account>
  templates: ApiList<InvitationTemplate>
  links: ApiList<InvitationLink>
  runtime: RuntimeStatus
  audits: ApiList<AuditLog>
  roles: ApiList<Role>
  orgs: ApiList<Org>
  branding: BrandingConfig
}

export type AdminContext = {
  data: AdminData | undefined
  registrations: Registration[]
  people: ApiPerson[]
  accounts: Account[]
  templates: InvitationTemplate[]
  links: InvitationLink[]
  audits: AuditLog[]
  roles: Role[]
  orgs: Org[]
  loading: boolean
  acting: string | null
  perform: (label: string, action: () => Promise<unknown>) => Promise<void>
  reviewRegistration: (id: string, action: 'approve' | 'reject') => Promise<void>
  setActiveNav: (value: string) => void
  reloadBranding: () => Promise<void>
}
