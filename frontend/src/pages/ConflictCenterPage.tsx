import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Panel, Select, StatCard, Tabs, Tag } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiConflict, type ApiList, conflictTypeLabel, formatDate, riskLabel, riskVariant } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const filterTabs = [
  { value: 'all', label: '全部' },
  { value: 'open', label: '待处理' },
  { value: 'resolved', label: '已解决' },
  { value: 'forced', label: '强制排期' },
]

const conflictTypeOptions = [
  { value: '', label: '全部类型' },
  { value: 'overload', label: '人员超载' },
  { value: 'full_day_overlap', label: '全天占用重叠' },
  { value: 'all_day_overlap', label: '全天任务重叠' },
  { value: 'unavailable', label: '人员不可用' },
  { value: 'time_overlap', label: '时间冲突' },
]

const riskOptions = [
  { value: '', label: '全部风险' },
  { value: 'critical', label: '严重' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

const resolutionOptions = [
  { value: 'adjust_time', label: '调整任务时间' },
  { value: 'adjust_hours', label: '调整每日投入' },
  { value: 'replace_person', label: '更换执行人员' },
  { value: 'coordinate', label: '发起跨部门协调' },
  { value: 'resolved', label: '已线下处理' },
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
  const [params, setParams] = useSearchParams()
  const [acting, setActing] = useState<string | null>(null)
  const [actionTarget, setActionTarget] = useState<{ type: 'resolve' | 'force'; conflict: ApiConflict } | null>(null)
  const [resolutionAction, setResolutionAction] = useState('adjust_time')
  const [comment, setComment] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const activeTab = params.get('status') ?? 'all'
  const conflictType = params.get('conflict_type') ?? ''
  const riskLevel = params.get('risk_level') ?? ''
  const { data, loading, error, reload } = useApiData(
    () => apiGet<ApiList<ApiConflict>>('/conflicts', {
      status: activeTab === 'all' ? undefined : activeTab,
      conflict_type: conflictType || undefined,
      risk_level: riskLevel || undefined,
      page_size: 100,
    }),
    [activeTab, conflictType, riskLevel]
  )
  const conflicts = useMemo(() => data?.items ?? [], [data?.items])
  const selectedConflictId = params.get('conflict')
  const activeConflict = conflicts.find((conflict) => conflict.id === selectedConflictId) ?? conflicts[0]
  const stats = useMemo(() => {
    return {
      total: conflicts.length,
      high: conflicts.filter((item) => item.risk_level === 'high' || item.risk_level === 'critical').length,
      open: conflicts.filter((item) => item.status === 'open').length,
      overload: conflicts.filter((item) => item.conflict_type === 'overload').length,
    }
  }, [conflicts])

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  function openAction(type: 'resolve' | 'force', conflict: ApiConflict) {
    setActionTarget({ type, conflict })
    setResolutionAction(type === 'force' ? 'force' : 'adjust_time')
    setComment('')
    setMessage(null)
  }

  function closeAction() {
    setActionTarget(null)
    setComment('')
    setMessage(null)
  }

  async function resolve(id: string) {
    if (!comment.trim()) {
      setMessage('请填写处理说明')
      return
    }
    setActing(id)
    try {
      await apiPost(`/conflicts/${id}/resolve`, { resolution_action: resolutionAction, resolution_comment: comment.trim() })
      await reload()
      closeAction()
    } finally {
      setActing(null)
    }
  }

  async function force(id: string) {
    if (!comment.trim()) {
      setMessage('强制排期必须填写业务原因')
      return
    }
    setActing(id)
    try {
      await apiPost(`/conflicts/${id}/force`, { reason: comment.trim() })
      await reload()
      closeAction()
    } finally {
      setActing(null)
    }
  }

  function conflictTitle(conflict: ApiConflict) {
    return conflict.task_name || conflict.task_no || conflict.task_id || '冲突记录'
  }

  function personLabel(conflict: ApiConflict) {
    if (conflict.person_name) return `${conflict.person_name}${conflict.owner_org_name ? ` · ${conflict.owner_org_name}` : ''}`
    return conflict.person_id ?? '未关联人员'
  }

  function selectConflict(id: string) {
    const next = new URLSearchParams(params)
    next.set('conflict', id)
    setParams(next)
  }

  return (
    <MainLayout title="冲突中心" subtitle="负载、时间与资源冲突处理">
      <div className="flex flex-col gap-6">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}
        <div className="grid grid-cols-4 gap-5">
          <StatCard label="冲突总数" value={stats.total} sub={loading ? '加载中' : '当前筛选结果'} />
          <StatCard label="高风险" value={stats.high} />
          <StatCard label="待处理" value={stats.open} />
          <StatCard label="人员超载" value={stats.overload} />
        </div>

        <div className="flex items-center justify-between">
          <Tabs tabs={filterTabs} value={activeTab} onChange={(value) => updateFilter('status', value)} />
          <div className="flex flex-wrap items-center gap-3">
            <Select aria-label="冲突类型筛选" className="w-[170px]" value={conflictType} onChange={(event) => updateFilter('conflict_type', event.target.value)} options={conflictTypeOptions} />
            <Select aria-label="风险等级筛选" className="w-[140px]" value={riskLevel} onChange={(event) => updateFilter('risk_level', event.target.value)} options={riskOptions} />
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-4">
            {conflicts.map((conflict) => (
              <div
                key={conflict.id}
                role="button"
                tabIndex={0}
                className={`flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5 text-left transition-fast ${
                  activeConflict?.id === conflict.id ? 'ring-2 ring-primary-fill' : 'hover:bg-hover-bg'
                }`}
                onClick={() => selectConflict(conflict.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') selectConflict(conflict.id)
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge>{conflictTypeLabel(conflict.conflict_type)}</Badge>
                    <Tag variant={riskVariant(conflict.risk_level)}>{riskLabel(conflict.risk_level)}</Tag>
                  </div>
                  <Tag variant={statusVariant(conflict.status)}>{statusLabel(conflict.status)}</Tag>
                </div>

                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-text-primary">{conflictTitle(conflict)}</h3>
                  <p className="text-sm text-text-muted">
                    {formatDate(conflict.conflict_date_start)} - {formatDate(conflict.conflict_date_end)}
                    {conflict.overload_hours ? ` · 超载 ${conflict.overload_hours}h` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-sm text-text-muted">
                  <span>人员：{personLabel(conflict)}</span>
                  <span>{formatDate(conflict.created_at)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    className="h-8 px-4 text-sm"
                    disabled={acting === conflict.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      openAction('resolve', conflict)
                    }}
                  >
                    处理
                  </Button>
                  <Button
                    variant="danger"
                    className="h-8 px-4 text-sm"
                    disabled={acting === conflict.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      openAction('force', conflict)
                    }}
                  >
                    强制排期
                  </Button>
                </div>
              </div>
            ))}
            {!loading && conflicts.length === 0 && <EmptyState title="暂无冲突" desc="当前筛选下没有冲突记录。" />}
          </div>

          <Panel className="gap-5" title="风险详情" right={activeConflict && <Tag variant={statusVariant(activeConflict.status)}>{statusLabel(activeConflict.status)}</Tag>}>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-bg-tertiary p-4">
              <Mini label="全部" value={stats.total} />
              <Mini label="高风险" value={stats.high} />
              <Mini label="待处理" value={stats.open} />
            </div>
            {activeConflict && (
              <div className="flex flex-col gap-3 rounded-md border border-border-subtle p-4">
                <div className="flex items-center gap-2">
                  <Badge>{conflictTypeLabel(activeConflict.conflict_type)}</Badge>
                  <Tag variant={riskVariant(activeConflict.risk_level)}>{riskLabel(activeConflict.risk_level)}</Tag>
                </div>
                <div>
                  <div className="text-base font-semibold text-text-primary">{conflictTitle(activeConflict)}</div>
                  <div className="mt-1 text-sm text-text-muted">
                    {formatDate(activeConflict.conflict_date_start)} - {formatDate(activeConflict.conflict_date_end)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <MiniInfo label="人员" value={personLabel(activeConflict)} />
                  <MiniInfo label="超载" value={activeConflict.overload_hours ? `${activeConflict.overload_hours}h` : '无'} />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="primary" className="h-9 px-4 text-sm" disabled={acting === activeConflict.id} onClick={() => openAction('resolve', activeConflict)}>
                    处理
                  </Button>
                  <Button variant="danger" className="h-9 px-4 text-sm" disabled={acting === activeConflict.id} onClick={() => openAction('force', activeConflict)}>
                    强制排期
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-text-primary">处理说明</h4>
              <p className="text-sm leading-relaxed text-text-secondary">
                冲突数据来自后端负载与排期计算。处理会写入冲突记录状态；强制排期需要权限并写入审计日志。
              </p>
            </div>
          </Panel>
        </div>

        {actionTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="w-full max-w-[560px] rounded-lg border border-border-subtle bg-bg-primary p-5 shadow-2xl">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-text-primary">
                  {actionTarget.type === 'force' ? '确认强制排期' : '填写处理方案'}
                </h3>
                <p className="mt-1 text-sm text-text-muted">
                  {conflictTitle(actionTarget.conflict)} · {personLabel(actionTarget.conflict)}
                </p>
              </div>
              {actionTarget.type === 'resolve' ? (
                <Select label="处理动作" value={resolutionAction} onChange={(event) => setResolutionAction(event.target.value)} options={resolutionOptions} />
              ) : (
                <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm leading-relaxed text-color-error">
                  强制排期会保留冲突记录并写入审计，请确认业务上允许人员超载或时间重叠。
                </div>
              )}
              <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-text-muted">
                {actionTarget.type === 'force' ? '强制排期原因' : '处理说明'}
                <textarea
                  className="min-h-28 rounded-md border border-border-subtle bg-bg-secondary px-4 py-3 text-base text-text-primary focus:border-text-muted focus:outline-none"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={actionTarget.type === 'force' ? '说明为什么必须强制排期，以及已知风险的承担人' : '说明调整方案、沟通结论或后续跟进人'}
                />
              </label>
              {message && <div className="mt-4 rounded-md bg-color-error-bg px-3 py-2 text-sm text-color-error">{message}</div>}
              <div className="mt-5 flex justify-end gap-3 border-t border-border-subtle pt-4">
                <Button type="button" variant="secondary" className="h-10 px-4" onClick={closeAction}>
                  取消
                </Button>
                <Button
                  type="button"
                  variant={actionTarget.type === 'force' ? 'danger' : 'primary'}
                  className="h-10 px-4"
                  disabled={acting === actionTarget.conflict.id}
                  onClick={() => actionTarget.type === 'force' ? void force(actionTarget.conflict.id) : void resolve(actionTarget.conflict.id)}
                >
                  {actionTarget.type === 'force' ? '确认强制排期' : '提交处理'}
                </Button>
              </div>
            </div>
          </div>
        )}
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

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-bg-tertiary p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-text-primary">{value}</div>
    </div>
  )
}
