import { MainLayout } from '@/components/layout'
import { Avatar, EmptyState, ProgressBar, SearchInput, Select, Table, Tag, Tbody, Td, Th, Thead, Tr } from '@/components/ui'
import { apiGet } from '@/lib/api'
import {
  type ApiOrg,
  type ApiList,
  type ApiPerson,
  type ApiProject,
  type ApiTask,
  formatDate,
  numberValue,
  priorityLabel,
  taskStatusLabel,
  taskStatusVariant,
  taskTypeLabel,
  textFromPayload,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { useApiData } from '@/lib/useApiData'
import { ChevronDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TaskDetailContent } from '@/pages/TaskDetailPage'

const columns = [
  { label: '任务名称', width: 'w-[280px]' },
  { label: '状态', width: 'w-[90px]' },
  { label: '类型', width: 'w-[90px]' },
  { label: '负责人', width: 'w-[120px]' },
  { label: '起止时间', width: 'w-[180px]' },
  { label: '进度', width: 'w-[100px]' },
  { label: '优先级', width: 'w-[80px]' },
  { label: '操作', width: 'w-[60px]' },
]

const pageSize = 20

const typeOptions = [
  { value: '', label: '全部类型' },
  { value: 'research', label: '科研任务' },
  { value: 'report', label: '报告材料' },
  { value: 'support', label: '协同支持' },
  { value: 'travel', label: '出差安排' },
  { value: 'leave', label: '休假占用' },
  { value: 'backfill', label: '后补填报' },
  { value: 'other', label: '其他' },
]

const priorityOptions = [
  { value: '', label: '全部优先级' },
  { value: 'urgent', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'normal', label: '中' },
  { value: 'low', label: '低' },
]

const statusGroupOptions = [
  { value: '', label: '全部' },
  { value: 'active', label: '进行中' },
  { value: 'confirmation', label: '待确认' },
  { value: 'acceptance', label: '待验收' },
  { value: 'risk', label: '有风险' },
  { value: 'completed', label: '已完成' },
]

function pageFromParams(value: string | null) {
  const page = Number(value)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

function valueFromParams(params: URLSearchParams, key: string) {
  const value = params.get(key)
  return value && value.trim() ? value : null
}

function taskQuery(params: URLSearchParams, page: number, pageSizeValue = pageSize): Record<string, string | number | null> {
  return {
    q: valueFromParams(params, 'q'),
    status_group: valueFromParams(params, 'status_group'),
    status: valueFromParams(params, 'status'),
    sub_type: valueFromParams(params, 'sub_type'),
    priority: valueFromParams(params, 'priority'),
    owner_id: valueFromParams(params, 'owner_id'),
    org_id: valueFromParams(params, 'org_id'),
    project_id: valueFromParams(params, 'project_id'),
    start_date: valueFromParams(params, 'start_date'),
    end_date: valueFromParams(params, 'end_date'),
    page,
    page_size: pageSizeValue,
  }
}

function loadTasks(params: URLSearchParams, page: number) {
  return apiGet<ApiList<ApiTask>>('/tasks', taskQuery(params, page))
}

async function loadFilterOptions() {
  const [people, projects, orgs] = await Promise.all([
    apiGet<ApiList<ApiPerson>>('/users', { page_size: 200 }),
    apiGet<ApiList<ApiProject>>('/projects', { page_size: 200 }),
    apiGet<ApiList<ApiOrg>>('/orgs/tree'),
  ])
  return { people: people.items, projects: projects.items, orgs: orgs.items }
}

async function loadStatusGroupCounts(params: URLSearchParams) {
  const base = new URLSearchParams(params)
  base.delete('page')
  base.delete('task')
  base.delete('status_group')
  base.delete('status')
  const entries = await Promise.all(
    statusGroupOptions.map(async (option) => {
      const next = new URLSearchParams(base)
      if (option.value) next.set('status_group', option.value)
      const result = await apiGet<ApiList<ApiTask>>('/tasks', taskQuery(next, 1, 1))
      return [option.value, result.total ?? 0] as const
    })
  )
  return Object.fromEntries(entries) as Record<string, number>
}

function countKeyFromParams(params: URLSearchParams) {
  const next = new URLSearchParams(params)
  next.delete('page')
  next.delete('task')
  next.delete('status_group')
  next.delete('status')
  return next.toString()
}

export function TaskListPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q')
  const page = pageFromParams(params.get('page'))
  const selectedTaskId = params.get('task')
  const [searchValue, setSearchValue] = useState(q ?? '')
  const [filtersOpen, setFiltersOpen] = useState(() => ['sub_type', 'priority', 'owner_id', 'org_id', 'project_id', 'start_date', 'end_date'].some((key) => params.has(key)))
  const filterKey = params.toString()
  const countKey = countKeyFromParams(params)
  const { data, loading, error } = useApiData(() => loadTasks(params, page), [filterKey, page])
  const optionsState = useApiData(loadFilterOptions, [])
  const countState = useApiData(() => loadStatusGroupCounts(params), [countKey])
  const tasks = data?.items ?? []
  const people = optionsState.data?.people ?? []
  const projects = optionsState.data?.projects ?? []
  const orgs = optionsState.data?.orgs ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(total, page * pageSize)

  function updateParams(update: (next: URLSearchParams) => void, resetPage = true) {
    const next = new URLSearchParams(params)
    update(next)
    if (resetPage && next.toString() !== params.toString()) next.set('page', '1')
    setParams(next)
  }

  function setFilter(key: string, value: string) {
    updateParams((next) => {
      if (value) next.set(key, value)
      else next.delete(key)
      if (key === 'status_group') next.delete('status')
    })
  }

  function openTask(taskId: string) {
    updateParams((next) => next.set('task', taskId), false)
  }

  function closeTask() {
    updateParams((next) => next.delete('task'), false)
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateParams((next) => {
      const value = searchValue.trim()
      if (value) next.set('q', value)
      else next.delete('q')
    })
  }

  function clearSearch() {
    setSearchValue('')
    updateParams((next) => {
      next.delete('q')
    })
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params)
    next.set('page', String(Math.min(Math.max(nextPage, 1), totalPages)))
    setParams(next)
  }

  function clearFilters() {
    setSearchValue('')
    setParams(new URLSearchParams())
    setFiltersOpen(false)
  }

  function removeFilter(key: string) {
    if (key === 'q') setSearchValue('')
    updateParams((next) => {
      next.delete(key)
    })
  }

  const typeOptionItems = typeOptions
  const priorityOptionItems = priorityOptions
  const peopleOptions = [{ value: '', label: '全部负责人' }, ...people.map((person) => ({ value: person.id, label: person.name }))]
  const orgOptions = [{ value: '', label: '全部组织' }, ...orgs.map((org) => ({ value: org.id, label: org.name }))]
  const projectOptions = [{ value: '', label: '全部项目' }, ...projects.map((project) => ({ value: project.id, label: project.name }))]

  const activeFilterKeys = ['q', 'status_group', 'status', 'sub_type', 'priority', 'owner_id', 'org_id', 'project_id', 'start_date', 'end_date']
  const hasFilters = activeFilterKeys.some((key) => params.has(key))
  const advancedFilterCount = ['sub_type', 'priority', 'owner_id', 'org_id', 'project_id', 'start_date', 'end_date'].filter((key) => params.has(key)).length
  const activeFilterLabels = [
    params.get('q') && { key: 'q', label: `搜索：${params.get('q')}` },
    params.get('status_group') && { key: 'status_group', label: `状态：${statusGroupOptions.find((item) => item.value === params.get('status_group'))?.label ?? params.get('status_group')}` },
    params.get('status') && { key: 'status', label: `状态：${taskStatusLabel(params.get('status') ?? undefined)}` },
    params.get('sub_type') && { key: 'sub_type', label: `类型：${taskTypeLabel(params.get('sub_type'))}` },
    params.get('priority') && { key: 'priority', label: `优先级：${priorityLabel(params.get('priority') ?? undefined)}` },
    params.get('owner_id') && { key: 'owner_id', label: `负责人：${people.find((person) => person.id === params.get('owner_id'))?.name ?? '已选择'}` },
    params.get('org_id') && { key: 'org_id', label: `组织：${orgs.find((org) => org.id === params.get('org_id'))?.name ?? '已选择'}` },
    params.get('project_id') && { key: 'project_id', label: `项目：${projects.find((project) => project.id === params.get('project_id'))?.name ?? '已选择'}` },
    params.get('start_date') && { key: 'start_date', label: `开始不早于：${params.get('start_date')}` },
    params.get('end_date') && { key: 'end_date', label: `截止不晚于：${params.get('end_date')}` },
  ].filter(Boolean) as { key: string; label: string }[]

  function taskOwner(task: ApiTask) {
    return textFromPayload(task.payload, 'owner_name', task.owner_id ?? '未设置')
  }

  function openButton(task: ApiTask) {
    return (
      <button
        type="button"
        className="text-sm text-text-muted hover:text-text-primary"
        onClick={(event) => {
          event.stopPropagation()
          openTask(task.id)
        }}
      >
        详情
      </button>
    )
  }

  return (
    <MainLayout title="我的工作" subtitle="任务筛选、分工状态与详情面板">
      <div className="flex h-full min-h-0 flex-col gap-4">
        {error && <div className="rounded-md bg-color-error-bg px-4 py-3 text-sm text-color-error">{error}</div>}

        <div className="rounded-md border border-border-subtle bg-bg-secondary p-3 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
              <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={submitSearch}>
                <div className="relative min-w-0 flex-1 xl:max-w-[520px]">
                  <SearchInput
                    placeholder="搜索任务名称、编号、负责人、项目..."
                    className="h-10 w-full bg-bg-tertiary pr-10"
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                  />
                  {searchValue && (
                    <button
                      type="button"
                      aria-label="清空搜索"
                      className="absolute right-3 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-fast hover:bg-hover-bg hover:text-text-primary"
                      onClick={clearSearch}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary-fill px-4 text-sm font-semibold text-primary-text transition-fast hover:bg-black/85"
                >
                  <Search className="h-4 w-4" />
                  搜索
                </button>
              </form>

              <div className="flex items-center justify-between gap-2 xl:justify-end">
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-border-subtle bg-bg-secondary px-3 text-sm font-semibold text-text-secondary transition-fast hover:bg-hover-bg hover:text-text-primary"
                  onClick={() => setFiltersOpen((value) => !value)}
                  aria-expanded={filtersOpen}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  精细筛选
                  {advancedFilterCount > 0 && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary-fill px-1.5 py-0.5 text-xs text-primary-text">
                      {advancedFilterCount}
                    </span>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-fast ${filtersOpen ? 'rotate-180' : ''}`} />
                </button>
                {hasFilters && (
                  <button type="button" className="h-10 rounded-md px-3 text-sm font-medium text-text-muted transition-fast hover:bg-hover-bg hover:text-text-primary" onClick={clearFilters}>
                    重置
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {statusGroupOptions.map((option) => {
                const active = (params.get('status_group') ?? '') === option.value && !params.get('status')
                const count = countState.loading && !countState.data ? '...' : countState.data?.[option.value] ?? 0
                return (
                  <button
                    key={option.value || 'all'}
                    type="button"
                    className={cn(
                      'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-fast',
                      active
                        ? 'border-primary-fill bg-primary-fill text-primary-text'
                        : 'border-border-subtle bg-bg-tertiary text-text-secondary hover:bg-hover-bg hover:text-text-primary'
                    )}
                    onClick={() => setFilter('status_group', option.value)}
                  >
                    <span>{option.label}</span>
                    <span className={cn('text-xs', active ? 'text-primary-text/80' : 'text-text-muted')}>{count}</span>
                  </button>
                )
              })}
            </div>

            {filtersOpen && (
              <div className="rounded-md border border-border-subtle bg-bg-tertiary p-3">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <Select aria-label="类型筛选" label="类型" className="min-w-0" value={params.get('sub_type') ?? ''} onChange={(event) => setFilter('sub_type', event.target.value)} options={typeOptionItems} />
                  <Select aria-label="优先级筛选" label="优先级" className="min-w-0" value={params.get('priority') ?? ''} onChange={(event) => setFilter('priority', event.target.value)} options={priorityOptionItems} />
                  <Select
                    aria-label="负责人筛选"
                    label="负责人"
                    className="min-w-0"
                    value={params.get('owner_id') ?? ''}
                    onChange={(event) => setFilter('owner_id', event.target.value)}
                    options={peopleOptions}
                  />
                  <Select
                    aria-label="组织筛选"
                    label="组织"
                    className="min-w-0"
                    value={params.get('org_id') ?? ''}
                    onChange={(event) => setFilter('org_id', event.target.value)}
                    options={orgOptions}
                  />
                  <Select
                    aria-label="项目筛选"
                    label="项目"
                    className="min-w-0"
                    value={params.get('project_id') ?? ''}
                    onChange={(event) => setFilter('project_id', event.target.value)}
                    options={projectOptions}
                  />
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-text-muted">
                      开始不早于
                      <input className="h-10 min-w-0 rounded-md border border-border-subtle bg-bg-secondary px-3 text-sm text-text-primary" type="date" value={params.get('start_date') ?? ''} onChange={(event) => setFilter('start_date', event.target.value)} />
                    </label>
                    <label className="flex min-w-0 flex-col gap-2 text-sm font-medium text-text-muted">
                      截止不晚于
                      <input className="h-10 min-w-0 rounded-md border border-border-subtle bg-bg-secondary px-3 text-sm text-text-primary" type="date" value={params.get('end_date') ?? ''} onChange={(event) => setFilter('end_date', event.target.value)} />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeFilterLabels.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                <span className="text-xs font-semibold text-text-muted">已选条件</span>
                {activeFilterLabels.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border-subtle bg-bg-tertiary px-2 text-xs font-medium text-text-secondary transition-fast hover:bg-hover-bg hover:text-text-primary"
                    onClick={() => removeFilter(filter.key)}
                  >
                    {filter.label}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border-subtle bg-bg-secondary">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">任务列表</div>
              <div className="mt-1 text-xs text-text-muted">点击一行在右侧打开任务详情。</div>
            </div>
            <span className="text-xs text-text-muted">{loading ? '加载中...' : `共 ${total} 条`}</span>
          </div>
          <div className="flex-1 overflow-auto">
            <div className="flex flex-col divide-y divide-border-subtle md:hidden">
              {tasks.map((task) => {
                const progress = numberValue(task.progress)
                const owner = taskOwner(task)
                return (
                  <button key={task.id} type="button" className="flex flex-col gap-3 px-4 py-4 text-left transition-fast hover:bg-hover-bg" onClick={() => openTask(task.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-text-primary">{task.name}</div>
                        <div className="mt-1 truncate text-xs text-text-muted">{task.summary || task.task_no || '无描述'}</div>
                      </div>
                      <Tag variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Tag>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm text-text-secondary">
                      <span>{taskTypeLabel(task.sub_type)}</span>
                      <span>{priorityLabel(task.priority)}</span>
                      <span className="truncate">负责人：{owner}</span>
                      <span>{formatDate(task.due_at)}</span>
                    </div>
                    <ProgressBar value={progress} className="h-1.5" />
                  </button>
                )
              })}
            </div>
            <div className="hidden min-w-[980px] md:block">
            <Table>
              <Thead>
                <Tr>
                  {columns.map((col) => (
                    <Th key={col.label} className={`text-sm ${col.width}`}>
                      {col.label}
                    </Th>
                  ))}
                </Tr>
              </Thead>
              <Tbody>
                {tasks.map((task) => {
                  const progress = numberValue(task.progress)
                  const owner = taskOwner(task)
                  return (
                    <Tr
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      className={`cursor-pointer ${selectedTaskId === task.id ? 'bg-hover-bg' : ''}`}
                      onClick={() => openTask(task.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') openTask(task.id)
                      }}
                    >
                      <Td className="w-[280px]">
                        <button
                          type="button"
                          className="flex w-full flex-col gap-1 text-left"
                          onClick={(event) => {
                            event.stopPropagation()
                            openTask(task.id)
                          }}
                        >
                          <span className="text-base font-medium text-text-primary">{task.name}</span>
                          <span className="text-xs text-text-muted">{task.summary || task.task_no || '无描述'}</span>
                        </button>
                      </Td>
                      <Td className="w-[90px]">
                        <Tag variant={taskStatusVariant(task.status)}>{taskStatusLabel(task.status)}</Tag>
                      </Td>
                      <Td className="w-[90px]">
                        <span className="text-sm text-text-secondary">{taskTypeLabel(task.sub_type)}</span>
                      </Td>
                      <Td className="w-[120px]">
                        <div className="flex items-center gap-2">
                          <Avatar name={owner} />
                          <span className="truncate text-sm text-text-secondary">{owner}</span>
                        </div>
                      </Td>
                      <Td className="w-[180px]">
                        <span className="text-sm text-text-secondary">
                          {formatDate(task.start_at)} - {formatDate(task.due_at)}
                        </span>
                      </Td>
                      <Td className="w-[100px]">
                        <div className="flex flex-col gap-2">
                          <ProgressBar value={progress} className="h-1" />
                          <span className="text-xs text-text-muted">{Math.round(progress)}%</span>
                        </div>
                      </Td>
                      <Td className="w-[80px]">{priorityLabel(task.priority)}</Td>
                      <Td className="w-[60px]">
                        {openButton(task)}
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
            </div>
            {!loading && tasks.length === 0 && <EmptyState title="暂无任务" desc="当前条件下没有可见任务。" />}
          </div>

          <div className="flex items-center justify-between border-t border-border-subtle px-4 py-3">
            <span className="text-sm text-text-muted">
              {loading ? '加载中...' : `第 ${rangeStart}-${rangeEnd} 条，共 ${total} 条`}
            </span>
            <div className="inline-flex items-center gap-2">
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-muted transition-fast hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page <= 1 || loading}
                onClick={() => goToPage(page - 1)}
                aria-label="上一页"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-20 text-center text-sm text-text-muted">
                {page} / {totalPages}
              </span>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border-subtle text-text-muted transition-fast hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-40"
                disabled={page >= totalPages || loading}
                onClick={() => goToPage(page + 1)}
                aria-label="下一页"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {selectedTaskId && (
          <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex w-full justify-end">
            <aside className="pointer-events-auto h-full w-full max-w-full border-l border-border-subtle bg-bg-primary shadow-2xl md:w-[72vw] md:max-w-[calc(100vw-220px)]">
              <div className="h-full overflow-auto px-5 py-4">
                <TaskDetailContent id={selectedTaskId} compact onClose={closeTask} />
              </div>
            </aside>
          </div>
        )}
      </div>
    </MainLayout>
  )
}
