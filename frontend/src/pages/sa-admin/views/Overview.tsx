import { Badge, Button, EmptyState, Panel, StatCard, Tag } from '@/components/ui'
import { Building2, FileText, Link as LinkIcon, UserPlus } from 'lucide-react'
import type { AdminContext } from '../types'
import { AccountTag, AuditRows, RegistrationRows, RuntimePanel } from '../components'

export function OverviewView({ data, registrations, accounts, templates, links, audits, roles, setActiveNav }: AdminContext) {
  const pending = registrations.filter((item) => item.status === 'pending')
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-6 gap-4">
        <StatCard label="组织" value={data?.orgs.items.length ?? 0} />
        <StatCard label="人员" value={data?.people.items.length ?? 0} />
        <StatCard label="账号启用" value={data?.dashboard.enabled_accounts ?? accounts.filter((item) => item.status === 'enabled').length} />
        <StatCard label="运行状态" value={data?.runtime.status ?? '未知'} />
        <StatCard label="待审核注册" value={data?.dashboard.pending_registrations ?? pending.length} />
        <StatCard label="有效邀请" value={links.filter((item) => item.status === 'enabled').length} />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" className="h-10 px-4" onClick={() => setActiveNav('personnel')}><Building2 className="h-4 w-4" />新建组织</Button>
        <Button variant="secondary" className="h-10 px-4" onClick={() => setActiveNav('personnel')}><UserPlus className="h-4 w-4" />新建人员</Button>
        <Button className="h-10 px-4" onClick={() => setActiveNav('links')}><LinkIcon className="h-4 w-4" />生成邀请链接</Button>
        <Button variant="secondary" className="h-10 px-4" onClick={() => setActiveNav('audit')}><FileText className="h-4 w-4" />查看审计日志</Button>
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-6">
        <div className="flex flex-col gap-6">
          <Panel title="待审核注册" right={<button className="text-sm text-text-muted hover:text-text-primary" onClick={() => setActiveNav('pending')}>查看全部</button>}>
            <RegistrationRows registrations={pending.slice(0, 6)} compact />
          </Panel>
          <Panel title="邀请模板">
            <div className="flex flex-col divide-y divide-border-subtle">
              {templates.slice(0, 5).map((template) => (
                <div key={template.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-base font-medium text-text-primary">{template.name ?? '邀请模板'}</span>
                    <span className="text-sm text-text-muted">{template.invite_type ?? 'user'} · {template.expires_in_days ?? 7} 天 · {template.max_uses ?? 1} 次</span>
                  </div>
                  <Tag variant={template.status === 'enabled' ? 'success' : 'warning'}>{template.status ?? 'enabled'}</Tag>
                </div>
              ))}
            </div>
            {templates.length === 0 && <EmptyState title="暂无模板" desc="进入邀请模板页创建第一条模板。" />}
          </Panel>
        </div>
        <div className="flex flex-col gap-6">
          <RuntimePanel runtime={data?.runtime} />
          <Panel title="账号异常">
            <div className="flex flex-col divide-y divide-border-subtle">
              {accounts.filter((item) => item.status !== 'enabled' || (item.failed_login_count ?? 0) > 0).slice(0, 6).map((account) => (
                <div key={account.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-base font-medium text-text-primary">{account.login_name}</span>
                    <span className="text-sm text-text-muted">失败 {account.failed_login_count ?? 0} 次</span>
                  </div>
                  <AccountTag status={account.status} />
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="最近权限/配置审计">
            <AuditRows audits={audits.slice(0, 5)} />
          </Panel>
          <Panel title="角色入口概览">
            <div className="flex flex-col divide-y divide-border-subtle">
              {roles.slice(0, 5).map((role) => (
                <div key={role.id} className="flex items-center justify-between py-3">
                  <span className="text-base font-medium text-text-primary">{role.name}</span>
                  <Badge>{role.code}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
