import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Panel, StatCard, Tabs, Tag } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiConflict, type ApiList, conflictTypeLabel, formatDate, riskLabel, riskVariant } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { ChevronDown } from 'lucide-react'
import { useMemo, useState } from 'react'

const filterTabs = [
  { value: 'all', label: '全部' },
  { value: 'open', label: '待处理' },
  { value: 'resolved', label: '已解决' },
  { value: 'forced', label: '强制排期' },
]

function statusLabel(status?: string) {
  const map: Record<string, string> = {
    open: '待处理',
    processing: '处理中',
    resolved: '已解决',
    forced: '强制排期',
  }
  return map[status ?? ''] ?? status ?? '未知'
}

function statusVariant(status?: string) {
  if (status === 'resolved') return 'success'
  if (status === 'forced') return 'error'
  if (status === 'processing') return 'info'
  return 'warning'
}

export function ConflictCenterPage() {
  const [activeTab, setActiveTab] = useState('all')
  const [acting, setActing] = useState<string | null>(null)
  const { data, loading, error, reload } = useApiData(
    () => apiGet<ApiList<ApiConflict>>('/conflicts', { status: activeTab === 'all' ? undefined : activeTab, page_size: 100 }),
    [activeTab]
  )
  const conflicts = useMemo(() => data?.items ?? [], [data?.items])
  const stats = useMemo(() => {
    return {
      total: conflicts.length,
      high: conflicts.filter((item) => item.risk_level === 'high' || item.risk_level === 'critical').length,
      open: conflicts.filter((item) => item.status === 'open').length,
      overload: conflicts.filter((item) => item.conflict_type === 'overload').length,
    }
  }, [conflicts])

  async function resolve(id: string) {
    setActing(id)
    try {
      await apiPost(`/conflicts/${id}/resolve`, { resolution_action: 'resolved', resolution_comment: '前端处理完成' })
      await reload()
    } finally {
      setActing(null)
    }
  }

  async function force(id: string) {
    setActing(id)
    try {
      await apiPost(`/conflicts/${id}/force`, { reason: '业务确认强制排期' })
      await reload()
    } finally {
      setActing(null)
    }
  }

  return (
    <MainLayout title="冲突中心" subtitle="负载、时间与资源冲突处理">
      <div className="flex flex-col gap-6">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}
        <div className="grid grid-cols-4 gap-5">
          <StatCard label="冲突总数" value={stats.total} sub={loading ? '加载中' : '真实冲突数据'} />
          <StatCard label="高风险" value={stats.high} />
          <StatCard label="待处理" value={stats.open} />
          <StatCard label="人员超载" value={stats.overload} />
        </div>

        <div className="flex items-center justify-between">
          <Tabs tabs={filterTabs} value={activeTab} onChange={setActiveTab} />
          <button className="flex items-center gap-1 text-sm text-text-muted transition-fast hover:text-text-primary">
            按风险等级
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-[1fr_340px] gap-6">
          <div className="flex flex-col gap-4">
            {conflicts.map((conflict) => (
              <div key={conflict.id} className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge>{conflictTypeLabel(conflict.conflict_type)}</Badge>
                    <Tag variant={riskVariant(conflict.risk_level)}>{riskLabel(conflict.risk_level)}</Tag>
                  </div>
                  <Tag variant={statusVariant(conflict.status)}>{statusLabel(conflict.status)}</Tag>
                </div>

                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-text-primary">{conflict.task_id ?? '冲突记录'}</h3>
                  <p className="text-sm text-text-muted">
                    {formatDate(conflict.conflict_date_start)} - {formatDate(conflict.conflict_date_end)}
                    {conflict.overload_hours ? ` · 超载 ${conflict.overload_hours}h` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-sm text-text-muted">
                  <span>人员：{conflict.person_id ?? '未关联'}</span>
                  <span>{formatDate(conflict.created_at)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="primary" className="h-8 px-4 text-sm" disabled={acting === conflict.id} onClick={() => void resolve(conflict.id)}>
                    处理
                  </Button>
                  <Button variant="danger" className="h-8 px-4 text-sm" disabled={acting === conflict.id} onClick={() => void force(conflict.id)}>
                    强制排期
                  </Button>
                </div>
              </div>
            ))}
            {!loading && conflicts.length === 0 && <EmptyState title="暂无冲突" desc="当前筛选下没有冲突记录。" />}
          </div>

          <Panel className="gap-5">
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-bg-tertiary p-4">
              <Mini label="全部" value={stats.total} />
              <Mini label="高风险" value={stats.high} />
              <Mini label="待处理" value={stats.open} />
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-text-primary">处理说明</h4>
              <p className="text-sm leading-relaxed text-text-secondary">
                冲突数据来自后端负载与排期计算。处理会写入冲突记录状态；强制排期需要权限并写入审计日志。
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </MainLayout>
  )
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-stat font-bold text-text-primary">{value}</span>
    </div>
  )
}
