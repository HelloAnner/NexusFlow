import { Avatar, NavItem } from '@/components/ui'
import { apiPost } from '@/lib/api'
import { useBranding } from '@/lib/branding'
import { useApiData } from '@/lib/useApiData'
import { LayoutDashboard } from 'lucide-react'
import { useState } from 'react'
import { loadAdminData } from './sa-admin/api'
import { navIcons, secondaryNav } from './sa-admin/nav'
import type { AdminContext } from './sa-admin/types'
import { OverviewView } from './sa-admin/views/Overview'
import { SystemAppearanceView } from './sa-admin/views/Appearance'
import { PendingView } from './sa-admin/views/Pending'
import { PersonnelView } from './sa-admin/views/Personnel'
import { TemplateView } from './sa-admin/views/Templates'
import { LinkView } from './sa-admin/views/Links'
import { RoleEntryView } from './sa-admin/views/RoleEntry'
import { SecurityView } from './sa-admin/views/Security'
import { AuditView } from './sa-admin/views/Audit'
import { StatusView } from './sa-admin/views/Status'
import { MainLayout } from '@/components/layout'

export default function SAAdminPage() {
  const { reloadBranding } = useBranding()
  const [activeNav, setActiveNav] = useState('overview')
  const [acting, setActing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const { data, loading, error, reload } = useApiData(loadAdminData)

  const registrations = data?.registrations.items ?? []
  const people = data?.people.items ?? []
  const accounts = data?.accounts.items ?? []
  const templates = data?.templates.items ?? []
  const links = data?.links.items ?? []
  const audits = data?.audits.items ?? []
  const roles = data?.roles.items ?? []
  const orgs = data?.orgs.items ?? []

  async function perform(label: string, action: () => Promise<unknown>) {
    setActing(label)
    setMessage(null)
    setErrorMessage(null)
    try {
      const res = await action()
      setMessage(typeof res === 'string' ? res : `${label}完成`)
      await reload()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : `${label}失败`)
    } finally {
      setActing(null)
    }
  }

  async function reviewRegistration(id: string, action: 'approve' | 'reject') {
    await perform(action === 'approve' ? '审核通过' : '审核拒绝', () =>
      apiPost(`/admin/registrations/${id}/${action}`, { comment: action === 'approve' ? '审核通过' : '审核拒绝' })
    )
  }

  const context: AdminContext = {
    data: data ?? undefined,
    registrations,
    people,
    accounts,
    templates,
    links,
    audits,
    roles,
    orgs,
    loading,
    acting,
    perform,
    reviewRegistration,
    setActiveNav,
    reloadBranding,
  }

  return (
    <MainLayout title="系统管理" subtitle="平台级运营与监控" className="!p-0">
      <div className="flex h-full">
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-border-subtle bg-bg-secondary px-3 py-4">
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {secondaryNav.map((item) => (
              <NavItem
                key={item.id}
                icon={navIcons[item.id] ?? LayoutDashboard}
                label={item.label}
                active={activeNav === item.id}
                onClick={() => setActiveNav(item.id)}
              />
            ))}
          </nav>
          <div className="mt-2 flex items-center gap-3 border-t border-border-subtle pt-4">
            <Avatar name="超级管理员" className="h-9 w-9" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text-primary">超级管理员</span>
              <span className="text-xs text-text-muted">SA</span>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6 p-6">
          {(error || errorMessage || message) && (
            <div className={`rounded-md px-4 py-3 text-sm ${error || errorMessage ? 'bg-color-error-bg text-color-error' : 'bg-color-info-bg text-color-info'}`}>
              {error || errorMessage || message}
            </div>
          )}
          {activeNav === 'overview' && <OverviewView {...context} />}
          {activeNav === 'appearance' && (
            <SystemAppearanceView
              key={`${data?.branding.product_name ?? ''}-${data?.branding.system_name ?? ''}`}
              {...context}
            />
          )}
          {activeNav === 'pending' && <PendingView {...context} />}
          {activeNav === 'personnel' && <PersonnelView {...context} />}
          {activeNav === 'templates' && <TemplateView {...context} />}
          {activeNav === 'links' && <LinkView {...context} />}
          {activeNav === 'role-entry' && <RoleEntryView {...context} />}
          {activeNav === 'security' && <SecurityView {...context} />}
          {activeNav === 'audit' && <AuditView {...context} />}
          {activeNav === 'status' && <StatusView {...context} />}
        </div>
      </div>
    </MainLayout>
  )
}
