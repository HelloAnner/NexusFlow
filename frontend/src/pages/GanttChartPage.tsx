import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Input, ProgressBar, Select, Tag } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { type ApiList, type ApiOrg, type ApiPerson, type ApiProject, formatDate, numberValue, riskLabel, taskStatusLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { cn } from '@/lib/utils'
import { Download, ExternalLink, ShieldCheck, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

interface GanttItem {
  id: string
  type?: string
  title: string
  start?: string | null
  end?: string | null
  progress?: number | string | null
  status?: string
  risk_level?: string
  target_url?: string
  readonly?: boolean
  owner_id?: string | null
  owner_name?: string | null
  owner_org_id?: string | null
  owner_org_name?: string | null
  project_id?: string | null
  project_name?: string | null
  task_count?: number
}

interface GanttData {
  data_scope_applied?: boolean
  items: GanttItem[]
  summary: {
    data_scope_applied?: boolean
    in_progress?: number
    acceptance_pending?: number
    archived?: number
    open_risk?: number
  }
}

const dimensionTabs = [
  { value: 'task', label: '任务' },
  { value: 'person', label: '人员' },
  { value: 'department', label: '部门' },
  { value: 'project', label: '项目' },
]

const dimensionLabels: Record<string, string> = {
  task: '任务名称',
  person: '负责人',
  department: '所属部门',
  project: '所属项目',
}

const riskScore: Record<string, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const granularityOptions = [
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'quarter', label: '季' },
]

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'in_progress', label: '进行中' },
  { value: 'pending_acceptance', label: '待验收' },
  { value: 'acceptance_pending', label: '待验收' },
  { value: 'paused', label: '已暂停' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
]

