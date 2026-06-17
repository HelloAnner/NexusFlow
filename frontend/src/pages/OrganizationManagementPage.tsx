import { MainLayout } from '@/components/layout'
import { EmptyState, Panel, Tag } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { type ApiList } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { Building2, CheckCircle2, CircleOff } from 'lucide-react'
import { useMemo, useState } from 'react'

interface ApiOrg {
  id: string
  name: string
  code: string
  org_type: string
  parent_id?: string | null
  path?: string
  leader_ids?: string[]
  enabled?: boolean
  payload?: Record<string, unknown>
}

function orgTypeLabel(type: string) {
  const labels: Record<string, string> = {
    company: '公司',
    center: '中心',
    department: '部门',
    studio: '工作室',
  }
  return labels[type] ?? type
}

function depthOf(path?: string) {
  return Math.max(0, (path ?? '').split('/').filter(Boolean).length - 1)
}

export function OrganizationManagementPage() {
  const { data, loading, error } = useApiData(() => apiGet<ApiList<ApiOrg>>('/orgs/tree'), [])
  const orgs = data?.items ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = useMemo(
    () => orgs.find((org) => org.id === (selectedId ?? orgs[0]?.id)) ?? null,
    [orgs, selectedId]
  )
  const enabled = orgs.filter((org) => org.enabled).length

  return (
    <MainLayout title="组织管理" subtitle="组织树、负责人和默认审批关系">
      <div className="flex flex-col gap-6">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}

        <div className="grid grid-cols-3 gap-5">
          <Panel>
            <span className="text-sm text-text-muted">组织总数</span>
            <strong className="text-stat text-text-primary">{orgs.length}</strong>
          </Panel>
          <Panel>
            <span className="text-sm text-text-muted">启用组织</span>
            <strong className="text-stat text-text-primary">{enabled}</strong>
          </Panel>
          <Panel>
            <span className="text-sm text-text-muted">组织层级</span>
            <strong className="text-stat text-text-primary">
              {orgs.length ? Math.max(...orgs.map((org) => depthOf(org.path))) + 1 : 0}
            </strong>
          </Panel>
        </div>

        <div className="grid grid-cols-[minmax(280px,360px)_1fr] gap-6">
          <Panel title="组织树">
            <div className="flex flex-col gap-1">
              {orgs.map((org) => {
                const active = selected?.id === org.id
                return (
                  <button
                    key={org.id}
                    className={[
                      'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-fast',
                      active ? 'bg-hover-bg text-text-primary' : 'text-text-secondary hover:bg-hover-bg',
                    ].join(' ')}
                    style={{ paddingLeft: `${12 + depthOf(org.path) * 18}px` }}
                    onClick={() => setSelectedId(org.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0 text-text-muted" />
                      <span className="truncate text-sm font-medium">{org.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-text-muted">{org.code}</span>
                  </button>
                )
              })}
              {!loading && orgs.length === 0 && <EmptyState title="暂无组织" desc="当前没有可见组织。" />}
            </div>
          </Panel>

          <Panel title="组织详情">
            {selected ? (
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <span className="text-sm text-text-muted">名称</span>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{selected.name}</p>
                </div>
                <div>
                  <span className="text-sm text-text-muted">编码</span>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{selected.code}</p>
                </div>
                <div>
                  <span className="text-sm text-text-muted">类型</span>
                  <p className="mt-2 text-text-primary">{orgTypeLabel(selected.org_type)}</p>
                </div>
                <div>
                  <span className="text-sm text-text-muted">状态</span>
                  <div className="mt-2">
                    <Tag variant={selected.enabled ? 'success' : 'error'}>
                      {selected.enabled ? (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      ) : (
                        <CircleOff className="mr-1 h-3 w-3" />
                      )}
                      {selected.enabled ? '启用' : '停用'}
                    </Tag>
                  </div>
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-text-muted">路径</span>
                  <p className="mt-2 rounded-md bg-bg-tertiary px-3 py-2 font-mono text-sm text-text-secondary">
                    {selected.path ?? '-'}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-sm text-text-muted">负责人</span>
                  <p className="mt-2 text-text-primary">
                    {selected.leader_ids?.length ? `${selected.leader_ids.length} 人` : '未配置'}
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState title="未选择组织" desc="从左侧组织树选择一个节点查看详情。" />
            )}
          </Panel>
        </div>
      </div>
    </MainLayout>
  )
}
