import { apiGet } from '@/lib/api'
import type {
  Account,
  AdminDashboard,
  AdminData,
  AuditLog,
  BrandingConfig,
  InvitationLink,
  InvitationTemplate,
  Org,
  Registration,
  Role,
  RuntimeStatus,
} from './types'
import type { ApiList, ApiPerson } from '@/lib/format'

export async function loadAdminData() {
  const [dashboard, registrations, people, accounts, templates, links, runtime, audits, roles, orgs, branding] = await Promise.all([
    apiGet<AdminDashboard>('/admin/dashboard'),
    apiGet<ApiList<Registration>>('/admin/registrations'),
    apiGet<ApiList<ApiPerson>>('/users', { page_size: 200 }),
    apiGet<ApiList<Account>>('/admin/accounts'),
    apiGet<ApiList<InvitationTemplate>>('/invitations/templates'),
    apiGet<ApiList<InvitationLink>>('/invitations/links'),
    apiGet<RuntimeStatus>('/config/runtime-status'),
    apiGet<ApiList<AuditLog>>('/audit/permission', { page_size: 100 }),
    apiGet<ApiList<Role>>('/roles', { page_size: 200 }),
    apiGet<ApiList<Org>>('/orgs', { page_size: 200 }),
    apiGet<{ branding: BrandingConfig }>('/system/branding'),
  ])
  return {
    dashboard,
    registrations,
    people,
    accounts,
    templates,
    links,
    runtime,
    audits,
    roles,
    orgs,
    branding: branding.branding,
  } as AdminData
}