function dateDays(date: Date) {
  return Math.floor(date.getTime() / 86400000)
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function isoDateTime(date: Date) {
  return date.toISOString()
}

function defaultStart() {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return isoDate(date)
}

function defaultEnd() {
  const date = new Date()
  date.setDate(date.getDate() + 90)
  return isoDate(date)
}

function clampDate(value?: string | null) {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function ganttTargetUrl(item: GanttItem) {
  const taskMatch = item.target_url?.match(/^\/tasks\/([^/?#]+)/)
  if (taskMatch?.[1]) return `/tasks?task=${encodeURIComponent(taskMatch[1])}`
  if (item.target_url?.startsWith('/')) return item.target_url
  if (item.type === 'task') return `/tasks?task=${encodeURIComponent(item.id)}`
  return ''
}

function riskVariant(level?: string) {
  if (level === 'critical' || level === 'high') return 'error'
  if (level === 'medium') return 'warning'
  if (level === 'low') return 'info'
  return 'success'
}

function maxRisk(items: GanttItem[]) {
  return items.reduce((current, item) => {
    const currentScore = riskScore[current] ?? 0
    const next = item.risk_level ?? 'none'
    return (riskScore[next] ?? 0) > currentScore ? next : current
  }, 'none')
}

function buildDimensionItems(items: GanttItem[], dimension: string) {
  if (dimension === 'task') return items

  const groups = new Map<string, { title: string; type: string; items: GanttItem[] }>()
  items.forEach((item) => {
    const key =
      dimension === 'project'
        ? item.project_id ?? 'unassigned-project'
        : dimension === 'person'
          ? item.owner_id ?? 'unassigned-person'
          : item.owner_org_id ?? 'unassigned-department'
    const title =
      dimension === 'project'
        ? item.project_name ?? '未关联项目'
        : dimension === 'person'
          ? item.owner_name ?? '未设置负责人'
          : item.owner_org_name ?? '未设置部门'
    if (!groups.has(key)) groups.set(key, { title, type: dimension, items: [] })
    groups.get(key)?.items.push(item)
  })

  return Array.from(groups.entries()).map(([key, group]) => {
    const starts = group.items.map((item) => clampDate(item.start))
    const ends = group.items.map((item) => clampDate(item.end))
    const progress = group.items.reduce((sum, item) => sum + numberValue(item.progress), 0) / Math.max(group.items.length, 1)
    return {
      id: `${dimension}:${key}`,
      type: group.type,
      title: group.title,
      start: new Date(Math.min(...starts.map((date) => date.getTime()))).toISOString(),
      end: new Date(Math.max(...ends.map((date) => date.getTime()))).toISOString(),
      progress,
      status: `${group.items.length} 个任务`,
      risk_level: maxRisk(group.items),
      readonly: true,
      task_count: group.items.length,
      target_url: dimension === 'project' && key !== 'unassigned-project' ? `/projects/${key}` : '/tasks',
    }
  })
}

function queryValue(params: URLSearchParams, key: string) {
  const value = params.get(key)
  return value && value.trim() ? value : ''
}

function buildApiQuery(params: URLSearchParams) {
  const start = queryValue(params, 'start') || defaultStart()
  const end = queryValue(params, 'end') || defaultEnd()
  const riskOnly = params.get('risk') === '1'
  return {
    start: isoDateTime(new Date(`${start}T00:00:00`)),
    end: isoDateTime(new Date(`${end}T23:59:59`)),
    project_id: queryValue(params, 'project_id') || undefined,
    owner_id: queryValue(params, 'owner_id') || undefined,
    org_id: queryValue(params, 'org_id') || undefined,
    status: queryValue(params, 'status') || undefined,
    risk_only: riskOnly ? '1' : undefined,
  }
}

async function loadGantt(params: URLSearchParams) {
  const query = buildApiQuery(params)
  const [items, summary] = await Promise.all([
    apiGet<{ data_scope_applied?: boolean; items: GanttItem[] }>('/gantt', query),
    apiGet<GanttData['summary']>('/gantt/summary', query),
  ])
  return { data_scope_applied: items.data_scope_applied, items: items.items, summary }
}

async function loadFilterOptions() {
  const [people, projects, orgs] = await Promise.all([
    apiGet<ApiList<ApiPerson>>('/users', { page_size: 200 }),
    apiGet<ApiList<ApiProject>>('/projects', { page_size: 200 }),
    apiGet<ApiList<ApiOrg>>('/orgs/tree'),
  ])
  return { people: people.items, projects: projects.items, orgs: orgs.items }
}

function downloadJson(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function GanttChartPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filterKey = params.toString()
  const requestedTaskId = params.get('task_id')
  const dimension = requestedTaskId ? 'task' : queryValue(params, 'dimension') || 'project'
  const granularity = queryValue(params, 'granularity') || 'week'
  const riskOnly = params.get('risk') === '1'
  const startDate = queryValue(params, 'start') || defaultStart()
  const endDate = queryValue(params, 'end') || defaultEnd()
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)
  const [pinnedItemId, setPinnedItemId] = useState<string | null>(requestedTaskId)
  const [message, setMessage] = useState<string | null>(null)
  const { data, loading, error } = useApiData(() => loadGantt(params), [filterKey])
  const optionState = useApiData(loadFilterOptions, [])
  const people = optionState.data?.people ?? []
  const projects = optionState.data?.projects ?? []
  const orgs = optionState.data?.orgs ?? []
  const sourceItems = data?.items ?? []
  const items = buildDimensionItems(sourceItems, dimension).filter((item) => !riskOnly || (item.risk_level && item.risk_level !== 'none'))
  const activeItem = items.find((item) => item.id === (pinnedItemId ?? hoveredItemId))
  const dataScopeApplied = data?.data_scope_applied === true && data.summary?.data_scope_applied === true

  const range = useMemo(() => {
    const dates = items.flatMap((item) => [clampDate(item.start), clampDate(item.end)])
    const min = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date(`${startDate}T00:00:00`)
    const max = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date(`${endDate}T00:00:00`)
    min.setDate(min.getDate() - 7)
    max.setDate(max.getDate() + 14)
    return { min, max, days: Math.max(1, dateDays(max) - dateDays(min)) }
  }, [endDate, items, startDate])

  const ticks = useMemo(() => {
    const count = granularity === 'quarter' ? 4 : granularity === 'month' ? 6 : 12
    return Array.from({ length: count }).map((_, index) => {
      const date = new Date(range.min)
      date.setDate(range.min.getDate() + Math.round((range.days / count) * index))
      return formatDate(date.toISOString())
    })
  }, [granularity, range])

  function updateParams(update: (next: URLSearchParams) => void, clearPin = true) {
    const next = new URLSearchParams(params)
    update(next)
    if (clearPin) next.delete('task_id')
    setParams(next)
  }

  function setFilter(key: string, value: string) {
    updateParams((next) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    setMessage(null)
    setPinnedItemId(null)
    setHoveredItemId(null)
  }

  function changeDimension(nextDimension: string) {
    setFilter('dimension', nextDimension)
  }

  function showItem(item: GanttItem) {
    setPinnedItemId(item.id)
  }

  function openItem(item: GanttItem) {
    const target = ganttTargetUrl(item)
    if (target) navigate(target)
  }

  function exportCurrentView() {
    const generatedAt = new Date().toISOString()
    const fileName = `nexusflow-schedule-gantt-${generatedAt.slice(0, 10)}.json`
    downloadJson(fileName, {
      generated_at: generatedAt,
      filters: {
        start: startDate,
        end: endDate,
        project_id: queryValue(params, 'project_id') || null,
        owner_id: queryValue(params, 'owner_id') || null,
        org_id: queryValue(params, 'org_id') || null,
        status: queryValue(params, 'status') || null,
        risk_only: riskOnly,
      },
      dimension,
      granularity,
      data_scope_applied: dataScopeApplied,
      summary: data?.summary ?? null,
      items,
    })
    setMessage(`已导出 ${fileName}`)
  }

  return (
    <MainLayout title="排程" subtitle="项目与任务时间线">
      <div className="flex h-full min-h-0 flex-col gap-4">
        {(error || message) && (
          <div className={error ? 'rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error' : 'rounded-md bg-color-success-bg px-4 py-3 text-sm text-color-success'}>
            {error || message}
          </div>
        )}

        <div className="grid gap-3 rounded-md border border-border-subtle bg-bg-secondary p-3 xl:grid-cols-[1fr_auto]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Input label="开始日期" type="date" value={startDate} onChange={(event) => setFilter('start', event.target.value)} />
            <Input label="结束日期" type="date" value={endDate} onChange={(event) => setFilter('end', event.target.value)} />
            <Select
              label="项目"
              value={queryValue(params, 'project_id')}
              onChange={(event) => setFilter('project_id', event.target.value)}
              options={[{ value: '', label: '全部项目' }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
            />
            <Select
              label="负责人"
              value={queryValue(params, 'owner_id')}
              onChange={(event) => setFilter('owner_id', event.target.value)}
              options={[{ value: '', label: '全部负责人' }, ...people.map((person) => ({ value: person.id, label: person.name }))]}
            />
            <Select
              label="组织"
              value={queryValue(params, 'org_id')}
              onChange={(event) => setFilter('org_id', event.target.value)}
              options={[{ value: '', label: '全部组织' }, ...orgs.map((org) => ({ value: org.id, label: org.name }))]}
            />
            <Select label="状态" value={queryValue(params, 'status')} onChange={(event) => setFilter('status', event.target.value)} options={statusOptions} />
          </div>
          <div className="flex flex-wrap items-end justify-end gap-2">
            <Button
              variant={riskOnly ? 'danger' : 'secondary'}
              className="h-10 px-3"
              onClick={() => setFilter('risk', riskOnly ? '' : '1')}
            >
              只看风险
            </Button>
            <Button variant="secondary" className="h-10 px-3" onClick={() => setParams(new URLSearchParams())}>
              清空筛选
            </Button>
            <Button className="h-10 px-3" onClick={exportCurrentView}>
              <Download className="h-4 w-4" />
              导出 JSON
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <ScheduleMetric label="进行中" value={numberValue(data?.summary?.in_progress)} />
          <ScheduleMetric label="待验收" value={numberValue(data?.summary?.acceptance_pending)} />
          <ScheduleMetric label="开放风险" value={numberValue(data?.summary?.open_risk)} />
          <ScheduleMetric label="已归档" value={numberValue(data?.summary?.archived)} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-1 rounded-md bg-bg-secondary p-1">
              {dimensionTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => changeDimension(tab.value)}
                  className={cn('rounded-sm px-4 py-1.5 text-sm transition-fast', dimension === tab.value ? 'bg-primary-fill font-semibold text-primary-text' : 'text-text-muted hover:bg-hover-bg')}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-1 rounded-md bg-bg-secondary p-1">
              {granularityOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFilter('granularity', option.value)}
                  className={cn('rounded-sm px-3 py-1.5 text-sm transition-fast', granularity === option.value ? 'bg-primary-fill font-semibold text-primary-text' : 'text-text-muted hover:bg-hover-bg')}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-bg-secondary px-3 py-2 text-sm text-text-muted">
            <ShieldCheck className={cn('h-4 w-4', dataScopeApplied ? 'text-color-success' : 'text-color-warning')} />
            {dataScopeApplied ? '服务器已应用当前账号数据范围' : '等待服务器权限口径'}
            <Badge>{loading ? '加载中' : `${items.length} 条`}</Badge>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-md border border-border-subtle bg-bg-secondary">
          <div className="flex w-[320px] shrink-0 flex-col border-r border-border-subtle bg-bg-tertiary">
            <div className="grid h-10 grid-cols-[1fr_64px_64px_48px] items-center border-b border-border-subtle bg-bg-tertiary px-3 text-xs text-text-muted">
              <span>{dimensionLabels[dimension] ?? '任务名称'}</span><span>开始</span><span>截止</span><span>风险</span>
            </div>
            <div className="flex flex-col overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'grid h-12 grid-cols-[1fr_64px_64px_48px] items-center border-b border-border-subtle px-3 text-left text-sm transition-fast last:border-b-0 hover:bg-hover-bg',
                    activeItem?.id === item.id && 'bg-hover-bg'
                  )}
                  onClick={() => showItem(item)}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId(null)}
                >
                  <span className="truncate font-medium text-text-primary">{item.title}</span>
                  <span className="truncate text-xs text-text-secondary">{formatDate(item.start)}</span>
                  <span className="truncate text-xs text-text-secondary">{formatDate(item.end)}</span>
                  <span className="truncate text-xs text-text-muted">{riskLabel(item.risk_level)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col overflow-auto">
            <div className="grid h-10 shrink-0 border-b border-border-subtle bg-bg-tertiary" style={{ gridTemplateColumns: `repeat(${ticks.length}, minmax(90px, 1fr))` }}>
              {ticks.map((tick) => (
                <div key={tick} className="flex items-center justify-center border-r border-border-subtle text-xs text-text-muted last:border-r-0">{tick}</div>
              ))}
            </div>
            <div className="relative flex flex-col">
              {items.map((item) => {
                const start = clampDate(item.start)
                const end = clampDate(item.end)
                const left = ((dateDays(start) - dateDays(range.min)) / range.days) * 100
                const width = Math.max(((dateDays(end) - dateDays(start)) / range.days) * 100, 1)
                const progress = numberValue(item.progress)
                return (
                  <div key={item.id} className="relative h-12 border-b border-border-subtle last:border-b-0">
                    <button
                      type="button"
                      aria-label={`查看 ${item.title}`}
                      className="absolute top-1/2 h-5 -translate-y-1/2 rounded-full outline-none ring-primary-fill transition-fast hover:ring-2 focus:ring-2"
                      style={{ left: `${Math.max(0, Math.min(98, left))}%`, width: `${Math.max(1, Math.min(100, width))}%` }}
                      onClick={() => showItem(item)}
                      onMouseEnter={() => setHoveredItemId(item.id)}
                      onMouseLeave={() => setHoveredItemId(null)}
                    >
                      <span className="block h-3 w-full rounded-full bg-bg-tertiary" />
                      <span className="absolute left-0 top-1 h-3 rounded-full bg-primary-fill" style={{ width: `${Math.min(100, progress)}%` }} />
                    </button>
                    {item.risk_level && item.risk_level !== 'none' && (
                      <button
                        type="button"
                        aria-label={`查看 ${item.title} 风险`}
                        className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-color-error ring-2 ring-bg-secondary transition-fast hover:scale-110 focus:outline-none focus:ring-primary-fill"
                        style={{ left: `${Math.min(Math.max(left + width, 0), 98)}%` }}
                        onClick={() => showItem(item)}
                        onMouseEnter={() => setHoveredItemId(item.id)}
                        onMouseLeave={() => setHoveredItemId(null)}
                      />
                    )}
                  </div>
                )
              })}
              {!loading && items.length === 0 && <EmptyState title="暂无甘特数据" desc="当前筛选下没有任务。" />}
            </div>
          </div>
          {activeItem && (
            <div
              className="absolute right-4 top-14 z-20 w-[340px] rounded-lg border border-border-subtle bg-bg-primary p-4 shadow-2xl"
              onMouseEnter={() => setHoveredItemId(activeItem.id)}
              onMouseLeave={() => setHoveredItemId(null)}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge>{dimensionTabs.find((tab) => tab.value === activeItem.type)?.label ?? '任务'}</Badge>
                    <Tag variant={riskVariant(activeItem.risk_level)}>{riskLabel(activeItem.risk_level)}</Tag>
                  </div>
                  <h3 className="truncate text-base font-semibold text-text-primary">{activeItem.title}</h3>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-hover-bg hover:text-text-primary"
                  aria-label="关闭悬浮详情"
                  onClick={() => {
                    setPinnedItemId(null)
                    setHoveredItemId(null)
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <GanttInfo label="开始" value={formatDate(activeItem.start)} />
                <GanttInfo label="截止" value={formatDate(activeItem.end)} />
                <GanttInfo label="状态" value={activeItem.type === 'task' ? taskStatusLabel(activeItem.status) : activeItem.status ?? '未知'} />
                <GanttInfo label={activeItem.type === 'task' ? '只读' : '任务数'} value={activeItem.type === 'task' ? (activeItem.readonly ? '是' : '否') : `${activeItem.task_count ?? 0} 个`} />
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm text-text-muted">
                  <span>进度</span>
                  <span>{Math.round(numberValue(activeItem.progress))}%</span>
                </div>
                <ProgressBar value={numberValue(activeItem.progress)} className="h-1.5" />
              </div>
              <div className="mt-4 flex justify-end">
                <Button className="h-9 px-3 py-0 text-sm" disabled={!ganttTargetUrl(activeItem)} onClick={() => openItem(activeItem)}>
                  <ExternalLink className="h-4 w-4" />
                  打开详情
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  )
}

function ScheduleMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-secondary px-4 py-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold text-text-primary">{value}</div>
    </div>
  )
}

function GanttInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-bg-tertiary p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 truncate font-medium text-text-primary">{value}</div>
    </div>
  )
}
