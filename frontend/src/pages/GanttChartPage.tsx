import { MainLayout } from '@/components/layout'
import { EmptyState, StatCard } from '@/components/ui'
import { apiGet } from '@/lib/api'
import { formatDate, numberValue, riskLabel } from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { cn } from '@/lib/utils'
import { useMemo, useState } from 'react'

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
  const [dimension, setDimension] = useState('project')
  const [granularity, setGranularity] = useState('week')
  const [riskOnly, setRiskOnly] = useState(false)
  const { data, loading, error } = useApiData(loadGantt)
  const items = (data?.items ?? []).filter((item) => !riskOnly || (item.risk_level && item.risk_level !== 'none'))

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
                  onClick={() => setDimension(tab.value)}
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

        <div className="flex min-h-[520px] overflow-hidden rounded-lg border border-border-subtle bg-bg-secondary">
          <div className="flex w-[420px] flex-col border-r border-border-subtle">
            <div className="grid h-10 grid-cols-[1fr_90px_90px_70px] items-center border-b border-border-subtle bg-bg-tertiary px-3 text-xs text-text-muted">
              <span>任务名称</span><span>开始</span><span>截止</span><span>风险</span>
            </div>
            <div className="flex flex-col overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="grid h-10 grid-cols-[1fr_90px_90px_70px] items-center border-b border-border-subtle px-3 text-sm last:border-b-0 hover:bg-hover-bg">
                  <span className="truncate font-medium text-text-primary">{item.title}</span>
                  <span className="text-text-secondary">{formatDate(item.start)}</span>
                  <span className="text-text-secondary">{formatDate(item.end)}</span>
                  <span className="text-text-muted">{riskLabel(item.risk_level)}</span>
                </div>
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
                    <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-bg-tertiary" style={{ left: `${left}%`, width: `${width}%` }} />
                    <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-primary-fill" style={{ left: `${left}%`, width: `${width * (progress / 100)}%` }} />
                    {item.risk_level && item.risk_level !== 'none' && <span className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-color-error" style={{ left: `${Math.min(left + width, 98)}%` }} />}
                  </div>
                )
              })}
              {!loading && items.length === 0 && <EmptyState title="暂无甘特数据" desc="当前时间范围内没有任务。" />}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
