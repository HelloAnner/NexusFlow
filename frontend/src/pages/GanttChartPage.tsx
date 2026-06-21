import { MainLayout } from '@/components/layout'
import { Badge, Button, EmptyState, Input, ProgressBar, Select, Tag } from '@/components/ui'
import { apiGet } from '@/lib/api'
import {
  type ApiList,
  type ApiOrg,
  type ApiPerson,
  type ApiProject,
  formatDate,
  numberValue,
  priorityLabel,
  riskLabel,
  riskVariant,
  taskStatusLabel,
} from '@/lib/format'
import { useApiData } from '@/lib/useApiData'
import { cn } from '@/lib/utils'
import {
  addDays,
  differenceInDays,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  format,
  isToday,
  isWeekend,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from 'date-fns'
import {
  CalendarDays,
  ChevronsLeft,
  ChevronsRight,
  Download,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

interface GanttItem {
  id: string
  type?: string
  title: string
  summary?: string | null
  task_no?: string | null
  start?: string | null
  end?: string | null
  progress?: number | string | null
  status?: string
  priority?: string | null
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
  { value: 'day', label: '日' },
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

const MIN_VIEW_DAYS = 7
const MAX_VIEW_DAYS = 365
const ROW_HEIGHT = 48
const HEADER_HEIGHT = 40
const BAR_HEIGHT = 24
const BAR_RADIUS = 4
const MILESTONE_SIZE = 14
const LEFT_PANEL_WIDTH = 280

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function isoDateTime(date: Date) {
  return date.toISOString()
}

function defaultStart() {
  const date = new Date()
  date.setDate(date.getDate() - 7)
  return isoDate(date)
}

function defaultEnd() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return isoDate(date)
}

function clampDate(value?: string | null) {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : startOfDay(date)
}

function ganttTargetUrl(item: GanttItem) {
  const taskMatch = item.target_url?.match(/^\/tasks\/([^/?#]+)/)
  if (taskMatch?.[1]) return `/tasks/${encodeURIComponent(taskMatch[1])}`
  if (item.target_url?.startsWith('/')) return item.target_url
  if (item.type === 'task') return `/tasks/${encodeURIComponent(item.id)}`
  return ''
}

function maxRisk(items: GanttItem[]) {
  return items.reduce((current, item) => {
    const currentScore = riskScore[current] ?? 0
    const next = item.risk_level ?? 'none'
    return (riskScore[next] ?? 0) > currentScore ? next : current
  }, 'none')
}

function buildDimensionItems(items: GanttItem[], dimension: string): GanttItem[] {
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

function headerCells(viewStart: Date, viewEnd: Date, granularity: string) {
  const cells: { date: Date; label: string; endDate: Date; isMajor: boolean }[] = []
  let cursor = startOfDay(viewStart)
  const last = startOfDay(viewEnd)

  while (cursor.getTime() <= last.getTime()) {
    let end: Date
    let label: string
    let isMajor = false
    if (granularity === 'day') {
      end = cursor
      label = format(cursor, 'MM-dd')
      isMajor = isToday(cursor) || cursor.getDay() === 1
    } else if (granularity === 'week') {
      const weekStart = startOfWeek(cursor, { weekStartsOn: 1 })
      end = endOfWeek(weekStart, { weekStartsOn: 1 })
      label = format(weekStart, 'MM-dd')
      isMajor = true
    } else if (granularity === 'month') {
      const monthStart = startOfMonth(cursor)
      end = endOfMonth(monthStart)
      label = format(monthStart, 'yyyy-MM')
      isMajor = true
    } else {
      const quarterStart = startOfQuarter(cursor)
      end = endOfQuarter(quarterStart)
      label = `${quarterStart.getFullYear()} Q${Math.floor(quarterStart.getMonth() / 3) + 1}`
      isMajor = true
    }
    if (end.getTime() > last.getTime()) end = last
    cells.push({ date: cursor, label, endDate: end, isMajor })
    cursor = addDays(end, 1)
  }
  return cells
}

export function GanttChartPage() {
  const [params, setParams] = useSearchParams()
  const filterKey = params.toString()
  const requestedTaskId = params.get('task_id')
  const dimension = requestedTaskId ? 'task' : queryValue(params, 'dimension') || 'project'
  const granularity = queryValue(params, 'granularity') || 'week'
  const riskOnly = params.get('risk') === '1'
  const startDate = queryValue(params, 'start') || defaultStart()
  const endDate = queryValue(params, 'end') || defaultEnd()

  const [leftPanelOpen, setLeftPanelOpen] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(requestedTaskId)
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const queryStart = useMemo(() => clampDate(startDate), [startDate])
  const queryEnd = useMemo(() => clampDate(endDate), [endDate])
  const [viewStart, setViewStart] = useState<Date>(queryStart)
  const [viewEnd, setViewEnd] = useState<Date>(queryEnd)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStartX = useRef(0)
  const panStartViewStart = useRef<Date>(queryStart)

  const bodyRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<HTMLDivElement>(null)

  const { data, loading, error } = useApiData(() => loadGantt(params), [filterKey])
  const optionState = useApiData(loadFilterOptions, [])
  const people = optionState.data?.people ?? []
  const projects = optionState.data?.projects ?? []
  const orgs = optionState.data?.orgs ?? []
  const sourceItems = data?.items ?? []
  const items = buildDimensionItems(sourceItems, dimension).filter(
    (item) => !riskOnly || (item.risk_level && item.risk_level !== 'none')
  )
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null
  const activeItem = selectedItem
  const dataScopeApplied = data?.data_scope_applied === true && data.summary?.data_scope_applied === true

  useEffect(() => {
    setViewStart(queryStart)
    setViewEnd(queryEnd)
  }, [queryStart, queryEnd])

  useEffect(() => {
    function updateSize() {
      const el = bodyRef.current
      if (!el) return
      setContainerSize({ width: el.clientWidth, height: el.clientHeight })
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [leftPanelOpen])

  useEffect(() => {
    if (requestedTaskId && items.length && !selectedItemId) {
      setSelectedItemId(requestedTaskId)
    }
  }, [requestedTaskId, items.length, selectedItemId])

  const viewDays = useMemo(() => Math.max(1, differenceInDays(viewEnd, viewStart) + 1), [viewEnd, viewStart])
  const colWidth = useMemo(
    () => (containerSize.width > 0 ? containerSize.width / viewDays : 0),
    [containerSize.width, viewDays]
  )

  const cells = useMemo(() => headerCells(viewStart, viewEnd, granularity), [viewStart, viewEnd, granularity])

  const leftWidth = leftPanelOpen ? LEFT_PANEL_WIDTH : 0
  const svgWidth = containerSize.width > 0 ? containerSize.width : 0
  const bodyWidth = leftWidth + svgWidth
  const rowsHeight = items.length * ROW_HEIGHT
  const trackHeight = Math.max(rowsHeight, containerSize.height - HEADER_HEIGHT)

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
    setSelectedItemId(null)
    setHoveredItemId(null)
  }

  function changeDimension(nextDimension: string) {
    setFilter('dimension', nextDimension)
  }

  function showItem(item: GanttItem) {
    setSelectedItemId(item.id)
  }

  function openItemNewTab(item: GanttItem) {
    const target = ganttTargetUrl(item)
    if (target) window.open(target, '_blank')
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

  function shiftRange(days: number) {
    const nextStart = addDays(viewStart, days)
    const nextEnd = addDays(viewEnd, days)
    setViewStart(nextStart)
    setViewEnd(nextEnd)
  }

  function zoom(factor: number) {
    const currentDays = differenceInDays(viewEnd, viewStart) + 1
    const nextDays = Math.max(MIN_VIEW_DAYS, Math.min(MAX_VIEW_DAYS, Math.round(currentDays * factor)))
    const center = addDays(viewStart, Math.floor(currentDays / 2))
    const nextStart = addDays(center, -Math.floor(nextDays / 2))
    const nextEnd = addDays(nextStart, nextDays - 1)
    setViewStart(nextStart)
    setViewEnd(nextEnd)
  }

  function jumpToToday() {
    const today = startOfDay(new Date())
    const half = Math.floor(viewDays / 2)
    const nextStart = addDays(today, -half)
    const nextEnd = addDays(today, viewDays - half - 1)
    setViewStart(nextStart)
    setViewEnd(nextEnd)
  }

  function handlePointerDown(event: React.PointerEvent) {
    const target = event.target as HTMLElement
    if (target.closest('[data-gantt-bar], [data-left-cell]')) return
    setIsPanning(true)
    panStartX.current = event.clientX
    panStartViewStart.current = viewStart
    const el = panRef.current
    if (el) {
      el.setPointerCapture(event.pointerId)
      el.style.cursor = 'grabbing'
    }
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (!isPanning || colWidth <= 0) return
    const dx = event.clientX - panStartX.current
    const daysShift = Math.round(-dx / colWidth)
    if (daysShift !== 0) {
      setViewStart(addDays(panStartViewStart.current, daysShift))
      setViewEnd(addDays(panStartViewStart.current, daysShift + viewDays - 1))
    }
  }

  function handlePointerUp(event: React.PointerEvent) {
    if (!isPanning) return
    setIsPanning(false)
    const el = panRef.current
    if (el) {
      try {
        el.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }
      el.style.cursor = 'grab'
    }
  }

  function handleWheel(event: React.WheelEvent) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      zoom(event.deltaY > 0 ? 1.15 : 0.87)
    } else if (Math.abs(event.deltaX) > 0) {
      event.preventDefault()
      shiftRange(event.deltaX > 0 ? -3 : 3)
    }
  }

  function itemPosition(item: GanttItem) {
    const start = clampDate(item.start)
    const end = clampDate(item.end)
    const offsetDays = differenceInDays(start, viewStart)
    const durationDays = Math.max(0, differenceInDays(end, start) + 1)
    const x = offsetDays * colWidth
    const width = Math.max(colWidth * 0.4, durationDays * colWidth)
    return { x, width, start, end }
  }

  function isMilestone(item: GanttItem) {
    const start = clampDate(item.start)
    const end = clampDate(item.end)
    return differenceInDays(end, start) === 0 && numberValue(item.progress) >= 100
  }

  return (
    <MainLayout title="排期" subtitle="项目与任务时间线">
      <div className="flex h-full min-h-0 flex-col gap-4">
        {(error || message) && (
          <div
            className={
              error
                ? 'rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error'
                : 'rounded-md bg-color-success-bg px-4 py-3 text-sm text-color-success'
            }
          >
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
            <Button variant={riskOnly ? 'danger' : 'secondary'} className="h-10 px-3" onClick={() => setFilter('risk', riskOnly ? '' : '1')}>
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
                  className={cn(
                    'rounded-sm px-4 py-1.5 text-sm transition-fast',
                    dimension === tab.value ? 'bg-primary-fill font-semibold text-primary-text' : 'text-text-muted hover:bg-hover-bg'
                  )}
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
                  className={cn(
                    'rounded-sm px-3 py-1.5 text-sm transition-fast',
                    granularity === option.value ? 'bg-primary-fill font-semibold text-primary-text' : 'text-text-muted hover:bg-hover-bg'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" className="h-9 px-2" onClick={() => setLeftPanelOpen((v) => !v)} title={leftPanelOpen ? '收起左侧列表' : '展开左侧列表'}>
              {leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">{leftPanelOpen ? '收起' : '列表'}</span>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-md bg-bg-secondary p-1">
              <Button variant="ghost" className="h-8 w-8 px-0" onClick={() => shiftRange(-Math.max(1, Math.floor(viewDays / 4)))} title="向左平移">
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" className="h-8 w-8 px-0" onClick={() => zoom(0.87)} title="放大">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" className="h-8 w-8 px-0" onClick={() => zoom(1.15)} title="缩小">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="ghost" className="h-8 w-8 px-0" onClick={() => shiftRange(Math.max(1, Math.floor(viewDays / 4)))} title="向右平移">
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="secondary" className="h-9 px-3" onClick={jumpToToday}>
              <CalendarDays className="h-4 w-4" />
              回到今天
            </Button>
            <div className="flex items-center gap-2 rounded-md bg-bg-secondary px-3 py-2 text-sm text-text-muted">
              <ShieldCheck className={cn('h-4 w-4', dataScopeApplied ? 'text-color-success' : 'text-color-warning')} />
              {dataScopeApplied ? '服务器已应用当前账号数据范围' : '等待服务器权限口径'}
              <Badge>{loading ? '加载中' : `${items.length} 条`}</Badge>
            </div>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-md border border-border-subtle bg-bg-secondary">
          <div
            ref={bodyRef}
            className="relative flex-1 cursor-grab overflow-auto active:cursor-grabbing"
            onWheel={handleWheel}
          >
            <div className="relative flex flex-col" style={{ width: Math.max(bodyWidth, 1), minHeight: '100%' }}>
              {/* Header */}
              <div className="sticky top-0 z-30 flex h-10 shrink-0 bg-bg-tertiary" style={{ width: Math.max(bodyWidth, 1) }}>
                {leftPanelOpen && (
                  <div
                    className="sticky left-0 z-30 flex shrink-0 items-center border-b border-r border-border-subtle bg-bg-tertiary px-3 text-xs text-text-muted"
                    style={{ width: LEFT_PANEL_WIDTH }}
                  >
                    <span>{dimensionLabels[dimension] ?? '名称'}</span>
                  </div>
                )}
                <div className="relative shrink-0" style={{ width: Math.max(svgWidth, 1) }}>
                  {cells.map((cell, index) => {
                    const days = differenceInDays(cell.endDate, cell.date) + 1
                    const width = days * colWidth
                    const left = differenceInDays(cell.date, viewStart) * colWidth
                    return (
                      <div
                        key={index}
                        className={cn(
                          'absolute top-0 flex h-10 items-center justify-center border-b border-r border-border-subtle text-xs',
                          cell.isMajor ? 'font-semibold text-text-secondary' : 'text-text-muted'
                        )}
                        style={{ left, width }}
                      >
                        {cell.label}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Timeline track (grid, bars, today line) */}
              <div
                className="absolute"
                style={{ left: leftWidth, top: HEADER_HEIGHT, width: Math.max(svgWidth, 1), height: Math.max(trackHeight, 1) }}
              >
                {/* Pan capture */}
                <div
                  ref={panRef}
                  className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                />

                <svg className="absolute left-0 top-0 z-10 h-full w-full" width={Math.max(svgWidth, 1)} height={Math.max(trackHeight, 1)}>
                  <defs>
                    <pattern id="gantt-grid" width={Math.max(colWidth, 1)} height={ROW_HEIGHT} patternUnits="userSpaceOnUse">
                      <rect width={Math.max(colWidth, 1)} height={ROW_HEIGHT} fill="transparent" />
                      <line
                        x1={Math.max(colWidth, 1)}
                        y1={0}
                        x2={Math.max(colWidth, 1)}
                        y2={ROW_HEIGHT}
                        stroke="rgba(0,0,0,0.04)"
                        strokeWidth={1}
                      />
                      <line x1={0} y1={ROW_HEIGHT} x2={Math.max(colWidth, 1)} y2={ROW_HEIGHT} stroke="rgba(0,0,0,0.04)" strokeWidth={1} />
                    </pattern>
                  </defs>
                  <rect x={0} y={0} width={Math.max(svgWidth, 1)} height={rowsHeight} fill="url(#gantt-grid)" />

                  {Array.from({ length: viewDays }).map((_, index) => {
                    const date = addDays(viewStart, index)
                    const x = index * colWidth
                    const isWeekendDay = isWeekend(date)
                    return (
                      <rect
                        key={date.toISOString()}
                        x={x}
                        y={0}
                        width={Math.max(colWidth, 1)}
                        height={rowsHeight}
                        fill={isWeekendDay ? 'rgba(0,0,0,0.025)' : 'transparent'}
                      />
                    )
                  })}

                  {(() => {
                    const today = startOfDay(new Date())
                    const offset = differenceInDays(today, viewStart)
                    if (offset < 0 || offset > viewDays) return null
                    const x = offset * colWidth + colWidth / 2
                    return (
                      <line
                        x1={x}
                        y1={0}
                        x2={x}
                        y2={rowsHeight}
                        stroke="#3B82F6"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                      />
                    )
                  })()}

                  {items.map((item, index) => {
                    const y = index * ROW_HEIGHT + ROW_HEIGHT / 2
                    const { x, width } = itemPosition(item)
                    const progress = numberValue(item.progress)
                    const risk = item.risk_level && item.risk_level !== 'none'
                    const milestone = isMilestone(item)
                    const isHovered = hoveredItemId === item.id || selectedItemId === item.id

                    if (milestone) {
                      return (
                        <g key={item.id} transform={`translate(${x + colWidth / 2}, ${y})`} data-gantt-bar>
                          <polygon
                            points={`0,-${MILESTONE_SIZE / 2} ${MILESTONE_SIZE / 2},0 0,${MILESTONE_SIZE / 2} -${MILESTONE_SIZE / 2},0`}
                            fill="#1A1A1A"
                            stroke={risk ? '#EF4444' : 'transparent'}
                            strokeWidth={2}
                            className="cursor-pointer transition-all"
                            opacity={isHovered ? 1 : 0.9}
                            onClick={() => showItem(item)}
                            onMouseEnter={() => setHoveredItemId(item.id)}
                            onMouseLeave={() => setHoveredItemId(null)}
                          />
                        </g>
                      )
                    }

                    return (
                      <g key={item.id} transform={`translate(${x}, ${y - BAR_HEIGHT / 2})`} data-gantt-bar>
                        <rect
                          x={0}
                          y={0}
                          width={width}
                          height={BAR_HEIGHT}
                          rx={BAR_RADIUS}
                          fill="rgba(26,26,26,0.16)"
                          stroke={risk ? '#EF4444' : 'transparent'}
                          strokeWidth={risk ? 2 : 0}
                          className="cursor-pointer transition-all"
                          opacity={isHovered ? 1 : 0.85}
                          onClick={() => showItem(item)}
                          onMouseEnter={() => setHoveredItemId(item.id)}
                          onMouseLeave={() => setHoveredItemId(null)}
                        />
                        <rect
                          x={0}
                          y={0}
                          width={Math.max(2, (width * Math.min(100, progress)) / 100)}
                          height={BAR_HEIGHT}
                          rx={BAR_RADIUS}
                          fill="#1A1A1A"
                          className="pointer-events-none"
                        />
                        {risk && (
                          <circle cx={width + 6} cy={BAR_HEIGHT / 2} r={4} fill="#EF4444" className="pointer-events-none" />
                        )}
                      </g>
                    )
                  })}
                </svg>

                {!loading && items.length === 0 && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center">
                    <EmptyState title="暂无甘特数据" desc="当前筛选下没有任务。" />
                  </div>
                )}
              </div>

              {/* Rows (left cells + transparent right placeholders for alignment) */}
              <div className="pointer-events-none relative z-20 flex flex-col" style={{ width: Math.max(bodyWidth, 1) }}>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="pointer-events-none flex h-12 border-b border-border-subtle"
                    style={{ width: Math.max(bodyWidth, 1), height: ROW_HEIGHT }}
                  >
                    {leftPanelOpen && (
                      <button
                        type="button"
                        data-left-cell
                        className={cn(
                          'sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-border-subtle bg-bg-tertiary px-3 text-left transition-fast hover:bg-hover-bg',
                          activeItem?.id === item.id && 'bg-selected-bg'
                        )}
                        style={{ width: LEFT_PANEL_WIDTH }}
                        onClick={() => showItem(item)}
                        onMouseEnter={() => setHoveredItemId(item.id)}
                        onMouseLeave={() => setHoveredItemId(null)}
                      >
                        <span className="truncate text-sm font-medium text-text-primary">{item.title}</span>
                        <span className="truncate text-xs text-text-muted">
                          {formatDate(item.start)} · {item.type === 'task' ? taskStatusLabel(item.status) : item.status ?? '—'} · {riskLabel(item.risk_level)}
                        </span>
                      </button>
                    )}
                    <div className="shrink-0" style={{ width: Math.max(svgWidth, 1) }} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {activeItem && (
            <div className="absolute inset-y-0 right-0 z-40 flex w-[360px] flex-col border-l border-border-subtle bg-bg-primary shadow-modal">
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge>{dimensionTabs.find((tab) => tab.value === activeItem.type)?.label ?? '任务'}</Badge>
                  <Tag variant={riskVariant(activeItem.risk_level)}>{riskLabel(activeItem.risk_level)}</Tag>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-hover-bg hover:text-text-primary"
                  aria-label="关闭详情"
                  onClick={() => {
                    setSelectedItemId(null)
                    setHoveredItemId(null)
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="mb-1 text-base font-semibold text-text-primary">{activeItem.title}</h3>
                {activeItem.task_no && <div className="mb-3 text-xs text-text-muted">编号：{activeItem.task_no}</div>}
                {activeItem.summary && (
                  <div className="mb-4 rounded-md bg-bg-tertiary p-3 text-sm text-text-secondary">{activeItem.summary}</div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <GanttInfo label="开始" value={formatDate(activeItem.start)} />
                  <GanttInfo label="截止" value={formatDate(activeItem.end)} />
                  <GanttInfo
                    label="状态"
                    value={activeItem.type === 'task' ? taskStatusLabel(activeItem.status) : activeItem.status ?? '未知'}
                  />
                  <GanttInfo label="负责人" value={activeItem.owner_name ?? '未设置'} />
                  <GanttInfo label="归属项目" value={activeItem.project_name ?? '未关联项目'} />
                  <GanttInfo label="优先级" value={priorityLabel(activeItem.priority ?? undefined)} />
                  <GanttInfo
                    label={activeItem.type === 'task' ? '只读' : '任务数'}
                    value={activeItem.type === 'task' ? (activeItem.readonly ? '是' : '否') : `${activeItem.task_count ?? 0} 个`}
                  />
                  <GanttInfo label="风险" value={riskLabel(activeItem.risk_level)} />
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm text-text-muted">
                    <span>进度</span>
                    <span>{Math.round(numberValue(activeItem.progress))}%</span>
                  </div>
                  <ProgressBar value={numberValue(activeItem.progress)} className="h-1.5" />
                </div>
              </div>

              <div className="border-t border-border-subtle p-4">
                <Button
                  className="h-9 w-full px-3 py-0 text-sm"
                  disabled={!ganttTargetUrl(activeItem)}
                  onClick={() => openItemNewTab(activeItem)}
                >
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
