import { EmptyState, Panel, Tag } from '@/components/ui'
import type { TagProps } from '@/components/ui'
import { accountStatusLabel, formatDateTime } from '@/lib/format'
import type { AuditLog, Registration, RuntimeStatus } from './types'

type TagVariant = NonNullable<TagProps['variant']>

export const accountVariant = (status?: string): TagVariant =>
  status === 'enabled' ? 'success' : status === 'locked' || status === 'disabled' ? 'error' : 'warning'

export const enabledVariant = (enabled?: boolean): TagVariant => (enabled === false ? 'warning' : 'success')

export function AccountTag({ status }: { status?: string }) {
  return <Tag variant={accountVariant(status)}>{accountStatusLabel(status)}</Tag>
}

export function RuntimePanel({ runtime }: { runtime?: RuntimeStatus }) {
  return (
    <Panel title="系统运行状态">
      <div className="flex flex-col divide-y divide-border-subtle">
        <Status label="数据库" ok={runtime?.database} />
        <Status label="Redis" ok={runtime?.redis} />
        <Status label="对象存储" ok={runtime?.s3_configured} />
        <div className="flex items-center justify-between gap-4 py-3">
          <span className="text-base text-text-primary">搜索后端</span>
          <span className="text-sm text-text-muted">{runtime?.search_backend ?? 'unknown'}</span>
        </div>
      </div>
    </Panel>
  )
}

export function RegistrationRows({ registrations, compact }: { registrations: Registration[]; compact?: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      {registrations.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-medium text-text-primary">
              {String(item.payload?.name ?? item.person_id ?? '注册申请')}
            </span>
            <span className="text-sm text-text-muted">
              {String(item.payload?.login_name ?? item.account_id ?? '-')} · {formatDateTime(item.created_at)}
            </span>
          </div>
          <RegistrationTag status={item.status} />
        </div>
      ))}
      {registrations.length === 0 && compact && <EmptyState title="暂无待审核注册" desc="当前没有待处理注册。" />}
    </div>
  )
}

export function RegistrationTag({ status }: { status?: string }) {
  return <Tag variant={status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'warning'}>{status ?? 'pending'}</Tag>
}

export function AuditRows({ audits }: { audits: AuditLog[] }) {
  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      {audits.map((audit) => (
        <div key={audit.id} className="flex flex-col gap-0.5 py-3">
          <span className="text-base font-medium text-text-primary">{audit.action ?? '审计动作'}</span>
          <span className="text-sm text-text-muted">{audit.object_type ?? 'object'} · {formatDateTime(audit.created_at)}</span>
        </div>
      ))}
      {audits.length === 0 && <EmptyState title="暂无审计" desc="当前没有审计记录。" />}
    </div>
  )
}

export function Status({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-base text-text-primary">{label}</span>
      <Tag variant={ok ? 'success' : 'warning'}>{ok ? '正常' : '未就绪'}</Tag>
    </div>
  )
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-3 last:border-b-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-base font-medium text-text-primary">{value}</span>
    </div>
  )
}

export function orgName(orgs: { id: string; name: string }[], id?: string | null) {
  return orgs.find((org) => org.id === id)?.name ?? id ?? '未配置'
}

export function templateName(templates: { id: string; name?: string }[], id?: string) {
  return templates.find((template) => template.id === id)?.name ?? id ?? '-'
}

export function roleNames(roles: { id: string; name: string }[], value: unknown) {
  const ids = Array.isArray(value) ? value.map(String) : []
  if (ids.length === 0) return '未配置'
  return ids.map((id) => roles.find((role) => role.id === id)?.name ?? id).join('、')
}
