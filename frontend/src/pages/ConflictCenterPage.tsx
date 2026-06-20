import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, LoadIndicator, Panel, Select, StatCard, Tabs, Tag } from '@/components/ui'
import { apiGet, apiPost } from '@/lib/api'
import { type ApiConflict, type ApiConflictDetail, type ApiList, conflictTypeLabel, formatDate, formatDateTime, numberValue, riskLabel, riskVariant, taskStatusLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { CalendarDays, ExternalLink } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

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
  const [bulkAction, setBulkAction] = useState<'resolve' | 'force' | null>(null)
  const [resolutionAction, setResolutionAction] = useState('adjust_time')
  const [bulkResolutionAction, setBulkResolutionAction] = useState('resolved')
  const [comment, setComment] = useState('')
  const [bulkComment, setBulkComment] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [bulkMessage, setBulkMessage] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
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
  const selectedConflicts = useMemo(() => conflicts.filter((conflict) => selectedIds.includes(conflict.id)), [conflicts, selectedIds])
  const selectedHighCount = selectedConflicts.filter((conflict) => conflict.risk_level === 'high' || conflict.risk_level === 'critical').length
  const selectedConflictId = params.get('conflict')
  const activeConflict = conflicts.find((conflict) => conflict.id === selectedConflictId) ?? conflicts[0]
  const conflictDetailState = useApiData<ApiConflictDetail | null>(
    async () => activeConflict?.id ? apiGet<ApiConflictDetail>(`/conflicts/${activeConflict.id}`) : null,
    [activeConflict?.id ?? '']
  )
  const activeDetail = (conflictDetailState.data ?? activeConflict) as ApiConflictDetail | undefined
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
    next.delete('conflict')
    setSelectedIds([])
    setParams(next)
  }

  function applyMetricFilter(metric: 'all' | 'high' | 'open' | 'overload') {
    const next = new URLSearchParams(params)
    next.delete('conflict')
    if (metric === 'all') {
      next.delete('status')
      next.delete('risk_level')
      next.delete('conflict_type')
    }
    if (metric === 'high') next.set('risk_level', 'high')
    if (metric === 'open') next.set('status', 'open')
    if (metric === 'overload') next.set('conflict_type', 'overload')
    setSelectedIds([])
    setParams(next)
  }

  function openAction(type: 'resolve' | 'force', conflict: ApiConflict) {
    setActionTarget({ type, conflict })
    setResolutionAction(type === 'force' ? 'force' : 'adjust_time')
    setComment('')
    setMessage(null)
  }

  function openBulkAction(type: 'resolve' | 'force') {
    if (selectedConflicts.length === 0) return
    setBulkAction(type)
    setBulkResolutionAction(type === 'force' ? 'force' : 'resolved')
    setBulkComment('')
    setBulkMessage(null)
  }

  function closeAction() {
    setActionTarget(null)
    setComment('')
    setMessage(null)
  }

  function closeBulkAction() {
    setBulkAction(null)
    setBulkComment('')
    setBulkMessage(null)
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current.concat(id))
  }

  function toggleAllVisible() {
    const visibleIds = conflicts.map((conflict) => conflict.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
    setSelectedIds((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set(current.concat(visibleIds))))
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
      await conflictDetailState.reload()
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
      await conflictDetailState.reload()
      closeAction()
    } finally {
      setActing(null)
    }
  }

  async function submitBulkAction() {
    if (!bulkAction) return
    if (!bulkComment.trim()) {
      setBulkMessage(bulkAction === 'force' ? '批量强制排期必须填写业务原因' : '请填写统一处理说明')
      return
    }
    setActing(`bulk-${bulkAction}`)
    setBulkMessage(null)
    const failures: string[] = []
    for (const conflict of selectedConflicts) {
      try {
        if (bulkAction === 'force') await apiPost(`/conflicts/${conflict.id}/force`, { reason: bulkComment.trim() })
        else await apiPost(`/conflicts/${conflict.id}/resolve`, { resolution_action: bulkResolutionAction, resolution_comment: bulkComment.trim() })
      } catch (err) {
        failures.push(err instanceof Error ? err.message : `${conflict.id} 处理失败`)
      }
    }
    if (failures.length > 0) {
      setBulkMessage(`${failures.length} 条处理失败：${failures[0]}`)
      setActing(null)
      return
    }
    await reload()
    await conflictDetailState.reload()
    setSelectedIds([])
    closeBulkAction()
    setActing(null)
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
          <button type="button" className="w-full text-left" onClick={() => applyMetricFilter('all')}>
            <StatCard label="冲突总数" value={stats.total} sub={loading ? '加载中' : '点击清除筛选'} />
          </button>
          <button type="button" className="w-full text-left" onClick={() => applyMetricFilter('high')}>
            <StatCard label="高风险" value={stats.high} sub="点击筛选高风险" />
          </button>
          <button type="button" className="w-full text-left" onClick={() => applyMetricFilter('open')}>
            <StatCard label="待处理" value={stats.open} sub="点击筛选待处理" />
          </button>
          <button type="button" className="w-full text-left" onClick={() => applyMetricFilter('overload')}>
            <StatCard label="人员超载" value={stats.overload} sub="点击筛选超载" />
          </button>
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
            {selectedConflicts.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-text-primary bg-bg-secondary px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-black"
                    checked
                    aria-label="清空当前选择"
                    onChange={() => setSelectedIds([])}
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-text-primary">已选 {selectedConflicts.length} 条冲突</span>
                    <span className="text-xs text-text-muted">高风险 {selectedHighCount} 条，批量动作将顺序调用现有接口。</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" className="h-8 px-3 text-sm" onClick={() => openBulkAction('resolve')}>
                    批量标记已解决
                  </Button>
                  <Button variant="danger" className="h-8 px-3 text-sm" onClick={() => openBulkAction('force')}>
                    批量强制排期
                  </Button>
                  <Button variant="ghost" className="h-8 px-3 text-sm" onClick={() => setSelectedIds([])}>
                    清空选择
                  </Button>
                </div>
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-secondary px-4 py-2">
                <label className="flex items-center gap-2 text-sm text-text-muted">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-black"
                    checked={conflicts.length > 0 && conflicts.every((conflict) => selectedIds.includes(conflict.id))}
                    onChange={toggleAllVisible}
                  />
                  选择当前筛选下 {conflicts.length} 条
                </label>
                <span className="text-xs text-text-muted">批量处理失败时会保留选择和说明。</span>
              </div>
            )}

            {conflicts.map((conflict) => {
              const isSelected = selectedIds.includes(conflict.id)
              return (
                <div
                  key={conflict.id}
                  role="button"
                  tabIndex={0}
                  className={`flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5 text-left transition-fast ${
                    activeConflict?.id === conflict.id ? 'ring-2 ring-primary-fill' : isSelected ? 'bg-color-info-bg' : 'hover:bg-hover-bg'
                  }`}
                  onClick={() => selectConflict(conflict.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') selectConflict(conflict.id)
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-black"
                        checked={isSelected}
                        aria-label={`选择冲突 ${conflictTitle(conflict)}`}
                        onChange={() => toggleSelected(conflict.id)}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Badge>{conflictTypeLabel(conflict.conflict_type)}</Badge>
                          <Tag variant={riskVariant(conflict.risk_level)}>{riskLabel(conflict.risk_level)}</Tag>
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
                      </div>
                    </div>
                    <Tag variant={statusVariant(conflict.status)}>{statusLabel(conflict.status)}</Tag>
                  </div>

                  <div className="flex items-center gap-2 pl-7">
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
              )
            })}
            {!loading && conflicts.length === 0 && <EmptyState title="暂无冲突" desc="当前筛选下没有冲突记录。" />}
          </div>

          <Panel className="gap-5" title="风险详情" right={activeDetail && <Tag variant={statusVariant(activeDetail.status)}>{statusLabel(activeDetail.status)}</Tag>}>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-bg-tertiary p-4">
              <Mini label="全部" value={stats.total} />
              <Mini label="高风险" value={stats.high} />
              <Mini label="待处理" value={stats.open} />
            </div>
            {conflictDetailState.error && <div className="rounded-md bg-color-error-bg px-3 py-2 text-sm text-color-error">{conflictDetailState.error}</div>}
            {activeDetail && (
              <div className="flex flex-col gap-3 rounded-md border border-border-subtle p-4">
                <div className="flex items-center gap-2">
                  <Badge>{conflictTypeLabel(activeDetail.conflict_type)}</Badge>
                  <Tag variant={riskVariant(activeDetail.risk_level)}>{riskLabel(activeDetail.risk_level)}</Tag>
                </div>
                <div>
                  <div className="text-base font-semibold text-text-primary">{conflictTitle(activeDetail)}</div>
                  <div className="mt-1 text-sm text-text-muted">
                    {formatDate(activeDetail.conflict_date_start)} - {formatDate(activeDetail.conflict_date_end)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <MiniInfo label="人员" value={personLabel(activeDetail)} />
                  <MiniInfo label="超载" value={activeDetail.overload_hours ? `${activeDetail.overload_hours}h` : '无'} />
                  <MiniInfo label="任务状态" value={taskStatusLabel(activeDetail.task?.status ?? activeDetail.status)} />
                  <MiniInfo label="创建时间" value={formatDateTime(activeDetail.created_at)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeDetail.task_id && (
                    <Link className="inline-flex h-9 items-center gap-2 rounded-md bg-bg-tertiary px-3 text-sm text-text-muted hover:bg-hover-bg hover:text-text-primary" to={`/tasks/${activeDetail.task_id}`}>
                      <ExternalLink className="h-4 w-4" />任务
                    </Link>
                  )}
                  {activeDetail.person_id && (
                    <Link className="inline-flex h-9 items-center gap-2 rounded-md bg-bg-tertiary px-3 text-sm text-text-muted hover:bg-hover-bg hover:text-text-primary" to={`/people/${activeDetail.person_id}#workload`}>
                      <ExternalLink className="h-4 w-4" />人员负载
                    </Link>
                  )}
                  <Link className="inline-flex h-9 items-center gap-2 rounded-md bg-bg-tertiary px-3 text-sm text-text-muted hover:bg-hover-bg hover:text-text-primary" to={`/gantt?risk=1${activeDetail.task_id ? `&task_id=${activeDetail.task_id}` : ''}`}>
                    <CalendarDays className="h-4 w-4" />甘特风险
                  </Link>
                </div>
                <div className="rounded-md bg-bg-tertiary p-3">
                  <div className="mb-2 text-sm font-semibold text-text-primary">推荐动作与预计影响</div>
                  <div className="flex flex-col gap-2">
                    {buildSuggestions(activeDetail).map((suggestion) => (
                      <div key={suggestion.title} className="rounded-sm bg-bg-secondary px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-text-primary">{suggestion.title}</div>
                          <Badge>{suggestion.entry}</Badge>
                        </div>
                        <div className="mt-1 text-xs leading-5 text-text-muted">{suggestion.desc}</div>
                        <div className="mt-2 rounded-sm bg-bg-tertiary px-2 py-1 text-xs text-text-secondary">{suggestion.impact}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {(activeDetail.related_workload?.length ?? 0) > 0 && (
                  <div>
                    <div className="mb-2 text-sm font-semibold text-text-primary">相关负载窗口</div>
                    <div className="grid grid-cols-2 gap-2">
                      {activeDetail.related_workload?.slice(0, 8).map((day) => (
                        <div key={day.date} className="rounded-md bg-bg-tertiary p-2 text-xs">
                          <div className="flex items-center justify-between text-text-secondary">
                            <span>{formatDate(day.date)}</span>
                            <span>{numberValue(day.committed_hours)}h / {numberValue(day.standard_hours, 8)}h</span>
                          </div>
                          <LoadIndicator className="mt-2 w-full" value={Math.round(numberValue(day.load_rate) * 100)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(activeDetail.events?.length ?? 0) > 0 && (
                  <div>
                    <div className="mb-2 text-sm font-semibold text-text-primary">处理时间线</div>
                    <div className="flex flex-col gap-2">
                      {activeDetail.events?.map((event) => (
                        <div key={event.id} className="rounded-md bg-bg-tertiary px-3 py-2 text-xs">
                          <div className="font-medium text-text-primary">{event.event_type ?? '事件'}</div>
                          <div className="mt-1 text-text-muted">{event.actor_name ?? '系统'} · {formatDateTime(event.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {activeDetail.resolution_comment && (
                  <div className="rounded-md bg-bg-tertiary p-3 text-sm leading-6 text-text-secondary">
                    <span className="font-medium text-text-primary">处理说明：</span>{activeDetail.resolution_comment}
                  </div>
                )}
                {activeDetail.payload && Object.keys(activeDetail.payload).length > 0 && (
                  <details className="rounded-md bg-bg-tertiary p-3 text-xs text-text-secondary">
                    <summary className="cursor-pointer text-sm font-medium text-text-primary">原始冲突数据</summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(activeDetail.payload, null, 2)}</pre>
                  </details>
                )}
                <div className="flex items-center gap-2">
                  <Button variant="primary" className="h-9 px-4 text-sm" disabled={acting === activeDetail.id} onClick={() => openAction('resolve', activeDetail)}>
                    处理
                  </Button>
                  <Button variant="danger" className="h-9 px-4 text-sm" disabled={acting === activeDetail.id} onClick={() => openAction('force', activeDetail)}>
                    强制排期
                  </Button>
                </div>
              </div>
            )}
            {!activeDetail && <EmptyState title="选择一条冲突" desc="查看冲突详情、处理建议和相关负载。" />}
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

        {bulkAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
            <div className="w-full max-w-[560px] rounded-lg border border-border-subtle bg-bg-primary p-5 shadow-2xl">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-text-primary">
                  {bulkAction === 'force' ? '批量强制排期' : '批量标记已解决'}
                </h3>
                <p className="mt-1 text-sm text-text-muted">
                  将对 {selectedConflicts.length} 条冲突顺序调用 {bulkAction === 'force' ? 'force' : 'resolve'} 接口；高风险 {selectedHighCount} 条。
                </p>
              </div>
              {bulkAction === 'resolve' ? (
                <Select label="处理动作" value={bulkResolutionAction} onChange={(event) => setBulkResolutionAction(event.target.value)} options={resolutionOptions} />
              ) : (
                <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm leading-relaxed text-color-error">
                  批量强制排期会写入审计，并保留风险处理痕迹。请确认业务上允许这些人员超载或时间重叠。
                </div>
              )}
              <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-text-muted">
                {bulkAction === 'force' ? '统一业务原因' : '统一处理说明'}
                <textarea
                  className="min-h-28 rounded-md border border-border-subtle bg-bg-secondary px-4 py-3 text-base text-text-primary focus:border-text-muted focus:outline-none"
                  value={bulkComment}
                  onChange={(event) => setBulkComment(event.target.value)}
                  placeholder={bulkAction === 'force' ? '说明为什么必须批量强制排期，以及已知风险的承担人' : '说明统一处理方案、沟通结论或后续跟进人'}
                />
              </label>
              <div className="mt-4 rounded-md bg-color-info-bg px-4 py-3 text-sm leading-relaxed text-color-info">
                如果部分处理失败，将保留当前选择和说明，并展示后端错误，便于修正后重试。
              </div>
              {bulkMessage && <div className="mt-4 rounded-md bg-color-error-bg px-3 py-2 text-sm text-color-error">{bulkMessage}</div>}
              <div className="mt-5 flex justify-end gap-3 border-t border-border-subtle pt-4">
                <Button type="button" variant="secondary" className="h-10 px-4" onClick={closeBulkAction}>
                  取消
                </Button>
                <Button
                  type="button"
                  variant={bulkAction === 'force' ? 'danger' : 'primary'}
                  className="h-10 px-4"
                  disabled={acting === `bulk-${bulkAction}` || selectedConflicts.length === 0}
                  onClick={() => void submitBulkAction()}
                >
                  {acting === `bulk-${bulkAction}` ? '处理中...' : bulkAction === 'force' ? `确认强制 ${selectedConflicts.length} 条` : `提交 ${selectedConflicts.length} 条处理`}
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

function buildSuggestions(conflict: ApiConflictDetail) {
  const type = conflict.conflict_type
  const overload = numberValue(conflict.overload_hours)
  const taskName = conflict.task?.name ?? conflict.task_name ?? '相关任务'
  if (type === 'full_day_overlap' || type === 'all_day_overlap') {
    return [
      { title: '拆分全天占用', desc: `检查 ${taskName} 是否必须全天占用；若不是重点任务，改为每日小时投入。`, impact: '预计新增冲突 0；需要负责人确认；影响任务详情和甘特图。', entry: '任务详情' },
      { title: '调整日期窗口', desc: '优先移动开始或截止日期，避开同一人员已经全天占用的日期。', impact: '预计新增冲突 0；无需审批；影响甘特风险视图。', entry: '甘特' },
      { title: '升级协调', desc: '如果必须保持全天占用，发起部门负责人协调并记录强制排期原因。', impact: '预计新增冲突保持 1；需要审批；影响 Inbox 和审批中心。', entry: '审批' },
    ]
  }
  if (type === 'overload') {
    return [
      { title: '下调每日投入', desc: overload ? `当前超载约 ${overload} 小时，优先降低每日投入或拆分到多人。` : '优先降低每日投入或拆分到多人。', impact: '预计新增冲突 0；需要负责人确认；影响任务详情工时。', entry: '任务详情' },
      { title: '更换执行人员', desc: '查看人员负载页，选择同技能且窗口内有余量的候选人。', impact: '预计新增冲突 0；可能需要跨部门审批；影响人员负载和 Inbox。', entry: '人员负载' },
      { title: '调整任务排期', desc: '打开甘特图查看相邻任务，延后低优先级任务或缩短重叠窗口。', impact: '预计新增冲突 0；无需审批；影响甘特和相关任务。', entry: '甘特' },
    ]
  }
  if (type === 'unavailable') {
    return [
      { title: '确认人员状态', desc: '先确认人员是否出差、请假或已停用。', impact: '预计新增冲突 0；需要人员管理员确认；影响人员详情。', entry: '人员详情' },
      { title: '替换人员', desc: '优先选择同项目成员，避免新增跨部门协调成本。', impact: '预计新增冲突 0；可能需要负责人确认；影响任务分工。', entry: '任务详情' },
    ]
  }
  return [
    { title: '检查任务时间', desc: '打开任务详情核对开始、截止时间和成员分工。', impact: '预计新增冲突未知；需要负责人确认；影响任务详情。', entry: '任务详情' },
    { title: '查看甘特风险', desc: '使用甘特图确认冲突是否影响同项目或同人员的其他任务。', impact: '预计新增冲突未知；无需审批；影响甘特风险视图。', entry: '甘特' },
  ]
}
