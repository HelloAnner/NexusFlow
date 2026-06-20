import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, ProgressBar, StatCard, Tag } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { formatDate, numberValue, riskLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { cn } from '@/lib/utils'
import { ExternalLink, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
  items: GanttItem[]
  summary: {
    in_progress?: number
    acceptance_pending?: number
    archived?: number
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
]

function dateDays(date: Date) {
  return Math.floor(date.getTime() / 86400000)
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
      target_url: '/tasks',
    }
  })
}

async function loadGantt() {
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - 30)
  const end = new Date(now)
  end.setDate(end.getDate() + 90)
  const [items, summary] = await Promise.all([
    apiGet<{ items: GanttItem[] }>('/gantt', { start: start.toISOString(), end: end.toISOString() }),
    apiGet<GanttData['summary']>('/gantt/summary'),
  ])
  return { items: items.items, summary }
}

export function GanttChartPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [dimension, setDimension] = useState('project')
  const [granularity, setGranularity] = useState('week')
  const [riskOnly, setRiskOnly] = useState(() => params.get('risk') === '1')
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)
  const [pinnedItemId, setPinnedItemId] = useState<string | null>(params.get('task_id'))
  const { data, loading, error } = useApiData(loadGantt)
  const sourceItems = data?.items ?? []
  const items = buildDimensionItems(sourceItems, dimension).filter((item) => !riskOnly || (item.risk_level && item.risk_level !== 'none'))
  const activeItem = items.find((item) => item.id === (pinnedItemId ?? hoveredItemId))

  useEffect(() => {
    const taskId = params.get('task_id')
    if (taskId && sourceItems.some((item) => item.id === taskId)) {
      setDimension('task')
      setPinnedItemId(taskId)
    }
  }, [params, sourceItems])

  const range = useMemo(() => {
    const dates = items.flatMap((item) => [clampDate(item.start), clampDate(item.end)])
    const min = dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date()
    const max = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date()
    min.setDate(min.getDate() - 7)
    max.setDate(max.getDate() + 14)
    return { min, max, days: Math.max(1, dateDays(max) - dateDays(min)) }
  }, [items])

  const ticks = useMemo(() => {
    const count = granularity === 'week' ? 12 : 6
    return Array.from({ length: count }).map((_, index) => {
      const date = new Date(range.min)
      date.setDate(range.min.getDate() + Math.round((range.days / count) * index))
      return formatDate(date.toISOString())
    })
  }, [granularity, range])

  function showItem(item: GanttItem) {
    setPinnedItemId(item.id)
  }

  function changeDimension(nextDimension: string) {
    setDimension(nextDimension)
    setPinnedItemId(null)
    setHoveredItemId(null)
  }

  function openItem(item: GanttItem) {
    const target = ganttTargetUrl(item)
    if (target) navigate(target)
  }

  return (
    <MainLayout title="甘特图" subtitle="项目与任务时间线">
      <div className="flex flex-col gap-4">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="进行中" value={data?.summary.in_progress ?? 0} />
          <StatCard label="待验收" value={data?.summary.acceptance_pending ?? 0} />
          <StatCard label="已归档" value={data?.summary.archived ?? 0} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
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
                  onClick={() => setGranularity(option.value)}
                  className={cn('rounded-sm px-3 py-1.5 text-sm transition-fast', granularity === option.value ? 'bg-primary-fill font-semibold text-primary-text' : 'text-text-muted hover:bg-hover-bg')}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setRiskOnly((value) => !value)}
            className={cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-fast', riskOnly ? 'bg-color-error-bg text-color-error' : 'text-text-muted hover:bg-hover-bg')}
          >
            <span className="h-2 w-2 rounded-full bg-color-error" />
            只看风险
          </button>
        </div>

        <div className="relative flex min-h-[520px] overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary">
          <div className="flex w-[420px] flex-col border-r border-border-subtle">
            <div className="grid h-10 grid-cols-[1fr_90px_90px_70px] items-center border-b border-border-subtle bg-bg-tertiary px-3 text-xs text-text-muted">
              <span>{dimensionLabels[dimension] ?? '任务名称'}</span><span>开始</span><span>截止</span><span>风险</span>
            </div>
            <div className="flex flex-col overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'grid h-10 grid-cols-[1fr_90px_90px_70px] items-center border-b border-border-subtle px-3 text-left text-sm transition-fast last:border-b-0 hover:bg-hover-bg',
                    activeItem?.id === item.id && 'bg-hover-bg'
                  )}
                  onClick={() => showItem(item)}
                  onMouseEnter={() => setHoveredItemId(item.id)}
                  onMouseLeave={() => setHoveredItemId(null)}
                >
                  <span className="truncate font-medium text-text-primary">{item.title}</span>
                  <span className="text-text-secondary">{formatDate(item.start)}</span>
                  <span className="text-text-secondary">{formatDate(item.end)}</span>
                  <span className="text-text-muted">{riskLabel(item.risk_level)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-auto">
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
                  <div key={item.id} className="relative h-10 border-b border-border-subtle last:border-b-0">
                    <button
                      type="button"
                      aria-label={`查看 ${item.title}`}
                      className="absolute top-1/2 h-5 -translate-y-1/2 rounded-full outline-none ring-primary-fill transition-fast hover:ring-2 focus:ring-2"
                      style={{ left: `${left}%`, width: `${width}%` }}
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
                        style={{ left: `${Math.min(left + width, 98)}%` }}
                        onClick={() => showItem(item)}
                        onMouseEnter={() => setHoveredItemId(item.id)}
                        onMouseLeave={() => setHoveredItemId(null)}
                      />
                    )}
                  </div>
                )
              })}
              {!loading && items.length === 0 && <EmptyState title="暂无甘特数据" desc="当前时间范围内没有任务。" />}
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
                <GanttInfo label="状态" value={activeItem.status ?? '未知'} />
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

function GanttInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-bg-tertiary p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 truncate font-medium text-text-primary">{value}</div>
    </div>
  )
}
